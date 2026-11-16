import type {
  FireModifierKind,
  GameWorld,
  MatchRules,
  PlayerId,
  ShipBuffKind,
} from './types.ts';

export type OnlineTransportMode = 'ws' | 'p2p';

export interface RuntimeOnlineConfig {
  defaultTransport?: OnlineTransportMode;
  defaultWsUrl?: string;
}

export type OnlinePhase =
  | 'idle'
  | 'waiting_room'
  | 'queueing'
  | 'playing';

export type OnlineSfxCue =
  | 'select'
  | 'fire'
  | 'fire_heavy'
  | 'move'
  | 'bounce'
  | 'shield'
  | 'shield_break'
  | 'shield_boost'
  | 'cell_pickup'
  | 'mine_explosion'
  | 'trident_split'
  | 'flak_burst'
  | 'explosion'
  | 'mothership_explosion'
  | 'asteroid_hit'
  | 'asteroid_break'
  | 'victory';

export interface OpponentAimState {
  shipId: string;
  angle: number;
  isCharging: boolean;
}

export type ClientToServerMessage =
  | { type: 'room:create'; rules: MatchRules }
  | { type: 'room:join'; code: string }
  | { type: 'room:reconnect'; code: string; seatToken: string }
  | { type: 'queue:join'; rules: MatchRules }
  | { type: 'queue:leave' }
  | { type: 'aim:update'; shipId: string; angle: number; isCharging: boolean }
  | {
      type: 'action:fire';
      shipId: string;
      angle: number;
      power: number;
      fireMod?: FireModifierKind | null;
      fireMods?: FireModifierKind[];
    }
  | {
      type: 'action:move';
      shipId: string;
      targetX: number;
      targetY: number;
      hyperMove?: boolean;
    }
  | {
      type: 'action:equip';
      shipId: string;
      buff: ShipBuffKind;
    }
  | { type: 'match:rematch' }
  | { type: 'room:leave' };

export type ServerToClientMessage =
  | { type: 'room:created'; code: string; seat: PlayerId; seatToken: string; rules: MatchRules }
  | { type: 'queue:waiting' }
  | { type: 'queue:cancelled' }
  | { type: 'room:started'; code: string; seat: PlayerId; seatToken: string; world: GameWorld }
  | {
      type: 'room:resynced';
      code: string;
      seat: PlayerId;
      seatToken: string;
      world: GameWorld;
      opponentDisconnectedSeconds: number | null;
    }
  | { type: 'aim:sync'; aim: OpponentAimState | null }
  | { type: 'world:state'; world: GameWorld; sfx?: OnlineSfxCue[] }
  | { type: 'opponent:disconnected'; remainingSeconds: number }
  | { type: 'opponent:reconnected' }
  | { type: 'match:forfeit'; winner: PlayerId; world: GameWorld }
  | { type: 'rematch:status'; votes: PlayerId[] }
  | { type: 'room:error'; message: string };
