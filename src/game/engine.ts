import { sound } from './sound.ts';
import type {
  Asteroid,
  AsteroidDensity,
  FloatingText,
  GameWorld,
  MatchRules,
  MoveDraft,
  MoveOutcome,
  PlayerId,
  Projectile,
  ShieldSegment,
  Ship,
  ShipKind,
  Vec2,
  VectorParticle,
} from './types.ts';

export const LOGICAL_WIDTH = 1280;
export const LOGICAL_HEIGHT = 760;
export const PAPER_MARGIN = 26;

export const SHIELD_RADIUS = 104;
export const SHIELD_SEGMENTS = 12;
export const FIGHTER_ORBIT_RADIUS = 148;
export const MAX_MOVE_DISTANCE = 155;
export const ROTATION_SENSITIVITY = 0.006; // radians per horizontal pixel
export const KEY_ROTATION_SPEED = 2.1; // radians per second
export const CHARGE_FILL_DURATION = 1.3125 / 0.8; // 1.640625s (further 20% slower charge speed)
export const MIN_POWER = 0.1;
export const SAFE_POWER_LIMIT = 0.75;
export const MAX_OVERHEAT_CHANCE = 0.95;
export const ASYMPTOTE_K = 0.88;
export const FIGHTER_MAX_RANGE = 392; // Further 30% reduced from 560px
export const MOTHERSHIP_MAX_RANGE = FIGHTER_MAX_RANGE * 2; // 784px (Further 30% reduced from 1120px)
export const PROJECTILE_SPEED = 780; // pixels per second

export const FIGHTER_HP = 3;
export const MOTHERSHIP_HP = 20;
export const SHIELD_SEGMENT_HP = 6;
export const FIGHTER_PROJECTILE_DAMAGE = 3;
export const MOTHERSHIP_PROJECTILE_DAMAGE = 10;
export const KAMIKAZE_DAMAGE = 5;
export const SHIELD_COLLISION_DAMAGE = 5;
export const ASTEROID_COLLISION_DAMAGE = 5;

export const ASTEROID_COUNTS: Record<AsteroidDensity, number> = {
  off: 0,
  low: 3,
  medium: 5,
  high: 8,
};
export const ASTEROID_MIN_RADIUS = 20;
export const ASTEROID_MAX_RADIUS = 46;
export const ASTEROID_GRAVITY_RADIUS_MULT = 3.4;
export const ASTEROID_GRAVITY_CONSTANT = 4500;
export const COLLAPSE_INTERVAL = 0.16;
export const VICTORY_SETTLE_DELAY = 0.35;

export const P1_COLOR = '#38BDF8'; // Crisp vector cyan
export const P2_COLOR = '#FB923C'; // Crisp vector amber-orange

export const P1_BASE = { x: 146, y: 614 };
export const P2_BASE = { x: 1134, y: 146 };

export function getPlayerColor(player: PlayerId): string {
  return player === 1 ? P1_COLOR : P2_COLOR;
}

export function normalizeAngle(a: number): number {
  let angle = a % (Math.PI * 2);
  if (angle < 0) angle += Math.PI * 2;
  return angle;
}

function isAngleInSegment(angle: number, start: number, end: number): boolean {
  const a = normalizeAngle(angle);
  const s = normalizeAngle(start);
  const e = normalizeAngle(end);
  if (s <= e) {
    return a >= s && a <= e;
  }
  return a >= s || a <= e;
}

function generateAsteroids(density: AsteroidDensity): Asteroid[] {
  const count = ASTEROID_COUNTS[density] ?? 0;
  if (count <= 0) return [];

  const asteroids: Asteroid[] = [];
  for (let i = 0; i < count; i++) {
    let placed = false;
    for (let attempt = 0; attempt < 90; attempt++) {
      const radius = Math.round(
        ASTEROID_MIN_RADIUS + Math.random() * (ASTEROID_MAX_RADIUS - ASTEROID_MIN_RADIUS)
      );
      const margin = PAPER_MARGIN + radius + 34;
      const x = margin + Math.random() * (LOGICAL_WIDTH - margin * 2);
      const y = margin + Math.random() * (LOGICAL_HEIGHT - margin * 2);

      const distP1 = Math.hypot(x - P1_BASE.x, y - P1_BASE.y);
      const distP2 = Math.hypot(x - P2_BASE.x, y - P2_BASE.y);
      if (
        distP1 < FIGHTER_ORBIT_RADIUS + radius + 72 ||
        distP2 < FIGHTER_ORBIT_RADIUS + radius + 72
      ) {
        continue;
      }

      const overlaps = asteroids.some(
        (other) => Math.hypot(x - other.x, y - other.y) < radius + other.radius + 54
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
      });
      placed = true;
      break;
    }
    if (!placed) break;
  }

  return asteroids;
}

export function createWorld(rules: MatchRules): GameWorld {
  const ships: Ship[] = [];
  const shields: ShieldSegment[] = [];

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

  const segStep = (Math.PI * 2) / SHIELD_SEGMENTS;
  for (const owner of [1, 2] as PlayerId[]) {
    const base = owner === 1 ? P1_BASE : P2_BASE;
    for (let i = 0; i < SHIELD_SEGMENTS; i++) {
      shields.push({
        id: `p${owner}-shield-${i}`,
        owner,
        index: i,
        centerX: base.x,
        centerY: base.y,
        radius: SHIELD_RADIUS,
        startAngle: i * segStep,
        endAngle: (i + 1) * segStep,
        hp: SHIELD_SEGMENT_HP,
        maxHp: SHIELD_SEGMENT_HP,
        flashTimer: 0,
      });
    }
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

  return {
    ships,
    shields,
    asteroids,
    projectiles: [],
    particles: [],
    shockwaves: [],
    floatingTexts: [],
    pendingDestructions: [],
    destructionTimer: 0,
    victoryDelay: 0,
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
): ShieldSegment | null {
  for (const seg of world.shields) {
    if (seg.hp <= 0) continue;
    const dist = Math.hypot(x - seg.centerX, y - seg.centerY);
    if (Math.abs(dist - seg.radius) <= radius) {
      const angle = Math.atan2(y - seg.centerY, x - seg.centerX);
      if (isAngleInSegment(angle, seg.startAngle, seg.endAngle)) {
        return seg;
      }
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

function applyDamageToAsteroid(
  world: GameWorld,
  asteroid: Asteroid,
  damage: number,
  impactX: number,
  impactY: number
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

interface MoveTraceResult {
  outcome: MoveOutcome;
  x: number;
  y: number;
  shield?: ShieldSegment;
  asteroid?: Asteroid;
  ships: Ship[];
}

function traceShipMovement(
  world: GameWorld,
  movingShip: Ship,
  rawTargetX: number,
  rawTargetY: number
): MoveTraceResult {
  const clamped = clampMoveRange(movingShip, rawTargetX, rawTargetY);
  const dx = clamped.x - movingShip.x;
  const dy = clamped.y - movingShip.y;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 3));

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const sx = movingShip.x + dx * t;
    const sy = movingShip.y + dy * t;

    if (isTouchingBorder(sx, sy, movingShip.radius)) {
      return { outcome: 'border', x: sx, y: sy, ships: [] };
    }

    const shield = findShieldAtPoint(world, sx, sy, movingShip.radius);
    if (shield) {
      return { outcome: 'shield', x: sx, y: sy, shield, ships: [] };
    }

    const asteroid = findAsteroidAtPoint(world, sx, sy, movingShip.radius);
    if (asteroid) {
      return { outcome: 'asteroid', x: sx, y: sy, asteroid, ships: [] };
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
        ships: hitShips,
      };
    }
  }

  return { outcome: 'move', x: clamped.x, y: clamped.y, ships: [] };
}

export function clampMoveRange(movingShip: Ship, rawX: number, rawY: number): { x: number; y: number } {
  const dx = rawX - movingShip.x;
  const dy = rawY - movingShip.y;
  const dist = Math.hypot(dx, dy);
  if (dist > MAX_MOVE_DISTANCE && dist > 0) {
    return {
      x: movingShip.x + (dx / dist) * MAX_MOVE_DISTANCE,
      y: movingShip.y + (dy / dist) * MAX_MOVE_DISTANCE,
    };
  }
  return { x: rawX, y: rawY };
}

export function executeMoveShip(world: GameWorld, shipId: string, targetX: number, targetY: number): boolean {
  if (world.actionLocked || world.winner !== null) return false;
  const ship = world.ships.find((s) => s.id === shipId && s.alive && s.owner === world.currentTurn);
  if (!ship || ship.kind !== 'fighter') return false;

  const trace = traceShipMovement(world, ship, targetX, targetY);
  if (Math.hypot(trace.x - ship.x, trace.y - ship.y) < 12) return false;

  const oldX = ship.x;
  const oldY = ship.y;
  const color = getPlayerColor(ship.owner);

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

  if (trace.outcome === 'shield' && trace.shield) {
    ship.hp = 0;
    ship.alive = false;
    trace.shield.hp = Math.max(0, trace.shield.hp - SHIELD_COLLISION_DAMAGE);
    trace.shield.flashTimer = 0.25;
    const shattered = trace.shield.hp <= 0;

    spawnVectorBurst(world, oldX, oldY, color, 6, 0.4, 0.7);
    spawnVectorBurst(world, trace.x, trace.y, getPlayerColor(trace.shield.owner), 20, 0.95, 1.0);
    world.shockwaves.push({
      x: trace.x,
      y: trace.y,
      radius: 5,
      maxRadius: shattered ? 50 : 34,
      life: 0.32,
      maxLife: 0.32,
      color: getPlayerColor(trace.shield.owner),
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

  // Clean reposition
  const enemyBase = ship.owner === 1 ? P2_BASE : P1_BASE;
  ship.x = trace.x;
  ship.y = trace.y;
  ship.angle = Math.atan2(enemyBase.y - trace.y, enemyBase.x - trace.x);

  spawnVectorBurst(world, oldX, oldY, color, 8, 0.5, 0.8);
  sound.playMove();
  advanceTurn(world, `Player ${ship.owner} repositioned a fighter`);
  return true;
}

export function getShipMaxRange(ship: Ship): number {
  return ship.kind === 'mothership' ? MOTHERSHIP_MAX_RANGE : FIGHTER_MAX_RANGE;
}

export function getOverheatChance(power: number, shipKind: ShipKind = 'fighter'): number {
  if (shipKind === 'mothership') return 0;
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

function applyDamageToShip(world: GameWorld, ship: Ship, damage: number, impactX: number, impactY: number): void {
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

export function fireFromShip(world: GameWorld, shipId: string, angle: number, power: number): boolean {
  if (world.actionLocked || world.winner !== null) return false;
  const ship = world.ships.find((s) => s.id === shipId && s.alive && s.owner === world.currentTurn);
  if (!ship) return false;

  ship.angle = angle;
  const chargedPower = Math.max(MIN_POWER, Math.min(1, power));
  const chargedPct = Math.round(chargedPower * 100);
  const overheatChance = getOverheatChance(chargedPower, ship.kind);

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

  // Deterministic range: exact charged power without +/-10% random variance
  const maxRange = getProjectileRange(ship, chargedPower);
  const damage = ship.kind === 'mothership' ? MOTHERSHIP_PROJECTILE_DAMAGE : FIGHTER_PROJECTILE_DAMAGE;

  const spawnOffset = ship.radius + 8;
  const startX = ship.x + Math.cos(angle) * spawnOffset;
  const startY = ship.y + Math.sin(angle) * spawnOffset;

  world.projectiles.push({
    id: `proj-${Date.now()}-${Math.random()}`,
    owner: ship.owner,
    sourceShipId: ship.id,
    hitShipIds: [],
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
  });

  world.actionLocked = true;
  world.lastEventText = `Player ${ship.owner} fired (${chargedPct}% · ${Math.round(maxRange)}px)`;
  sound.playFire(ship.kind === 'mothership');
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

  // 2. Active shield collision check (destroys spawned ship & deals 5 dmg to shield segment)
  const hitShield = findShieldAtPoint(world, spawnX, spawnY, spawnRadius);
  if (hitShield) {
    hitShield.hp = Math.max(0, hitShield.hp - SHIELD_COLLISION_DAMAGE);
    hitShield.flashTimer = 0.25;
    const shattered = hitShield.hp <= 0;
    const shieldColor = getPlayerColor(hitShield.owner);

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

  // 3. Asteroid collision check (destroys spawned ship & deals 5 dmg to asteroid)
  const hitAsteroid = findAsteroidAtPoint(world, spawnX, spawnY, spawnRadius);
  if (hitAsteroid) {
    spawnVectorBurst(world, spawnX, spawnY, color, 16, 0.85, 0.95);
    const shattered = applyDamageToAsteroid(
      world,
      hitAsteroid,
      ASTEROID_COLLISION_DAMAGE,
      spawnX,
      spawnY
    );
    sound.playShipExplosion(false);
    world.lastEventText = shattered
      ? `Spawned fighter crashed into & shattered an asteroid`
      : `Spawned fighter destroyed on asteroid (${hitAsteroid.hp}/${hitAsteroid.maxHp} HP)`;
    return false;
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

  // 4. Ship overlap check (Kamikaze Hit if overlapping enemy ship -> 5 HP mutual + bonus turn)
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

  // 4. Clean deployment
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
  world.lastEventText = `Player ${proj.owner} deployed a fighter at ${Math.round(proj.maxRange)}px`;
  return false;
}

function advanceTurn(world: GameWorld, eventText: string) {
  if (world.winner !== null) return;
  world.actionLocked = false;
  world.currentTurn = world.currentTurn === 1 ? 2 : 1;
  world.turnCount += 1;
  world.lastEventText = eventText;
}

function awardBonusTurn(world: GameWorld, eventText: string) {
  if (world.winner !== null) return;
  world.actionLocked = false;
  world.turnCount += 1;
  world.lastEventText = eventText;
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
  }

  for (const seg of world.shields) {
    if (seg.flashTimer > 0) {
      seg.flashTimer = Math.max(0, seg.flashTimer - clampedDt);
    }
  }

  for (const ast of world.asteroids) {
    if (ast.flashTimer > 0) {
      ast.flashTimer = Math.max(0, ast.flashTimer - clampedDt);
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
  let bonusTurnGranted = false;
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

      // Apply gravitational pull from nearby asteroids (larger radius = stronger gravity)
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
        world.lastEventText = `Player ${proj.owner} shot missed off paper`;
        break;
      }

      proj.x = nextX;
      proj.y = nextY;

      // 2. Check circular shield segments
      for (const seg of world.shields) {
        if (seg.hp <= 0) continue;
        if (seg.owner === proj.owner && proj.bounces === 0) continue;

        const prevDist = Math.hypot(prevX - seg.centerX, prevY - seg.centerY);
        const currDist = Math.hypot(proj.x - seg.centerX, proj.y - seg.centerY);

        const crossedShield =
          (prevDist >= seg.radius && currDist <= seg.radius) ||
          (prevDist <= seg.radius && currDist >= seg.radius) ||
          Math.abs(currDist - seg.radius) <= 3.5;

        if (crossedShield) {
          const hitAngle = Math.atan2(proj.y - seg.centerY, proj.x - seg.centerX);
          if (isAngleInSegment(hitAngle, seg.startAngle, seg.endAngle)) {
            seg.hp = Math.max(0, seg.hp - proj.damage);
            seg.flashTimer = 0.25;
            proj.active = false;
            resolvedThisStep = true;

            const impactX = seg.centerX + Math.cos(hitAngle) * seg.radius;
            const impactY = seg.centerY + Math.sin(hitAngle) * seg.radius;
            const color = getPlayerColor(seg.owner);
            const shattered = seg.hp <= 0;

            spawnVectorBurst(world, impactX, impactY, color, shattered ? 18 : 10, shattered ? 0.95 : 0.65);
            world.shockwaves.push({
              x: impactX,
              y: impactY,
              radius: 4,
              maxRadius: shattered ? 46 : 26,
              life: 0.28,
              maxLife: 0.28,
              color,
            });
            world.screenShake = Math.max(world.screenShake, shattered ? 6 : 3);
            sound.playShieldHit(shattered);

            world.lastEventText = shattered
              ? `Player ${seg.owner} shield breached (${proj.damage} dmg)`
              : `Player ${seg.owner} shield damaged (${seg.hp}/${seg.maxHp} HP)`;
            break;
          }
        }
      }
      if (!proj.active) break;

      // 2b. Check Asteroid collisions (projectile deals damage and is destroyed)
      for (let aIdx = world.asteroids.length - 1; aIdx >= 0; aIdx--) {
        const ast = world.asteroids[aIdx];
        if (Math.hypot(proj.x - ast.x, proj.y - ast.y) <= ast.radius + 3) {
          proj.active = false;
          resolvedThisStep = true;
          const shattered = applyDamageToAsteroid(world, ast, proj.damage, proj.x, proj.y);
          world.lastEventText = shattered
            ? `Player ${proj.owner} shattered an asteroid (${proj.damage} dmg)`
            : `Asteroid hit for ${proj.damage} dmg (${ast.hp}/${ast.maxHp} HP)`;
          break;
        }
      }
      if (!proj.active) break;

      // 3. Check Ship collisions (Fighter Ships pierce & continue; Mother Ships absorb & stop)
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

      // 4. Range-end: spawn a friendly Fighter Ship on the projectile's final position
      if (reachedMaxRange) {
        proj.active = false;
        resolvedThisStep = true;
        if (spawnFighterAtProjectileEnd(world, proj)) {
          bonusTurnGranted = true;
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
    if (bonusTurnGranted) {
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

export function chooseCpuAction(world: GameWorld): { shipId: string; angle: number; power: number } | null {
  const cpuShips = world.ships.filter((s) => s.alive && s.owner === 2);
  if (cpuShips.length === 0) return null;

  const p1Fighters = world.ships.filter((s) => s.alive && s.owner === 1 && s.kind === 'fighter');
  const p1Mother = world.ships.find((s) => s.alive && s.owner === 1 && s.kind === 'mothership');
  if (!p1Mother) return null;

  const shooters = cpuShips.filter((s) => s.kind === 'fighter');
  let shooter = shooters.length > 0 ? shooters[Math.floor(Math.random() * shooters.length)] : cpuShips[0];

  const p1ShieldBreached = world.shields.some(
    (seg) =>
      seg.owner === 1 &&
      seg.hp <= 0 &&
      isAngleInSegment(
        Math.atan2(shooter.y - seg.centerY, shooter.x - seg.centerX),
        seg.startAngle,
        seg.endAngle
      )
  );

  let targetX = p1Mother.x;
  let targetY = p1Mother.y;

  if (!p1ShieldBreached && p1Fighters.length > 0 && Math.random() < 0.7) {
    // Pick closest enemy fighter so reduced 392px fighter range can reach effectively
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
    // Prefer a forward-deployed clear fighter within safe range before falling back to Mother Ship
    const forwardFighter = shooters.find(
      (s) => !hasFriendlyInPath(s) && Math.hypot(targetX - s.x, targetY - s.y) / getShipMaxRange(s) <= 0.78
    );
    if (forwardFighter) {
      chosenShooter = forwardFighter;
      distToTarget = Math.hypot(targetX - chosenShooter.x, targetY - chosenShooter.y);
      neededPower = distToTarget / getShipMaxRange(chosenShooter);
    } else {
      const cpuMother = cpuShips.find((s) => s.kind === 'mothership');
      if (cpuMother && !hasFriendlyInPath(cpuMother)) {
        chosenShooter = cpuMother;
        distToTarget = Math.hypot(targetX - chosenShooter.x, targetY - chosenShooter.y);
        neededPower = distToTarget / getShipMaxRange(chosenShooter);
      }
    }
  }

  const baseAngle = Math.atan2(targetY - chosenShooter.y, targetX - chosenShooter.x);
  const jitter = (Math.random() - 0.5) * 0.08;
  const maxSafeCap = chosenShooter.kind === 'mothership' ? 1.0 : 0.88;
  const power = Math.max(MIN_POWER, Math.min(maxSafeCap, neededPower + 0.03));

  return {
    shipId: chosenShooter.id,
    angle: baseAngle + jitter,
    power,
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
  pointerY: number
): MoveDraft {
  const trace = traceShipMovement(world, ship, pointerX, pointerY);
  const dist = Math.hypot(trace.x - ship.x, trace.y - ship.y);
  return {
    shipId: ship.id,
    targetX: trace.x,
    targetY: trace.y,
    outcome: trace.outcome,
    cancelled: dist < 12,
  };
}
