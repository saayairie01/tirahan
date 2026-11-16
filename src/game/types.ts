export const APP_VERSION = 'v0.1';

export type PlayerId = 1 | 2;

export type GameMode = 'pvp' | 'cpu' | 'online';

export type GameState = 'TITLE_MENU' | 'PLAYING' | 'GAME_OVER';

export type ActionMode = 'fire' | 'move';

export type ShipKind = 'mothership' | 'fighter';

export type AsteroidDensity = 'off' | 'low' | 'medium' | 'high';

export type PowerCellKind =
  | 'repair'
  | 'energy'
  | 'mine'
  | 'trident'
  | 'flak'
  | 'overcharge'
  | 'piercer'
  | 'hyper_move'
  | 'laser_sight'
  | 'laser_dot'
  | 'fighter_shield';

export type FireModifierKind = 'trident' | 'flak' | 'overcharge' | 'piercer';

export type ShipBuffKind = 'laser_sight' | 'laser_dot' | 'fighter_shield';

export type ChargeKey = FireModifierKind | 'hyper_move' | ShipBuffKind;

export type PlayerCharges = Record<ChargeKey, number>;

export interface Vec2 {
  x: number;
  y: number;
}

export interface Ship {
  id: string;
  owner: PlayerId;
  kind: ShipKind;
  x: number;
  y: number;
  angle: number;
  radius: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  flashTimer: number;
  hasLaserSight?: boolean;
  hasLaserDot?: boolean;
  shieldHp?: number;
  shieldMaxHp?: number;
  shieldFlashTimer?: number;
}

export interface ShieldRing {
  id: string;
  owner: PlayerId;
  centerX: number;
  centerY: number;
  radius: number;
  hp: number;
  maxHp: number;
  flashTimer: number;
}

export interface PowerCell {
  id: string;
  kind: PowerCellKind;
  x: number;
  y: number;
  radius: number;
  value: number;
  pulsePhase: number;
  graceTimer: number;
  immuneProjectileId?: string;
}

export type ProjectileKind = 'normal' | 'trident' | 'flak' | 'shrapnel';

export interface Projectile {
  id: string;
  owner: PlayerId;
  sourceShipId: string;
  hitShipIds: string[];
  hitCellIds?: string[];
  x: number;
  y: number;
  vx: number;
  vy: number;
  power: number; // 0..1
  damage: number;
  distanceTraveled: number;
  maxRange: number;
  bounces: number;
  maxBounces: number;
  trail: Vec2[];
  active: boolean;
  kind?: ProjectileKind;
  spawnsFighter?: boolean;
  shieldPiercer?: boolean;
  tridentSplitPending?: boolean;
  flakBurstOnEnd?: boolean;
  overcharged?: boolean;
}

export interface VectorParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  length: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface ShockwaveRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface FloatingText {
  text: string;
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface Asteroid {
  id: string;
  x: number;
  y: number;
  radius: number;
  gravityRadius: number;
  gravityStrength: number;
  hp: number;
  maxHp: number;
  vertices: Vec2[];
  rotation: number;
  rotSpeed: number;
  flashTimer: number;
  hiddenCellKind?: PowerCellKind | null;
}

export interface ActiveFireState {
  shipId: string;
  isCharging: boolean;
  chargeTime: number;
  power: number;
}

export type MoveOutcome =
  | 'move'
  | 'pickup'
  | 'mine'
  | 'kamikaze'
  | 'friendly'
  | 'shield'
  | 'border'
  | 'asteroid';

export interface MoveDraft {
  shipId: string;
  targetX: number;
  targetY: number;
  outcome: MoveOutcome;
  cancelled: boolean;
  hyperMove?: boolean;
}

export interface MatchRules {
  ricochetWalls: boolean;
  asteroidDensity: AsteroidDensity;
}

export interface GameWorld {
  ships: Ship[];
  shields: ShieldRing[];
  asteroids: Asteroid[];
  powerCells: PowerCell[];
  charges: Record<PlayerId, PlayerCharges>;
  projectiles: Projectile[];
  particles: VectorParticle[];
  shockwaves: ShockwaveRing[];
  floatingTexts: FloatingText[];
  pendingDestructions: string[];
  destructionTimer: number;
  victoryDelay: number;
  pendingBonusTurn?: boolean;
  currentTurn: PlayerId;
  turnCount: number;
  actionLocked: boolean;
  winner: PlayerId | null;
  lastEventText: string;
  screenShake: number;
  rules: MatchRules;
}
