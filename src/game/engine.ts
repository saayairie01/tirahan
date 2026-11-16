import { sound } from './sound.ts';
import type {
  Asteroid,
  AsteroidDensity,
  FireModifierKind,
  FloatingText,
  GameWorld,
  MatchRules,
  MoveDraft,
  MoveOutcome,
  PlayerCharges,
  PlayerId,
  PowerCell,
  PowerCellKind,
  Projectile,
  ShieldRing,
  Ship,
  ShipBuffKind,
  ShipKind,
  Vec2,
  VectorParticle,
} from './types.ts';

export const LOGICAL_WIDTH = 1280;
export const LOGICAL_HEIGHT = 760;
export const PAPER_MARGIN = 26;

export const SHIELD_RADIUS = 104;
export const SHIELD_RING_HP = 10;
export const SHIELD_MAX_OVER_HP = 20;
export const FIGHTER_ORBIT_RADIUS = 148;
export const MAX_MOVE_DISTANCE = 155;
export const HYPER_MOVE_MULT = 2;
export const ROTATION_SENSITIVITY = 0.006; // radians per horizontal pixel
export const KEY_ROTATION_SPEED = 2.1; // radians per second
export const CHARGE_FILL_DURATION = 1.3125 / 0.8; // 1.640625s
export const MIN_POWER = 0.1;
export const SAFE_POWER_LIMIT = 0.75;
export const MAX_OVERHEAT_CHANCE = 0.95;
export const ASYMPTOTE_K = 0.88;
export const FIGHTER_MAX_RANGE = 392;
export const MOTHERSHIP_MAX_RANGE = FIGHTER_MAX_RANGE * 2; // 784px
export const PROJECTILE_SPEED = 780; // pixels per second

export const FIGHTER_HP = 3;
export const MOTHERSHIP_HP = 20;
export const FIGHTER_PROJECTILE_DAMAGE = 3;
export const MOTHERSHIP_PROJECTILE_DAMAGE = 10;
export const KAMIKAZE_DAMAGE = 5;
export const SHIELD_COLLISION_DAMAGE = 5;
export const ASTEROID_COLLISION_DAMAGE = 5;

export const ASTEROID_COUNTS: Record<AsteroidDensity, number> = {
  off: 0,
  low: 6,
  medium: 10,
  high: 16,
};
export const ASTEROID_MIN_RADIUS = 20;
export const ASTEROID_MAX_RADIUS = 44;
export const ASTEROID_GRAVITY_RADIUS_MULT = 3.4;
export const ASTEROID_GRAVITY_CONSTANT = 4500;
export const COLLAPSE_INTERVAL = 0.16;
export const VICTORY_SETTLE_DELAY = 0.35;

export const POWER_CELL_RADIUS = 14;
export const MAX_ACTIVE_POWER_CELLS = 5;
export const REPAIR_CELL_VALUE = 4;
export const ENERGY_CELL_VALUE = 4;
export const FIGHTER_SHIELD_HP = 5;
export const FIGHTER_SHIELD_OFFSET = 9;
export const MINE_BLAST_RADIUS = 90;
export const MINE_BLAST_DAMAGE = 4;
export const TRIDENT_SPLIT_RATIO = 0.5;
export const TRIDENT_SPREAD_RAD = 0.31; // ~18 degrees
export const FLAK_SHRAPNEL_COUNT = 8;
export const FLAK_SHRAPNEL_RANGE = 95;
export const FLAK_SHRAPNEL_DAMAGE = 3;

export const P1_COLOR = '#38BDF8'; // Crisp vector cyan
export const P2_COLOR = '#FB923C'; // Crisp vector amber-orange

export const P1_BASE = { x: 146, y: 614 };
export const P2_BASE = { x: 1134, y: 146 };

export const POWER_CELL_META: Record<
  PowerCellKind,
  { label: string; short: string; color: string; description: string }
> = {
  repair: {
    label: 'Repair Cell',
    short: `+${REPAIR_CELL_VALUE} HP`,
    color: '#34D399',
    description: `Restores ${REPAIR_CELL_VALUE} Mother Ship HP`,
  },
  energy: {
    label: 'Energy Cell',
    short: `+${ENERGY_CELL_VALUE} SHD`,
    color: '#38BDF8',
    description: `Restores/over-shields Mother Ship ring +${ENERGY_CELL_VALUE} HP`,
  },
  mine: {
    label: 'Proximity Mine',
    short: 'MINE',
    color: '#F43F5E',
    description: `Explodes on contact (${MINE_BLAST_DAMAGE} dmg in ${MINE_BLAST_RADIUS}px radius)`,
  },
  trident: {
    label: 'Trident Missile',
    short: 'TRIDENT',
    color: '#A78BFA',
    description: 'Splits at mid-flight into 3 shots & spawns up to 3 fighters',
  },
  flak: {
    label: 'Flak Warhead',
    short: 'FLAK',
    color: '#FB923C',
    description: `Bursts at range-end into ${FLAK_SHRAPNEL_COUNT}x ${FLAK_SHRAPNEL_DAMAGE} dmg 360° shrapnel (no spawn)`,
  },
  overcharge: {
    label: 'Overcharge',
    short: '2× DMG',
    color: '#FACC15',
    description: '2× shot damage with 0% Fighter overheat risk (stackable)',
  },
  piercer: {
    label: 'Shield Piercer',
    short: 'PIERCE',
    color: '#E0F2FE',
    description: 'Bypasses intact enemy Mother Ship & Fighter shields (stackable)',
  },
  hyper_move: {
    label: 'Hyper Move',
    short: '2× MOVE',
    color: '#2DD4BF',
    description: 'Doubles Fighter Move-mode drag range for one maneuver',
  },
  laser_sight: {
    label: 'Laser Sight',
    short: 'SIGHT',
    color: '#10B981',
    description: 'Permanent aim line from nose up to max projectile range (free buff)',
  },
  laser_dot: {
    label: 'Laser Dot',
    short: 'DOT',
    color: '#F43F5E',
    description: 'Permanent invisible beam projecting a red dot on solid contact (free buff)',
  },
  fighter_shield: {
    label: 'Fighter Shield',
    short: 'F-SHD',
    color: '#818CF8',
    description: `Equips a ${FIGHTER_SHIELD_HP} HP shield around selected Fighter (replace to repair)`,
  },
};

export function createEmptyCharges(): PlayerCharges {
  return {
    trident: 0,
    flak: 0,
    overcharge: 0,
    piercer: 0,
    hyper_move: 0,
    laser_sight: 0,
    laser_dot: 0,
    fighter_shield: 0,
  };
}

export function getPlayerColor(player: PlayerId): string {
  return player === 1 ? P1_COLOR : P2_COLOR;
}

export function normalizeAngle(a: number): number {
  let angle = a % (Math.PI * 2);
  if (angle < 0) angle += Math.PI * 2;
  return angle;
}

function pickRandomCellKind(allowMine: boolean): PowerCellKind {
  const weighted: PowerCellKind[] = allowMine
    ? [
        'repair',
        'repair',
        'energy',
        'energy',
        'trident',
        'flak',
        'overcharge',
        'piercer',
        'hyper_move',
        'laser_sight',
        'laser_dot',
        'fighter_shield',
        'mine',
        'mine',
      ]
    : [
        'repair',
        'energy',
        'trident',
        'flak',
        'overcharge',
        'piercer',
        'hyper_move',
        'laser_sight',
        'laser_dot',
        'fighter_shield',
      ];
  return weighted[Math.floor(Math.random() * weighted.length)];
}

function createPowerCell(
  kind: PowerCellKind,
  x: number,
  y: number,
  graceTimer = 0,
  immuneProjectileId?: string
): PowerCell {
  const value =
    kind === 'repair'
      ? REPAIR_CELL_VALUE
      : kind === 'energy'
        ? ENERGY_CELL_VALUE
        : kind === 'mine'
          ? MINE_BLAST_DAMAGE
          : 1;
  return {
    id: `cell-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    x,
    y,
    radius: POWER_CELL_RADIUS,
    value,
    pulsePhase: Math.random() * Math.PI * 2,
    graceTimer,
    immuneProjectileId,
  };
}

function findOpenPowerCellSpot(world: {
  ships: Ship[];
  asteroids: Asteroid[];
  powerCells?: PowerCell[];
}): Vec2 | null {
  const margin = PAPER_MARGIN + POWER_CELL_RADIUS + 42;
  for (let attempt = 0; attempt < 90; attempt++) {
    const x = margin + Math.random() * (LOGICAL_WIDTH - margin * 2);
    const y = margin + Math.random() * (LOGICAL_HEIGHT - margin * 2);

    const distP1 = Math.hypot(x - P1_BASE.x, y - P1_BASE.y);
    const distP2 = Math.hypot(x - P2_BASE.x, y - P2_BASE.y);
    if (distP1 < FIGHTER_ORBIT_RADIUS + 46 || distP2 < FIGHTER_ORBIT_RADIUS + 46) {
      continue;
    }

    if (
      world.ships.some(
        (s) => s.alive && Math.hypot(x - s.x, y - s.y) < s.radius + POWER_CELL_RADIUS + 26
      )
    ) {
      continue;
    }

    if (
      world.asteroids.some(
        (a) => Math.hypot(x - a.x, y - a.y) < a.radius + POWER_CELL_RADIUS + 24
      )
    ) {
      continue;
    }

    if (
      world.powerCells?.some(
        (c) => Math.hypot(x - c.x, y - c.y) < c.radius + POWER_CELL_RADIUS + 48
      )
    ) {
      continue;
    }

    return { x, y };
  }
  return null;
}

function maybeSpawnOpenSpacePowerCell(world: GameWorld): void {
  if (world.powerCells.length >= MAX_ACTIVE_POWER_CELLS) return;
  const chance = world.powerCells.length === 0 ? 0.85 : 0.55;
  if (Math.random() > chance) return;

  const spot = findOpenPowerCellSpot(world);
  if (!spot) return;

  const kind = pickRandomCellKind(true);
  world.powerCells.push(createPowerCell(kind, spot.x, spot.y));
}

function generateAsteroids(density: AsteroidDensity): Asteroid[] {
  const count = ASTEROID_COUNTS[density] ?? 0;
  if (count <= 0) return [];

  const asteroids: Asteroid[] = [];
  for (let i = 0; i < count; i++) {
    let placed = false;

    const passes = [
      { attempts: 140, gap: 42, basePad: 64, minR: ASTEROID_MIN_RADIUS, maxR: ASTEROID_MAX_RADIUS },
      { attempts: 180, gap: 22, basePad: 50, minR: ASTEROID_MIN_RADIUS, maxR: 34 },
    ];

    for (const pass of passes) {
      if (placed) break;
      for (let attempt = 0; attempt < pass.attempts; attempt++) {
        const radius = Math.round(pass.minR + Math.random() * (pass.maxR - pass.minR));
        const margin = PAPER_MARGIN + radius + 24;
        const x = margin + Math.random() * (LOGICAL_WIDTH - margin * 2);
        const y = margin + Math.random() * (LOGICAL_HEIGHT - margin * 2);

        const distP1 = Math.hypot(x - P1_BASE.x, y - P1_BASE.y);
        const distP2 = Math.hypot(x - P2_BASE.x, y - P2_BASE.y);
        if (
          distP1 < FIGHTER_ORBIT_RADIUS + radius + pass.basePad ||
          distP2 < FIGHTER_ORBIT_RADIUS + radius + pass.basePad
        ) {
          continue;
        }

        const overlaps = asteroids.some(
          (other) => Math.hypot(x - other.x, y - other.y) < radius + other.radius + pass.gap
        );
        if (overlaps) continue;

        const vertexCount = 10 + Math.floor(Math.random() * 3);
        const vertices: Vec2[] = [];
        for (let v = 0; v < vertexCount; v++) {
          const angle = (v / vertexCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.18;
          const jag = 0.72 + Math.random() * 0.42;
          vertices.push({
            x: Math.cos(angle) * radius * jag,
            y: Math.sin(angle) * radius * jag,
          });
        }

        const maxHp = Math.max(3, Math.round(radius * 0.3));
        const hasHiddenCell = Math.random() < 0.42;
        const hiddenCellKind = hasHiddenCell
          ? pickRandomCellKind(Math.random() < 0.15)
          : null;

        asteroids.push({
          id: `asteroid-${i}-${Math.random().toString(36).slice(2, 6)}`,
          x,
          y,
          radius,
          gravityRadius: radius * ASTEROID_GRAVITY_RADIUS_MULT,
          gravityStrength: ASTEROID_GRAVITY_CONSTANT * radius * radius,
          hp: maxHp,
          maxHp,
          vertices,
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: 0,
          flashTimer: 0,
          hiddenCellKind,
        });
        placed = true;
        break;
      }
    }
    if (!placed) break;
  }

  return asteroids;
}

export function createWorld(rules: MatchRules): GameWorld {
  const ships: Ship[] = [];
  const shields: ShieldRing[] = [];

  const p1ToP2 = Math.atan2(P2_BASE.y - P1_BASE.y, P2_BASE.x - P1_BASE.x);
  const p2ToP1 = Math.atan2(P1_BASE.y - P2_BASE.y, P1_BASE.x - P2_BASE.x);

  ships.push({
    id: 'p1-mothership',
    owner: 1,
    kind: 'mothership',
    x: P1_BASE.x,
    y: P1_BASE.y,
    angle: p1ToP2,
    radius: 34,
    hp: MOTHERSHIP_HP,
    maxHp: MOTHERSHIP_HP,
    alive: true,
    flashTimer: 0,
  });

  ships.push({
    id: 'p2-mothership',
    owner: 2,
    kind: 'mothership',
    x: P2_BASE.x,
    y: P2_BASE.y,
    angle: p2ToP1,
    radius: 34,
    hp: MOTHERSHIP_HP,
    maxHp: MOTHERSHIP_HP,
    alive: true,
    flashTimer: 0,
  });

  for (const owner of [1, 2] as PlayerId[]) {
    const base = owner === 1 ? P1_BASE : P2_BASE;
    shields.push({
      id: `p${owner}-shield`,
      owner,
      centerX: base.x,
      centerY: base.y,
      radius: SHIELD_RADIUS,
      hp: SHIELD_RING_HP,
      maxHp: SHIELD_RING_HP,
      flashTimer: 0,
    });
  }

  const fighterOffsets = [-0.92, -0.46, 0, 0.46, 0.92];
  fighterOffsets.forEach((offset, idx) => {
    const a1 = p1ToP2 + offset;
    ships.push({
      id: `p1-fighter-${idx}`,
      owner: 1,
      kind: 'fighter',
      x: P1_BASE.x + Math.cos(a1) * FIGHTER_ORBIT_RADIUS,
      y: P1_BASE.y + Math.sin(a1) * FIGHTER_ORBIT_RADIUS,
      angle: p1ToP2,
      radius: 15,
      hp: FIGHTER_HP,
      maxHp: FIGHTER_HP,
      alive: true,
      flashTimer: 0,
    });

    const a2 = p2ToP1 + offset;
    ships.push({
      id: `p2-fighter-${idx}`,
      owner: 2,
      kind: 'fighter',
      x: P2_BASE.x + Math.cos(a2) * FIGHTER_ORBIT_RADIUS,
      y: P2_BASE.y + Math.sin(a2) * FIGHTER_ORBIT_RADIUS,
      angle: p2ToP1,
      radius: 15,
      hp: FIGHTER_HP,
      maxHp: FIGHTER_HP,
      alive: true,
      flashTimer: 0,
    });
  });

  const startingTurn: PlayerId = Math.random() < 0.5 ? 1 : 2;
  const asteroids = generateAsteroids(rules.asteroidDensity);
  const powerCells: PowerCell[] = [];

  for (let i = 0; i < 2; i++) {
    const spot = findOpenPowerCellSpot({ ships, asteroids, powerCells });
    if (spot) {
      powerCells.push(createPowerCell(pickRandomCellKind(false), spot.x, spot.y));
    }
  }

  return {
    ships,
    shields,
    asteroids,
    powerCells,
    charges: {
      1: createEmptyCharges(),
      2: createEmptyCharges(),
    },
    projectiles: [],
    particles: [],
    shockwaves: [],
    floatingTexts: [],
    pendingDestructions: [],
    destructionTimer: 0,
    victoryDelay: 0,
    pendingBonusTurn: false,
    currentTurn: startingTurn,
    turnCount: 1,
    actionLocked: false,
    winner: null,
    lastEventText: `Coin flip: Player ${startingTurn} shoots first · Click any ship to activate`,
    screenShake: 0,
    rules,
  };
}

function spawnFloatingText(
  world: GameWorld,
  text: string,
  x: number,
  y: number,
  color: string
) {
  const ft: FloatingText = {
    text,
    x,
    y,
    vy: -28,
    life: 0.95,
    maxLife: 0.95,
    color,
  };
  world.floatingTexts.push(ft);
}

function spawnVectorBurst(
  world: GameWorld,
  x: number,
  y: number,
  color: string,
  count: number,
  speedScale: number,
  lengthScale = 1
) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = (60 + Math.random() * 210) * speedScale;
    const life = 0.32 + Math.random() * 0.45;
    const particle: VectorParticle = {
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 11,
      length: (6 + Math.random() * 14) * lengthScale,
      life,
      maxLife: life,
      color,
    };
    world.particles.push(particle);
  }
}

function isTouchingBorder(x: number, y: number, radius: number): boolean {
  return (
    x - radius <= PAPER_MARGIN ||
    x + radius >= LOGICAL_WIDTH - PAPER_MARGIN ||
    y - radius <= PAPER_MARGIN ||
    y + radius >= LOGICAL_HEIGHT - PAPER_MARGIN
  );
}

function findShieldAtPoint(
  world: GameWorld,
  x: number,
  y: number,
  radius: number
): ShieldRing | null {
  for (const ring of world.shields) {
    if (ring.hp <= 0) continue;
    const dist = Math.hypot(x - ring.centerX, y - ring.centerY);
    if (Math.abs(dist - ring.radius) <= radius) {
      return ring;
    }
  }
  return null;
}

function findAsteroidAtPoint(
  world: GameWorld,
  x: number,
  y: number,
  radius: number
): Asteroid | null {
  for (const ast of world.asteroids) {
    if (ast.hp <= 0) continue;
    if (Math.hypot(x - ast.x, y - ast.y) <= ast.radius + radius) {
      return ast;
    }
  }
  return null;
}

function findPowerCellAtPoint(
  world: GameWorld,
  x: number,
  y: number,
  radius: number,
  ignoreProjectileId?: string
): PowerCell | null {
  for (const cell of world.powerCells) {
    if (cell.graceTimer > 0) continue;
    if (ignoreProjectileId && cell.immuneProjectileId === ignoreProjectileId) continue;
    if (Math.hypot(x - cell.x, y - cell.y) <= cell.radius + radius) {
      return cell;
    }
  }
  return null;
}

function applyDamageToAsteroid(
  world: GameWorld,
  asteroid: Asteroid,
  damage: number,
  impactX: number,
  impactY: number,
  immuneProjectileId?: string
): boolean {
  asteroid.hp = Math.max(0, asteroid.hp - damage);
  asteroid.flashTimer = 0.22;
  const shattered = asteroid.hp <= 0;

  if (shattered) {
    const idx = world.asteroids.findIndex((a) => a.id === asteroid.id);
    if (idx !== -1) {
      world.asteroids.splice(idx, 1);
    }
    spawnVectorBurst(world, asteroid.x, asteroid.y, '#E4E4E7', 26, 1.05, 1.05);
    world.shockwaves.push({
      x: asteroid.x,
      y: asteroid.y,
      radius: 6,
      maxRadius: asteroid.radius * 1.9,
      life: 0.4,
      maxLife: 0.4,
      color: '#E4E4E7',
    });
    world.screenShake = Math.max(world.screenShake, 7);
    sound.playAsteroidHit(true);

    if (asteroid.hiddenCellKind) {
      const revealed = createPowerCell(
        asteroid.hiddenCellKind,
        asteroid.x,
        asteroid.y,
        0.18,
        immuneProjectileId
      );
      world.powerCells.push(revealed);
      const meta = POWER_CELL_META[revealed.kind];
      spawnFloatingText(world, `${meta.short} REVEALED`, asteroid.x, asteroid.y - 14, meta.color);
    }
  } else {
    spawnVectorBurst(world, impactX, impactY, '#D4D4D8', 10, 0.7, 0.8);
    world.shockwaves.push({
      x: impactX,
      y: impactY,
      radius: 4,
      maxRadius: 24,
      life: 0.25,
      maxLife: 0.25,
      color: '#D4D4D8',
    });
    world.screenShake = Math.max(world.screenShake, 3);
    sound.playAsteroidHit(false);
  }

  return shattered;
}

function detonateMine(world: GameWorld, x: number, y: number): void {
  spawnVectorBurst(world, x, y, '#F43F5E', 34, 1.25, 1.15);
  spawnVectorBurst(world, x, y, '#FACC15', 14, 0.9, 0.85);
  world.shockwaves.push({
    x,
    y,
    radius: 8,
    maxRadius: MINE_BLAST_RADIUS,
    life: 0.44,
    maxLife: 0.44,
    color: '#F43F5E',
  });
  world.screenShake = Math.max(world.screenShake, 11);
  spawnFloatingText(world, 'MINE BLAST!', x, y - 16, '#F43F5E');
  sound.playMineExplosion();

  // Damage ships (or absorb via Fighter Shield first) in blast radius
  for (const ship of [...world.ships]) {
    if (!ship.alive) continue;
    const fShieldR = (ship.shieldHp ?? 0) > 0 ? ship.radius + FIGHTER_SHIELD_OFFSET : ship.radius;
    if (Math.hypot(ship.x - x, ship.y - y) <= MINE_BLAST_RADIUS + fShieldR) {
      if (ship.kind === 'fighter' && (ship.shieldHp ?? 0) > 0) {
        ship.shieldHp = Math.max(0, (ship.shieldHp ?? 0) - MINE_BLAST_DAMAGE);
        ship.shieldFlashTimer = 0.25;
        sound.playShieldHit(ship.shieldHp <= 0);
      } else if (Math.hypot(ship.x - x, ship.y - y) <= MINE_BLAST_RADIUS + ship.radius) {
        applyDamageToShip(world, ship, MINE_BLAST_DAMAGE, x, y);
      }
    }
  }

  // Damage shields intersecting blast radius
  for (const ring of world.shields) {
    if (ring.hp <= 0) continue;
    const dist = Math.hypot(x - ring.centerX, y - ring.centerY);
    if (Math.abs(dist - ring.radius) <= MINE_BLAST_RADIUS) {
      ring.hp = Math.max(0, ring.hp - MINE_BLAST_DAMAGE);
      ring.flashTimer = 0.25;
      sound.playShieldHit(ring.hp <= 0);
    }
  }

  // Damage asteroids in blast radius
  for (const ast of [...world.asteroids]) {
    if (ast.hp <= 0) continue;
    if (Math.hypot(ast.x - x, ast.y - y) <= MINE_BLAST_RADIUS + ast.radius) {
      applyDamageToAsteroid(world, ast, MINE_BLAST_DAMAGE, x, y);
    }
  }

  // Chain-detonate nearby Mines
  for (let i = world.powerCells.length - 1; i >= 0; i--) {
    const other = world.powerCells[i];
    if (
      other.kind === 'mine' &&
      Math.hypot(other.x - x, other.y - y) <= MINE_BLAST_RADIUS + other.radius
    ) {
      world.powerCells.splice(i, 1);
      detonateMine(world, other.x, other.y);
    }
  }
}

function triggerPowerCell(
  world: GameWorld,
  cell: PowerCell,
  collector: PlayerId
): { isMine: boolean; message: string } {
  const idx = world.powerCells.findIndex((c) => c.id === cell.id);
  if (idx !== -1) {
    world.powerCells.splice(idx, 1);
  }

  if (cell.kind === 'mine') {
    detonateMine(world, cell.x, cell.y);
    return {
      isMine: true,
      message: `Proximity Mine detonated! (${MINE_BLAST_DAMAGE} AoE dmg)`,
    };
  }

  const meta = POWER_CELL_META[cell.kind];
  spawnVectorBurst(world, cell.x, cell.y, meta.color, 16, 0.85, 0.9);
  world.shockwaves.push({
    x: cell.x,
    y: cell.y,
    radius: 5,
    maxRadius: 36,
    life: 0.3,
    maxLife: 0.3,
    color: meta.color,
  });

  if (cell.kind === 'repair') {
    const mother = world.ships.find((s) => s.owner === collector && s.kind === 'mothership' && s.alive);
    if (mother) {
      const before = mother.hp;
      mother.hp = Math.min(mother.maxHp, mother.hp + cell.value);
      mother.flashTimer = 0.24;
      const gained = mother.hp - before;
      spawnFloatingText(
        world,
        gained > 0 ? `+${gained} HULL` : 'HULL FULL',
        cell.x,
        cell.y - 12,
        meta.color
      );
      sound.playCellPickup();
      return {
        isMine: false,
        message:
          gained > 0
            ? `Player ${collector} collected Repair (+${gained} Mother Ship HP)`
            : `Player ${collector} collected Repair (Mother Ship already full)`,
      };
    }
    sound.playCellPickup();
    return { isMine: false, message: `Player ${collector} collected Repair` };
  }

  if (cell.kind === 'energy') {
    const ring = world.shields.find((s) => s.owner === collector);
    if (ring) {
      const before = ring.hp;
      ring.hp = Math.min(SHIELD_MAX_OVER_HP, ring.hp + cell.value);
      ring.flashTimer = 0.28;
      const gained = ring.hp - before;
      const pct = Math.round((ring.hp / ring.maxHp) * 100);
      spawnFloatingText(
        world,
        ring.hp > ring.maxHp ? `OVER-SHIELD ${pct}%` : `+${gained} SHIELD`,
        cell.x,
        cell.y - 12,
        meta.color
      );
      sound.playShieldBoost();
      return {
        isMine: false,
        message:
          ring.hp > ring.maxHp
            ? `Player ${collector} Energy Over-Shield active (${pct}%)`
            : `Player ${collector} collected Energy (+${gained} Shield HP · ${pct}%)`,
      };
    }
    sound.playShieldBoost();
    return { isMine: false, message: `Player ${collector} collected Energy` };
  }

  // Tactical stored charge
  world.charges[collector][cell.kind] += 1;
  spawnFloatingText(world, `+1 ${meta.short}`, cell.x, cell.y - 12, meta.color);
  sound.playCellPickup();
  return {
    isMine: false,
    message: `Player ${collector} banked +1 ${meta.label} charge`,
  };
}

interface MoveTraceResult {
  outcome: MoveOutcome;
  x: number;
  y: number;
  shield?: ShieldRing;
  shieldedFighter?: Ship;
  asteroid?: Asteroid;
  mineCell?: PowerCell;
  crossedCells: PowerCell[];
  ships: Ship[];
}

function findFighterShieldAtPoint(
  world: GameWorld,
  x: number,
  y: number,
  radius: number,
  movingOwner: PlayerId
): Ship | null {
  for (const ship of world.ships) {
    if (!ship.alive || ship.kind !== 'fighter' || (ship.shieldHp ?? 0) <= 0) continue;
    if (ship.owner === movingOwner) continue;
    const shieldR = ship.radius + FIGHTER_SHIELD_OFFSET;
    if (Math.hypot(x - ship.x, y - ship.y) <= shieldR + radius) {
      return ship;
    }
  }
  return null;
}

function traceShipMovement(
  world: GameWorld,
  movingShip: Ship,
  rawTargetX: number,
  rawTargetY: number,
  hyperMove = false
): MoveTraceResult {
  const clamped = clampMoveRange(movingShip, rawTargetX, rawTargetY, hyperMove);
  const dx = clamped.x - movingShip.x;
  const dy = clamped.y - movingShip.y;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 3));
  const crossedCells: PowerCell[] = [];
  const seenCellIds = new Set<string>();

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const sx = movingShip.x + dx * t;
    const sy = movingShip.y + dy * t;

    if (isTouchingBorder(sx, sy, movingShip.radius)) {
      return { outcome: 'border', x: sx, y: sy, crossedCells, ships: [] };
    }

    const shield = findShieldAtPoint(world, sx, sy, movingShip.radius);
    if (shield) {
      return { outcome: 'shield', x: sx, y: sy, shield, crossedCells, ships: [] };
    }

    const shieldedFighter = findFighterShieldAtPoint(world, sx, sy, movingShip.radius, movingShip.owner);
    if (shieldedFighter) {
      return { outcome: 'shield', x: sx, y: sy, shieldedFighter, crossedCells, ships: [] };
    }

    const asteroid = findAsteroidAtPoint(world, sx, sy, movingShip.radius);
    if (asteroid) {
      return { outcome: 'asteroid', x: sx, y: sy, asteroid, crossedCells, ships: [] };
    }

    for (const cell of world.powerCells) {
      if (cell.graceTimer > 0) continue;
      if (Math.hypot(sx - cell.x, sy - cell.y) <= movingShip.radius + cell.radius) {
        if (cell.kind === 'mine') {
          return { outcome: 'mine', x: sx, y: sy, mineCell: cell, crossedCells, ships: [] };
        }
        if (!seenCellIds.has(cell.id)) {
          seenCellIds.add(cell.id);
          crossedCells.push(cell);
        }
      }
    }

    const hitShips = world.ships.filter(
      (other) =>
        other.alive &&
        other.id !== movingShip.id &&
        Math.hypot(sx - other.x, sy - other.y) <= movingShip.radius + other.radius
    );
    if (hitShips.length > 0) {
      const hasEnemy = hitShips.some((s) => s.owner !== movingShip.owner);
      return {
        outcome: hasEnemy ? 'kamikaze' : 'friendly',
        x: sx,
        y: sy,
        crossedCells,
        ships: hitShips,
      };
    }
  }

  return {
    outcome: crossedCells.length > 0 ? 'pickup' : 'move',
    x: clamped.x,
    y: clamped.y,
    crossedCells,
    ships: [],
  };
}

export function clampMoveRange(
  movingShip: Ship,
  rawX: number,
  rawY: number,
  hyperMove = false
): { x: number; y: number } {
  const maxDist = hyperMove ? MAX_MOVE_DISTANCE * HYPER_MOVE_MULT : MAX_MOVE_DISTANCE;
  const dx = rawX - movingShip.x;
  const dy = rawY - movingShip.y;
  const dist = Math.hypot(dx, dy);
  if (dist > maxDist && dist > 0) {
    return {
      x: movingShip.x + (dx / dist) * maxDist,
      y: movingShip.y + (dy / dist) * maxDist,
    };
  }
  return { x: rawX, y: rawY };
}

export function executeMoveShip(
  world: GameWorld,
  shipId: string,
  targetX: number,
  targetY: number,
  requestedHyperMove = false
): boolean {
  if (world.actionLocked || world.winner !== null) return false;
  const ship = world.ships.find((s) => s.id === shipId && s.alive && s.owner === world.currentTurn);
  if (!ship || ship.kind !== 'fighter') return false;

  const canHyper = requestedHyperMove && world.charges[ship.owner].hyper_move > 0;
  const trace = traceShipMovement(world, ship, targetX, targetY, canHyper);
  if (Math.hypot(trace.x - ship.x, trace.y - ship.y) < 12) return false;

  if (canHyper) {
    world.charges[ship.owner].hyper_move = Math.max(0, world.charges[ship.owner].hyper_move - 1);
  }

  // Collect beneficial power cells crossed prior to terminal impact/destination
  let lastPickupMsg: string | null = null;
  for (const cell of trace.crossedCells) {
    const res = triggerPowerCell(world, cell, ship.owner);
    lastPickupMsg = res.message;
  }

  const oldX = ship.x;
  const oldY = ship.y;
  const color = getPlayerColor(ship.owner);

  if (trace.outcome === 'mine' && trace.mineCell) {
    ship.x = trace.x;
    ship.y = trace.y;
    spawnVectorBurst(world, oldX, oldY, color, 6, 0.4, 0.7);
    triggerPowerCell(world, trace.mineCell, ship.owner);
    if (world.winner !== null) {
      world.lastEventText = `Player ${world.winner} wins · Proximity Mine destroyed the Mother Ship`;
      return true;
    }
    advanceTurn(world, `Player ${ship.owner} fighter triggered a Proximity Mine!`);
    return true;
  }

  if (trace.outcome === 'border') {
    ship.hp = 0;
    ship.alive = false;
    spawnVectorBurst(world, oldX, oldY, color, 6, 0.4, 0.7);
    spawnVectorBurst(world, trace.x, trace.y, '#EF4444', 18, 0.9, 1.0);
    world.shockwaves.push({
      x: trace.x,
      y: trace.y,
      radius: 4,
      maxRadius: 42,
      life: 0.3,
      maxLife: 0.3,
      color: '#EF4444',
    });
    world.screenShake = Math.max(world.screenShake, 6);
    sound.playShipExplosion(false);
    advanceTurn(world, `Player ${ship.owner} fighter crashed against the border and was destroyed`);
    return true;
  }

  if (trace.outcome === 'shield' && (trace.shield || trace.shieldedFighter)) {
    ship.hp = 0;
    ship.alive = false;
    let shieldOwner: PlayerId = 1;
    let shattered = false;
    if (trace.shield) {
      trace.shield.hp = Math.max(0, trace.shield.hp - SHIELD_COLLISION_DAMAGE);
      trace.shield.flashTimer = 0.25;
      shieldOwner = trace.shield.owner;
      shattered = trace.shield.hp <= 0;
    } else if (trace.shieldedFighter) {
      trace.shieldedFighter.shieldHp = Math.max(
        0,
        (trace.shieldedFighter.shieldHp ?? 0) - SHIELD_COLLISION_DAMAGE
      );
      trace.shieldedFighter.shieldFlashTimer = 0.25;
      shieldOwner = trace.shieldedFighter.owner;
      shattered = trace.shieldedFighter.shieldHp <= 0;
    }

    spawnVectorBurst(world, oldX, oldY, color, 6, 0.4, 0.7);
    spawnVectorBurst(world, trace.x, trace.y, getPlayerColor(shieldOwner), 20, 0.95, 1.0);
    world.shockwaves.push({
      x: trace.x,
      y: trace.y,
      radius: 5,
      maxRadius: shattered ? 50 : 34,
      life: 0.32,
      maxLife: 0.32,
      color: getPlayerColor(shieldOwner),
    });
    world.screenShake = Math.max(world.screenShake, 7);
    sound.playShieldHit(shattered);
    sound.playShipExplosion(false);
    advanceTurn(
      world,
      shattered
        ? `Player ${ship.owner} fighter crashed into shield & breached it (${SHIELD_COLLISION_DAMAGE} dmg)`
        : `Player ${ship.owner} fighter destroyed on shield (${SHIELD_COLLISION_DAMAGE} dmg)`
    );
    return true;
  }

  if (trace.outcome === 'asteroid' && trace.asteroid) {
    ship.hp = 0;
    ship.alive = false;
    spawnVectorBurst(world, oldX, oldY, color, 6, 0.4, 0.7);
    spawnVectorBurst(world, trace.x, trace.y, color, 16, 0.85, 0.95);
    const shattered = applyDamageToAsteroid(
      world,
      trace.asteroid,
      ASTEROID_COLLISION_DAMAGE,
      trace.x,
      trace.y
    );
    sound.playShipExplosion(false);
    advanceTurn(
      world,
      shattered
        ? `Player ${ship.owner} fighter crashed into & shattered an asteroid`
        : `Player ${ship.owner} fighter destroyed on asteroid (${trace.asteroid.hp}/${trace.asteroid.maxHp} HP)`
    );
    return true;
  }

  if (trace.outcome === 'kamikaze' || trace.outcome === 'friendly') {
    ship.x = trace.x;
    ship.y = trace.y;
    applyDamageToShip(world, ship, KAMIKAZE_DAMAGE, trace.x, trace.y);
    for (const target of trace.ships) {
      applyDamageToShip(world, target, KAMIKAZE_DAMAGE, trace.x, trace.y);
    }

    if (trace.outcome === 'kamikaze') {
      spawnFloatingText(world, 'Kamikaze', trace.x, trace.y - 12, color);
    }

    if (world.winner !== null) {
      world.lastEventText = `Player ${world.winner} wins · Kamikaze Hit destroyed the Mother Ship`;
      return true;
    }

    if (trace.outcome === 'kamikaze') {
      awardBonusTurn(
        world,
        `Kamikaze Hit! Player ${ship.owner} & enemy took ${KAMIKAZE_DAMAGE} HP · Bonus turn to fire`
      );
    } else {
      advanceTurn(
        world,
        `Friendly crash · Both ships took ${KAMIKAZE_DAMAGE} HP damage`
      );
    }
    return true;
  }

  // Clean reposition (and/or pickup)
  const enemyBase = ship.owner === 1 ? P2_BASE : P1_BASE;
  ship.x = trace.x;
  ship.y = trace.y;
  ship.angle = Math.atan2(enemyBase.y - trace.y, enemyBase.x - trace.x);

  spawnVectorBurst(world, oldX, oldY, color, 8, 0.5, 0.8);
  sound.playMove();
  const moveLabel = canHyper ? 'Hyper-moved a fighter' : 'repositioned a fighter';
  advanceTurn(
    world,
    lastPickupMsg ?? `Player ${ship.owner} ${moveLabel}`
  );
  return true;
}

export function getShipMaxRange(ship: Ship): number {
  return ship.kind === 'mothership' ? MOTHERSHIP_MAX_RANGE : FIGHTER_MAX_RANGE;
}

export function getOverheatChance(
  power: number,
  shipKind: ShipKind = 'fighter',
  overcharged = false
): number {
  if (shipKind === 'mothership' || overcharged) return 0;
  const pct = Math.round(Math.max(0, Math.min(1, power)) * 100);
  if (pct <= 75) return 0;
  const t = (pct - 75) / 25;
  const raw = 1 / (1 - ASYMPTOTE_K * t) - 1;
  const maxRaw = 1 / (1 - ASYMPTOTE_K) - 1;
  return (raw / maxRaw) * MAX_OVERHEAT_CHANCE;
}

export function getProjectileRange(ship: Ship, power: number): number {
  const clampedPower = Math.max(MIN_POWER, Math.min(1, power));
  return clampedPower * getShipMaxRange(ship);
}

function applyDamageToShip(
  world: GameWorld,
  ship: Ship,
  damage: number,
  impactX: number,
  impactY: number
): void {
  if (!ship.alive) return;
  ship.hp -= damage;
  ship.flashTimer = 0.28;
  const color = getPlayerColor(ship.owner);
  const isMother = ship.kind === 'mothership';

  if (ship.hp <= 0) {
    ship.hp = 0;
    ship.alive = false;
    spawnVectorBurst(
      world,
      ship.x,
      ship.y,
      color,
      isMother ? 54 : 24,
      isMother ? 1.5 : 1.0,
      isMother ? 1.5 : 1.0
    );
    world.shockwaves.push({
      x: ship.x,
      y: ship.y,
      radius: 8,
      maxRadius: isMother ? 150 : 54,
      life: isMother ? 0.65 : 0.34,
      maxLife: isMother ? 0.65 : 0.34,
      color,
    });
    world.screenShake = Math.max(world.screenShake, isMother ? 16 : 7);
    sound.playShipExplosion(isMother);

    if (isMother) {
      world.winner = ship.owner === 1 ? 2 : 1;
      world.actionLocked = true;
      for (const proj of world.projectiles) {
        proj.active = false;
      }
      const survivingFighters = world.ships
        .filter((s) => s.alive && s.owner === ship.owner && s.kind === 'fighter')
        .sort(
          (a, b) =>
            Math.hypot(a.x - ship.x, a.y - ship.y) - Math.hypot(b.x - ship.x, b.y - ship.y)
        );
      world.pendingDestructions = survivingFighters.map((s) => s.id);
      world.destructionTimer = survivingFighters.length > 0 ? COLLAPSE_INTERVAL : 0;
      world.victoryDelay = VICTORY_SETTLE_DELAY;
      if (survivingFighters.length === 0) {
        sound.playVictory();
      }
    }
  } else {
    spawnVectorBurst(world, impactX, impactY, color, 14, 0.85, 1.0);
    world.shockwaves.push({
      x: impactX,
      y: impactY,
      radius: 6,
      maxRadius: isMother ? 48 : 34,
      life: 0.28,
      maxLife: 0.28,
      color,
    });
    world.screenShake = Math.max(world.screenShake, isMother ? 8 : 5);
    sound.playShipExplosion(false);
  }
}

export function normalizeFireModifiers(
  requested: FireModifierKind[] | FireModifierKind | null | undefined
): FireModifierKind[] {
  const list = Array.isArray(requested) ? requested : requested ? [requested] : [];
  const validMods: FireModifierKind[] = ['trident', 'flak', 'overcharge', 'piercer'];
  const unique: FireModifierKind[] = [];
  for (const mod of list) {
    if (!validMods.includes(mod)) continue;
    if (mod === 'trident') {
      const flakIdx = unique.indexOf('flak');
      if (flakIdx !== -1) unique.splice(flakIdx, 1);
    } else if (mod === 'flak') {
      const tridentIdx = unique.indexOf('trident');
      if (tridentIdx !== -1) unique.splice(tridentIdx, 1);
    }
    if (!unique.includes(mod)) {
      unique.push(mod);
    }
  }
  return unique;
}

export function applyShipBuff(
  world: GameWorld,
  shipId: string,
  buff: ShipBuffKind
): boolean {
  if (world.actionLocked || world.winner !== null) return false;
  const ship = world.ships.find((s) => s.id === shipId && s.alive && s.owner === world.currentTurn);
  if (!ship) return false;
  if ((world.charges[ship.owner][buff] ?? 0) <= 0) return false;

  const meta = POWER_CELL_META[buff];

  if (buff === 'laser_sight') {
    if (ship.hasLaserSight) return false;
    world.charges[ship.owner].laser_sight -= 1;
    ship.hasLaserSight = true;
    ship.flashTimer = 0.2;
    spawnVectorBurst(world, ship.x, ship.y, meta.color, 12, 0.65, 0.75);
    spawnFloatingText(world, 'LASER SIGHT ON', ship.x, ship.y - ship.radius - 10, meta.color);
    sound.playCellPickup();
    world.lastEventText = `Player ${ship.owner} mounted Laser Sight on ${ship.kind === 'mothership' ? 'Mother Ship' : 'Fighter'}`;
    return true;
  }

  if (buff === 'laser_dot') {
    if (ship.hasLaserDot) return false;
    world.charges[ship.owner].laser_dot -= 1;
    ship.hasLaserDot = true;
    ship.flashTimer = 0.2;
    spawnVectorBurst(world, ship.x, ship.y, meta.color, 12, 0.65, 0.75);
    spawnFloatingText(world, 'LASER DOT ON', ship.x, ship.y - ship.radius - 10, meta.color);
    sound.playCellPickup();
    world.lastEventText = `Player ${ship.owner} mounted Laser Dot on ${ship.kind === 'mothership' ? 'Mother Ship' : 'Fighter'}`;
    return true;
  }

  if (buff === 'fighter_shield') {
    if (ship.kind !== 'fighter') return false;
    if ((ship.shieldHp ?? 0) >= FIGHTER_SHIELD_HP) return false;
    const replaced = (ship.shieldHp ?? 0) > 0;
    world.charges[ship.owner].fighter_shield -= 1;
    ship.shieldHp = FIGHTER_SHIELD_HP;
    ship.shieldMaxHp = FIGHTER_SHIELD_HP;
    ship.shieldFlashTimer = 0.28;
    spawnVectorBurst(world, ship.x, ship.y, meta.color, 14, 0.75, 0.85);
    world.shockwaves.push({
      x: ship.x,
      y: ship.y,
      radius: ship.radius,
      maxRadius: ship.radius + FIGHTER_SHIELD_OFFSET + 12,
      life: 0.3,
      maxLife: 0.3,
      color: meta.color,
    });
    spawnFloatingText(
      world,
      replaced ? 'SHIELD REPLACED' : `F-SHIELD ${FIGHTER_SHIELD_HP} HP`,
      ship.x,
      ship.y - ship.radius - 12,
      meta.color
    );
    sound.playShieldBoost();
    world.lastEventText = replaced
      ? `Player ${ship.owner} replaced a Fighter Shield (${FIGHTER_SHIELD_HP} HP)`
      : `Player ${ship.owner} deployed a ${FIGHTER_SHIELD_HP} HP Fighter Shield`;
    return true;
  }

  return false;
}

export function fireFromShip(
  world: GameWorld,
  shipId: string,
  angle: number,
  power: number,
  requestedFireMods: FireModifierKind[] | FireModifierKind | null = null
): boolean {
  if (world.actionLocked || world.winner !== null) return false;
  const ship = world.ships.find((s) => s.id === shipId && s.alive && s.owner === world.currentTurn);
  if (!ship) return false;

  const normalized = normalizeFireModifiers(requestedFireMods);
  const activeMods: FireModifierKind[] = [];
  for (const mod of normalized) {
    if (world.charges[ship.owner][mod] > 0) {
      activeMods.push(mod);
      world.charges[ship.owner][mod] -= 1;
    }
  }

  const hasTrident = activeMods.includes('trident');
  const hasFlak = activeMods.includes('flak');
  const isOvercharge = activeMods.includes('overcharge');
  const isPiercer = activeMods.includes('piercer');

  ship.angle = angle;
  const chargedPower = Math.max(MIN_POWER, Math.min(1, power));
  const chargedPct = Math.round(chargedPower * 100);
  const overheatChance = getOverheatChance(chargedPower, ship.kind, isOvercharge);

  if (overheatChance > 0 && Math.random() < overheatChance) {
    ship.hp = 0;
    ship.alive = false;
    const color = getPlayerColor(ship.owner);

    spawnVectorBurst(world, ship.x, ship.y, '#EF4444', 24, 1.0, 1.0);
    spawnVectorBurst(world, ship.x, ship.y, color, 12, 0.9, 1.0);
    world.shockwaves.push({
      x: ship.x,
      y: ship.y,
      radius: 8,
      maxRadius: 62,
      life: 0.38,
      maxLife: 0.38,
      color: '#EF4444',
    });
    world.screenShake = Math.max(world.screenShake, 9);
    sound.playShipExplosion(false);

    advanceTurn(
      world,
      `Player ${ship.owner} fighter overheated at ${chargedPct}% power and exploded`
    );
    return true;
  }

  const maxRange = getProjectileRange(ship, chargedPower);
  const baseDamage = ship.kind === 'mothership' ? MOTHERSHIP_PROJECTILE_DAMAGE : FIGHTER_PROJECTILE_DAMAGE;
  const damage = isOvercharge ? baseDamage * 2 : baseDamage;

  const spawnOffset = ship.radius + 8;
  const startX = ship.x + Math.cos(angle) * spawnOffset;
  const startY = ship.y + Math.sin(angle) * spawnOffset;

  world.projectiles.push({
    id: `proj-${Date.now()}-${Math.random()}`,
    owner: ship.owner,
    sourceShipId: ship.id,
    hitShipIds: [],
    hitCellIds: [],
    x: startX,
    y: startY,
    vx: Math.cos(angle) * PROJECTILE_SPEED,
    vy: Math.sin(angle) * PROJECTILE_SPEED,
    power: chargedPower,
    damage,
    distanceTraveled: 0,
    maxRange,
    bounces: 0,
    maxBounces: world.rules.ricochetWalls ? 1 : 0,
    trail: [{ x: startX, y: startY }],
    active: true,
    kind: hasTrident ? 'trident' : hasFlak ? 'flak' : 'normal',
    spawnsFighter: !hasFlak,
    shieldPiercer: isPiercer,
    tridentSplitPending: hasTrident,
    flakBurstOnEnd: hasFlak,
    overcharged: isOvercharge,
  });

  world.pendingBonusTurn = false;
  world.actionLocked = true;
  const modLabel =
    activeMods.length > 0
      ? ` · ${activeMods.map((m) => POWER_CELL_META[m].short).join('+')}`
      : '';
  world.lastEventText = `Player ${ship.owner} fired (${chargedPct}% · ${Math.round(maxRange)}px${modLabel})`;
  sound.playFire(ship.kind === 'mothership' || isOvercharge);
  return true;
}

// Returns true if a Kamikaze Hit bonus turn should be awarded
function spawnFighterAtProjectileEnd(world: GameWorld, proj: Projectile): boolean {
  const enemyBase = proj.owner === 1 ? P2_BASE : P1_BASE;
  const spawnX = proj.x;
  const spawnY = proj.y;
  const spawnRadius = 15;
  const color = getPlayerColor(proj.owner);

  // 1. Border collision check
  if (isTouchingBorder(spawnX, spawnY, spawnRadius)) {
    spawnVectorBurst(world, spawnX, spawnY, '#EF4444', 18, 0.9, 1.0);
    world.shockwaves.push({
      x: spawnX,
      y: spawnY,
      radius: 4,
      maxRadius: 40,
      life: 0.28,
      maxLife: 0.28,
      color: '#EF4444',
    });
    world.screenShake = Math.max(world.screenShake, 5);
    sound.playShipExplosion(false);
    world.lastEventText = `Player ${proj.owner} spawned fighter hit the border and was destroyed`;
    return false;
  }

  // 2. Active shield collision check (Mother Ship Shield OR Fighter Shield, unless shield piercer)
  const hitShield = proj.shieldPiercer ? null : findShieldAtPoint(world, spawnX, spawnY, spawnRadius);
  const hitFighterShield =
    !hitShield && !proj.shieldPiercer
      ? findFighterShieldAtPoint(world, spawnX, spawnY, spawnRadius, proj.owner)
      : null;
  if (hitShield || hitFighterShield) {
    let shieldOwner: PlayerId = 1;
    let shattered = false;
    if (hitShield) {
      hitShield.hp = Math.max(0, hitShield.hp - SHIELD_COLLISION_DAMAGE);
      hitShield.flashTimer = 0.25;
      shieldOwner = hitShield.owner;
      shattered = hitShield.hp <= 0;
    } else if (hitFighterShield) {
      hitFighterShield.shieldHp = Math.max(
        0,
        (hitFighterShield.shieldHp ?? 0) - SHIELD_COLLISION_DAMAGE
      );
      hitFighterShield.shieldFlashTimer = 0.25;
      shieldOwner = hitFighterShield.owner;
      shattered = hitFighterShield.shieldHp <= 0;
    }
    const shieldColor = getPlayerColor(shieldOwner);

    spawnVectorBurst(world, spawnX, spawnY, shieldColor, 20, 0.95, 1.0);
    world.shockwaves.push({
      x: spawnX,
      y: spawnY,
      radius: 5,
      maxRadius: shattered ? 48 : 32,
      life: 0.3,
      maxLife: 0.3,
      color: shieldColor,
    });
    world.screenShake = Math.max(world.screenShake, 6);
    sound.playShieldHit(shattered);
    sound.playShipExplosion(false);
    world.lastEventText = shattered
      ? `Spawned fighter crashed into shield & breached it (${SHIELD_COLLISION_DAMAGE} dmg)`
      : `Spawned fighter destroyed on shield (${SHIELD_COLLISION_DAMAGE} dmg)`;
    return false;
  }

  // 3. Asteroid collision check
  const hitAsteroid = findAsteroidAtPoint(world, spawnX, spawnY, spawnRadius);
  if (hitAsteroid) {
    spawnVectorBurst(world, spawnX, spawnY, color, 16, 0.85, 0.95);
    const shattered = applyDamageToAsteroid(
      world,
      hitAsteroid,
      ASTEROID_COLLISION_DAMAGE,
      spawnX,
      spawnY,
      proj.id
    );
    sound.playShipExplosion(false);
    world.lastEventText = shattered
      ? `Spawned fighter crashed into & shattered an asteroid`
      : `Spawned fighter destroyed on asteroid (${hitAsteroid.hp}/${hitAsteroid.maxHp} HP)`;
    return false;
  }

  // 4. Power Cell contact at spawn point
  const hitCell = findPowerCellAtPoint(world, spawnX, spawnY, spawnRadius, proj.id);
  if (hitCell) {
    const res = triggerPowerCell(world, hitCell, proj.owner);
    if (res.isMine) {
      // Mine deals 4 AoE dmg, destroying the 3 HP newly spawned fighter
      if (world.winner !== null) {
        world.lastEventText = `Player ${world.winner} wins · Proximity Mine destroyed the Mother Ship`;
      } else {
        world.lastEventText = `Spawned fighter detonated a Proximity Mine!`;
      }
      return false;
    }
  }

  const spawned: Ship = {
    id: `p${proj.owner}-spawn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    owner: proj.owner,
    kind: 'fighter',
    x: spawnX,
    y: spawnY,
    angle: Math.atan2(enemyBase.y - spawnY, enemyBase.x - spawnX),
    radius: spawnRadius,
    hp: FIGHTER_HP,
    maxHp: FIGHTER_HP,
    alive: true,
    flashTimer: 0.25,
  };

  // 5. Ship overlap check (Kamikaze Hit if overlapping enemy ship -> 5 HP mutual + bonus turn)
  const overlappingShips = world.ships.filter(
    (other) => other.alive && Math.hypot(spawned.x - other.x, spawned.y - other.y) <= spawned.radius + other.radius
  );

  if (overlappingShips.length > 0) {
    const hitEnemy = overlappingShips.some((other) => other.owner !== proj.owner);
    spawned.hp -= KAMIKAZE_DAMAGE;
    spawned.alive = spawned.hp > 0;

    const impactColor = hitEnemy ? color : '#EF4444';
    spawnVectorBurst(world, spawned.x, spawned.y, impactColor, 24, 1.05, 1.0);
    world.shockwaves.push({
      x: spawned.x,
      y: spawned.y,
      radius: 6,
      maxRadius: 58,
      life: 0.36,
      maxLife: 0.36,
      color: impactColor,
    });

    if (hitEnemy) {
      spawnFloatingText(world, 'Kamikaze', spawned.x, spawned.y - 12, color);
    }

    for (const target of overlappingShips) {
      applyDamageToShip(world, target, KAMIKAZE_DAMAGE, spawned.x, spawned.y);
    }

    if (world.winner !== null) {
      world.lastEventText = `Player ${world.winner} wins · Kamikaze Hit destroyed the Mother Ship`;
      return false;
    }

    if (hitEnemy) {
      world.lastEventText = `Kamikaze Hit! Player ${proj.owner} & enemy took ${KAMIKAZE_DAMAGE} HP · Bonus turn to fire`;
      return true;
    }

    world.lastEventText = `Spawn collision · Both friendly ships took ${KAMIKAZE_DAMAGE} HP damage`;
    return false;
  }

  // 6. Clean deployment
  world.ships.push(spawned);
  spawnVectorBurst(world, spawned.x, spawned.y, color, 10, 0.55, 0.75);
  world.shockwaves.push({
    x: spawned.x,
    y: spawned.y,
    radius: 4,
    maxRadius: 34,
    life: 0.28,
    maxLife: 0.28,
    color,
  });
  sound.playMove();
  world.lastEventText = `Player ${proj.owner} deployed a fighter`;
  return false;
}

function triggerFlakBurst(world: GameWorld, proj: Projectile): void {
  const x = proj.x;
  const y = proj.y;
  const shrapnelDamage = proj.overcharged ? FLAK_SHRAPNEL_DAMAGE * 2 : FLAK_SHRAPNEL_DAMAGE;
  const burstColor = proj.overcharged ? '#FACC15' : '#FB923C';
  spawnVectorBurst(world, x, y, burstColor, 28, 1.15, 0.95);
  world.shockwaves.push({
    x,
    y,
    radius: 6,
    maxRadius: FLAK_SHRAPNEL_RANGE,
    life: 0.34,
    maxLife: 0.34,
    color: burstColor,
  });
  world.screenShake = Math.max(world.screenShake, 7);
  spawnFloatingText(
    world,
    proj.overcharged ? 'OVERCHARGED FLAK' : 'FLAK BURST',
    x,
    y - 14,
    burstColor
  );
  sound.playFlakBurst();

  const stepAngle = (Math.PI * 2) / FLAK_SHRAPNEL_COUNT;
  const baseAngle = Math.atan2(proj.vy, proj.vx);

  for (let i = 0; i < FLAK_SHRAPNEL_COUNT; i++) {
    const a = baseAngle + i * stepAngle;
    world.projectiles.push({
      id: `flak-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      owner: proj.owner,
      sourceShipId: proj.sourceShipId,
      hitShipIds: [],
      hitCellIds: [],
      x,
      y,
      vx: Math.cos(a) * PROJECTILE_SPEED,
      vy: Math.sin(a) * PROJECTILE_SPEED,
      power: 0.25,
      damage: shrapnelDamage,
      distanceTraveled: 0,
      maxRange: FLAK_SHRAPNEL_RANGE,
      bounces: 0,
      maxBounces: 0,
      trail: [{ x, y }],
      active: true,
      kind: 'shrapnel',
      spawnsFighter: false,
      shieldPiercer: proj.shieldPiercer,
      overcharged: proj.overcharged,
    });
  }

  world.lastEventText = `Player ${proj.owner} Flak detonated (${FLAK_SHRAPNEL_COUNT}× ${shrapnelDamage} dmg)`;
}

function advanceTurn(world: GameWorld, eventText: string) {
  if (world.winner !== null) return;
  world.actionLocked = false;
  world.pendingBonusTurn = false;
  world.currentTurn = world.currentTurn === 1 ? 2 : 1;
  world.turnCount += 1;
  world.lastEventText = eventText;
  maybeSpawnOpenSpacePowerCell(world);
}

function awardBonusTurn(world: GameWorld, eventText: string) {
  if (world.winner !== null) return;
  world.actionLocked = false;
  world.pendingBonusTurn = false;
  world.turnCount += 1;
  world.lastEventText = eventText;
  maybeSpawnOpenSpacePowerCell(world);
}

export function stepWorld(world: GameWorld, dt: number): void {
  const clampedDt = Math.min(dt, 0.05);

  if (world.screenShake > 0) {
    world.screenShake = Math.max(0, world.screenShake - clampedDt * 28);
  }

  for (const ship of world.ships) {
    if (ship.flashTimer > 0) {
      ship.flashTimer = Math.max(0, ship.flashTimer - clampedDt);
    }
    if ((ship.shieldFlashTimer ?? 0) > 0) {
      ship.shieldFlashTimer = Math.max(0, (ship.shieldFlashTimer ?? 0) - clampedDt);
    }
  }

  for (const ring of world.shields) {
    if (ring.flashTimer > 0) {
      ring.flashTimer = Math.max(0, ring.flashTimer - clampedDt);
    }
  }

  for (const ast of world.asteroids) {
    if (ast.flashTimer > 0) {
      ast.flashTimer = Math.max(0, ast.flashTimer - clampedDt);
    }
  }

  for (const cell of world.powerCells) {
    cell.pulsePhase = (cell.pulsePhase + clampedDt * 3.2) % (Math.PI * 2);
    if (cell.graceTimer > 0) {
      cell.graceTimer = Math.max(0, cell.graceTimer - clampedDt);
      if (cell.graceTimer === 0) {
        cell.immuneProjectileId = undefined;
      }
    }
  }

  for (let i = world.particles.length - 1; i >= 0; i--) {
    const p = world.particles[i];
    p.x += p.vx * clampedDt;
    p.y += p.vy * clampedDt;
    p.vx *= 0.96;
    p.vy *= 0.96;
    p.angle += p.spin * clampedDt;
    p.life -= clampedDt;
    if (p.life <= 0) {
      world.particles.splice(i, 1);
    }
  }

  for (let i = world.shockwaves.length - 1; i >= 0; i--) {
    const sw = world.shockwaves[i];
    sw.life -= clampedDt;
    const progress = 1 - Math.max(0, sw.life / sw.maxLife);
    sw.radius = sw.maxRadius * (0.2 + 0.8 * progress);
    if (sw.life <= 0) {
      world.shockwaves.splice(i, 1);
    }
  }

  for (let i = world.floatingTexts.length - 1; i >= 0; i--) {
    const ft = world.floatingTexts[i];
    ft.y += ft.vy * clampedDt;
    ft.life -= clampedDt;
    if (ft.life <= 0) {
      world.floatingTexts.splice(i, 1);
    }
  }

  // Sequenced collapse of defeated Mother Ship's remaining Fighter Ships
  if (world.winner !== null) {
    if (world.pendingDestructions.length > 0) {
      world.destructionTimer -= clampedDt;
      if (world.destructionTimer <= 0) {
        const nextId = world.pendingDestructions.shift();
        const target = world.ships.find((s) => s.id === nextId && s.alive);
        if (target) {
          const color = getPlayerColor(target.owner);
          target.hp = 0;
          target.alive = false;
          spawnVectorBurst(world, target.x, target.y, color, 24, 1.0, 1.0);
          world.shockwaves.push({
            x: target.x,
            y: target.y,
            radius: 6,
            maxRadius: 54,
            life: 0.34,
            maxLife: 0.34,
            color,
          });
          world.screenShake = Math.max(world.screenShake, 7);
          sound.playShipExplosion(false);
        }
        if (world.pendingDestructions.length > 0) {
          world.destructionTimer = COLLAPSE_INTERVAL;
        } else {
          world.destructionTimer = 0;
          sound.playVictory();
        }
      }
    } else if (world.victoryDelay > 0) {
      world.victoryDelay = Math.max(0, world.victoryDelay - clampedDt);
    }
  }

  let resolvedThisStep = false;
  const subSteps = 6;
  const subDt = clampedDt / subSteps;

  for (let pIdx = world.projectiles.length - 1; pIdx >= 0; pIdx--) {
    const proj = world.projectiles[pIdx];
    if (!proj.active) {
      world.projectiles.splice(pIdx, 1);
      continue;
    }

    for (let s = 0; s < subSteps; s++) {
      if (!proj.active) break;

      // Apply gravitational pull from nearby asteroids
      let gravAx = 0;
      let gravAy = 0;
      for (const ast of world.asteroids) {
        const dx = ast.x - proj.x;
        const dy = ast.y - proj.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.001 && dist <= ast.gravityRadius) {
          const effectiveDist = Math.max(dist, ast.radius + 6);
          const edgeFade = 1 - Math.pow(dist / ast.gravityRadius, 2);
          const accel =
            (ast.gravityStrength / (effectiveDist * effectiveDist)) * Math.max(0.15, edgeFade);
          gravAx += (dx / dist) * accel;
          gravAy += (dy / dist) * accel;
        }
      }
      if (gravAx !== 0 || gravAy !== 0) {
        const speed = Math.hypot(proj.vx, proj.vy) || PROJECTILE_SPEED;
        const nvx = proj.vx + gravAx * subDt;
        const nvy = proj.vy + gravAy * subDt;
        const nLen = Math.hypot(nvx, nvy);
        if (nLen > 0.001) {
          proj.vx = (nvx / nLen) * speed;
          proj.vy = (nvy / nLen) * speed;
        }
      }

      const prevX = proj.x;
      const prevY = proj.y;
      let stepX = proj.vx * subDt;
      let stepY = proj.vy * subDt;
      let stepDist = Math.hypot(stepX, stepY);

      const remaining = proj.maxRange - proj.distanceTraveled;
      let reachedMaxRange = false;
      if (stepDist >= remaining) {
        const ratio = remaining > 0 && stepDist > 0 ? remaining / stepDist : 0;
        stepX *= ratio;
        stepY *= ratio;
        stepDist = remaining;
        reachedMaxRange = true;
      }

      const nextX = prevX + stepX;
      const nextY = prevY + stepY;
      proj.distanceTraveled += stepDist;

      // 1. Check paper boundary walls
      let hitWall = false;
      if (nextX <= PAPER_MARGIN || nextX >= LOGICAL_WIDTH - PAPER_MARGIN) {
        if (proj.bounces < proj.maxBounces) {
          proj.vx = -proj.vx;
          proj.bounces += 1;
          sound.playBounce();
          spawnVectorBurst(world, nextX, nextY, '#E4E4E7', 6, 0.45, 0.7);
        } else {
          hitWall = true;
        }
      }
      if (!hitWall && (nextY <= PAPER_MARGIN || nextY >= LOGICAL_HEIGHT - PAPER_MARGIN)) {
        if (proj.bounces < proj.maxBounces) {
          proj.vy = -proj.vy;
          proj.bounces += 1;
          sound.playBounce();
          spawnVectorBurst(world, nextX, nextY, '#E4E4E7', 6, 0.45, 0.7);
        } else {
          hitWall = true;
        }
      }

      if (hitWall) {
        proj.active = false;
        spawnVectorBurst(world, nextX, nextY, '#71717A', 5, 0.4, 0.6);
        resolvedThisStep = true;
        if (proj.kind !== 'shrapnel') {
          world.lastEventText = `Player ${proj.owner} shot missed off paper`;
        }
        break;
      }

      proj.x = nextX;
      proj.y = nextY;

      // 1b. Trident mid-flight split (at 50% range into 3 projectiles)
      if (
        proj.tridentSplitPending &&
        !reachedMaxRange &&
        proj.distanceTraveled >= proj.maxRange * TRIDENT_SPLIT_RATIO
      ) {
        proj.tridentSplitPending = false;
        const speed = Math.hypot(proj.vx, proj.vy) || PROJECTILE_SPEED;
        const baseAngle = Math.atan2(proj.vy, proj.vx);
        const remRange = Math.max(16, proj.maxRange - proj.distanceTraveled);
        proj.distanceTraveled = 0;
        proj.maxRange = remRange;

        for (const offset of [-TRIDENT_SPREAD_RAD, TRIDENT_SPREAD_RAD]) {
          const splitAngle = baseAngle + offset;
          world.projectiles.push({
            id: `trident-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            owner: proj.owner,
            sourceShipId: proj.sourceShipId,
            hitShipIds: [...proj.hitShipIds],
            hitCellIds: [...(proj.hitCellIds ?? [])],
            x: proj.x,
            y: proj.y,
            vx: Math.cos(splitAngle) * speed,
            vy: Math.sin(splitAngle) * speed,
            power: proj.power,
            damage: proj.damage,
            distanceTraveled: 0,
            maxRange: remRange,
            bounces: proj.bounces,
            maxBounces: proj.maxBounces,
            trail: [{ x: proj.x, y: proj.y }],
            active: true,
            kind: 'trident',
            spawnsFighter: true,
            shieldPiercer: proj.shieldPiercer,
            overcharged: proj.overcharged,
          });
        }

        spawnVectorBurst(world, proj.x, proj.y, '#A78BFA', 14, 0.8, 0.8);
        world.shockwaves.push({
          x: proj.x,
          y: proj.y,
          radius: 4,
          maxRadius: 30,
          life: 0.25,
          maxLife: 0.25,
          color: '#A78BFA',
        });
        spawnFloatingText(world, 'TRIDENT ×3', proj.x, proj.y - 12, '#A78BFA');
        sound.playTridentSplit();
      }

      // 2. Check unified solid circular shield rings & enemy Fighter Shields
      if (!proj.shieldPiercer) {
        for (const ring of world.shields) {
          if (ring.hp <= 0) continue;
          if (ring.owner === proj.owner && proj.bounces === 0) continue;

          const prevDist = Math.hypot(prevX - ring.centerX, prevY - ring.centerY);
          const currDist = Math.hypot(proj.x - ring.centerX, proj.y - ring.centerY);

          const crossedShield =
            (prevDist >= ring.radius && currDist <= ring.radius) ||
            (prevDist <= ring.radius && currDist >= ring.radius) ||
            Math.abs(currDist - ring.radius) <= 3.5;

          if (crossedShield) {
            const hitAngle = Math.atan2(proj.y - ring.centerY, proj.x - ring.centerX);
            ring.hp = Math.max(0, ring.hp - proj.damage);
            ring.flashTimer = 0.25;
            proj.active = false;
            resolvedThisStep = true;

            const impactX = ring.centerX + Math.cos(hitAngle) * ring.radius;
            const impactY = ring.centerY + Math.sin(hitAngle) * ring.radius;
            const color = getPlayerColor(ring.owner);
            const shattered = ring.hp <= 0;

            spawnVectorBurst(
              world,
              impactX,
              impactY,
              color,
              shattered ? 22 : 12,
              shattered ? 0.95 : 0.65
            );
            world.shockwaves.push({
              x: impactX,
              y: impactY,
              radius: 4,
              maxRadius: shattered ? 50 : 28,
              life: 0.28,
              maxLife: 0.28,
              color,
            });
            world.screenShake = Math.max(world.screenShake, shattered ? 7 : 3.5);
            sound.playShieldHit(shattered);

            world.lastEventText = shattered
              ? `Player ${ring.owner} shield breached (${proj.damage} dmg)`
              : `Player ${ring.owner} shield damaged (${ring.hp}/${ring.maxHp} HP)`;
            break;
          }
        }
        if (!proj.active) break;

        for (const ship of world.ships) {
          if (!ship.alive || ship.kind !== 'fighter' || (ship.shieldHp ?? 0) <= 0) continue;
          if (ship.owner === proj.owner && proj.bounces === 0) continue;

          const ringR = ship.radius + FIGHTER_SHIELD_OFFSET;
          const prevDist = Math.hypot(prevX - ship.x, prevY - ship.y);
          const currDist = Math.hypot(proj.x - ship.x, proj.y - ship.y);

          if (
            currDist <= ringR + 3 ||
            (prevDist >= ringR && currDist <= ringR) ||
            (prevDist <= ringR && currDist >= ringR)
          ) {
            const hitAngle = Math.atan2(proj.y - ship.y, proj.x - ship.x);
            ship.shieldHp = Math.max(0, (ship.shieldHp ?? 0) - proj.damage);
            ship.shieldFlashTimer = 0.25;
            proj.active = false;
            resolvedThisStep = true;

            const impactX = ship.x + Math.cos(hitAngle) * ringR;
            const impactY = ship.y + Math.sin(hitAngle) * ringR;
            const color = getPlayerColor(ship.owner);
            const shattered = ship.shieldHp <= 0;

            spawnVectorBurst(
              world,
              impactX,
              impactY,
              color,
              shattered ? 18 : 10,
              shattered ? 0.85 : 0.6
            );
            world.shockwaves.push({
              x: impactX,
              y: impactY,
              radius: 4,
              maxRadius: shattered ? 38 : 22,
              life: 0.26,
              maxLife: 0.26,
              color,
            });
            world.screenShake = Math.max(world.screenShake, shattered ? 6 : 3);
            sound.playShieldHit(shattered);

            world.lastEventText = shattered
              ? `Player ${ship.owner} Fighter Shield shattered (${proj.damage} dmg)`
              : `Player ${ship.owner} Fighter Shield absorbed hit (${ship.shieldHp}/${ship.shieldMaxHp ?? FIGHTER_SHIELD_HP} HP)`;
            break;
          }
        }
        if (!proj.active) break;
      }

      // 2b. Check Asteroid collisions
      for (let aIdx = world.asteroids.length - 1; aIdx >= 0; aIdx--) {
        const ast = world.asteroids[aIdx];
        if (Math.hypot(proj.x - ast.x, proj.y - ast.y) <= ast.radius + 3) {
          proj.active = false;
          resolvedThisStep = true;
          const shattered = applyDamageToAsteroid(
            world,
            ast,
            proj.damage,
            proj.x,
            proj.y,
            proj.id
          );
          world.lastEventText = shattered
            ? `Player ${proj.owner} shattered an asteroid (${proj.damage} dmg)`
            : `Asteroid hit for ${proj.damage} dmg (${ast.hp}/${ast.maxHp} HP)`;
          break;
        }
      }
      if (!proj.active) break;

      // 2c. Check Power Cell collisions along projectile flight
      for (let cIdx = world.powerCells.length - 1; cIdx >= 0; cIdx--) {
        const cell = world.powerCells[cIdx];
        if (cell.graceTimer > 0) continue;
        if (cell.immuneProjectileId === proj.id) continue;
        if (proj.hitCellIds?.includes(cell.id)) continue;

        if (Math.hypot(proj.x - cell.x, proj.y - cell.y) <= cell.radius + 5) {
          proj.hitCellIds = proj.hitCellIds ?? [];
          proj.hitCellIds.push(cell.id);
          const res = triggerPowerCell(world, cell, proj.owner);
          world.lastEventText = res.message;
          if (res.isMine) {
            proj.active = false;
            resolvedThisStep = true;
            break;
          }
        }
      }
      if (!proj.active) break;

      // 3. Check Ship collisions (Fighters pierce & continue; Mother Ships absorb & stop)
      for (const ship of world.ships) {
        if (!ship.alive) continue;
        if (ship.id === proj.sourceShipId && proj.bounces === 0) continue;
        if (ship.kind === 'mothership' && ship.owner === proj.owner && proj.bounces === 0) continue;
        if (proj.hitShipIds.includes(ship.id)) continue;

        const dist = Math.hypot(proj.x - ship.x, proj.y - ship.y);
        if (dist <= ship.radius + 4) {
          proj.hitShipIds.push(ship.id);
          applyDamageToShip(world, ship, proj.damage, proj.x, proj.y);

          if (ship.kind === 'mothership') {
            proj.active = false;
            resolvedThisStep = true;
            if (!ship.alive) {
              world.lastEventText = `Player ${world.winner} destroyed the Mother Ship (${proj.damage} dmg)`;
            } else {
              world.lastEventText = `Player ${ship.owner} Mother Ship hit for ${proj.damage} dmg (${ship.hp}/${ship.maxHp} HP)`;
            }
            break;
          }

          if (!ship.alive) {
            world.lastEventText = `Player ${ship.owner} fighter destroyed (${proj.damage} dmg)`;
          } else {
            world.lastEventText = `Player ${ship.owner} fighter hit for ${proj.damage} dmg (${ship.hp}/${ship.maxHp} HP)`;
          }
        }
      }
      if (!proj.active) break;

      // 4. Range-end: Flak 360° burst OR Fighter Ship spawn
      if (reachedMaxRange) {
        proj.active = false;
        resolvedThisStep = true;
        if (proj.flakBurstOnEnd) {
          triggerFlakBurst(world, proj);
        } else if (proj.spawnsFighter !== false) {
          if (spawnFighterAtProjectileEnd(world, proj)) {
            world.pendingBonusTurn = true;
          }
        }
        break;
      }
    }

    proj.trail.push({ x: proj.x, y: proj.y });
    if (proj.trail.length > 18) {
      proj.trail.shift();
    }

    if (!proj.active) {
      world.projectiles.splice(pIdx, 1);
    }
  }

  if (resolvedThisStep && world.projectiles.length === 0 && world.winner === null) {
    if (world.pendingBonusTurn) {
      awardBonusTurn(world, world.lastEventText);
    } else {
      advanceTurn(world, world.lastEventText);
    }
  }
}

export function findShipAtPoint(world: GameWorld, x: number, y: number, owner: PlayerId): Ship | null {
  let closest: Ship | null = null;
  let minDist = Infinity;
  for (const ship of world.ships) {
    if (!ship.alive || ship.owner !== owner) continue;
    const hitRadius = ship.kind === 'mothership' ? ship.radius + 10 : ship.radius + 14;
    const d = Math.hypot(x - ship.x, y - ship.y);
    if (d <= hitRadius && d < minDist) {
      closest = ship;
      minDist = d;
    }
  }
  return closest;
}

export function computeLaserSightEnd(ship: Ship): {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
} {
  const noseOffset = ship.radius + 2;
  const startX = ship.x + Math.cos(ship.angle) * noseOffset;
  const startY = ship.y + Math.sin(ship.angle) * noseOffset;
  const maxRange = getShipMaxRange(ship);
  return {
    startX,
    startY,
    endX: startX + Math.cos(ship.angle) * maxRange,
    endY: startY + Math.sin(ship.angle) * maxRange,
  };
}

function rayCircleFirstHit(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  cx: number,
  cy: number,
  r: number,
  maxT: number
): number | null {
  const fx = ox - cx;
  const fy = oy - cy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * c;
  if (disc < 0) return null;
  const sqrtD = Math.sqrt(disc);
  const t1 = (-b - sqrtD) / 2;
  if (t1 >= 0 && t1 <= maxT) return t1;
  const t2 = (-b + sqrtD) / 2;
  if (t2 >= 0 && t2 <= maxT) return t2;
  return null;
}

export function computeLaserDotContact(
  world: GameWorld,
  ship: Ship
): { x: number; y: number; dist: number } | null {
  const dx = Math.cos(ship.angle);
  const dy = Math.sin(ship.angle);
  const ox = ship.x + dx * (ship.radius + 2);
  const oy = ship.y + dy * (ship.radius + 2);

  // Distance to arena border along ray
  let borderT = Infinity;
  const minX = PAPER_MARGIN;
  const maxX = LOGICAL_WIDTH - PAPER_MARGIN;
  const minY = PAPER_MARGIN;
  const maxY = LOGICAL_HEIGHT - PAPER_MARGIN;
  if (dx > 1e-6) borderT = Math.min(borderT, (maxX - ox) / dx);
  else if (dx < -1e-6) borderT = Math.min(borderT, (minX - ox) / dx);
  if (dy > 1e-6) borderT = Math.min(borderT, (maxY - oy) / dy);
  else if (dy < -1e-6) borderT = Math.min(borderT, (minY - oy) / dy);
  if (!Number.isFinite(borderT) || borderT <= 0) return null;

  let bestT: number | null = null;
  const considerHit = (t: number | null) => {
    if (t !== null && t >= 0 && t <= borderT && (bestT === null || t < bestT)) {
      bestT = t;
    }
  };

  // Enemy solid Mother Ship shield rings
  for (const ring of world.shields) {
    if (ring.hp <= 0 || ring.owner === ship.owner) continue;
    considerHit(rayCircleFirstHit(ox, oy, dx, dy, ring.centerX, ring.centerY, ring.radius, borderT));
  }

  // Asteroids
  for (const ast of world.asteroids) {
    if (ast.hp <= 0) continue;
    considerHit(rayCircleFirstHit(ox, oy, dx, dy, ast.x, ast.y, ast.radius, borderT));
  }

  // Enemy Fighter Shields and all Ships (except self)
  for (const target of world.ships) {
    if (!target.alive || target.id === ship.id) continue;
    if (target.kind === 'fighter' && (target.shieldHp ?? 0) > 0 && target.owner !== ship.owner) {
      considerHit(
        rayCircleFirstHit(
          ox,
          oy,
          dx,
          dy,
          target.x,
          target.y,
          target.radius + FIGHTER_SHIELD_OFFSET,
          borderT
        )
      );
    }
    considerHit(rayCircleFirstHit(ox, oy, dx, dy, target.x, target.y, target.radius, borderT));
  }

  if (bestT === null) return null;
  return {
    x: ox + dx * bestT,
    y: oy + dy * bestT,
    dist: bestT,
  };
}

export function chooseCpuAction(world: GameWorld): {
  shipId: string;
  angle: number;
  power: number;
  fireMods: FireModifierKind[];
  preBuffs: { shipId: string; buff: ShipBuffKind }[];
} | null {
  const cpuShips = world.ships.filter((s) => s.alive && s.owner === 2);
  if (cpuShips.length === 0) return null;

  const cpuMother = cpuShips.find((s) => s.kind === 'mothership');
  const cpuShield = world.shields.find((s) => s.owner === 2);
  const p1Shield = world.shields.find((s) => s.owner === 1);
  const p1ShieldIntact = Boolean(p1Shield && p1Shield.hp > 0);
  const p1Fighters = world.ships.filter((s) => s.alive && s.owner === 1 && s.kind === 'fighter');
  const p1Mother = world.ships.find((s) => s.alive && s.owner === 1 && s.kind === 'mothership');
  if (!p1Mother) return null;

  const shooters = cpuShips.filter((s) => s.kind === 'fighter');
  let shooter = shooters.length > 0 ? shooters[Math.floor(Math.random() * shooters.length)] : cpuShips[0];

  let targetX = p1Mother.x;
  let targetY = p1Mother.y;
  let targetingCell = false;

  // Check if a beneficial Power Cell is worth grabbing
  const helpfulCells = world.powerCells.filter((c) => {
    if (c.kind === 'mine') return false;
    if (c.kind === 'repair' && cpuMother && cpuMother.hp <= cpuMother.maxHp - 3) return true;
    if (c.kind === 'energy' && cpuShield && cpuShield.hp < 12) return true;
    return (
      c.kind === 'trident' ||
      c.kind === 'overcharge' ||
      c.kind === 'piercer' ||
      c.kind === 'flak' ||
      c.kind === 'fighter_shield' ||
      c.kind === 'laser_sight' ||
      c.kind === 'laser_dot'
    );
  });

  if (helpfulCells.length > 0 && Math.random() < 0.35) {
    let bestCell = helpfulCells[0];
    let bestDist = Infinity;
    for (const c of helpfulCells) {
      const d = Math.hypot(c.x - shooter.x, c.y - shooter.y);
      if (d < bestDist && d <= FIGHTER_MAX_RANGE * 0.92) {
        bestDist = d;
        bestCell = c;
      }
    }
    if (bestDist < Infinity) {
      targetX = bestCell.x;
      targetY = bestCell.y;
      targetingCell = true;
    }
  }

  if (!targetingCell && p1ShieldIntact && p1Fighters.length > 0 && Math.random() < 0.68) {
    let closestFighter = p1Fighters[0];
    let minD = Infinity;
    for (const f of p1Fighters) {
      const d = Math.hypot(f.x - shooter.x, f.y - shooter.y);
      if (d < minD) {
        minD = d;
        closestFighter = f;
      }
    }
    targetX = closestFighter.x;
    targetY = closestFighter.y;
  }

  const hasFriendlyInPath = (candidate: Ship): boolean => {
    const segLen = Math.hypot(targetX - candidate.x, targetY - candidate.y);
    if (segLen < 1) return false;
    const ux = (targetX - candidate.x) / segLen;
    const uy = (targetY - candidate.y) / segLen;
    return shooters.some((f) => {
      if (f.id === candidate.id || !f.alive) return false;
      const projT = (f.x - candidate.x) * ux + (f.y - candidate.y) * uy;
      if (projT <= 0 || projT >= segLen) return false;
      const perp = Math.abs((f.x - candidate.x) * uy - (f.y - candidate.y) * ux);
      return perp <= f.radius + 8;
    });
  };

  const clearShooter = shooters.find((s) => !hasFriendlyInPath(s));
  if (clearShooter && hasFriendlyInPath(shooter)) {
    shooter = clearShooter;
  }

  let chosenShooter = shooter;
  let distToTarget = Math.hypot(targetX - chosenShooter.x, targetY - chosenShooter.y);
  let neededPower = distToTarget / getShipMaxRange(chosenShooter);

  if (chosenShooter.kind === 'fighter' && neededPower > 0.78) {
    const forwardFighter = shooters.find(
      (s) => !hasFriendlyInPath(s) && Math.hypot(targetX - s.x, targetY - s.y) / getShipMaxRange(s) <= 0.78
    );
    if (forwardFighter) {
      chosenShooter = forwardFighter;
      distToTarget = Math.hypot(targetX - chosenShooter.x, targetY - chosenShooter.y);
      neededPower = distToTarget / getShipMaxRange(chosenShooter);
    } else if (cpuMother && !hasFriendlyInPath(cpuMother)) {
      chosenShooter = cpuMother;
      distToTarget = Math.hypot(targetX - chosenShooter.x, targetY - chosenShooter.y);
      neededPower = distToTarget / getShipMaxRange(chosenShooter);
    }
  }

  const cpuCharges = world.charges[2];
  const preBuffs: { shipId: string; buff: ShipBuffKind }[] = [];
  if (cpuCharges.fighter_shield > 0) {
    const unshielded = shooters.find((f) => (f.shieldHp ?? 0) === 0);
    if (unshielded) {
      preBuffs.push({ shipId: unshielded.id, buff: 'fighter_shield' });
    }
  }
  if (cpuCharges.laser_sight > 0 && !chosenShooter.hasLaserSight) {
    preBuffs.push({ shipId: chosenShooter.id, buff: 'laser_sight' });
  }
  if (cpuCharges.laser_dot > 0 && !chosenShooter.hasLaserDot) {
    preBuffs.push({ shipId: chosenShooter.id, buff: 'laser_dot' });
  }

  // Stack compatible Fire modifiers intelligently
  const fireMods: FireModifierKind[] = [];
  if (!targetingCell) {
    const aimingMother = Math.hypot(targetX - p1Mother.x, targetY - p1Mother.y) < 40;
    if (p1ShieldIntact && cpuCharges.piercer > 0 && aimingMother) {
      fireMods.push('piercer');
      if (cpuCharges.overcharge > 0) {
        fireMods.push('overcharge');
      }
    } else {
      if (cpuCharges.overcharge > 0 && (neededPower > 0.65 || aimingMother)) {
        fireMods.push('overcharge');
      }
      if (cpuCharges.flak > 0 && neededPower <= 0.9) {
        fireMods.push('flak');
      } else if (cpuCharges.trident > 0) {
        fireMods.push('trident');
      }
    }
  }

  const baseAngle = Math.atan2(targetY - chosenShooter.y, targetX - chosenShooter.x);
  const jitter = (Math.random() - 0.5) * 0.08;
  const maxSafeCap =
    chosenShooter.kind === 'mothership' || fireMods.includes('overcharge') ? 1.0 : 0.88;
  const power = Math.max(MIN_POWER, Math.min(maxSafeCap, neededPower + 0.03));

  return {
    shipId: chosenShooter.id,
    angle: baseAngle + jitter,
    power,
    fireMods,
    preBuffs,
  };
}

export function rotateShipByDelta(world: GameWorld, shipId: string, deltaRadians: number): void {
  const ship = world.ships.find((s) => s.id === shipId && s.alive && s.owner === world.currentTurn);
  if (!ship) return;
  ship.angle += deltaRadians;
}

export function computeChargePower(chargeTime: number): number {
  const cycle = Math.max(0, chargeTime) / CHARGE_FILL_DURATION;
  const triangle = 1 - Math.abs((cycle % 2) - 1);
  return MIN_POWER + triangle * (1 - MIN_POWER);
}

export function getMoveDraftPreview(
  world: GameWorld,
  ship: Ship,
  pointerX: number,
  pointerY: number,
  hyperMove = false
): MoveDraft {
  const trace = traceShipMovement(world, ship, pointerX, pointerY, hyperMove);
  const dist = Math.hypot(trace.x - ship.x, trace.y - ship.y);
  return {
    shipId: ship.id,
    targetX: trace.x,
    targetY: trace.y,
    outcome: trace.outcome,
    cancelled: dist < 12,
    hyperMove,
  };
}
