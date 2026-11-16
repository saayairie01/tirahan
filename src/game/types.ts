export type PlayerId = 1 | 2;

export type GameMode = 'pvp' | 'cpu' | 'online';

export type GameState = 'TITLE_MENU' | 'PLAYING' | 'GAME_OVER';

export type ActionMode = 'fire' | 'move';

export type ShipKind = 'mothership' | 'fighter';

export type AsteroidDensity = 'off' | 'low' | 'medium' | 'high';

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
}

export interface ShieldSegment {
  id: string;
  owner: PlayerId;
  index: number;
  centerX: number;
  centerY: number;
  radius: number;
  startAngle: number;
  endAngle: number;
  hp: number;
  maxHp: number;
  flashTimer: number;
}

export interface Projectile {
  id: string;
  owner: PlayerId;
  sourceShipId: string;
  hitShipIds: string[];
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
}

export interface ActiveFireState {
  shipId: string;
  isCharging: boolean;
  chargeTime: number;
  power: number;
}

export type MoveOutcome = 'move' | 'kamikaze' | 'friendly' | 'shield' | 'border' | 'asteroid';

export interface MoveDraft {
  shipId: string;
  targetX: number;
  targetY: number;
  outcome: MoveOutcome;
  cancelled: boolean;
}

export interface MatchRules {
  ricochetWalls: boolean;
  asteroidDensity: AsteroidDensity;
}

export interface GameWorld {
  ships: Ship[];
  shields: ShieldSegment[];
  asteroids: Asteroid[];
  projectiles: Projectile[];
  particles: VectorParticle[];
  shockwaves: ShockwaveRing[];
  floatingTexts: FloatingText[];
  pendingDestructions: string[];
  destructionTimer: number;
  victoryDelay: number;
  currentTurn: PlayerId;
  turnCount: number;
  actionLocked: boolean;
  winner: PlayerId | null;
  lastEventText: string;
  screenShake: number;
  rules: MatchRules;
}
