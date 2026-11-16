import crypto from 'node:crypto';
import fs from 'node:fs';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import {
  createWorld,
  executeMoveShip,
  fireFromShip,
  stepWorld,
} from './src/game/engine.ts';
import type {
  ClientToServerMessage,
  OnlineSfxCue,
  OpponentAimState,
  ServerToClientMessage,
} from './src/game/onlineTypes.ts';
import { sound } from './src/game/sound.ts';
import type { AsteroidDensity, GameWorld, MatchRules, PlayerId } from './src/game/types.ts';

interface RoomSeat {
  seat: PlayerId;
  token: string;
  ws: WebSocket | null;
  remainingSeconds: number | null;
  countdownInterval: NodeJS.Timeout | null;
}

interface OnlineRoom {
  code: string;
  rules: MatchRules;
  world: GameWorld | null;
  seats: Record<PlayerId, RoomSeat | null>;
  rematchVotes: Set<PlayerId>;
  tickInterval: NodeJS.Timeout | null;
  lastBroadcastAt: number;
  lastAim: OpponentAimState | null;
  cleanupTimer: NodeJS.Timeout | null;
}

interface SocketMeta {
  roomCode: string | null;
  seat: PlayerId | null;
}

const PORT = Number(process.env.PORT || 3000);
const DISCONNECT_GRACE_SECONDS = 60;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const rooms = new Map<string, OnlineRoom>();
const socketMeta = new WeakMap<WebSocket, SocketMeta>();
const lastSeenAt = new WeakMap<WebSocket, number>();
const quickMatchQueue: { ws: WebSocket; rules: MatchRules }[] = [];

function sanitizeRules(raw: unknown): MatchRules {
  const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const validDensities: AsteroidDensity[] = ['off', 'low', 'medium', 'high'];
  const density = validDensities.includes(obj.asteroidDensity as AsteroidDensity)
    ? (obj.asteroidDensity as AsteroidDensity)
    : 'medium';
  return {
    ricochetWalls: Boolean(obj.ricochetWalls),
    asteroidDensity: density,
  };
}

function generateRoomCode(): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += CODE_CHARS[crypto.randomInt(0, CODE_CHARS.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function generateSeatToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

function sendMsg(ws: WebSocket | null | undefined, msg: ServerToClientMessage) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(msg));
}

function broadcastRoom(room: OnlineRoom, msg: ServerToClientMessage, excludeSeat?: PlayerId) {
  for (const s of [1, 2] as PlayerId[]) {
    if (excludeSeat === s) continue;
    sendMsg(room.seats[s]?.ws, msg);
  }
}

function captureSfx(fn: () => void): OnlineSfxCue[] {
  const cues: OnlineSfxCue[] = [];
  sound.onCue = (cue) => {
    cues.push(cue);
  };
  try {
    fn();
  } finally {
    sound.onCue = null;
  }
  return cues;
}

function hasActiveSimulation(world: GameWorld): boolean {
  return (
    world.projectiles.length > 0 ||
    world.particles.length > 0 ||
    world.shockwaves.length > 0 ||
    world.floatingTexts.length > 0 ||
    world.pendingDestructions.length > 0 ||
    world.victoryDelay > 0 ||
    world.screenShake > 0.1 ||
    world.ships.some((s) => s.flashTimer > 0) ||
    world.shields.some((s) => s.flashTimer > 0) ||
    world.asteroids.some((a) => a.flashTimer > 0)
  );
}

function clearSeatTimers(seat: RoomSeat | null) {
  if (!seat) return;
  if (seat.countdownInterval) {
    clearInterval(seat.countdownInterval);
    seat.countdownInterval = null;
  }
  seat.remainingSeconds = null;
}

function destroyRoom(code: string) {
  const room = rooms.get(code);
  if (!room) return;
  if (room.tickInterval) {
    clearInterval(room.tickInterval);
    room.tickInterval = null;
  }
  if (room.cleanupTimer) {
    clearTimeout(room.cleanupTimer);
    room.cleanupTimer = null;
  }
  clearSeatTimers(room.seats[1]);
  clearSeatTimers(room.seats[2]);
  rooms.delete(code);
}

function ensureRoomTickLoop(room: OnlineRoom) {
  if (room.tickInterval || !room.world) return;
  const tickMs = 1000 / 60;
  let lastTime = Date.now();

  room.tickInterval = setInterval(() => {
    const world = room.world;
    if (!world) {
      if (room.tickInterval) {
        clearInterval(room.tickInterval);
        room.tickInterval = null;
      }
      return;
    }

    const now = Date.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;

    const prevTurn = world.currentTurn;
    const prevWinner = world.winner;
    const prevPending = world.pendingDestructions.length;
    const prevVictoryDelay = world.victoryDelay;

    const cues = captureSfx(() => {
      stepWorld(world, dt);
    });

    const settled = !hasActiveSimulation(world);
    const importantTransition =
      cues.length > 0 ||
      prevTurn !== world.currentTurn ||
      prevWinner !== world.winner ||
      prevPending !== world.pendingDestructions.length ||
      (prevVictoryDelay > 0 && world.victoryDelay <= 0) ||
      settled;

    if (importantTransition || now - room.lastBroadcastAt >= 25) {
      room.lastBroadcastAt = now;
      broadcastRoom(room, {
        type: 'world:state',
        world,
        sfx: cues.length > 0 ? cues : undefined,
      });
    }

    if (settled) {
      if (room.tickInterval) {
        clearInterval(room.tickInterval);
        room.tickInterval = null;
      }
    }
  }, tickMs);
}

function removeFromQueue(ws: WebSocket): boolean {
  const idx = quickMatchQueue.findIndex((entry) => entry.ws === ws);
  if (idx !== -1) {
    quickMatchQueue.splice(idx, 1);
    return true;
  }
  return false;
}

function startDisconnectCountdown(room: OnlineRoom, droppedSeat: RoomSeat) {
  clearSeatTimers(droppedSeat);
  if (!room.world) return;

  const otherSeatId: PlayerId = droppedSeat.seat === 1 ? 2 : 1;
  const otherSeat = room.seats[otherSeatId];

  // If match already finished, just clean up if both are disconnected
  if (room.world.winner !== null) {
    if (!otherSeat?.ws) {
      destroyRoom(room.code);
    }
    return;
  }

  droppedSeat.remainingSeconds = DISCONNECT_GRACE_SECONDS;
  room.lastAim = null;
  if (otherSeat?.ws) {
    sendMsg(otherSeat.ws, { type: 'aim:sync', aim: null });
    sendMsg(otherSeat.ws, {
      type: 'opponent:disconnected',
      remainingSeconds: DISCONNECT_GRACE_SECONDS,
    });
  }

  droppedSeat.countdownInterval = setInterval(() => {
    if (!rooms.has(room.code) || !room.world) {
      clearSeatTimers(droppedSeat);
      return;
    }

    if (droppedSeat.ws && droppedSeat.ws.readyState === WebSocket.OPEN) {
      clearSeatTimers(droppedSeat);
      return;
    }

    const nextSec = (droppedSeat.remainingSeconds ?? DISCONNECT_GRACE_SECONDS) - 1;
    droppedSeat.remainingSeconds = nextSec;

    const currentOther = room.seats[otherSeatId];

    if (nextSec <= 0) {
      clearSeatTimers(droppedSeat);
      if (room.tickInterval) {
        clearInterval(room.tickInterval);
        room.tickInterval = null;
      }

      if (currentOther?.ws && currentOther.ws.readyState === WebSocket.OPEN) {
        const winner = currentOther.seat;
        room.world.winner = winner;
        room.world.actionLocked = true;
        room.world.pendingDestructions = [];
        room.world.victoryDelay = 0;
        room.world.lastEventText = `Opponent disconnected · Player ${winner} wins by forfeit`;
        sendMsg(currentOther.ws, {
          type: 'match:forfeit',
          winner,
          world: room.world,
        });
      } else {
        destroyRoom(room.code);
      }
      return;
    }

    if (currentOther?.ws && currentOther.ws.readyState === WebSocket.OPEN) {
      sendMsg(currentOther.ws, {
        type: 'opponent:disconnected',
        remainingSeconds: nextSec,
      });
    }
  }, 1000);
}

function handleLeaveOrClose(ws: WebSocket, intentional: boolean) {
  const wasQueued = removeFromQueue(ws);
  if (wasQueued && intentional) {
    sendMsg(ws, { type: 'queue:cancelled' });
  }

  const meta = socketMeta.get(ws);
  if (!meta || !meta.roomCode || !meta.seat) return;

  const room = rooms.get(meta.roomCode);
  socketMeta.set(ws, { roomCode: null, seat: null });
  if (!room) return;

  const seat = room.seats[meta.seat];
  if (!seat || seat.ws !== ws) return;
  seat.ws = null;

  const otherSeatId: PlayerId = meta.seat === 1 ? 2 : 1;
  const otherSeat = room.seats[otherSeatId];

  // Unstarted private lobby room
  if (!room.world) {
    destroyRoom(room.code);
    return;
  }

  if (intentional) {
    clearSeatTimers(seat);
    if (room.world.winner === null && otherSeat?.ws && otherSeat.ws.readyState === WebSocket.OPEN) {
      if (room.tickInterval) {
        clearInterval(room.tickInterval);
        room.tickInterval = null;
      }
      const winner = otherSeat.seat;
      room.world.winner = winner;
      room.world.actionLocked = true;
      room.world.pendingDestructions = [];
      room.world.victoryDelay = 0;
      room.world.lastEventText = `Opponent left the match · Player ${winner} wins by forfeit`;
      sendMsg(otherSeat.ws, {
        type: 'match:forfeit',
        winner,
        world: room.world,
      });
    } else if (!otherSeat?.ws) {
      destroyRoom(room.code);
    }
    return;
  }

  startDisconnectCountdown(room, seat);
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ ok: true, rooms: rooms.size, queued: quickMatchQueue.length });
  });

  app.get('/tirahan-itch-io.zip', (_req, res) => {
    if (process.env.NODE_ENV === 'production') {
      res.status(404).send('Not found');
      return;
    }
    const exportZipPath = path.resolve(process.cwd(), 'exports', 'tirahan-itch-io.zip');
    if (!fs.existsSync(exportZipPath)) {
      res.status(404).send('itch.io package not built yet');
      return;
    }
    res.setHeader('Content-Type', 'application/zip');
    res.sendFile(exportZipPath);
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  const aliveSockets = new WeakSet<WebSocket>();

  server.on('upgrade', (req, socket, head) => {
    const reqPath = (req.url || '').split('?')[0];
    if (reqPath === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  wss.on('connection', (ws) => {
    aliveSockets.add(ws);
    lastSeenAt.set(ws, Date.now());
    socketMeta.set(ws, { roomCode: null, seat: null });

    ws.on('pong', () => {
      aliveSockets.add(ws);
      lastSeenAt.set(ws, Date.now());
    });

    ws.on('message', (raw) => {
      aliveSockets.add(ws);
      lastSeenAt.set(ws, Date.now());
      let msg: ClientToServerMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientToServerMessage;
      } catch {
        sendMsg(ws, { type: 'room:error', message: 'Invalid message payload.' });
        return;
      }

      if (msg.type === 'room:create') {
        handleLeaveOrClose(ws, true);
        const rules = sanitizeRules(msg.rules);
        const code = generateRoomCode();
        const token = generateSeatToken();
        const seat1: RoomSeat = {
          seat: 1,
          token,
          ws,
          remainingSeconds: null,
          countdownInterval: null,
        };
        const room: OnlineRoom = {
          code,
          rules,
          world: null,
          seats: { 1: seat1, 2: null },
          rematchVotes: new Set(),
          tickInterval: null,
          lastBroadcastAt: 0,
          lastAim: null,
          cleanupTimer: null,
        };
        rooms.set(code, room);
        socketMeta.set(ws, { roomCode: code, seat: 1 });
        sendMsg(ws, { type: 'room:created', code, seat: 1, seatToken: token, rules });
        return;
      }

      if (msg.type === 'room:join') {
        handleLeaveOrClose(ws, true);
        const code = String(msg.code || '').trim().toUpperCase();
        const room = rooms.get(code);
        if (!room) {
          sendMsg(ws, { type: 'room:error', message: `Room ${code || '(empty)'} not found.` });
          return;
        }
        if (room.seats[2] !== null || room.world !== null) {
          sendMsg(ws, { type: 'room:error', message: `Room ${code} is already full.` });
          return;
        }

        const seat1 = room.seats[1];
        if (!seat1 || !seat1.ws || seat1.ws.readyState !== WebSocket.OPEN) {
          destroyRoom(code);
          sendMsg(ws, { type: 'room:error', message: `Room ${code} host is no longer connected.` });
          return;
        }

        const token2 = generateSeatToken();
        const seat2: RoomSeat = {
          seat: 2,
          token: token2,
          ws,
          remainingSeconds: null,
          countdownInterval: null,
        };
        room.seats[2] = seat2;
        room.world = createWorld(room.rules);
        room.rematchVotes.clear();
        room.lastAim = null;
        socketMeta.set(ws, { roomCode: code, seat: 2 });

        sendMsg(seat1.ws, {
          type: 'room:started',
          code,
          seat: 1,
          seatToken: seat1.token,
          world: room.world,
        });
        sendMsg(seat2.ws, {
          type: 'room:started',
          code,
          seat: 2,
          seatToken: seat2.token,
          world: room.world,
        });
        return;
      }

      if (msg.type === 'room:reconnect') {
        const code = String(msg.code || '').trim().toUpperCase();
        const seatToken = String(msg.seatToken || '').trim();
        const room = rooms.get(code);
        if (!room || !room.world) {
          sendMsg(ws, { type: 'room:error', message: 'Match session expired or ended.' });
          return;
        }

        const targetSeat =
          room.seats[1]?.token === seatToken
            ? room.seats[1]
            : room.seats[2]?.token === seatToken
              ? room.seats[2]
              : null;

        if (!targetSeat) {
          sendMsg(ws, { type: 'room:error', message: 'Reconnect token invalid for this room.' });
          return;
        }

        clearSeatTimers(targetSeat);
        if (targetSeat.ws && targetSeat.ws !== ws) {
          const previousWs = targetSeat.ws;
          socketMeta.set(previousWs, { roomCode: null, seat: null });
          try {
            previousWs.close(4001, 'Session resumed in another tab');
          } catch {
            // Ignore close errors
          }
        }
        targetSeat.ws = ws;
        socketMeta.set(ws, { roomCode: code, seat: targetSeat.seat });

        const otherSeatId: PlayerId = targetSeat.seat === 1 ? 2 : 1;
        const otherSeat = room.seats[otherSeatId];
        const oppSec =
          otherSeat && !otherSeat.ws && otherSeat.remainingSeconds !== null
            ? otherSeat.remainingSeconds
            : null;

        sendMsg(ws, {
          type: 'room:resynced',
          code,
          seat: targetSeat.seat,
          seatToken: targetSeat.token,
          world: room.world,
          opponentDisconnectedSeconds: oppSec,
        });

        if (otherSeat?.ws && otherSeat.ws.readyState === WebSocket.OPEN) {
          sendMsg(otherSeat.ws, { type: 'opponent:reconnected' });
        }
        return;
      }

      if (msg.type === 'queue:join') {
        handleLeaveOrClose(ws, true);
        const rules = sanitizeRules(msg.rules);

        // Prune closed or stale sockets from queue before pairing
        const now = Date.now();
        while (
          quickMatchQueue.length > 0 &&
          (quickMatchQueue[0].ws === ws ||
            quickMatchQueue[0].ws.readyState !== WebSocket.OPEN ||
            now - (lastSeenAt.get(quickMatchQueue[0].ws) ?? 0) > 65000)
        ) {
          quickMatchQueue.shift();
        }

        if (quickMatchQueue.length > 0) {
          const waiting = quickMatchQueue.shift()!;
          const code = generateRoomCode();
          const token1 = generateSeatToken();
          const token2 = generateSeatToken();
          const world = createWorld(waiting.rules);

          const seat1: RoomSeat = {
            seat: 1,
            token: token1,
            ws: waiting.ws,
            remainingSeconds: null,
            countdownInterval: null,
          };
          const seat2: RoomSeat = {
            seat: 2,
            token: token2,
            ws,
            remainingSeconds: null,
            countdownInterval: null,
          };

          const room: OnlineRoom = {
            code,
            rules: waiting.rules,
            world,
            seats: { 1: seat1, 2: seat2 },
            rematchVotes: new Set(),
            tickInterval: null,
            lastBroadcastAt: 0,
            lastAim: null,
            cleanupTimer: null,
          };

          rooms.set(code, room);
          socketMeta.set(waiting.ws, { roomCode: code, seat: 1 });
          socketMeta.set(ws, { roomCode: code, seat: 2 });

          sendMsg(seat1.ws, {
            type: 'room:started',
            code,
            seat: 1,
            seatToken: token1,
            world,
          });
          sendMsg(seat2.ws, {
            type: 'room:started',
            code,
            seat: 2,
            seatToken: token2,
            world,
          });
        } else {
          quickMatchQueue.push({ ws, rules });
          sendMsg(ws, { type: 'queue:waiting' });
        }
        return;
      }

      if (msg.type === 'queue:leave') {
        removeFromQueue(ws);
        sendMsg(ws, { type: 'queue:cancelled' });
        return;
      }

      if (msg.type === 'room:leave') {
        handleLeaveOrClose(ws, true);
        return;
      }

      // Match-scoped messages below require active room & seat
      const meta = socketMeta.get(ws);
      if (!meta?.roomCode || !meta.seat) return;
      const room = rooms.get(meta.roomCode);
      if (!room || !room.world) return;
      const world = room.world;
      const otherSeatId: PlayerId = meta.seat === 1 ? 2 : 1;
      const otherSeat = room.seats[otherSeatId];

      if (msg.type === 'aim:update') {
        if (world.winner !== null || world.actionLocked || world.currentTurn !== meta.seat) {
          return;
        }
        const ship = world.ships.find(
          (s) => s.id === msg.shipId && s.alive && s.owner === meta.seat
        );
        if (!ship || !Number.isFinite(msg.angle)) return;
        ship.angle = msg.angle;
        room.lastAim = {
          shipId: ship.id,
          angle: msg.angle,
          isCharging: Boolean(msg.isCharging),
        };
        sendMsg(otherSeat?.ws, { type: 'aim:sync', aim: room.lastAim });
        return;
      }

      if (msg.type === 'action:fire') {
        if (world.winner !== null || world.actionLocked || world.currentTurn !== meta.seat) {
          return;
        }
        if (otherSeat && !otherSeat.ws) {
          return;
        }
        if (!Number.isFinite(msg.angle) || !Number.isFinite(msg.power)) return;

        room.lastAim = null;
        broadcastRoom(room, { type: 'aim:sync', aim: null });

        let executed = false;
        const cues = captureSfx(() => {
          executed = fireFromShip(world, msg.shipId, msg.angle, msg.power);
        });
        if (!executed) return;

        room.lastBroadcastAt = Date.now();
        broadcastRoom(room, {
          type: 'world:state',
          world,
          sfx: cues.length > 0 ? cues : undefined,
        });
        ensureRoomTickLoop(room);
        return;
      }

      if (msg.type === 'action:move') {
        if (world.winner !== null || world.actionLocked || world.currentTurn !== meta.seat) {
          return;
        }
        if (otherSeat && !otherSeat.ws) {
          return;
        }
        if (!Number.isFinite(msg.targetX) || !Number.isFinite(msg.targetY)) return;

        room.lastAim = null;
        broadcastRoom(room, { type: 'aim:sync', aim: null });

        let executed = false;
        const cues = captureSfx(() => {
          executed = executeMoveShip(world, msg.shipId, msg.targetX, msg.targetY);
        });
        if (!executed) return;

        room.lastBroadcastAt = Date.now();
        broadcastRoom(room, {
          type: 'world:state',
          world,
          sfx: cues.length > 0 ? cues : undefined,
        });
        ensureRoomTickLoop(room);
        return;
      }

      if (msg.type === 'match:rematch') {
        if (world.winner === null) return;
        if (!otherSeat?.ws || otherSeat.ws.readyState !== WebSocket.OPEN) {
          sendMsg(ws, { type: 'room:error', message: 'Opponent has left the room.' });
          return;
        }
        room.rematchVotes.add(meta.seat);
        if (room.rematchVotes.size >= 2) {
          room.rematchVotes.clear();
          if (room.tickInterval) {
            clearInterval(room.tickInterval);
            room.tickInterval = null;
          }
          room.world = createWorld(room.rules);
          room.lastAim = null;
          const s1 = room.seats[1]!;
          const s2 = room.seats[2]!;
          sendMsg(s1.ws, {
            type: 'room:started',
            code: room.code,
            seat: 1,
            seatToken: s1.token,
            world: room.world,
          });
          sendMsg(s2.ws, {
            type: 'room:started',
            code: room.code,
            seat: 2,
            seatToken: s2.token,
            world: room.world,
          });
        } else {
          broadcastRoom(room, {
            type: 'rematch:status',
            votes: Array.from(room.rematchVotes),
          });
        }
      }
    });

    ws.on('close', () => {
      handleLeaveOrClose(ws, false);
    });
  });

  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (!aliveSockets.has(client)) {
        client.terminate();
        continue;
      }
      aliveSockets.delete(client);
      client.ping();
    }
  }, 25000);

  wss.on('close', () => {
    clearInterval(heartbeat);
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Tirahan server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Tirahan server:', err);
  process.exit(1);
});
