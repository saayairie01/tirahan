import { sound } from './sound';
import type {
  ClientToServerMessage,
  OnlineSfxCue,
  OnlineTransportMode,
  RuntimeOnlineConfig,
  ServerToClientMessage,
} from './onlineTypes';
import type { GameWorld, MatchRules } from './types';

const SESSION_KEY = 'tirahan_online_session';
const WS_URL_OVERRIDE_KEY = 'tirahan_ws_url_override';
const IS_ITCH_EXPORT = import.meta.env.VITE_ITCH_EXPORT === 'true';

let loadedRuntimeConfig: RuntimeOnlineConfig | null = null;
let runtimeConfigPromise: Promise<RuntimeOnlineConfig> | null = null;

export interface OnlineTransport {
  readonly mode: OnlineTransportMode;
  isConnected(): boolean;
  ensureConnected(): Promise<void>;
  send(msg: ClientToServerMessage): void;
  close(): void;
}

export interface StoredOnlineSession {
  code: string;
  seat: 1 | 2;
  seatToken: string;
  transport?: OnlineTransportMode;
  rules?: MatchRules;
  hostWorld?: GameWorld;
  guestToken?: string;
}

export function getSavedOnlineSession(): StoredOnlineSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredOnlineSession>;
    if (
      typeof parsed.code === 'string' &&
      (parsed.seat === 1 || parsed.seat === 2) &&
      typeof parsed.seatToken === 'string'
    ) {
      return {
        code: parsed.code,
        seat: parsed.seat,
        seatToken: parsed.seatToken,
        transport: parsed.transport === 'p2p' ? 'p2p' : 'ws',
        rules: parsed.rules,
        hostWorld: parsed.hostWorld,
        guestToken: typeof parsed.guestToken === 'string' ? parsed.guestToken : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveOnlineSession(session: StoredOnlineSession) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage quota issues
  }
}

export function clearOnlineSession() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore storage issues
  }
}

export function normalizeWebSocketUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    let normalized = trimmed;
    if (normalized.startsWith('https://')) {
      normalized = 'wss://' + normalized.slice('https://'.length);
    } else if (normalized.startsWith('http://')) {
      normalized = 'ws://' + normalized.slice('http://'.length);
    } else if (!normalized.startsWith('ws://') && !normalized.startsWith('wss://')) {
      const proto =
        typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss://' : 'ws://';
      normalized = proto + normalized;
    }
    const url = new URL(normalized);
    if (url.pathname === '' || url.pathname === '/') {
      url.pathname = '/ws';
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function getWsUrlOverride(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const val = window.localStorage.getItem(WS_URL_OVERRIDE_KEY);
    return val ? normalizeWebSocketUrl(val) : null;
  } catch {
    return null;
  }
}

export function setWsUrlOverride(rawUrl: string | null): string | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!rawUrl || !rawUrl.trim()) {
      window.localStorage.removeItem(WS_URL_OVERRIDE_KEY);
      return null;
    }
    const normalized = normalizeWebSocketUrl(rawUrl);
    if (!normalized) return null;
    window.localStorage.setItem(WS_URL_OVERRIDE_KEY, normalized);
    return normalized;
  } catch {
    return null;
  }
}

export async function loadRuntimeOnlineConfig(): Promise<RuntimeOnlineConfig> {
  if (loadedRuntimeConfig) return loadedRuntimeConfig;
  if (runtimeConfigPromise) return runtimeConfigPromise;

  runtimeConfigPromise = (async () => {
    if (typeof window === 'undefined') {
      loadedRuntimeConfig = {};
      return loadedRuntimeConfig;
    }
    try {
      const res = await fetch('./online-config.json', { cache: 'no-store' });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        loadedRuntimeConfig = {};
        return loadedRuntimeConfig;
      }
      const data = (await res.json()) as RuntimeOnlineConfig;
      loadedRuntimeConfig = {
        defaultTransport: data.defaultTransport === 'ws' || data.defaultTransport === 'p2p'
          ? data.defaultTransport
          : undefined,
        defaultWsUrl: typeof data.defaultWsUrl === 'string'
          ? normalizeWebSocketUrl(data.defaultWsUrl) ?? undefined
          : undefined,
      };
      return loadedRuntimeConfig;
    } catch {
      loadedRuntimeConfig = {};
      return loadedRuntimeConfig;
    }
  })();

  return runtimeConfigPromise;
}

export function isPrivateDevHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '0.0.0.0' ||
    lower.startsWith('ais-dev-')
  );
}

export function getPublicEmbeddableWsUrl(): string {
  const override = getWsUrlOverride();
  if (override) {
    try {
      const u = new URL(override);
      if (!isPrivateDevHost(u.hostname)) return override;
    } catch {
      // Ignore malformed override
    }
  }
  const envUrl = import.meta.env.VITE_WS_URL as string | undefined;
  if (envUrl && envUrl.trim().length > 0) {
    const norm = normalizeWebSocketUrl(envUrl);
    if (norm) return norm;
  }
  if (typeof window !== 'undefined' && !isPrivateDevHost(window.location.hostname)) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
  }
  return '';
}

export function getEmbeddedDefaultWsUrl(): string | null {
  if (loadedRuntimeConfig?.defaultWsUrl) {
    return loadedRuntimeConfig.defaultWsUrl;
  }
  const envUrl = import.meta.env.VITE_WS_URL as string | undefined;
  if (envUrl && envUrl.trim().length > 0) {
    return normalizeWebSocketUrl(envUrl);
  }
  if (!IS_ITCH_EXPORT && typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
  }
  return null;
}

export function getDefaultTransportMode(): OnlineTransportMode {
  if (loadedRuntimeConfig?.defaultTransport) {
    return loadedRuntimeConfig.defaultTransport;
  }
  return IS_ITCH_EXPORT ? 'p2p' : 'ws';
}

export function resolveWebSocketUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const override = getWsUrlOverride();
  if (override) return override;
  return getEmbeddedDefaultWsUrl();
}

export function playOnlineSfxCues(cues: OnlineSfxCue[] | undefined) {
  if (!cues || cues.length === 0) return;
  for (const cue of cues) {
    switch (cue) {
      case 'select':
        sound.playSelect();
        break;
      case 'fire':
        sound.playFire(false);
        break;
      case 'fire_heavy':
        sound.playFire(true);
        break;
      case 'move':
        sound.playMove();
        break;
      case 'bounce':
        sound.playBounce();
        break;
      case 'shield':
        sound.playShieldHit(false);
        break;
      case 'shield_break':
        sound.playShieldHit(true);
        break;
      case 'explosion':
        sound.playShipExplosion(false);
        break;
      case 'mothership_explosion':
        sound.playShipExplosion(true);
        break;
      case 'asteroid_hit':
        sound.playAsteroidHit(false);
        break;
      case 'asteroid_break':
        sound.playAsteroidHit(true);
        break;
      case 'victory':
        sound.playVictory();
        break;
    }
  }
}

export class OnlineSocketClient implements OnlineTransport {
  public readonly mode: OnlineTransportMode = 'ws';
  private ws: WebSocket | null = null;
  private onMessage: (msg: ServerToClientMessage) => void;
  private onDisconnect: () => void;
  private intentionalClose = false;
  private connectPromise: Promise<void> | null = null;

  constructor(
    onMessage: (msg: ServerToClientMessage) => void,
    onDisconnect: () => void
  ) {
    this.onMessage = onMessage;
    this.onDisconnect = onDisconnect;
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public async ensureConnected(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (this.connectPromise) return this.connectPromise;

    const url = resolveWebSocketUrl();
    if (!url) {
      throw new Error('No Match Server WebSocket URL configured.');
    }

    this.intentionalClose = false;
    this.connectPromise = new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url);
      let settled = false;

      socket.onopen = () => {
        this.ws = socket;
        this.connectPromise = null;
        settled = true;
        resolve();
      };

      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(String(event.data)) as ServerToClientMessage;
          this.onMessage(parsed);
        } catch {
          // Ignore malformed packet
        }
      };

      socket.onerror = () => {
        if (!settled) {
          settled = true;
          this.connectPromise = null;
          reject(new Error(`Could not connect to server (${url}).`));
        }
      };

      socket.onclose = () => {
        if (this.ws === socket) {
          this.ws = null;
        }
        this.connectPromise = null;
        if (!settled) {
          settled = true;
          reject(new Error('Multiplayer server connection closed.'));
        } else if (!this.intentionalClose) {
          this.onDisconnect();
        }
      };
    });

    return this.connectPromise;
  }

  public send(msg: ClientToServerMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public close() {
    this.intentionalClose = true;
    this.connectPromise = null;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore close error
      }
      this.ws = null;
    }
  }
}
