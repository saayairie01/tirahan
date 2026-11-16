import { Peer, type DataConnection } from 'peerjs';
import {
  createWorld,
  executeMoveShip,
  fireFromShip,
  stepWorld,
} from './engine';
import type { OnlineTransport } from './onlineClient';
import {
  clearOnlineSession,
  saveOnlineSession,
} from './onlineClient';
import type {
  ClientToServerMessage,
  OnlineSfxCue,
  OpponentAimState,
  ServerToClientMessage,
} from './onlineTypes';
import { sound } from './sound';
import type { GameWorld, MatchRules, PlayerId } from './types';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PEER_PREFIX = 'tirahan-p2p-';
const QM_SLOT_PREFIX = 'tirahan-qm-';
const QM_SLOT_COUNT = 3;
const DISCONNECT_GRACE_SECONDS = 60;

function generateCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

function generateToken(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
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

export class PeerOnlineClient implements OnlineTransport {
  public readonly mode = 'p2p' as const;

  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private seat: PlayerId | null = null;
  private code: string | null = null;
  private seat1Token: string | null = null;
  private seat2Token: string | null = null;
  private rules: MatchRules = { ricochetWalls: false, asteroidDensity: 'medium' };
  private world: GameWorld | null = null;
  private rematchVotes = new Set<PlayerId>();

  private tickInterval: number | null = null;
  private lastBroadcastAt = 0;
  private disconnectInterval: number | null = null;
  private disconnectRemaining = DISCONNECT_GRACE_SECONDS;
  private lastAim: OpponentAimState | null = null;
  private intentionalClose = false;
  private guestConnectedOnce = false;
  private queueCancelled = false;

  private onMessage: (msg: ServerToClientMessage) => void;
  private onDisconnect: () => void;

  constructor(
    onMessage: (msg: ServerToClientMessage) => void,
    onDisconnect: () => void
  ) {
    this.onMessage = onMessage;
    this.onDisconnect = onDisconnect;
  }

  public isConnected(): boolean {
    if (this.seat === 1) {
      return this.peer !== null && !this.peer.destroyed && !this.peer.disconnected;
    }
    return this.conn !== null && this.conn.open;
  }

  public async ensureConnected(): Promise<void> {
    // Peer lifecycle starts per room/queue action
  }

  public send(msg: ClientToServerMessage) {
    if (msg.type === 'room:create') {
      void this.hostCreateRoom(msg.rules);
      return;
    }

    if (msg.type === 'room:join') {
      void this.guestJoinRoom(msg.code, null);
      return;
    }

    if (msg.type === 'room:reconnect') {
      void this.handleReconnectRequest(msg.code, msg.seatToken);
      return;
    }

    if (msg.type === 'queue:join') {
      void this.joinQuickMatchQueue(msg.rules);
      return;
    }

    if (msg.type === 'queue:leave') {
      this.leaveQuickMatchQueue();
      return;
    }

    if (msg.type === 'room:leave') {
      this.leaveRoom();
      return;
    }

    if (this.seat === 1) {
      this.handleHostAction(1, msg);
    } else if (this.conn && this.conn.open) {
      this.conn.send(msg);
    }
  }

  public restoreHostSnapshot(
    code: string,
    seatToken: string,
    guestToken: string | undefined,
    rules: MatchRules | undefined,
    world: GameWorld
  ) {
    this.code = code;
    this.seat = 1;
    this.seat1Token = seatToken;
    this.seat2Token = guestToken ?? null;
    this.rules = rules ?? world.rules;
    this.world = world;
  }

  public close() {
    this.intentionalClose = true;
    this.queueCancelled = true;
    this.clearTimers();
    if (this.conn) {
      try {
        this.conn.close();
      } catch {
        // Ignore close errors
      }
      this.conn = null;
    }
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // Ignore destroy errors
      }
      this.peer = null;
    }
  }

  private clearTimers() {
    if (this.tickInterval !== null) {
      window.clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    if (this.disconnectInterval !== null) {
      window.clearInterval(this.disconnectInterval);
      this.disconnectInterval = null;
    }
  }

  private persistHostSession() {
    if (this.seat !== 1 || !this.code || !this.seat1Token) return;
    saveOnlineSession({
      code: this.code,
      seat: 1,
      seatToken: this.seat1Token,
      transport: 'p2p',
      rules: this.rules,
      hostWorld: this.world ?? undefined,
      guestToken: this.seat2Token ?? undefined,
    });
  }

  private async openPeerWithId(peerId?: string, suppressPeerUnavailable = false): Promise<Peer> {
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // Ignore
      }
      this.peer = null;
    }

    return new Promise<Peer>((resolve, reject) => {
      const peer = peerId
        ? new Peer(peerId, { debug: 0 })
        : new Peer({ debug: 0 });
      let settled = false;

      const timeout = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          try {
            peer.destroy();
          } catch {
            // Ignore
          }
          reject(new Error('Could not reach WebRTC signaling server.'));
        }
      }, 10000);

      peer.on('open', () => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timeout);
          this.peer = peer;
          resolve(peer);
        }
      });

      peer.on('error', (err) => {
        const msg = err?.type === 'peer-unavailable'
          ? `Room ${this.code ?? ''} not found or host offline.`
          : err?.message || 'Peer connection error.';
        if (!settled) {
          settled = true;
          window.clearTimeout(timeout);
          reject(new Error(msg));
        } else if (!this.intentionalClose) {
          if (err?.type === 'peer-unavailable' && suppressPeerUnavailable) {
            return;
          }
          if (err?.type === 'peer-unavailable' || err?.type === 'network') {
            this.onMessage({ type: 'room:error', message: msg });
          }
        }
      });
    });
  }

  private async joinQuickMatchQueue(rules: MatchRules) {
    this.close();
    this.intentionalClose = false;
    this.queueCancelled = false;
    this.rules = rules;

    let scannerPeer: Peer;
    try {
      scannerPeer = await this.openPeerWithId(undefined, true);
    } catch (err) {
      this.onMessage({
        type: 'room:error',
        message: err instanceof Error ? err.message : 'Unable to reach Quick Match signaling.',
      });
      return;
    }

    if (this.queueCancelled) {
      this.close();
      return;
    }

    // Check active Quick Match waiting slots first
    for (let slot = 0; slot < QM_SLOT_COUNT; slot++) {
      if (this.queueCancelled) {
        this.close();
        return;
      }
      const matchedCode = await this.probeQuickMatchSlot(scannerPeer, `${QM_SLOT_PREFIX}${slot}`);
      if (matchedCode) {
        this.close();
        this.intentionalClose = false;
        this.queueCancelled = false;
        await new Promise((r) => window.setTimeout(r, 380));
        await this.guestJoinRoom(matchedCode, null, 6);
        return;
      }
    }

    // No opponent currently waiting; claim the first available Quick Match slot
    for (let slot = 0; slot < QM_SLOT_COUNT; slot++) {
      if (this.queueCancelled) {
        this.close();
        return;
      }
      const slotId = `${QM_SLOT_PREFIX}${slot}`;
      try {
        const waitPeer = await this.openPeerWithId(slotId, true);
        if (this.queueCancelled) {
          this.close();
          return;
        }
        this.onMessage({ type: 'queue:waiting' });

        let paired = false;
        waitPeer.on('connection', (incoming) => {
          if (paired || this.queueCancelled) {
            try {
              incoming.close();
            } catch {
              // Ignore
            }
            return;
          }

          incoming.on('open', () => {
            if (paired || this.queueCancelled) {
              try {
                incoming.close();
              } catch {
                // Ignore
              }
              return;
            }
            paired = true;
            const roomCode = generateCode();
            incoming.send({ type: 'qm:matched', code: roomCode });
            window.setTimeout(() => {
              try {
                incoming.close();
              } catch {
                // Ignore
              }
              if (!this.queueCancelled) {
                void this.hostCreateRoom(rules, roomCode, true);
              }
            }, 140);
          });
        });
        return;
      } catch {
        // Slot just claimed by someone else; try next slot
      }
    }

    this.onMessage({
      type: 'room:error',
      message: 'Quick Match slots are busy right now — please try again.',
    });
  }

  private probeQuickMatchSlot(peer: Peer, slotId: string): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      let settled = false;
      const done = (code: string | null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        peer.off('error', onPeerError);
        try {
          conn.close();
        } catch {
          // Ignore
        }
        resolve(code);
      };

      const onPeerError = (err: { type?: string }) => {
        if (err?.type === 'peer-unavailable') {
          done(null);
        }
      };
      peer.on('error', onPeerError);

      const conn = peer.connect(slotId, {
        serialization: 'json',
        metadata: { kind: 'quickmatch' },
      });

      const timer = window.setTimeout(() => done(null), 2200);

      conn.on('data', (raw) => {
        const payload = raw as { type?: string; code?: string };
        if (payload?.type === 'qm:matched' && typeof payload.code === 'string') {
          done(payload.code);
        }
      });
      conn.on('close', () => done(null));
      conn.on('error', () => done(null));
    });
  }

  private leaveQuickMatchQueue() {
    this.queueCancelled = true;
    this.close();
    this.onMessage({ type: 'queue:cancelled' });
  }

  private async hostCreateRoom(
    rules: MatchRules,
    forcedCode?: string,
    suppressCreatedEvent = false
  ) {
    this.close();
    this.intentionalClose = false;
    this.queueCancelled = false;
    this.rules = rules;
    this.seat = 1;
    this.world = null;
    this.rematchVotes.clear();
    this.seat1Token = generateToken();
    this.seat2Token = null;
    this.guestConnectedOnce = false;

    let peer: Peer | null = null;
    let roomCode = forcedCode ?? '';
    const maxAttempts = forcedCode ? 1 : 5;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (!forcedCode) {
        roomCode = generateCode();
      }
      this.code = roomCode;
      try {
        peer = await this.openPeerWithId(`${PEER_PREFIX}${roomCode}`);
        break;
      } catch (err) {
        if (attempt === maxAttempts - 1) {
          this.onMessage({
            type: 'room:error',
            message: err instanceof Error ? err.message : 'Failed to create P2P room.',
          });
          return;
        }
      }
    }

    if (!peer) return;
    this.bindHostPeer(peer);
    if (!suppressCreatedEvent) {
      this.onMessage({
        type: 'room:created',
        code: roomCode,
        seat: 1,
        seatToken: this.seat1Token,
        rules,
      });
    }
  }

  private bindHostPeer(peer: Peer) {
    peer.on('connection', (incoming) => {
      const meta = (incoming.metadata || {}) as { kind?: string; seatToken?: string };

      const sendToConn = (msg: ServerToClientMessage) => {
        if (incoming.open) {
          incoming.send(msg);
        }
      };

      incoming.on('open', () => {
        // Case 1: Fresh guest joining waiting room
        if (!this.world && !this.guestConnectedOnce) {
          this.guestConnectedOnce = true;
          this.conn = incoming;
          this.seat2Token = generateToken();
          this.world = createWorld(this.rules);
          this.rematchVotes.clear();
          this.lastAim = null;
          this.bindHostDataConnection(incoming);
          this.persistHostSession();

          this.onMessage({
            type: 'room:started',
            code: this.code!,
            seat: 1,
            seatToken: this.seat1Token!,
            world: this.world,
          });
          sendToConn({
            type: 'room:started',
            code: this.code!,
            seat: 2,
            seatToken: this.seat2Token,
            world: this.world,
          });
          return;
        }

        // Case 2: Guest reconnecting within grace window
        if (this.world && this.seat2Token && meta.seatToken === this.seat2Token) {
          if (this.disconnectInterval !== null) {
            window.clearInterval(this.disconnectInterval);
            this.disconnectInterval = null;
          }
          if (this.conn && this.conn !== incoming) {
            try {
              this.conn.close();
            } catch {
              // Ignore
            }
          }
          this.conn = incoming;
          this.bindHostDataConnection(incoming);

          sendToConn({
            type: 'room:resynced',
            code: this.code!,
            seat: 2,
            seatToken: this.seat2Token,
            world: this.world,
            opponentDisconnectedSeconds: null,
          });
          this.onMessage({ type: 'opponent:reconnected' });
          return;
        }

        // Otherwise reject full room
        sendToConn({
          type: 'room:error',
          message: `Room ${this.code ?? ''} is already full.`,
        });
        window.setTimeout(() => {
          try {
            incoming.close();
          } catch {
            // Ignore
          }
        }, 100);
      });
    });
  }

  private bindHostDataConnection(conn: DataConnection) {
    conn.on('data', (raw) => {
      if (this.conn !== conn) return;
      const msg = raw as ClientToServerMessage;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'room:leave') {
        this.handleHostOpponentLeft();
        return;
      }
      this.handleHostAction(2, msg);
    });

    conn.on('close', () => {
      if (this.conn !== conn) return;
      this.conn = null;
      if (this.intentionalClose || !this.world || this.world.winner !== null) return;
      this.startHostDisconnectGrace();
    });
  }

  private handleHostOpponentLeft() {
    this.clearTimers();
    if (this.world && this.world.winner === null) {
      this.world.winner = 1;
      this.world.actionLocked = true;
      this.world.pendingDestructions = [];
      this.world.victoryDelay = 0;
      this.world.lastEventText = 'Opponent left the match · Player 1 wins by forfeit';
      this.onMessage({
        type: 'match:forfeit',
        winner: 1,
        world: this.world,
      });
    }
    this.conn = null;
    clearOnlineSession();
  }

  private startHostDisconnectGrace() {
    if (this.disconnectInterval !== null) {
      window.clearInterval(this.disconnectInterval);
    }
    this.disconnectRemaining = DISCONNECT_GRACE_SECONDS;
    this.lastAim = null;
    this.onMessage({ type: 'aim:sync', aim: null });
    this.onMessage({
      type: 'opponent:disconnected',
      remainingSeconds: this.disconnectRemaining,
    });

    this.disconnectInterval = window.setInterval(() => {
      if (!this.world || (this.conn && this.conn.open)) {
        if (this.disconnectInterval !== null) {
          window.clearInterval(this.disconnectInterval);
          this.disconnectInterval = null;
        }
        return;
      }

      this.disconnectRemaining -= 1;
      if (this.disconnectRemaining <= 0) {
        this.clearTimers();
        this.world.winner = 1;
        this.world.actionLocked = true;
        this.world.pendingDestructions = [];
        this.world.victoryDelay = 0;
        this.world.lastEventText = 'Opponent disconnected · Player 1 wins by forfeit';
        this.onMessage({
          type: 'match:forfeit',
          winner: 1,
          world: this.world,
        });
        clearOnlineSession();
        return;
      }

      this.onMessage({
        type: 'opponent:disconnected',
        remainingSeconds: this.disconnectRemaining,
      });
    }, 1000);
  }

  private ensureHostTickLoop() {
    if (this.tickInterval !== null || !this.world) return;
    let lastTime = performance.now();

    this.tickInterval = window.setInterval(() => {
      const world = this.world;
      if (!world) {
        if (this.tickInterval !== null) {
          window.clearInterval(this.tickInterval);
          this.tickInterval = null;
        }
        return;
      }

      const now = performance.now();
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

      if (importantTransition || now - this.lastBroadcastAt >= 25) {
        this.lastBroadcastAt = now;
        this.onMessage({ type: 'world:state', world });
        if (this.conn && this.conn.open) {
          this.conn.send({
            type: 'world:state',
            world,
            sfx: cues.length > 0 ? cues : undefined,
          });
        }
      }

      if (settled) {
        if (this.tickInterval !== null) {
          window.clearInterval(this.tickInterval);
          this.tickInterval = null;
        }
        this.persistHostSession();
      }
    }, 1000 / 60);
  }

  private handleHostAction(senderSeat: PlayerId, msg: ClientToServerMessage) {
    const world = this.world;
    if (!world) return;

    if (msg.type === 'aim:update') {
      if (world.winner !== null || world.actionLocked || world.currentTurn !== senderSeat) {
        return;
      }
      const ship = world.ships.find(
        (s) => s.id === msg.shipId && s.alive && s.owner === senderSeat
      );
      if (!ship || !Number.isFinite(msg.angle)) return;
      ship.angle = msg.angle;
      this.lastAim = {
        shipId: ship.id,
        angle: msg.angle,
        isCharging: Boolean(msg.isCharging),
      };
      if (senderSeat === 1) {
        if (this.conn && this.conn.open) {
          this.conn.send({ type: 'aim:sync', aim: this.lastAim });
        }
      } else {
        this.onMessage({ type: 'aim:sync', aim: this.lastAim });
      }
      return;
    }

    if (msg.type === 'action:fire') {
      if (world.winner !== null || world.actionLocked || world.currentTurn !== senderSeat) {
        return;
      }
      if (!this.conn || !this.conn.open) return;
      if (!Number.isFinite(msg.angle) || !Number.isFinite(msg.power)) return;

      this.lastAim = null;
      this.onMessage({ type: 'aim:sync', aim: null });
      this.conn.send({ type: 'aim:sync', aim: null });

      let executed = false;
      const cues = captureSfx(() => {
        executed = fireFromShip(world, msg.shipId, msg.angle, msg.power);
      });
      if (!executed) return;

      this.lastBroadcastAt = performance.now();
      this.onMessage({ type: 'world:state', world });
      this.conn.send({
        type: 'world:state',
        world,
        sfx: cues.length > 0 ? cues : undefined,
      });
      this.persistHostSession();
      this.ensureHostTickLoop();
      return;
    }

    if (msg.type === 'action:move') {
      if (world.winner !== null || world.actionLocked || world.currentTurn !== senderSeat) {
        return;
      }
      if (!this.conn || !this.conn.open) return;
      if (!Number.isFinite(msg.targetX) || !Number.isFinite(msg.targetY)) return;

      this.lastAim = null;
      this.onMessage({ type: 'aim:sync', aim: null });
      this.conn.send({ type: 'aim:sync', aim: null });

      let executed = false;
      const cues = captureSfx(() => {
        executed = executeMoveShip(world, msg.shipId, msg.targetX, msg.targetY);
      });
      if (!executed) return;

      this.lastBroadcastAt = performance.now();
      this.onMessage({ type: 'world:state', world });
      this.conn.send({
        type: 'world:state',
        world,
        sfx: cues.length > 0 ? cues : undefined,
      });
      this.persistHostSession();
      this.ensureHostTickLoop();
      return;
    }

    if (msg.type === 'match:rematch') {
      if (world.winner === null) return;
      if (!this.conn || !this.conn.open) {
        if (senderSeat === 1) {
          this.onMessage({ type: 'room:error', message: 'Opponent has left the room.' });
        }
        return;
      }

      this.rematchVotes.add(senderSeat);
      if (this.rematchVotes.size >= 2) {
        this.rematchVotes.clear();
        if (this.tickInterval !== null) {
          window.clearInterval(this.tickInterval);
          this.tickInterval = null;
        }
        this.world = createWorld(this.rules);
        this.lastAim = null;
        this.persistHostSession();

        this.onMessage({
          type: 'room:started',
          code: this.code!,
          seat: 1,
          seatToken: this.seat1Token!,
          world: this.world,
        });
        this.conn.send({
          type: 'room:started',
          code: this.code!,
          seat: 2,
          seatToken: this.seat2Token!,
          world: this.world,
        });
      } else {
        const votes = Array.from(this.rematchVotes);
        this.onMessage({ type: 'rematch:status', votes });
        this.conn.send({ type: 'rematch:status', votes });
      }
    }
  }

  private async guestJoinRoom(rawCode: string, seatToken: string | null, maxAttempts = 1) {
    const code = rawCode.trim().toUpperCase();
    this.close();
    this.intentionalClose = false;
    this.queueCancelled = false;
    this.code = code;
    this.seat = 2;

    let peer: Peer;
    try {
      peer = await this.openPeerWithId(undefined, maxAttempts > 1);
    } catch (err) {
      this.onMessage({
        type: 'room:error',
        message: err instanceof Error ? err.message : 'Unable to connect via WebRTC.',
      });
      return;
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (this.intentionalClose || this.queueCancelled) return;
      const connected = await this.tryConnectGuestOnce(
        peer,
        code,
        seatToken,
        attempt === maxAttempts
      );
      if (connected) return;
      if (attempt < maxAttempts) {
        await new Promise((r) => window.setTimeout(r, 600));
      }
    }
  }

  private tryConnectGuestOnce(
    peer: Peer,
    code: string,
    seatToken: string | null,
    emitFailure: boolean
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const conn = peer.connect(`${PEER_PREFIX}${code}`, {
        serialization: 'json',
        metadata: seatToken ? { kind: 'reconnect', seatToken } : { kind: 'join' },
      });
      this.conn = conn;

      let opened = false;
      let settled = false;

      const onPeerUnavailable = (err: { type?: string }) => {
        if (!opened && err?.type === 'peer-unavailable') {
          failAttempt(`Room ${code} not found or host offline.`);
        }
      };

      const failAttempt = (reason: string) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(joinTimeout);
        peer.off('error', onPeerUnavailable);
        if (this.conn === conn) {
          this.conn = null;
        }
        try {
          conn.close();
        } catch {
          // Ignore
        }
        if (emitFailure) {
          this.onMessage({ type: 'room:error', message: reason });
        }
        resolve(false);
      };

      peer.on('error', onPeerUnavailable);

      const joinTimeout = window.setTimeout(() => {
        if (!opened) {
          failAttempt(`Timed out joining P2P room ${code}.`);
        }
      }, 6500);

      conn.on('open', () => {
        if (settled) return;
        opened = true;
        settled = true;
        window.clearTimeout(joinTimeout);
        peer.off('error', onPeerUnavailable);
        resolve(true);
      });

      conn.on('data', (raw) => {
        const msg = raw as ServerToClientMessage;
        if (msg.type === 'room:started' || msg.type === 'room:resynced') {
          this.world = msg.world;
          this.seat2Token = msg.seatToken;
        } else if (msg.type === 'world:state') {
          this.world = msg.world;
        } else if (msg.type === 'match:forfeit') {
          this.world = msg.world;
        }
        this.onMessage(msg);
      });

      conn.on('close', () => {
        if (!opened) {
          failAttempt(`Room ${code} unavailable.`);
          return;
        }
        if (this.conn === conn) {
          this.conn = null;
        }
        if (!this.intentionalClose && this.world && this.world.winner === null) {
          this.onDisconnect();
        }
      });

      conn.on('error', () => {
        if (!opened) {
          failAttempt(`Could not reach P2P room ${code}.`);
        }
      });
    });
  }

  private async handleReconnectRequest(code: string, seatToken: string) {
    if (this.seat === 1 && this.world && this.seat1Token === seatToken) {
      this.intentionalClose = false;
      this.code = code;
      this.guestConnectedOnce = true;
      try {
        const peer = await this.openPeerWithId(`${PEER_PREFIX}${code}`);
        this.bindHostPeer(peer);
        this.onMessage({
          type: 'room:resynced',
          code,
          seat: 1,
          seatToken,
          world: this.world,
          opponentDisconnectedSeconds: DISCONNECT_GRACE_SECONDS,
        });
        this.startHostDisconnectGrace();
      } catch (err) {
        this.onMessage({
          type: 'room:error',
          message: err instanceof Error ? err.message : 'Unable to restore P2P host room.',
        });
      }
      return;
    }

    await this.guestJoinRoom(code, seatToken, 2);
  }

  private leaveRoom() {
    this.intentionalClose = true;
    this.queueCancelled = true;
    this.clearTimers();
    if (this.seat === 1 && this.conn && this.conn.open && this.world && this.world.winner === null) {
      this.world.winner = 2;
      this.world.actionLocked = true;
      this.world.pendingDestructions = [];
      this.world.victoryDelay = 0;
      this.world.lastEventText = 'Host left the match · Player 2 wins by forfeit';
      this.conn.send({
        type: 'match:forfeit',
        winner: 2,
        world: this.world,
      });
    } else if (this.seat === 2 && this.conn && this.conn.open) {
      this.conn.send({ type: 'room:leave' });
    }
    this.close();
    clearOnlineSession();
  }
}
