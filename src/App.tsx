import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, FileAudio, Globe, Server, Users } from 'lucide-react';
import { GodotModal } from './components/GodotModal';
import { RulesModal } from './components/RulesModal';
import { TopBar } from './components/TopBar';

const IS_ITCH_EXPORT = import.meta.env.VITE_ITCH_EXPORT === 'true';
const IS_AUTHORING_ENV =
  !IS_ITCH_EXPORT &&
  (import.meta.env.DEV ||
    (typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.startsWith('ais-dev-'))));
import {
  KEY_ROTATION_SPEED,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  MIN_POWER,
  ROTATION_SENSITIVITY,
  chooseCpuAction,
  computeChargePower,
  createWorld,
  executeMoveShip,
  findShipAtPoint,
  fireFromShip,
  getMoveDraftPreview,
  getOverheatChance,
  getProjectileRange,
  rotateShipByDelta,
  stepWorld,
} from './game/engine';
import {
  OnlineSocketClient,
  type OnlineTransport,
  clearOnlineSession,
  getDefaultTransportMode,
  getEmbeddedDefaultWsUrl,
  getPublicEmbeddableWsUrl,
  getSavedOnlineSession,
  loadRuntimeOnlineConfig,
  normalizeWebSocketUrl,
  playOnlineSfxCues,
  resolveWebSocketUrl,
  saveOnlineSession,
  setWsUrlOverride,
} from './game/onlineClient';
import {
  OnlinePhase,
  OnlineTransportMode,
  OpponentAimState,
  ServerToClientMessage,
} from './game/onlineTypes';
import { PeerOnlineClient } from './game/peerOnlineClient';
import { sound } from './game/sound';
import {
  ActionMode,
  ActiveFireState,
  AsteroidDensity,
  GameMode,
  GameState,
  GameWorld,
  MatchRules,
  MoveDraft,
  PlayerId,
} from './game/types';
import { renderWorld } from './game/vectorDraw';

interface HudSnapshot {
  currentTurn: 1 | 2;
  turnCount: number;
  p1MotherHp: number;
  p1MotherMaxHp: number;
  p1Fighters: number;
  p1ShieldPct: number;
  p2MotherHp: number;
  p2MotherMaxHp: number;
  p2Fighters: number;
  p2ShieldPct: number;
  winner: 1 | 2 | null;
  victoryReady: boolean;
  pendingCollapseCount: number;
  lastEventText: string;
}

interface CpuAimTween {
  shipId: string;
  startAngle: number;
  targetAngle: number;
  elapsed: number;
  duration: number;
}

function readHudSnapshot(world: GameWorld): HudSnapshot {
  const p1Mother = world.ships.find((s) => s.id === 'p1-mothership');
  const p2Mother = world.ships.find((s) => s.id === 'p2-mothership');
  const p1Fighters = world.ships.filter((s) => s.owner === 1 && s.kind === 'fighter' && s.alive).length;
  const p2Fighters = world.ships.filter((s) => s.owner === 2 && s.kind === 'fighter' && s.alive).length;

  const p1Shields = world.shields.filter((seg) => seg.owner === 1);
  const p2Shields = world.shields.filter((seg) => seg.owner === 2);
  const p1Hp = p1Shields.reduce((sum, seg) => sum + seg.hp, 0);
  const p1Max = p1Shields.reduce((sum, seg) => sum + seg.maxHp, 0);
  const p2Hp = p2Shields.reduce((sum, seg) => sum + seg.hp, 0);
  const p2Max = p2Shields.reduce((sum, seg) => sum + seg.maxHp, 0);

  return {
    currentTurn: world.currentTurn,
    turnCount: world.turnCount,
    p1MotherHp: p1Mother ? Math.max(0, p1Mother.hp) : 0,
    p1MotherMaxHp: p1Mother ? p1Mother.maxHp : 20,
    p1Fighters,
    p1ShieldPct: p1Max > 0 ? Math.round((p1Hp / p1Max) * 100) : 0,
    p2MotherHp: p2Mother ? Math.max(0, p2Mother.hp) : 0,
    p2MotherMaxHp: p2Mother ? p2Mother.maxHp : 20,
    p2Fighters,
    p2ShieldPct: p2Max > 0 ? Math.round((p2Hp / p2Max) * 100) : 0,
    winner: world.winner,
    victoryReady:
      world.winner !== null && world.pendingDestructions.length === 0 && world.victoryDelay <= 0,
    pendingCollapseCount: world.pendingDestructions.length,
    lastEventText: world.lastEventText,
  };
}

function shortestAngleDiff(from: number, to: number): number {
  let diff = (to - from) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

export default function App() {
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [gameMode, setGameMode] = useState<GameMode>('pvp');
  const [rules, setRules] = useState<MatchRules>({
    ricochetWalls: false,
    asteroidDensity: 'medium',
  });
  const [actionMode, setActionMode] = useState<ActionMode>('fire');
  const [muted, setMuted] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(() => sound.isMusicEnabled());
  const [musicStatus, setMusicStatus] = useState(() => sound.getMusicStatus());
  const [musicFileName, setMusicFileName] = useState<string>('mattoglseby-3.ogg');
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [godotOpen, setGodotOpen] = useState(false);
  const musicInputRef = useRef<HTMLInputElement | null>(null);

  const [onlinePhase, setOnlinePhase] = useState<OnlinePhase>('idle');
  const [transportMode, setTransportMode] = useState<OnlineTransportMode>(() =>
    getDefaultTransportMode()
  );
  const [serverSettingsOpen, setServerSettingsOpen] = useState<boolean>(false);
  const [wsUrlInput, setWsUrlInput] = useState<string>(() => resolveWebSocketUrl() ?? '');
  const [wsUrlSavedNotice, setWsUrlSavedNotice] = useState<string | null>(null);
  const [onlineRoomCode, setOnlineRoomCode] = useState<string | null>(null);
  const [onlineSeat, setOnlineSeat] = useState<PlayerId | null>(null);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [opponentDisconnectedSeconds, setOpponentDisconnectedSeconds] = useState<number | null>(
    null
  );
  const [rematchRequested, setRematchRequested] = useState(false);
  const [opponentWantsRematch, setOpponentWantsRematch] = useState(false);

  const worldRef = useRef<GameWorld>(
    createWorld({ ricochetWalls: false, asteroidDensity: 'medium' })
  );
  const [hud, setHud] = useState<HudSnapshot>(() => readHudSnapshot(worldRef.current));
  const [activeShipStatus, setActiveShipStatus] = useState<{
    active: boolean;
    charging: boolean;
    powerPct: number;
    rangePx: number;
    overheatPct: number;
  }>({ active: false, charging: false, powerPct: 10, rangePx: 39, overheatPct: 0 });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const activeFireRef = useRef<ActiveFireState | null>(null);
  const moveDraftRef = useRef<MoveDraft | null>(null);
  const hoveredShipIdRef = useRef<string | null>(null);
  const chargePointerIdRef = useRef<number | null>(null);
  const movePointerIdRef = useRef<number | null>(null);
  const spaceChargingRef = useRef<boolean>(false);
  const lastClientXRef = useRef<number | null>(null);
  const keysHeldRef = useRef<Set<string>>(new Set());

  const cpuTimerRef = useRef<number | null>(null);
  const cpuFireTimerRef = useRef<number | null>(null);
  const cpuAimTweenRef = useRef<CpuAimTween | null>(null);

  const onlineClientRef = useRef<OnlineTransport | null>(null);
  const remoteAimRef = useRef<OpponentAimState | null>(null);
  const lastAimSentAtRef = useRef<number>(0);
  const reconnectRetryTimerRef = useRef<number | null>(null);
  const p2pGuestCountdownRef = useRef<number | null>(null);

  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;
  const gameModeRef = useRef(gameMode);
  gameModeRef.current = gameMode;
  const actionModeRef = useRef(actionMode);
  actionModeRef.current = actionMode;
  const onlinePhaseRef = useRef(onlinePhase);
  onlinePhaseRef.current = onlinePhase;
  const onlineSeatRef = useRef(onlineSeat);
  onlineSeatRef.current = onlineSeat;
  const opponentDisconnectedRef = useRef(opponentDisconnectedSeconds);
  opponentDisconnectedRef.current = opponentDisconnectedSeconds;
  const modalsOpenRef = useRef(false);
  modalsOpenRef.current = rulesOpen || godotOpen;

  const clearCpuTimers = useCallback(() => {
    if (cpuTimerRef.current !== null) {
      window.clearTimeout(cpuTimerRef.current);
      cpuTimerRef.current = null;
    }
    if (cpuFireTimerRef.current !== null) {
      window.clearTimeout(cpuFireTimerRef.current);
      cpuFireTimerRef.current = null;
    }
    cpuAimTweenRef.current = null;
  }, []);

  const syncActiveStatus = useCallback(() => {
    const af = activeFireRef.current;
    if (!af) {
      setActiveShipStatus((prev) =>
        prev.active || prev.charging
          ? { active: false, charging: false, powerPct: 10, rangePx: 80, overheatPct: 0 }
          : prev
      );
      return;
    }
    const ship = worldRef.current.ships.find((s) => s.id === af.shipId && s.alive);
    const powerPct = Math.round(af.power * 100);
    const rangePx = ship ? Math.round(getProjectileRange(ship, af.power)) : 0;
    const overheatPct = ship ? Math.round(getOverheatChance(af.power, ship.kind) * 100) : 0;
    setActiveShipStatus((prev) =>
      prev.active &&
      prev.charging === af.isCharging &&
      prev.powerPct === powerPct &&
      prev.rangePx === rangePx &&
      prev.overheatPct === overheatPct
        ? prev
        : { active: true, charging: af.isCharging, powerPct, rangePx, overheatPct }
    );
  }, []);

  const syncHud = useCallback(() => {
    const snap = readHudSnapshot(worldRef.current);
    setHud(snap);
    if (snap.winner !== null && (activeFireRef.current || moveDraftRef.current)) {
      activeFireRef.current = null;
      moveDraftRef.current = null;
      chargePointerIdRef.current = null;
      movePointerIdRef.current = null;
      spaceChargingRef.current = false;
      syncActiveStatus();
    }
    if (snap.victoryReady && gameStateRef.current === 'PLAYING') {
      setGameState('GAME_OVER');
    }
  }, [syncActiveStatus]);

  const isInputAllowed = useCallback(() => {
    const world = worldRef.current;
    if (gameStateRef.current !== 'PLAYING') return false;
    if (modalsOpenRef.current) return false;
    if (world.actionLocked || world.winner !== null) return false;
    if (gameModeRef.current === 'cpu' && world.currentTurn === 2) return false;
    if (gameModeRef.current === 'online') {
      if (onlineSeatRef.current === null || world.currentTurn !== onlineSeatRef.current) {
        return false;
      }
      if (opponentDisconnectedRef.current !== null) return false;
    }
    return true;
  }, []);

  const emitAimUpdate = useCallback(
    (shipId: string, angle: number, isCharging: boolean, force = false) => {
      if (gameModeRef.current !== 'online') return;
      const now = performance.now();
      if (!force && now - lastAimSentAtRef.current < 32) return;
      lastAimSentAtRef.current = now;
      onlineClientRef.current?.send({
        type: 'aim:update',
        shipId,
        angle,
        isCharging,
      });
    },
    []
  );

  const handleActionModeChange = useCallback(
    (nextMode: ActionMode) => {
      activeFireRef.current = null;
      moveDraftRef.current = null;
      chargePointerIdRef.current = null;
      movePointerIdRef.current = null;
      spaceChargingRef.current = false;
      setActionMode(nextMode);
      syncActiveStatus();
    },
    [syncActiveStatus]
  );

  const resetLocalInputState = useCallback(() => {
    activeFireRef.current = null;
    moveDraftRef.current = null;
    hoveredShipIdRef.current = null;
    chargePointerIdRef.current = null;
    movePointerIdRef.current = null;
    spaceChargingRef.current = false;
    lastClientXRef.current = null;
    remoteAimRef.current = null;
    syncActiveStatus();
  }, [syncActiveStatus]);

  const clearOnlineTimers = useCallback(() => {
    if (reconnectRetryTimerRef.current !== null) {
      window.clearTimeout(reconnectRetryTimerRef.current);
      reconnectRetryTimerRef.current = null;
    }
    if (p2pGuestCountdownRef.current !== null) {
      window.clearInterval(p2pGuestCountdownRef.current);
      p2pGuestCountdownRef.current = null;
    }
  }, []);

  const leaveOnlineRoom = useCallback(() => {
    clearOnlineTimers();
    onlineClientRef.current?.send({ type: 'room:leave' });
    clearOnlineSession();
    setOnlinePhase('idle');
    setOnlineRoomCode(null);
    setOnlineSeat(null);
    setOnlineError(null);
    setOpponentDisconnectedSeconds(null);
    setRematchRequested(false);
    setOpponentWantsRematch(false);
    resetLocalInputState();
    setGameMode('pvp');
    setGameState('TITLE_MENU');
  }, [clearOnlineTimers, resetLocalInputState]);

  const getOrCreateOnlineClient = useCallback(
    (mode: OnlineTransportMode): OnlineTransport => {
      if (onlineClientRef.current && onlineClientRef.current.mode === mode) {
        return onlineClientRef.current;
      }

      if (onlineClientRef.current) {
        onlineClientRef.current.close();
        onlineClientRef.current = null;
      }

      const handleServerMessage = (msg: ServerToClientMessage) => {
        if (msg.type === 'room:created') {
          setOnlineRoomCode(msg.code);
          setOnlineSeat(msg.seat);
          setOnlinePhase('waiting_room');
          setOnlineError(null);
          setRules(msg.rules);
          return;
        }

        if (msg.type === 'queue:waiting') {
          setOnlinePhase('queueing');
          setOnlineError(null);
          return;
        }

        if (msg.type === 'queue:cancelled') {
          setOnlinePhase('idle');
          return;
        }

        if (msg.type === 'room:started' || msg.type === 'room:resynced') {
          clearOnlineTimers();
          if (mode === 'ws' || msg.seat === 2) {
            saveOnlineSession({
              code: msg.code,
              seat: msg.seat,
              seatToken: msg.seatToken,
              transport: mode,
            });
          }
          clearCpuTimers();
          resetLocalInputState();
          setGameMode('online');
          setOnlinePhase('playing');
          setOnlineRoomCode(msg.code);
          setOnlineSeat(msg.seat);
          setOnlineError(null);
          setActionMode('fire');
          setRematchRequested(false);
          setOpponentWantsRematch(false);
          setOpponentDisconnectedSeconds(
            msg.type === 'room:resynced' ? msg.opponentDisconnectedSeconds : null
          );
          worldRef.current = msg.world;
          const snap = readHudSnapshot(msg.world);
          setHud(snap);
          setGameState(snap.victoryReady ? 'GAME_OVER' : 'PLAYING');
          sound.tryStartMusicOnGesture();
          return;
        }

        if (msg.type === 'aim:sync') {
          remoteAimRef.current = msg.aim;
          if (msg.aim) {
            const targetShip = worldRef.current.ships.find(
              (s) => s.id === msg.aim?.shipId && s.alive
            );
            if (targetShip) {
              targetShip.angle = msg.aim.angle;
            }
          }
          return;
        }

        if (msg.type === 'world:state') {
          worldRef.current = msg.world;
          playOnlineSfxCues(msg.sfx);
          syncHud();
          return;
        }

        if (msg.type === 'opponent:disconnected') {
          setOpponentDisconnectedSeconds(msg.remainingSeconds);
          return;
        }

        if (msg.type === 'opponent:reconnected') {
          clearOnlineTimers();
          setOpponentDisconnectedSeconds(null);
          return;
        }

        if (msg.type === 'match:forfeit') {
          clearOnlineTimers();
          worldRef.current = msg.world;
          setOpponentDisconnectedSeconds(null);
          clearOnlineSession();
          if (msg.winner === onlineSeatRef.current) {
            sound.playVictory();
          }
          syncHud();
          return;
        }

        if (msg.type === 'rematch:status') {
          setOpponentWantsRematch(msg.votes.some((v) => v !== onlineSeatRef.current));
          return;
        }

        if (msg.type === 'room:error') {
          setOnlineError(msg.message);
          setRematchRequested(false);
          if (onlinePhaseRef.current !== 'playing') {
            clearOnlineSession();
            setOnlinePhase('idle');
          }
        }
      };

      const handleDisconnect = () => {
        if (onlinePhaseRef.current === 'waiting_room' || onlinePhaseRef.current === 'queueing') {
          setOnlinePhase('idle');
          setOnlineError('Connection lost.');
          return;
        }

        if (gameModeRef.current === 'online' && gameStateRef.current === 'PLAYING') {
          const saved = getSavedOnlineSession();
          if (!saved) return;

          if (mode === 'p2p' && onlineSeatRef.current === 2) {
            if (p2pGuestCountdownRef.current === null) {
              let remaining = 60;
              setOpponentDisconnectedSeconds(remaining);
              p2pGuestCountdownRef.current = window.setInterval(() => {
                remaining -= 1;
                if (remaining <= 0) {
                  clearOnlineTimers();
                  const w = worldRef.current;
                  w.winner = 2;
                  w.actionLocked = true;
                  w.pendingDestructions = [];
                  w.victoryDelay = 0;
                  w.lastEventText = 'Host disconnected · Player 2 wins by forfeit';
                  setOpponentDisconnectedSeconds(null);
                  clearOnlineSession();
                  sound.playVictory();
                  syncHud();
                  return;
                }
                setOpponentDisconnectedSeconds(remaining);
              }, 1000);
            }

            const attemptGuestReconnect = () => {
              if (
                gameModeRef.current !== 'online' ||
                gameStateRef.current !== 'PLAYING' ||
                worldRef.current.winner !== null ||
                onlineClientRef.current?.isConnected()
              ) {
                return;
              }
              onlineClientRef.current?.send({
                type: 'room:reconnect',
                code: saved.code,
                seatToken: saved.seatToken,
              });
              reconnectRetryTimerRef.current = window.setTimeout(attemptGuestReconnect, 2500);
            };
            reconnectRetryTimerRef.current = window.setTimeout(attemptGuestReconnect, 1500);
            return;
          }

          setOnlineError('Connection lost — reconnecting...');
          const attemptReconnect = async () => {
            if (gameModeRef.current !== 'online' || gameStateRef.current !== 'PLAYING') return;
            try {
              await onlineClientRef.current?.ensureConnected();
              onlineClientRef.current?.send({
                type: 'room:reconnect',
                code: saved.code,
                seatToken: saved.seatToken,
              });
              setOnlineError(null);
            } catch {
              reconnectRetryTimerRef.current = window.setTimeout(attemptReconnect, 2500);
            }
          };
          reconnectRetryTimerRef.current = window.setTimeout(attemptReconnect, 1200);
        }
      };

      const client: OnlineTransport =
        mode === 'p2p'
          ? new PeerOnlineClient(handleServerMessage, handleDisconnect)
          : new OnlineSocketClient(handleServerMessage, handleDisconnect);
      onlineClientRef.current = client;
      return client;
    },
    [clearCpuTimers, clearOnlineTimers, resetLocalInputState, syncHud]
  );

  const startNewMatch = useCallback(
    (mode: GameMode, nextRules: MatchRules) => {
      sound.tryStartMusicOnGesture();
      clearCpuTimers();
      clearOnlineTimers();
      clearOnlineSession();
      setOnlinePhase('idle');
      setOnlineRoomCode(null);
      setOnlineSeat(null);
      setOpponentDisconnectedSeconds(null);
      resetLocalInputState();
      setGameMode(mode);
      setRules(nextRules);
      setActionMode('fire');
      const nextWorld = createWorld(nextRules);
      if (mode === 'cpu' && nextWorld.currentTurn === 2) {
        nextWorld.lastEventText = 'Coin flip: CPU shoots first';
      }
      worldRef.current = nextWorld;
      setHud(readHudSnapshot(nextWorld));
      setGameState('PLAYING');
    },
    [clearCpuTimers, clearOnlineTimers, resetLocalInputState]
  );

  // Load runtime online config, restore saved session, or prefill ?room=CODE&mode=p2p|ws invite
  useEffect(() => {
    let cancelled = false;

    const initOnline = async () => {
      await loadRuntimeOnlineConfig();
      if (cancelled) return;

      const resolvedWs = resolveWebSocketUrl();
      setWsUrlInput((prev) => prev || resolvedWs || '');

      const params = new URLSearchParams(window.location.search);
      const inviteCode = params.get('room')?.trim().toUpperCase();
      const modeParam = params.get('mode');
      const saved = getSavedOnlineSession();

      if (modeParam === 'p2p' || modeParam === 'ws') {
        setTransportMode(modeParam);
      } else if (!saved) {
        setTransportMode(getDefaultTransportMode());
      }

      if (inviteCode && inviteCode.length >= 4 && (!saved || saved.code !== inviteCode)) {
        setJoinCodeInput(inviteCode);
      } else if (saved) {
        const savedMode: OnlineTransportMode = saved.transport ?? getDefaultTransportMode();
        setTransportMode(savedMode);
        const client = getOrCreateOnlineClient(savedMode);
        if (
          savedMode === 'p2p' &&
          saved.seat === 1 &&
          saved.hostWorld &&
          client instanceof PeerOnlineClient
        ) {
          client.restoreHostSnapshot(
            saved.code,
            saved.seatToken,
            saved.guestToken,
            saved.rules,
            saved.hostWorld
          );
        }
        client
          .ensureConnected()
          .then(() => {
            client.send({
              type: 'room:reconnect',
              code: saved.code,
              seatToken: saved.seatToken,
            });
          })
          .catch(() => {
            clearOnlineSession();
          });
      }
    };

    void initOnline();

    return () => {
      cancelled = true;
      clearOnlineTimers();
      onlineClientRef.current?.close();
      onlineClientRef.current = null;
    };
  }, [clearOnlineTimers, getOrCreateOnlineClient]);

  // Probe for bundled ./mattoglseby-3.ogg and subscribe to music updates
  useEffect(() => {
    const unsub = sound.subscribeMusic(() => {
      setMusicEnabled(sound.isMusicEnabled());
      setMusicStatus(sound.getMusicStatus());
    });
    sound.probeBundledMusic();
    return unsub;
  }, []);

  // Ensure looping music starts cleanly on first user interaction if enabled
  useEffect(() => {
    const resumeOnGesture = () => {
      sound.tryStartMusicOnGesture();
    };
    window.addEventListener('pointerdown', resumeOnGesture, { passive: true });
    window.addEventListener('keydown', resumeOnGesture, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', resumeOnGesture);
      window.removeEventListener('keydown', resumeOnGesture);
    };
  }, []);

  const fireActiveShip = useCallback(() => {
    const af = activeFireRef.current;
    if (!af || !isInputAllowed()) return;
    const world = worldRef.current;
    const ship = world.ships.find((s) => s.id === af.shipId && s.alive && s.owner === world.currentTurn);
    if (!ship) {
      activeFireRef.current = null;
      syncActiveStatus();
      return;
    }
    const power = af.power;
    activeFireRef.current = null;
    chargePointerIdRef.current = null;
    spaceChargingRef.current = false;
    if (gameModeRef.current === 'online') {
      world.actionLocked = true;
      onlineClientRef.current?.send({
        type: 'action:fire',
        shipId: ship.id,
        angle: ship.angle,
        power,
      });
      syncActiveStatus();
      return;
    }
    fireFromShip(world, ship.id, ship.angle, power);
    syncActiveStatus();
    syncHud();
  }, [isInputAllowed, syncActiveStatus, syncHud]);

  // Fit 1280x760 vector canvas cleanly inside viewport container
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const aspect = LOGICAL_WIDTH / LOGICAL_HEIGHT;
      let w = rect.width;
      let h = w / aspect;
      if (h > rect.height) {
        h = rect.height;
        w = h * aspect;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${Math.floor(w)}px`;
      canvas.style.height = `${Math.floor(h)}px`;
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(container);
    window.addEventListener('resize', updateSize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  // Main 60fps animation, rotation, charging & physics loop
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();
    let hudTick = 0;

    const frame = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      const world = worldRef.current;
      const hadProjectiles = world.projectiles.length > 0;
      const prevTurn = world.currentTurn;
      const prevWinner = world.winner;
      const prevPending = world.pendingDestructions.length;
      const prevVictoryReady =
        world.winner !== null &&
        world.pendingDestructions.length === 0 &&
        world.victoryDelay <= 0;

      // Update active ship charging or keyboard fine rotation
      const af = activeFireRef.current;
      if (af && isInputAllowed() && actionModeRef.current === 'fire') {
        if (af.isCharging) {
          af.chargeTime += dt;
          af.power = computeChargePower(af.chargeTime);
        } else {
          const leftHeld =
            keysHeldRef.current.has('ArrowLeft') || keysHeldRef.current.has('KeyA');
          const rightHeld =
            keysHeldRef.current.has('ArrowRight') || keysHeldRef.current.has('KeyD');
          const dir = (rightHeld ? 1 : 0) - (leftHeld ? 1 : 0);
          if (dir !== 0) {
            rotateShipByDelta(world, af.shipId, dir * KEY_ROTATION_SPEED * dt);
            const ship = world.ships.find((s) => s.id === af.shipId);
            if (ship) {
              emitAimUpdate(ship.id, ship.angle, false);
            }
          }
        }
      }

      // Smoothly rotate CPU ship toward its planned shot angle
      const tween = cpuAimTweenRef.current;
      if (tween) {
        tween.elapsed = Math.min(tween.duration, tween.elapsed + dt);
        const t = tween.duration > 0 ? tween.elapsed / tween.duration : 1;
        const eased = 1 - Math.pow(1 - t, 3);
        const ship = world.ships.find((s) => s.id === tween.shipId);
        if (ship) {
          ship.angle = tween.startAngle + shortestAngleDiff(tween.startAngle, tween.targetAngle) * eased;
        }
      }

      if (gameModeRef.current !== 'online') {
        stepWorld(world, dt);
      }

      const nowPending = world.pendingDestructions.length;
      const nowVictoryReady =
        world.winner !== null &&
        world.pendingDestructions.length === 0 &&
        world.victoryDelay <= 0;

      hudTick += dt;
      if (af?.isCharging) {
        syncActiveStatus();
      }
      if (
        hadProjectiles !== (world.projectiles.length > 0) ||
        prevTurn !== world.currentTurn ||
        prevWinner !== world.winner ||
        prevPending !== nowPending ||
        prevVictoryReady !== nowVictoryReady ||
        hudTick > 0.25
      ) {
        hudTick = 0;
        syncHud();
      }

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const scaleX = canvas.width / LOGICAL_WIDTH;
          const scaleY = canvas.height / LOGICAL_HEIGHT;
          ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);

          const humanTurn =
            gameStateRef.current === 'PLAYING' &&
            !(gameModeRef.current === 'cpu' && world.currentTurn === 2) &&
            !(
              gameModeRef.current === 'online' &&
              (onlineSeatRef.current === null ||
                world.currentTurn !== onlineSeatRef.current ||
                opponentDisconnectedRef.current !== null)
            );

          const renderActiveFire: ActiveFireState | null =
            af ??
            (tween
              ? { shipId: tween.shipId, isCharging: false, chargeTime: 0, power: 0.5 }
              : null);

          renderWorld(
            ctx,
            world,
            renderActiveFire,
            moveDraftRef.current,
            hoveredShipIdRef.current,
            actionModeRef.current,
            now / 1000,
            humanTurn,
            gameModeRef.current === 'online' ? remoteAimRef.current : null
          );
        }
      }

      rafId = window.requestAnimationFrame(frame);
    };

    rafId = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(rafId);
  }, [emitAimUpdate, isInputAllowed, syncActiveStatus, syncHud]);

  // Global horizontal mouse movement rotates the active ship clockwise / counter-clockwise
  useEffect(() => {
    const onWindowPointerMove = (e: PointerEvent) => {
      const af = activeFireRef.current;
      if (
        !af ||
        af.isCharging ||
        actionModeRef.current !== 'fire' ||
        !isInputAllowed()
      ) {
        lastClientXRef.current = e.clientX;
        return;
      }

      if (lastClientXRef.current === null) {
        lastClientXRef.current = e.clientX;
        return;
      }

      const dx = e.clientX - lastClientXRef.current;
      lastClientXRef.current = e.clientX;
      if (dx !== 0) {
        rotateShipByDelta(worldRef.current, af.shipId, dx * ROTATION_SENSITIVITY);
        const ship = worldRef.current.ships.find((s) => s.id === af.shipId);
        if (ship) {
          emitAimUpdate(ship.id, ship.angle, false);
        }
      }
    };

    const onWindowBlur = () => {
      keysHeldRef.current.clear();
      lastClientXRef.current = null;
      if (activeFireRef.current?.isCharging) {
        activeFireRef.current.isCharging = false;
        activeFireRef.current.chargeTime = 0;
        activeFireRef.current.power = MIN_POWER;
        chargePointerIdRef.current = null;
        spaceChargingRef.current = false;
        const ship = worldRef.current.ships.find((s) => s.id === activeFireRef.current?.shipId);
        if (ship) {
          emitAimUpdate(ship.id, ship.angle, false, true);
        }
        syncActiveStatus();
      }
    };

    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, [emitAimUpdate, isInputAllowed, syncActiveStatus]);

  // Trigger CPU turn automatically when playing vs CPU
  useEffect(() => {
    clearCpuTimers();
    if (
      gameState !== 'PLAYING' ||
      gameMode !== 'cpu' ||
      hud.currentTurn !== 2 ||
      hud.winner !== null
    ) {
      return;
    }

    const world = worldRef.current;
    if (
      world.actionLocked ||
      world.winner !== null ||
      world.pendingDestructions.length > 0 ||
      world.projectiles.length > 0
    ) {
      return;
    }

    cpuTimerRef.current = window.setTimeout(() => {
      const currentWorld = worldRef.current;
      if (currentWorld.actionLocked || currentWorld.winner !== null) return;
      const plan = chooseCpuAction(currentWorld);
      if (!plan) return;
      const ship = currentWorld.ships.find((s) => s.id === plan.shipId && s.alive);
      if (!ship) return;

      cpuAimTweenRef.current = {
        shipId: plan.shipId,
        startAngle: ship.angle,
        targetAngle: plan.angle,
        elapsed: 0,
        duration: 0.42,
      };

      cpuFireTimerRef.current = window.setTimeout(() => {
        cpuAimTweenRef.current = null;
        if (worldRef.current.winner !== null || worldRef.current.actionLocked) return;
        fireFromShip(worldRef.current, plan.shipId, plan.angle, plan.power);
        syncHud();
      }, 460);
    }, 580);

    return clearCpuTimers;
  }, [gameState, gameMode, hud.currentTurn, hud.turnCount, hud.winner, clearCpuTimers, syncHud]);

  // Keyboard controls (Esc deselect, Space hold/release to charge & fire, A/D & Arrows to rotate, M to toggle Move)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (rulesOpen || godotOpen) {
        if (e.key === 'Escape') {
          setRulesOpen(false);
          setGodotOpen(false);
        }
        return;
      }

      keysHeldRef.current.add(e.code);

      if (e.key === 'Escape') {
        activeFireRef.current = null;
        moveDraftRef.current = null;
        chargePointerIdRef.current = null;
        movePointerIdRef.current = null;
        spaceChargingRef.current = false;
        syncActiveStatus();
        return;
      }

      if ((e.key === 'm' || e.key === 'M') && gameStateRef.current === 'PLAYING') {
        handleActionModeChange(actionModeRef.current === 'fire' ? 'move' : 'fire');
        return;
      }

      if (
        e.code === 'Space' &&
        !e.repeat &&
        actionModeRef.current === 'fire' &&
        isInputAllowed() &&
        activeFireRef.current &&
        !activeFireRef.current.isCharging
      ) {
        e.preventDefault();
        activeFireRef.current.isCharging = true;
        activeFireRef.current.chargeTime = 0;
        activeFireRef.current.power = MIN_POWER;
        spaceChargingRef.current = true;
        const ship = worldRef.current.ships.find((s) => s.id === activeFireRef.current?.shipId);
        if (ship) {
          emitAimUpdate(ship.id, ship.angle, true, true);
        }
        syncActiveStatus();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysHeldRef.current.delete(e.code);
      if (e.code === 'Space' && spaceChargingRef.current) {
        e.preventDefault();
        spaceChargingRef.current = false;
        if (activeFireRef.current?.isCharging) {
          fireActiveShip();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [
    rulesOpen,
    godotOpen,
    emitAimUpdate,
    fireActiveShip,
    handleActionModeChange,
    isInputAllowed,
    syncActiveStatus,
  ]);

  const toLogicalPoint = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) * LOGICAL_WIDTH) / rect.width,
      y: ((clientY - rect.top) * LOGICAL_HEIGHT) / rect.height,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isInputAllowed()) return;

    // Right-click deselects active ship
    if (e.button === 2) {
      activeFireRef.current = null;
      moveDraftRef.current = null;
      chargePointerIdRef.current = null;
      movePointerIdRef.current = null;
      spaceChargingRef.current = false;
      syncActiveStatus();
      return;
    }

    if (e.button !== 0) return;

    const pt = toLogicalPoint(e.clientX, e.clientY);
    const world = worldRef.current;
    const clickedShip = findShipAtPoint(world, pt.x, pt.y, world.currentTurn);

    // Move mode: drag a friendly fighter ship to reposition
    if (actionModeRef.current === 'move') {
      if (!clickedShip || clickedShip.kind !== 'fighter') return;
      movePointerIdRef.current = e.pointerId;
      e.currentTarget.setPointerCapture(e.pointerId);
      moveDraftRef.current = getMoveDraftPreview(world, clickedShip, pt.x, pt.y);
      return;
    }

    // Fire mode: clicking an inactive friendly ship activates or switches to it
    if (clickedShip && (!activeFireRef.current || activeFireRef.current.shipId !== clickedShip.id)) {
      activeFireRef.current = {
        shipId: clickedShip.id,
        isCharging: false,
        chargeTime: 0,
        power: MIN_POWER,
      };
      lastClientXRef.current = e.clientX;
      sound.playSelect();
      emitAimUpdate(clickedShip.id, clickedShip.angle, false, true);
      syncActiveStatus();
      return;
    }

    // Fire mode: holding click while a ship is active starts charging shot power
    if (activeFireRef.current && !activeFireRef.current.isCharging) {
      activeFireRef.current.isCharging = true;
      activeFireRef.current.chargeTime = 0;
      activeFireRef.current.power = MIN_POWER;
      chargePointerIdRef.current = e.pointerId;
      e.currentTarget.setPointerCapture(e.pointerId);
      const ship = worldRef.current.ships.find((s) => s.id === activeFireRef.current?.shipId);
      if (ship) {
        emitAimUpdate(ship.id, ship.angle, true, true);
      }
      syncActiveStatus();
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = toLogicalPoint(e.clientX, e.clientY);
    const world = worldRef.current;

    if (movePointerIdRef.current === e.pointerId && moveDraftRef.current) {
      const ship = world.ships.find((s) => s.id === moveDraftRef.current?.shipId && s.alive);
      if (ship) {
        moveDraftRef.current = getMoveDraftPreview(world, ship, pt.x, pt.y);
      }
      return;
    }

    if (isInputAllowed()) {
      const hovered = findShipAtPoint(world, pt.x, pt.y, world.currentTurn);
      if (hovered && actionModeRef.current === 'move' && hovered.kind !== 'fighter') {
        hoveredShipIdRef.current = null;
      } else {
        hoveredShipIdRef.current = hovered ? hovered.id : null;
      }
    } else {
      hoveredShipIdRef.current = null;
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (movePointerIdRef.current === e.pointerId) {
      movePointerIdRef.current = null;
      const draft = moveDraftRef.current;
      moveDraftRef.current = null;
      if (draft && !draft.cancelled && isInputAllowed()) {
        if (gameModeRef.current === 'online') {
          worldRef.current.actionLocked = true;
          onlineClientRef.current?.send({
            type: 'action:move',
            shipId: draft.shipId,
            targetX: draft.targetX,
            targetY: draft.targetY,
          });
          setActionMode('fire');
        } else {
          executeMoveShip(worldRef.current, draft.shipId, draft.targetX, draft.targetY);
          setActionMode('fire');
          syncHud();
        }
      }
      return;
    }

    if (chargePointerIdRef.current === e.pointerId) {
      chargePointerIdRef.current = null;
      if (activeFireRef.current?.isCharging) {
        fireActiveShip();
      }
    }
  };

  const handleToggleMute = () => {
    const next = !muted;
    setMuted(next);
    sound.setMuted(next);
  };

  const handleToggleMusic = () => {
    const next = !musicEnabled;
    sound.setMusicEnabled(next);
    setMusicEnabled(next);
  };

  const handleMusicFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const ok = await sound.loadLocalMusicFile(file);
    if (ok) {
      setMusicFileName(file.name);
      setExportStatus(`Loaded ${file.name} — it will be bundled inside your itch.io zip.`);
    } else {
      setExportStatus('Could not read audio file.');
    }
  };

  const handleDownloadItchZip = async () => {
    if (!IS_AUTHORING_ENV || isExportingZip) return;
    setIsExportingZip(true);
    setExportStatus(null);
    try {
      const res = await fetch('./tirahan-itch-io.zip', { cache: 'no-store' });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || contentType.includes('text/html')) {
        setExportStatus('itch.io zip not built yet — run npm run build:itch.');
        return;
      }
      const baseBytes = await res.arrayBuffer();
      const musicBytes = sound.getCustomMusicBytes();
      const { default: JSZip } = await import('jszip');
      const zip = await JSZip.loadAsync(baseBytes);

      const embeddedWsUrl = getPublicEmbeddableWsUrl();

      zip.file(
        'online-config.json',
        JSON.stringify(
          {
            defaultTransport: 'p2p',
            defaultWsUrl: embeddedWsUrl,
          },
          null,
          2
        )
      );

      if (musicBytes && musicBytes.byteLength > 0) {
        zip.file('mattoglseby-3.ogg', musicBytes);
      }

      const downloadBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 },
      });

      const hasBundledMusic = Boolean(zip.file('mattoglseby-3.ogg'));
      setExportStatus(
        hasBundledMusic
          ? 'Downloaded tirahan-itch-io.zip with Standalone P2P Online & mattoglseby-3.ogg.'
          : 'Downloaded tirahan-itch-io.zip with Standalone P2P Online (attach .ogg for music).'
      );

      const url = URL.createObjectURL(downloadBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tirahan-itch-io.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      setExportStatus('Failed to package tirahan-itch-io.zip.');
    } finally {
      setIsExportingZip(false);
    }
  };

  const handleSaveWsUrl = () => {
    const trimmed = wsUrlInput.trim();
    if (!trimmed) {
      setWsUrlOverride(null);
      setWsUrlInput(getEmbeddedDefaultWsUrl() ?? '');
      setWsUrlSavedNotice('Reset to default server URL.');
      window.setTimeout(() => setWsUrlSavedNotice(null), 2000);
      return;
    }
    const normalized = normalizeWebSocketUrl(trimmed);
    if (!normalized) {
      setOnlineError('Enter a valid WebSocket URL (e.g. wss://host/ws).');
      return;
    }
    setWsUrlOverride(normalized);
    setWsUrlInput(normalized);
    setOnlineError(null);
    setWsUrlSavedNotice('Server URL saved.');
    window.setTimeout(() => setWsUrlSavedNotice(null), 2000);
  };

  const handleResetWsUrl = () => {
    setWsUrlOverride(null);
    const fallback = getEmbeddedDefaultWsUrl() ?? '';
    setWsUrlInput(fallback);
    setOnlineError(null);
    setWsUrlSavedNotice(fallback ? 'Restored embedded server URL.' : 'Cleared server URL.');
    window.setTimeout(() => setWsUrlSavedNotice(null), 2000);
  };

  const handleCreateOnlineRoom = async () => {
    sound.tryStartMusicOnGesture();
    setOnlineError(null);
    if (transportMode === 'ws' && !resolveWebSocketUrl()) {
      setServerSettingsOpen(true);
      setOnlineError('Enter a public Match Server URL below, or switch to Direct P2P.');
      return;
    }
    try {
      const client = getOrCreateOnlineClient(transportMode);
      await client.ensureConnected();
      client.send({ type: 'room:create', rules });
    } catch (err) {
      if (transportMode === 'ws') {
        setServerSettingsOpen(true);
      }
      setOnlineError(err instanceof Error ? err.message : 'Unable to connect.');
    }
  };

  const handleJoinOnlineRoom = async () => {
    const code = joinCodeInput.trim().toUpperCase();
    if (code.length < 4) {
      setOnlineError('Enter a valid 6-character room code.');
      return;
    }
    sound.tryStartMusicOnGesture();
    setOnlineError(null);
    if (transportMode === 'ws' && !resolveWebSocketUrl()) {
      setServerSettingsOpen(true);
      setOnlineError('Enter a public Match Server URL below, or switch to Direct P2P.');
      return;
    }
    try {
      const client = getOrCreateOnlineClient(transportMode);
      await client.ensureConnected();
      client.send({ type: 'room:join', code });
    } catch (err) {
      if (transportMode === 'ws') {
        setServerSettingsOpen(true);
      }
      setOnlineError(err instanceof Error ? err.message : 'Unable to connect.');
    }
  };

  const handleJoinQuickMatch = async () => {
    sound.tryStartMusicOnGesture();
    setOnlineError(null);
    if (transportMode === 'ws' && !resolveWebSocketUrl()) {
      setServerSettingsOpen(true);
      setOnlineError('Enter a public Match Server URL below, or switch to Direct P2P.');
      return;
    }
    try {
      const client = getOrCreateOnlineClient(transportMode);
      await client.ensureConnected();
      client.send({ type: 'queue:join', rules });
    } catch (err) {
      if (transportMode === 'ws') {
        setServerSettingsOpen(true);
      }
      setOnlineError(err instanceof Error ? err.message : 'Unable to connect.');
    }
  };

  const handleCancelOnlineLobby = () => {
    if (onlinePhase === 'queueing') {
      onlineClientRef.current?.send({ type: 'queue:leave' });
    } else if (onlinePhase === 'waiting_room') {
      onlineClientRef.current?.send({ type: 'room:leave' });
    }
    setOnlinePhase('idle');
    setOnlineRoomCode(null);
    setOnlineSeat(null);
    setOnlineError(null);
  };

  const handleCopyInviteLink = async () => {
    if (!onlineRoomCode) return;
    const activeMode = onlineClientRef.current?.mode ?? transportMode;
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${onlineRoomCode}&mode=${activeMode}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedInvite(true);
      window.setTimeout(() => setCopiedInvite(false), 1800);
    } catch {
      setOnlineError(`Share code: ${onlineRoomCode}`);
    }
  };

  const handleRequestRematch = () => {
    if (rematchRequested) return;
    setRematchRequested(true);
    onlineClientRef.current?.send({ type: 'match:rematch' });
  };

  const activePlayerLabel =
    hud.currentTurn === 1
      ? `Player 1 (Cyan)${gameMode === 'online' && onlineSeat === 1 ? ' · You' : ''}`
      : gameMode === 'cpu'
        ? 'CPU (Amber)'
        : `Player 2 (Amber)${gameMode === 'online' && onlineSeat === 2 ? ' · You' : ''}`;

  const footerPrompt =
    gameMode === 'online' && opponentDisconnectedSeconds !== null
      ? `Opponent disconnected · Reconnect window: ${opponentDisconnectedSeconds}s`
      : gameMode === 'online' && onlineSeat !== null && hud.currentTurn !== onlineSeat
        ? `Waiting for Player ${hud.currentTurn} to act...`
        : actionMode === 'move'
          ? 'Drag a Fighter Ship to reposition (M to switch to Fire)'
          : activeShipStatus.charging
            ? activeShipStatus.overheatPct > 0
              ? `Charging ${activeShipStatus.powerPct}% (${activeShipStatus.rangePx}px · ${activeShipStatus.overheatPct}% overheat risk) · Release to fire`
              : `Charging ${activeShipStatus.powerPct}% (${activeShipStatus.rangePx}px range) · Release to fire`
            : activeShipStatus.active
              ? 'Move mouse L/R to rotate · Hold Click or Space to charge & fire · Esc to deselect'
              : hud.lastEventText;

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-black text-zinc-100 select-none">
      <TopBar
        gameState={gameState}
        gameMode={gameMode}
        currentTurn={hud.currentTurn}
        actionMode={actionMode}
        onActionModeChange={handleActionModeChange}
        p1MotherHp={hud.p1MotherHp}
        p1MotherMaxHp={hud.p1MotherMaxHp}
        p1Fighters={hud.p1Fighters}
        p1ShieldPct={hud.p1ShieldPct}
        p2MotherHp={hud.p2MotherHp}
        p2MotherMaxHp={hud.p2MotherMaxHp}
        p2Fighters={hud.p2Fighters}
        p2ShieldPct={hud.p2ShieldPct}
        muted={muted}
        onToggleMute={handleToggleMute}
        musicEnabled={musicEnabled}
        onToggleMusic={handleToggleMusic}
        hideGodot={IS_ITCH_EXPORT}
        onlineSeat={onlineSeat}
        onlineRoomCode={onlineRoomCode}
        onOpenRules={() => setRulesOpen(true)}
        onOpenGodot={() => setGodotOpen(true)}
        onRestart={() => {
          if (gameMode === 'online') {
            leaveOnlineRoom();
          } else {
            setGameState('TITLE_MENU');
          }
        }}
      />

      {/* Main Black Vector Battlefield */}
      <main className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-black p-2 sm:p-4">
        {gameMode === 'online' && gameState === 'PLAYING' && opponentDisconnectedSeconds !== null && (
          <div className="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-lg border border-amber-500/40 bg-zinc-950/95 px-4 py-2 text-xs font-mono tabular-nums text-amber-300 shadow-lg">
            Opponent disconnected · Waiting {opponentDisconnectedSeconds}s before forfeit
          </div>
        )}
        <div
          ref={containerRef}
          className="relative flex h-full w-full items-center justify-center"
        >
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onContextMenu={(e) => e.preventDefault()}
            className="touch-none cursor-crosshair block"
          />
        </div>

        {/* Title / Mode Selection Overlay */}
        {gameState === 'TITLE_MENU' && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]">
            <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950/95 p-6 sm:p-7 shadow-2xl">
              <p className="text-xs font-mono tracking-wide text-zinc-400">
                Classic Pen-and-Paper Space Battle
              </p>
              <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-zinc-100 text-balance">
                Tirahan
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                Click a ship to activate it, sweep the mouse left or right to rotate its nose manually, and hold click or Space to charge and fire.
              </p>

              <div className="mt-5 space-y-3.5 border-t border-zinc-800/90 pt-4">
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <span className="text-sm text-zinc-200">
                    Wall Ricochet Shots (1 bounce off paper edge)
                  </span>
                  <input
                    type="checkbox"
                    checked={rules.ricochetWalls}
                    onChange={(e) =>
                      setRules((prev) => ({ ...prev, ricochetWalls: e.target.checked }))
                    }
                    className="h-4 w-4 accent-sky-400 cursor-pointer"
                  />
                </label>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-zinc-200">
                    Asteroids (Gravity &amp; Cover)
                  </span>
                  <div className="flex items-center rounded-md border border-zinc-800 bg-black p-0.5">
                    {(['off', 'low', 'medium', 'high'] as AsteroidDensity[]).map((density) => (
                      <button
                        key={density}
                        type="button"
                        onClick={() => setRules((prev) => ({ ...prev, asteroidDensity: density }))}
                        className={`px-2.5 py-1 text-xs font-medium capitalize rounded transition-colors cursor-pointer whitespace-nowrap ${
                          rules.asteroidDensity === density
                            ? 'bg-zinc-800 text-zinc-100'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {density}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => startNewMatch('pvp', rules)}
                  className="rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-black hover:bg-white transition-colors cursor-pointer whitespace-nowrap"
                >
                  Start 2-Player Match
                </button>
                <button
                  type="button"
                  onClick={() => startNewMatch('cpu', rules)}
                  className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer whitespace-nowrap"
                >
                  Play vs CPU
                </button>
              </div>

              <div className="mt-5 space-y-3 border-t border-zinc-800/90 pt-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                    2-Player Online
                  </span>
                  <div className="flex items-center rounded-md border border-zinc-800 bg-black p-0.5">
                    <button
                      type="button"
                      disabled={onlinePhase !== 'idle'}
                      onClick={() => {
                        setTransportMode('p2p');
                        setOnlineError(null);
                      }}
                      className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60 ${
                        transportMode === 'p2p'
                          ? 'bg-zinc-800 text-sky-300'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Direct P2P
                    </button>
                    <button
                      type="button"
                      disabled={onlinePhase !== 'idle'}
                      onClick={() => {
                        setTransportMode('ws');
                        setOnlineError(null);
                        if (!resolveWebSocketUrl()) {
                          setServerSettingsOpen(true);
                        }
                      }}
                      className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60 ${
                        transportMode === 'ws'
                          ? 'bg-zinc-800 text-orange-300'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Match Server
                    </button>
                  </div>
                </div>

                {onlinePhase === 'waiting_room' && onlineRoomCode ? (
                  <div className="space-y-3 rounded-lg border border-zinc-800 bg-black p-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-mono text-zinc-400">
                          {transportMode === 'p2p' ? 'P2P Room Code' : 'Server Room Code'}
                        </p>
                        <p className="text-xl font-bold font-mono tracking-widest text-sky-400">
                          {onlineRoomCode}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyInviteLink}
                        className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
                      >
                        {copiedInvite ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                            <span>Copied Link</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5 text-zinc-400" />
                            <span>Copy Invite Link</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-zinc-400">
                      <span>Waiting for Player 2 to join...</span>
                      <button
                        type="button"
                        onClick={handleCancelOnlineLobby}
                        className="text-zinc-300 underline underline-offset-2 hover:text-white cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : onlinePhase === 'queueing' ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-black p-3.5 text-xs">
                    <span className="text-zinc-200 font-mono">
                      Searching Quick Match queue for opponent...
                    </span>
                    <button
                      type="button"
                      onClick={handleCancelOnlineLobby}
                      className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-zinc-200 hover:bg-zinc-800 cursor-pointer shrink-0"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={handleCreateOnlineRoom}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3.5 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-500/20 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Users className="h-3.5 w-3.5" />
                        <span>
                          {transportMode === 'p2p' ? 'Create P2P Room' : 'Create Private Room'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={handleJoinQuickMatch}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-orange-500/40 bg-orange-500/10 px-3.5 py-2 text-xs font-semibold text-orange-300 hover:bg-orange-500/20 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Globe className="h-3.5 w-3.5" />
                        <span>Quick Match Queue</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={joinCodeInput}
                        onChange={(e) =>
                          setJoinCodeInput(
                            e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
                          )
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleJoinOnlineRoom();
                        }}
                        placeholder="Enter 6-char room code"
                        maxLength={6}
                        className="flex-1 rounded-lg border border-zinc-800 bg-black px-3 py-2 text-xs font-mono tracking-widest text-zinc-100 placeholder:tracking-normal placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleJoinOnlineRoom}
                        className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-semibold text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Join Room
                      </button>
                    </div>

                    <div className="space-y-2 pt-0.5">
                      <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-zinc-500">
                        <span>
                          {transportMode === 'p2p'
                            ? 'Peer-to-peer WebRTC (no server needed)'
                            : `Server: ${resolveWebSocketUrl() ? 'Configured' : 'Not set'}`}
                        </span>
                        <button
                          type="button"
                          onClick={() => setServerSettingsOpen((prev) => !prev)}
                          className="inline-flex items-center gap-1 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                        >
                          <Server className="h-3 w-3" />
                          <span>{serverSettingsOpen ? 'Hide Server URL' : 'Server URL'}</span>
                        </button>
                      </div>

                      {serverSettingsOpen && (
                        <div className="space-y-1.5 rounded-lg border border-zinc-800 bg-black p-2.5">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={wsUrlInput}
                              onChange={(e) => setWsUrlInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveWsUrl();
                              }}
                              placeholder="wss://your-tirahan-server/ws"
                              className="flex-1 rounded border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-[11px] font-mono text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={handleSaveWsUrl}
                              className="rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-[11px] font-medium text-zinc-100 hover:bg-zinc-800 cursor-pointer"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={handleResetWsUrl}
                              className="rounded border border-zinc-800 bg-black px-2 py-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
                            >
                              Reset
                            </button>
                          </div>
                          <p className="text-[10px] font-mono text-zinc-500">
                            Optional self-hosted Tirahan server for Match Server mode. Direct P2P works with zero server.
                          </p>
                          {wsUrlSavedNotice && (
                            <p className="text-[11px] font-mono text-emerald-400">
                              {wsUrlSavedNotice}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {onlineError && (
                  <p className="text-[11px] font-mono text-red-400">{onlineError}</p>
                )}
              </div>

              {IS_AUTHORING_ENV && (
                <div className="mt-5 space-y-2.5 border-t border-zinc-800/90 pt-4">
                  <div className="flex items-center justify-between gap-2 text-xs text-zinc-400">
                    <span>
                      {musicStatus === 'bundled' || musicStatus === 'custom'
                        ? `Music ready: ${musicFileName}`
                        : 'Music: attach mattoglseby-3.ogg to bundle'}
                    </span>
                    <input
                      ref={musicInputRef}
                      type="file"
                      accept=".ogg,audio/ogg,audio/*"
                      onChange={handleMusicFileSelected}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => musicInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-black px-2.5 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-900 transition-colors cursor-pointer shrink-0"
                    >
                      <FileAudio className="h-3.5 w-3.5 text-zinc-400" />
                      <span>{musicStatus === 'custom' || musicStatus === 'bundled' ? 'Replace .ogg' : 'Load .ogg'}</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleDownloadItchZip}
                    disabled={isExportingZip}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-black px-4 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-900 hover:border-zinc-700 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5 text-zinc-400" />
                    <span>{isExportingZip ? 'Packaging Zip...' : 'Download itch.io HTML5 (.zip)'}</span>
                  </button>

                  {exportStatus && (
                    <p className="text-[11px] font-mono text-zinc-400">{exportStatus}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Game Over Victory Overlay */}
        {gameState === 'GAME_OVER' && hud.winner !== null && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/75 p-4 backdrop-blur-[2px]">
            <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-950/95 p-7 shadow-2xl">
              <p className="text-xs font-mono text-zinc-400">
                Match Complete · {hud.turnCount} Turns
              </p>
              <h2
                className={`mt-1.5 text-2xl font-bold tracking-tight ${
                  hud.winner === 1 ? 'text-sky-400' : 'text-orange-400'
                }`}
              >
                {hud.winner === 1
                  ? `Player 1 Wins${gameMode === 'online' && onlineSeat === 1 ? ' (You)' : ''}`
                  : gameMode === 'cpu'
                    ? 'CPU Wins'
                    : `Player 2 Wins${gameMode === 'online' && onlineSeat === 2 ? ' (You)' : ''}`}
              </h2>
              <p className="mt-2 text-sm text-zinc-300">
                {hud.lastEventText}. Remaining fighters: P1 {hud.p1Fighters} ·{' '}
                {gameMode === 'cpu' ? 'CPU' : 'P2'} {hud.p2Fighters}.
              </p>

              {gameMode === 'online' && opponentWantsRematch && !rematchRequested && (
                <p className="mt-3 text-xs font-mono text-sky-400">
                  Opponent requested a rematch.
                </p>
              )}

              {gameMode === 'online' && onlineError && (
                <p className="mt-3 text-xs font-mono text-red-400">
                  {onlineError}
                </p>
              )}

              <div className="mt-6 flex items-center gap-3">
                {gameMode === 'online' ? (
                  <>
                    <button
                      type="button"
                      onClick={handleRequestRematch}
                      disabled={rematchRequested}
                      className="flex-1 rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-black hover:bg-white disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {rematchRequested ? 'Waiting for Opponent...' : 'Request Rematch'}
                    </button>
                    <button
                      type="button"
                      onClick={leaveOnlineRoom}
                      className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Leave Room
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => startNewMatch(gameMode, rules)}
                      className="flex-1 rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-black hover:bg-white transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Play Again
                    </button>
                    <button
                      type="button"
                      onClick={() => setGameState('TITLE_MENU')}
                      className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Change Mode
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Slim unboxed footer status bar */}
      <footer className="flex h-9 shrink-0 items-center justify-between gap-4 border-t border-zinc-900 bg-black px-4 sm:px-6 text-xs font-mono tabular-nums text-zinc-400">
        <div className="flex items-center gap-2 truncate">
          <span
            className={
              hud.currentTurn === 1 ? 'font-medium text-sky-400' : 'font-medium text-orange-400'
            }
          >
            Turn {hud.turnCount} · {activePlayerLabel}
          </span>
          <span aria-hidden="true" className="text-zinc-700">·</span>
          <span className="truncate text-zinc-300">{footerPrompt}</span>
        </div>

        <div className="hidden sm:flex items-center gap-3 text-zinc-500 shrink-0">
          <span>P1 Hull {hud.p1MotherHp}/{hud.p1MotherMaxHp}</span>
          <span aria-hidden="true">·</span>
          <span>{gameMode === 'cpu' ? 'CPU' : 'P2'} Hull {hud.p2MotherHp}/{hud.p2MotherMaxHp}</span>
        </div>
      </footer>

      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
      {!IS_ITCH_EXPORT && <GodotModal open={godotOpen} onClose={() => setGodotOpen(false)} />}
    </div>
  );
}
