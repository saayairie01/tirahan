import {
  FIGHTER_SHIELD_HP,
  FIGHTER_SHIELD_OFFSET,
  FLAK_SHRAPNEL_RANGE,
  HYPER_MOVE_MULT,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  MAX_MOVE_DISTANCE,
  P1_BASE,
  P2_BASE,
  PAPER_MARGIN,
  POWER_CELL_META,
  SAFE_POWER_LIMIT,
  SHIELD_RADIUS,
  TRIDENT_SPREAD_RAD,
  computeLaserDotContact,
  computeLaserSightEnd,
  getOverheatChance,
  getPlayerColor,
  getProjectileRange,
} from './engine';
import { OpponentAimState } from './onlineTypes';
import {
  ActionMode,
  ActiveFireState,
  FireModifierKind,
  GameWorld,
  MoveDraft,
  PowerCell,
  ShieldRing,
  Ship,
} from './types';

function drawPaperFrame(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 1;
  ctx.strokeRect(
    PAPER_MARGIN,
    PAPER_MARGIN,
    LOGICAL_WIDTH - PAPER_MARGIN * 2,
    LOGICAL_HEIGHT - PAPER_MARGIN * 2
  );

  const tick = 10;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  const corners = [
    [PAPER_MARGIN, PAPER_MARGIN, 1, 1],
    [LOGICAL_WIDTH - PAPER_MARGIN, PAPER_MARGIN, -1, 1],
    [PAPER_MARGIN, LOGICAL_HEIGHT - PAPER_MARGIN, 1, -1],
    [LOGICAL_WIDTH - PAPER_MARGIN, LOGICAL_HEIGHT - PAPER_MARGIN, -1, -1],
  ];
  for (const [cx, cy, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + sy * tick);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + sx * tick, cy);
    ctx.stroke();
  }

  const midX = LOGICAL_WIDTH / 2;
  const midY = LOGICAL_HEIGHT / 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.beginPath();
  ctx.moveTo(midX - 8, midY);
  ctx.lineTo(midX + 8, midY);
  ctx.moveTo(midX, midY - 8);
  ctx.lineTo(midX, midY + 8);
  ctx.stroke();
  ctx.restore();
}

function drawMotherShipVector(ctx: CanvasRenderingContext2D, ship: Ship) {
  const color = ship.flashTimer > 0 ? '#FFFFFF' : getPlayerColor(ship.owner);
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);

  ctx.strokeStyle = color;
  ctx.fillStyle = ship.owner === 1 ? 'rgba(56, 189, 248, 0.07)' : 'rgba(251, 146, 60, 0.07)';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = ship.flashTimer > 0 ? 14 : 6;

  if (ship.owner === 1) {
    ctx.beginPath();
    ctx.moveTo(34, 0);
    ctx.lineTo(6, -15);
    ctx.lineTo(-10, -28);
    ctx.lineTo(-28, -22);
    ctx.lineTo(-20, -9);
    ctx.lineTo(-30, 0);
    ctx.lineTo(-20, 9);
    ctx.lineTo(-28, 22);
    ctx.lineTo(-10, 28);
    ctx.lineTo(6, 15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(22, 0);
    ctx.lineTo(-18, 0);
    ctx.moveTo(10, 0);
    ctx.lineTo(-6, -12);
    ctx.lineTo(-18, -12);
    ctx.moveTo(10, 0);
    ctx.lineTo(-6, 12);
    ctx.lineTo(-18, 12);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-2, -6);
    ctx.lineTo(-10, 0);
    ctx.lineTo(-2, 6);
    ctx.closePath();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(34, -8);
    ctx.lineTo(10, -14);
    ctx.lineTo(-4, -29);
    ctx.lineTo(-26, -24);
    ctx.lineTo(-18, -10);
    ctx.lineTo(-28, 0);
    ctx.lineTo(-18, 10);
    ctx.lineTo(-26, 24);
    ctx.lineTo(-4, 29);
    ctx.lineTo(10, 14);
    ctx.lineTo(34, 8);
    ctx.lineTo(14, 4);
    ctx.lineTo(14, -4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(2, -7);
    ctx.lineTo(-8, -7);
    ctx.lineTo(-14, 0);
    ctx.lineTo(-8, 7);
    ctx.lineTo(2, 7);
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-4, -14);
    ctx.lineTo(-18, -18);
    ctx.moveTo(-4, 14);
    ctx.lineTo(-18, 18);
    ctx.stroke();
  }

  const lostRatio = (ship.maxHp - ship.hp) / Math.max(1, ship.maxHp);
  const fractureCount = Math.min(5, Math.ceil(lostRatio * 5));
  if (fractureCount > 0) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1;
    for (let i = 0; i < fractureCount; i++) {
      const yOff = (i - 2) * 5.5;
      ctx.beginPath();
      ctx.moveTo(10 - i * 4, yOff - 4);
      ctx.lineTo(3 - i * 3.5, yOff + 1);
      ctx.lineTo(-5 - i * 3, yOff - 2);
      ctx.stroke();
    }
  }

  // Subtle nose hardware dots when Laser Sight / Laser Dot attached
  if (ship.hasLaserSight) {
    ctx.fillStyle = '#10B981';
    ctx.beginPath();
    ctx.arc(24, -4, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  if (ship.hasLaserDot) {
    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.arc(34, 0, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawFighterShipVector(ctx: CanvasRenderingContext2D, ship: Ship) {
  const color = ship.flashTimer > 0 ? '#FFFFFF' : getPlayerColor(ship.owner);
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);

  ctx.strokeStyle = color;
  ctx.fillStyle = ship.owner === 1 ? 'rgba(56, 189, 248, 0.1)' : 'rgba(251, 146, 60, 0.1)';
  ctx.lineWidth = 1.75;
  ctx.lineJoin = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = 5;

  if (ship.owner === 1) {
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(-9, -11);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-9, 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-4, 0);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(14, -4);
    ctx.lineTo(4, -5);
    ctx.lineTo(-6, -12);
    ctx.lineTo(-10, -4);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-10, 4);
    ctx.lineTo(-6, 12);
    ctx.lineTo(4, 5);
    ctx.lineTo(14, 4);
    ctx.lineTo(7, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  if (ship.hasLaserSight) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#10B981';
    ctx.beginPath();
    ctx.arc(8, -3, 1.7, 0, Math.PI * 2);
    ctx.fill();
  }
  if (ship.hasLaserDot) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.arc(15, 0, 1.9, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  // 5 HP Fighter Shield ring & crisp HP pips above Fighter
  if ((ship.shieldHp ?? 0) > 0) {
    const shHp = ship.shieldHp ?? 0;
    const shMax = ship.shieldMaxHp ?? FIGHTER_SHIELD_HP;
    const ringR = ship.radius + FIGHTER_SHIELD_OFFSET;
    const shColor = (ship.shieldFlashTimer ?? 0) > 0 ? '#FFFFFF' : '#818CF8';
    const critical = shHp <= 2;

    ctx.save();
    ctx.strokeStyle = shColor;
    ctx.shadowColor = shColor;
    ctx.shadowBlur = 7;
    ctx.lineWidth = critical ? 1.5 : 2.1;
    ctx.globalAlpha = critical ? 0.65 : 0.9;
    if (critical) {
      ctx.setLineDash([5, 3]);
    }
    ctx.beginPath();
    ctx.arc(ship.x, ship.y, ringR, 0, Math.PI * 2);
    ctx.stroke();

    // Small shield HP pip strip above ring
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);
    const pipW = 3;
    const gap = 1.5;
    const totalW = shMax * pipW + (shMax - 1) * gap;
    const sx = ship.x - totalW / 2;
    const sy = ship.y - ringR - 6;
    for (let i = 0; i < shMax; i++) {
      ctx.fillStyle = i < shHp ? '#818CF8' : 'rgba(255, 255, 255, 0.16)';
      ctx.fillRect(sx + i * (pipW + gap), sy, pipW, 2);
    }
    ctx.restore();
  }

  if (ship.hp < ship.maxHp) {
    ctx.save();
    const pipW = 4;
    const gap = 2;
    const totalW = ship.maxHp * pipW + (ship.maxHp - 1) * gap;
    const startX = ship.x - totalW / 2;
    const y = ship.y + ship.radius + 7;
    for (let i = 0; i < ship.maxHp; i++) {
      ctx.fillStyle = i < ship.hp ? color : 'rgba(255, 255, 255, 0.16)';
      ctx.fillRect(startX + i * (pipW + gap), y, pipW, 2);
    }
    ctx.restore();
  }
}

function drawSolidShieldRing(ctx: CanvasRenderingContext2D, ring: ShieldRing, timeSec: number) {
  if (ring.hp <= 0) return;

  const baseColor = ring.flashTimer > 0 ? '#FFFFFF' : getPlayerColor(ring.owner);
  const ratio = ring.hp / Math.max(1, ring.maxHp);
  const overShielded = ring.hp > ring.maxHp;
  const critical = ring.hp <= 3;

  ctx.save();
  ctx.strokeStyle = baseColor;
  ctx.shadowColor = baseColor;
  ctx.shadowBlur = overShielded ? 12 : critical ? 3 : 8;
  ctx.lineWidth = overShielded ? 3 : critical ? 1.8 : 2.6;
  ctx.globalAlpha = critical ? 0.58 : Math.min(0.95, 0.45 + ratio * 0.5);
  if (critical) {
    ctx.setLineDash([8, 4]);
  }

  ctx.beginPath();
  ctx.arc(ring.centerX, ring.centerY, ring.radius, 0, Math.PI * 2);
  ctx.stroke();

  // Subtle cardinal node ticks on primary solid ring
  ctx.setLineDash([]);
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = critical ? 0.35 : 0.6;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    ctx.beginPath();
    ctx.moveTo(ring.centerX + Math.cos(a) * (ring.radius - 3.5), ring.centerY + Math.sin(a) * (ring.radius - 3.5));
    ctx.lineTo(ring.centerX + Math.cos(a) * (ring.radius + 3.5), ring.centerY + Math.sin(a) * (ring.radius + 3.5));
    ctx.stroke();
  }

  // Over-shield concentric outer halo when Energy boosts Shield > 10 HP
  if (overShielded) {
    const pulse = 0.45 + 0.3 * Math.sin(timeSec * 4.5);
    ctx.strokeStyle = '#FFFFFF';
    ctx.shadowColor = baseColor;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 1.4;
    ctx.globalAlpha = pulse;
    ctx.setLineDash([5, 6]);
    ctx.beginPath();
    ctx.arc(ring.centerX, ring.centerY, ring.radius + 6.5, timeSec * 0.4, timeSec * 0.4 + Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawPowerCell(ctx: CanvasRenderingContext2D, cell: PowerCell, timeSec: number) {
  const meta = POWER_CELL_META[cell.kind];
  const color = meta.color;
  const pulse = 1 + 0.08 * Math.sin(timeSec * 3.5 + cell.pulsePhase);
  const r = cell.radius * pulse;

  ctx.save();
  ctx.translate(cell.x, cell.y);

  // Subtle background aura
  ctx.fillStyle = `${color}14`;
  ctx.beginPath();
  ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.lineWidth = 1.7;
  ctx.lineJoin = 'round';

  // Outer shape depends on cell class (non-hue-only affordance)
  if (cell.kind === 'mine') {
    // 8-point spiked hazard ring
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8 + timeSec * 0.5;
      const rad = i % 2 === 0 ? r + 3 : r * 0.68;
      const px = Math.cos(a) * rad;
      const py = Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  } else if (cell.kind === 'energy' || cell.kind === 'piercer') {
    // Diamond frame
    ctx.beginPath();
    ctx.moveTo(0, -r - 1);
    ctx.lineTo(r + 1, 0);
    ctx.lineTo(0, r + 1);
    ctx.lineTo(-r - 1, 0);
    ctx.closePath();
    ctx.stroke();
  } else if (cell.kind === 'repair' || cell.kind === 'fighter_shield') {
    // Octagon frame
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + Math.PI / 8;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  } else {
    // Hexagon frame for weapon/mobility/laser charges
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 - Math.PI / 2;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  }

  // Distinct interior glyph
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  if (cell.kind === 'repair') {
    ctx.moveTo(-5, 0);
    ctx.lineTo(5, 0);
    ctx.moveTo(0, -5);
    ctx.lineTo(0, 5);
  } else if (cell.kind === 'energy') {
    ctx.moveTo(2, -6);
    ctx.lineTo(-3, 0);
    ctx.lineTo(1, 0);
    ctx.lineTo(-2, 6);
  } else if (cell.kind === 'mine') {
    ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
  } else if (cell.kind === 'trident') {
    ctx.moveTo(0, 6);
    ctx.lineTo(0, -6);
    ctx.moveTo(-5, -2);
    ctx.lineTo(-5, -5);
    ctx.lineTo(5, -5);
    ctx.lineTo(5, -2);
  } else if (cell.kind === 'flak') {
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 4;
      ctx.moveTo(Math.cos(a) * -5.5, Math.sin(a) * -5.5);
      ctx.lineTo(Math.cos(a) * 5.5, Math.sin(a) * 5.5);
    }
  } else if (cell.kind === 'overcharge') {
    ctx.moveTo(-4, 2);
    ctx.lineTo(0, -3);
    ctx.lineTo(4, 2);
    ctx.moveTo(-4, 6);
    ctx.lineTo(0, 1);
    ctx.lineTo(4, 6);
  } else if (cell.kind === 'piercer') {
    ctx.moveTo(-6, 0);
    ctx.lineTo(6, 0);
    ctx.moveTo(2, -3.5);
    ctx.lineTo(6, 0);
    ctx.lineTo(2, 3.5);
  } else if (cell.kind === 'hyper_move') {
    ctx.moveTo(-5, -4);
    ctx.lineTo(-1, 0);
    ctx.lineTo(-5, 4);
    ctx.moveTo(1, -4);
    ctx.lineTo(5, 0);
    ctx.lineTo(1, 4);
  } else if (cell.kind === 'laser_sight') {
    ctx.moveTo(-6, 3);
    ctx.lineTo(5, -4);
    ctx.moveTo(3, -6);
    ctx.lineTo(6, -2);
  } else if (cell.kind === 'laser_dot') {
    ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
    ctx.moveTo(-6, -3);
    ctx.lineTo(-6, -6);
    ctx.lineTo(-3, -6);
    ctx.moveTo(3, 6);
    ctx.lineTo(6, 6);
    ctx.lineTo(6, 3);
  } else if (cell.kind === 'fighter_shield') {
    ctx.arc(0, 1, 5.5, Math.PI, 0);
    ctx.moveTo(0, -1);
    ctx.lineTo(-3, 4);
    ctx.lineTo(3, 4);
    ctx.closePath();
  }
  ctx.stroke();

  // Crisp mono text tag beneath every cell
  ctx.font = '500 9px "IBM Plex Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.fillText(meta.short, 0, r + 5);

  ctx.restore();
}

function drawAsteroids(ctx: CanvasRenderingContext2D, world: GameWorld, timeSec: number) {
  for (const ast of world.asteroids) {
    const sizeRatio = Math.max(0, Math.min(1, (ast.radius - 20) / 24));

    ctx.save();
    ctx.strokeStyle = `rgba(228, 228, 231, ${(0.09 + sizeRatio * 0.1).toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 7]);
    ctx.beginPath();
    ctx.arc(ast.x, ast.y, ast.gravityRadius, 0, Math.PI * 2);
    ctx.stroke();

    if (ast.radius >= 34) {
      ctx.strokeStyle = `rgba(228, 228, 231, ${(0.07 + sizeRatio * 0.08).toFixed(2)})`;
      ctx.setLineDash([2, 8]);
      ctx.beginPath();
      ctx.arc(ast.x, ast.y, ast.radius * 2.1, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.translate(ast.x, ast.y);
    ctx.rotate(ast.rotation);

    const strokeCol = ast.flashTimer > 0 ? '#FFFFFF' : '#E4E4E7';
    ctx.strokeStyle = strokeCol;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1.75;
    ctx.lineJoin = 'miter';
    ctx.shadowColor = strokeCol;
    ctx.shadowBlur = ast.flashTimer > 0 ? 12 : 4;

    if (ast.vertices.length > 0) {
      ctx.beginPath();
      ctx.moveTo(ast.vertices[0].x, ast.vertices[0].y);
      for (let i = 1; i < ast.vertices.length; i++) {
        ctx.lineTo(ast.vertices[i].x, ast.vertices[i].y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    const dmgRatio = (ast.maxHp - ast.hp) / Math.max(1, ast.maxHp);
    const crackCount = Math.min(4, Math.ceil(dmgRatio * 4));
    if (crackCount > 0 && ast.vertices.length >= 4) {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(228, 228, 231, 0.55)';
      ctx.lineWidth = 1;
      for (let c = 0; c < crackCount; c++) {
        const v = ast.vertices[(c * 3) % ast.vertices.length];
        ctx.beginPath();
        ctx.moveTo(v.x * 0.85, v.y * 0.85);
        ctx.lineTo(v.x * 0.45 + 3, v.y * 0.45 - 2);
        ctx.lineTo(v.x * 0.25, v.y * 0.25);
        ctx.stroke();
      }
    }

    // Subtle crystalline core glint when asteroid hides a Power Cell and has taken a crack
    if (ast.hiddenCellKind && ast.hp < ast.maxHp) {
      const glintAlpha = 0.4 + 0.35 * Math.sin(timeSec * 5);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = POWER_CELL_META[ast.hiddenCellKind].color;
      ctx.globalAlpha = glintAlpha;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(0, -4.5);
      ctx.lineTo(4.5, 0);
      ctx.lineTo(0, 4.5);
      ctx.lineTo(-4.5, 0);
      ctx.closePath();
      ctx.stroke();
    }

    ctx.restore();
  }
}

function drawTurnReticles(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
  hoveredShipId: string | null,
  activeShipId: string | null,
  actionMode: ActionMode,
  timeSec: number,
  isHumanTurn: boolean
) {
  if (world.actionLocked || world.winner !== null) return;

  for (const ship of world.ships) {
    if (!ship.alive || ship.owner !== world.currentTurn) continue;
    if (isHumanTurn && actionMode === 'move' && ship.kind !== 'fighter') continue;

    const isActive = isHumanTurn && ship.id === activeShipId;
    const isHovered = isHumanTurn && ship.id === hoveredShipId;
    const color = getPlayerColor(ship.owner);

    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(isActive ? timeSec * 1.15 : isHumanTurn ? timeSec * 0.55 : timeSec * 0.35);

    if (isActive) {
      ctx.strokeStyle = '#FFFFFF';
      ctx.globalAlpha = 0.92;
      ctx.lineWidth = 1.8;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, ship.radius + 11, 0, Math.PI * 2);
      ctx.stroke();
    } else if (isHumanTurn) {
      ctx.strokeStyle = isHovered ? '#FFFFFF' : color;
      ctx.globalAlpha = isHovered ? 0.8 : 0.32;
      ctx.lineWidth = isHovered ? 1.4 : 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, ship.radius + (isHovered ? 10 : 8), 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.14;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 7]);
      ctx.beginPath();
      ctx.arc(0, 0, ship.radius + 8, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }
}

function drawRemoteAimOverlay(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
  remoteAim: OpponentAimState | null,
  timeSec: number
) {
  if (!remoteAim || world.actionLocked || world.winner !== null) return;
  const ship = world.ships.find((s) => s.id === remoteAim.shipId && s.alive);
  if (!ship) return;

  const color = getPlayerColor(ship.owner);
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(timeSec * 0.85);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 1.6;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.arc(0, 0, ship.radius + 11, 0, Math.PI * 2);
  ctx.stroke();

  if (remoteAim.isCharging) {
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.48 + 0.32 * Math.sin(timeSec * 8);
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(0, 0, ship.radius + 16, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function getComboAccentColor(
  mods: FireModifierKind[],
  owner: 1 | 2
): string {
  if (mods.includes('overcharge')) return POWER_CELL_META.overcharge.color;
  if (mods.includes('trident')) return POWER_CELL_META.trident.color;
  if (mods.includes('flak')) return POWER_CELL_META.flak.color;
  if (mods.includes('piercer')) return POWER_CELL_META.piercer.color;
  return getPlayerColor(owner);
}

function drawChargeRingOverlay(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
  activeFire: ActiveFireState | null,
  armedFireMods: FireModifierKind[]
) {
  if (!activeFire) return;
  const ship = world.ships.find((s) => s.id === activeFire.shipId && s.alive);
  if (!ship) return;

  const hasTrident = armedFireMods.includes('trident');
  const hasFlak = armedFireMods.includes('flak');
  const overcharged = armedFireMods.includes('overcharge');
  const hasPiercer = armedFireMods.includes('piercer');
  const color = getComboAccentColor(armedFireMods, ship.owner);

  // Preview aiming indicator when any modifier is armed even before charging
  if (armedFireMods.length > 0 && !activeFire.isCharging) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = hasPiercer ? 1.6 : 1.25;
    ctx.setLineDash(hasPiercer ? [8, 4] : [4, 5]);
    const previewDist = 90;
    const tipX = ship.x + Math.cos(ship.angle) * (ship.radius + previewDist);
    const tipY = ship.y + Math.sin(ship.angle) * (ship.radius + previewDist);
    ctx.beginPath();
    ctx.moveTo(ship.x + Math.cos(ship.angle) * (ship.radius + 10), ship.y + Math.sin(ship.angle) * (ship.radius + 10));
    ctx.lineTo(tipX, tipY);
    if (hasTrident) {
      const splitX = ship.x + Math.cos(ship.angle) * (ship.radius + 45);
      const splitY = ship.y + Math.sin(ship.angle) * (ship.radius + 45);
      for (const off of [-TRIDENT_SPREAD_RAD, TRIDENT_SPREAD_RAD]) {
        ctx.moveTo(splitX, splitY);
        ctx.lineTo(splitX + Math.cos(ship.angle + off) * 45, splitY + Math.sin(ship.angle + off) * 45);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  if (!activeFire.isCharging) return;

  const ringRadius = ship.radius + 16;
  const startAngle = -Math.PI / 2;
  const safeLimitAngle = startAngle + SAFE_POWER_LIMIT * Math.PI * 2;
  const currentAngle = startAngle + activeFire.power * Math.PI * 2;
  const pct = Math.round(activeFire.power * 100);
  const canOverheat = ship.kind !== 'mothership' && !overcharged;
  const overheatPct = Math.round(getOverheatChance(activeFire.power, ship.kind, overcharged) * 100);
  const isOverheating = canOverheat && overheatPct > 0;
  const rangePx = Math.round(getProjectileRange(ship, activeFire.power));

  ctx.save();
  // Show Flak burst radius preview at predicted endpoint while charging
  if (hasFlak) {
    const endX = ship.x + Math.cos(ship.angle) * (ship.radius + 8 + rangePx);
    const endY = ship.y + Math.sin(ship.angle) * (ship.radius + 8 + rangePx);
    ctx.strokeStyle = overcharged ? '#FACC15' : '#FB923C';
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.arc(endX, endY, FLAK_SHRAPNEL_RANGE, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(ship.x, ship.y, ringRadius, 0, Math.PI * 2);
  ctx.stroke();

  if (canOverheat) {
    ctx.strokeStyle = 'rgba(248, 113, 113, 0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(
      ship.x + Math.cos(safeLimitAngle) * (ringRadius - 4),
      ship.y + Math.sin(safeLimitAngle) * (ringRadius - 4)
    );
    ctx.lineTo(
      ship.x + Math.cos(safeLimitAngle) * (ringRadius + 4),
      ship.y + Math.sin(safeLimitAngle) * (ringRadius + 4)
    );
    ctx.stroke();
  }

  const safeEnd = canOverheat ? Math.min(currentAngle, safeLimitAngle) : currentAngle;
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(ship.x, ship.y, ringRadius, startAngle, safeEnd);
  ctx.stroke();

  if (canOverheat && activeFire.power > SAFE_POWER_LIMIT) {
    ctx.strokeStyle = '#EF4444';
    ctx.shadowColor = '#EF4444';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(ship.x, ship.y, ringRadius, safeLimitAngle, currentAngle);
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
  ctx.font = '500 11px "IBM Plex Mono", monospace';
  ctx.fillStyle = isOverheating ? '#FCA5A5' : '#F4F4F5';
  const modSuffix =
    armedFireMods.length > 0
      ? ` · ${armedFireMods.map((m) => POWER_CELL_META[m].short).join('+')}`
      : '';
  const label = isOverheating
    ? `PWR ${pct}% · ${rangePx}px · RISK ${overheatPct}%${modSuffix}`
    : `PWR ${pct}% · ${rangePx}px${modSuffix}`;
  const maxLabelX = LOGICAL_WIDTH - 280;
  const labelX = Math.min(maxLabelX, Math.max(36, ship.x + ship.radius + 18));
  const labelY = Math.max(46, ship.y - ship.radius - 10);
  ctx.fillText(label, labelX, labelY);
  ctx.restore();
}

function drawMoveOverlay(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
  moveDraft: MoveDraft | null,
  armedHyperMove: boolean
) {
  if (!moveDraft) return;
  const ship = world.ships.find((s) => s.id === moveDraft.shipId && s.alive);
  if (!ship) return;

  const isHyper = Boolean(moveDraft.hyperMove ?? armedHyperMove);
  const moveRadius = isHyper ? MAX_MOVE_DISTANCE * HYPER_MOVE_MULT : MAX_MOVE_DISTANCE;
  const color = isHyper ? '#2DD4BF' : getPlayerColor(ship.owner);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = isHyper ? 0.38 : 0.25;
  ctx.lineWidth = 1.25;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.arc(ship.x, ship.y, moveRadius, 0, Math.PI * 2);
  ctx.stroke();

  if (!moveDraft.cancelled) {
    let targetColor = '#22C55E';
    let outcomeLabel = '';
    if (moveDraft.outcome === 'pickup') {
      targetColor = '#34D399';
      outcomeLabel = 'CELL PICKUP';
    } else if (moveDraft.outcome === 'mine') {
      targetColor = '#F43F5E';
      outcomeLabel = 'MINE BLAST!';
    } else if (moveDraft.outcome === 'kamikaze') {
      targetColor = getPlayerColor(ship.owner);
      outcomeLabel = 'KAMIKAZE · +1 TURN';
    } else if (moveDraft.outcome === 'shield') {
      targetColor = '#EF4444';
      outcomeLabel = 'SHIELD IMPACT';
    } else if (moveDraft.outcome === 'asteroid') {
      targetColor = '#EF4444';
      outcomeLabel = 'ASTEROID IMPACT';
    } else if (moveDraft.outcome === 'border') {
      targetColor = '#EF4444';
      outcomeLabel = 'BORDER IMPACT';
    } else if (moveDraft.outcome === 'friendly') {
      targetColor = '#EF4444';
      outcomeLabel = 'FRIENDLY CRASH';
    }

    ctx.strokeStyle = targetColor;
    ctx.globalAlpha = 0.8;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(ship.x, ship.y);
    ctx.lineTo(moveDraft.targetX, moveDraft.targetY);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(moveDraft.targetX, moveDraft.targetY, ship.radius, 0, Math.PI * 2);
    ctx.stroke();

    if (outcomeLabel) {
      ctx.font = '500 10px "IBM Plex Mono", monospace';
      ctx.fillStyle = targetColor;
      const lx = Math.min(LOGICAL_WIDTH - 135, Math.max(32, moveDraft.targetX + ship.radius + 8));
      const ly = Math.max(42, moveDraft.targetY - ship.radius - 6);
      ctx.fillText(outcomeLabel, lx, ly);
    }
  }

  ctx.restore();
}

function drawCornerLabels(ctx: CanvasRenderingContext2D, world: GameWorld) {
  const p1Shield = world.shields.find((s) => s.owner === 1);
  const p2Shield = world.shields.find((s) => s.owner === 2);

  ctx.save();
  ctx.font = '500 11px "IBM Plex Mono", monospace';
  ctx.fillStyle = 'rgba(56, 189, 248, 0.56)';
  const p1Tag =
    p1Shield && p1Shield.hp > p1Shield.maxHp
      ? `P1 BASE · OVER-SHIELD ${Math.round((p1Shield.hp / p1Shield.maxHp) * 100)}%`
      : 'P1 BASE';
  ctx.fillText(p1Tag, P1_BASE.x - 24, P1_BASE.y + SHIELD_RADIUS + 20);

  ctx.fillStyle = 'rgba(251, 146, 60, 0.56)';
  const p2Tag =
    p2Shield && p2Shield.hp > p2Shield.maxHp
      ? `P2 BASE · OVER-SHIELD ${Math.round((p2Shield.hp / p2Shield.maxHp) * 100)}%`
      : 'P2 BASE';
  ctx.fillText(p2Tag, P2_BASE.x - 24, P2_BASE.y - SHIELD_RADIUS - 12);
  ctx.restore();
}

function drawLaserSightOverlays(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
  activeShipId: string | null
) {
  for (const ship of world.ships) {
    if (!ship.alive || !ship.hasLaserSight) continue;
    const isSelected = ship.id === activeShipId;
    const { startX, startY, endX, endY } = computeLaserSightEnd(ship);

    ctx.save();
    ctx.strokeStyle = '#10B981';
    ctx.shadowColor = '#10B981';
    ctx.shadowBlur = isSelected ? 6 : 2;
    ctx.globalAlpha = isSelected ? 0.72 : 0.28;
    ctx.lineWidth = isSelected ? 1.35 : 0.95;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Small perpendicular max-range caliper tick
    ctx.setLineDash([]);
    const perpX = -Math.sin(ship.angle) * 5;
    const perpY = Math.cos(ship.angle) * 5;
    ctx.beginPath();
    ctx.moveTo(endX - perpX, endY - perpY);
    ctx.lineTo(endX + perpX, endY + perpY);
    ctx.stroke();
    ctx.restore();
  }
}

function drawLaserDotOverlays(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
  timeSec: number
) {
  for (const ship of world.ships) {
    if (!ship.alive || !ship.hasLaserDot) continue;
    const contact = computeLaserDotContact(world, ship);
    if (!contact) continue;

    const pulse = 1 + 0.25 * Math.sin(timeSec * 8);
    ctx.save();
    // Soft glowing outer crimson halo (beam itself stays invisible)
    ctx.fillStyle = 'rgba(239, 68, 68, 0.34)';
    ctx.beginPath();
    ctx.arc(contact.x, contact.y, 6 * pulse, 0, Math.PI * 2);
    ctx.fill();

    // Bright pinpoint red laser dot
    ctx.fillStyle = '#EF4444';
    ctx.shadowColor = '#EF4444';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(contact.x, contact.y, 2.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export function renderWorld(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
  activeFire: ActiveFireState | null,
  moveDraft: MoveDraft | null,
  hoveredShipId: string | null,
  actionMode: ActionMode,
  timeSec: number,
  isHumanTurn: boolean,
  remoteAim: OpponentAimState | null = null,
  armedFireMods: FireModifierKind[] = [],
  armedHyperMove = false
) {
  ctx.save();

  if (world.screenShake > 0.2) {
    const sx = (Math.random() - 0.5) * world.screenShake;
    const sy = (Math.random() - 0.5) * world.screenShake;
    ctx.translate(sx, sy);
  }

  drawPaperFrame(ctx);
  drawCornerLabels(ctx, world);
  drawAsteroids(ctx, world, timeSec);

  for (const ring of world.shields) {
    drawSolidShieldRing(ctx, ring, timeSec);
  }

  for (const cell of world.powerCells) {
    drawPowerCell(ctx, cell, timeSec);
  }

  const activeShipId = activeFire ? activeFire.shipId : moveDraft ? moveDraft.shipId : null;
  drawTurnReticles(ctx, world, hoveredShipId, activeShipId, actionMode, timeSec, isHumanTurn);
  if (!activeFire) {
    drawRemoteAimOverlay(ctx, world, remoteAim, timeSec);
  }

  drawLaserSightOverlays(ctx, world, activeShipId);

  for (const ship of world.ships) {
    if (!ship.alive) continue;
    if (ship.kind === 'mothership') {
      drawMotherShipVector(ctx, ship);
    } else {
      drawFighterShipVector(ctx, ship);
    }
  }

  drawLaserDotOverlays(ctx, world, timeSec);

  for (const proj of world.projectiles) {
    if (!proj.active) continue;
    const color = proj.overcharged
      ? '#FACC15'
      : proj.shieldPiercer
        ? '#E0F2FE'
        : proj.kind === 'flak' || proj.kind === 'shrapnel'
          ? '#FB923C'
          : proj.kind === 'trident'
            ? '#A78BFA'
            : getPlayerColor(proj.owner);

    ctx.save();
    if (proj.trail.length > 1) {
      ctx.beginPath();
      ctx.moveTo(proj.trail[0].x, proj.trail[0].y);
      for (let i = 1; i < proj.trail.length; i++) {
        ctx.lineTo(proj.trail[i].x, proj.trail[i].y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = proj.overcharged ? 3 : 2.2;
      ctx.globalAlpha = 0.7;
      ctx.stroke();
    }

    const angle = Math.atan2(proj.vy, proj.vx);
    ctx.translate(proj.x, proj.y);
    ctx.rotate(angle);
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = proj.overcharged ? 14 : 10;
    ctx.globalAlpha = 1;
    ctx.lineWidth = proj.kind === 'shrapnel' ? 2.2 : proj.overcharged ? 3.4 : 2.8;
    ctx.beginPath();
    ctx.moveTo(proj.kind === 'shrapnel' ? 5 : 7, 0);
    ctx.lineTo(proj.kind === 'shrapnel' ? -4 : -6, 0);
    ctx.stroke();
    ctx.restore();
  }

  for (const p of world.particles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.strokeStyle = p.color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-p.length * 0.5, 0);
    ctx.lineTo(p.length * 0.5, 0);
    ctx.stroke();
    ctx.restore();
  }

  for (const sw of world.shockwaves) {
    const alpha = Math.max(0, sw.life / sw.maxLife) * 0.8;
    ctx.save();
    ctx.strokeStyle = sw.color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  for (const ft of world.floatingTexts) {
    const ratio = Math.max(0, ft.life / ft.maxLife);
    const alpha = ratio > 0.65 ? 1 : ratio / 0.65;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '600 12px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = ft.color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }

  drawChargeRingOverlay(ctx, world, activeFire, armedFireMods);
  drawMoveOverlay(ctx, world, moveDraft, armedHyperMove);

  ctx.restore();
}
