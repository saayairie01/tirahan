import {
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  MAX_MOVE_DISTANCE,
  P1_BASE,
  P2_BASE,
  PAPER_MARGIN,
  SAFE_POWER_LIMIT,
  SHIELD_RADIUS,
  getOverheatChance,
  getPlayerColor,
  getProjectileRange,
} from './engine';
import { OpponentAimState } from './onlineTypes';
import {
  ActionMode,
  ActiveFireState,
  GameWorld,
  MoveDraft,
  ShieldSegment,
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

  ctx.restore();

  // Subtle vector HP pips when a Fighter Ship is wounded
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

function drawShieldSegment(ctx: CanvasRenderingContext2D, seg: ShieldSegment) {
  if (seg.hp <= 0) return;

  const color = seg.flashTimer > 0 ? '#FFFFFF' : getPlayerColor(seg.owner);
  const gap = 0.028;
  const start = seg.startAngle + gap;
  const end = seg.endAngle - gap;
  const intact = seg.hp > seg.maxHp * 0.5;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = intact ? 7 : 3;
  ctx.lineCap = 'round';

  if (intact) {
    ctx.lineWidth = 2.4;
    ctx.globalAlpha = 0.9;
  } else {
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 5]);
    ctx.globalAlpha = 0.58;
  }

  ctx.beginPath();
  ctx.arc(seg.centerX, seg.centerY, seg.radius, start, end);
  ctx.stroke();

  if (intact) {
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1;
    const x1 = seg.centerX + Math.cos(start) * (seg.radius - 3);
    const y1 = seg.centerY + Math.sin(start) * (seg.radius - 3);
    const x2 = seg.centerX + Math.cos(start) * (seg.radius + 3);
    const y2 = seg.centerY + Math.sin(start) * (seg.radius + 3);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawAsteroids(ctx: CanvasRenderingContext2D, world: GameWorld) {
  for (const ast of world.asteroids) {
    const sizeRatio = Math.max(0, Math.min(1, (ast.radius - 20) / 26));

    // Faint dashed gravitational field boundary (stronger/larger rings for larger rocks)
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

    // Retro 1979 Atari Asteroids jagged closed vector polygon
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

    // Internal Atari vector fracture lines as asteroid takes damage
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
  if (!isHumanTurn || world.actionLocked || world.winner !== null) return;

  for (const ship of world.ships) {
    if (!ship.alive || ship.owner !== world.currentTurn) continue;
    if (actionMode === 'move' && ship.kind !== 'fighter') continue;

    const isActive = ship.id === activeShipId;
    const isHovered = ship.id === hoveredShipId;
    const color = getPlayerColor(ship.owner);

    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(isActive ? timeSec * 1.15 : timeSec * 0.55);

    if (isActive) {
      ctx.strokeStyle = '#FFFFFF';
      ctx.globalAlpha = 0.92;
      ctx.lineWidth = 1.8;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, ship.radius + 11, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = isHovered ? '#FFFFFF' : color;
      ctx.globalAlpha = isHovered ? 0.8 : 0.28;
      ctx.lineWidth = isHovered ? 1.4 : 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, ship.radius + (isHovered ? 10 : 8), 0, Math.PI * 2);
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

function drawChargeRingOverlay(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
  activeFire: ActiveFireState | null
) {
  if (!activeFire || !activeFire.isCharging) return;
  const ship = world.ships.find((s) => s.id === activeFire.shipId && s.alive);
  if (!ship) return;

  const color = getPlayerColor(ship.owner);
  const ringRadius = ship.radius + 16;
  const startAngle = -Math.PI / 2;
  const safeLimitAngle = startAngle + SAFE_POWER_LIMIT * Math.PI * 2;
  const currentAngle = startAngle + activeFire.power * Math.PI * 2;
  const pct = Math.round(activeFire.power * 100);
  const canOverheat = ship.kind !== 'mothership';
  const overheatPct = Math.round(getOverheatChance(activeFire.power, ship.kind) * 100);
  const isOverheating = canOverheat && overheatPct > 0;
  const rangePx = Math.round(getProjectileRange(ship, activeFire.power));

  ctx.save();
  // Background track ring
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(ship.x, ship.y, ringRadius, 0, Math.PI * 2);
  ctx.stroke();

  // 75% safe power threshold tick only for Fighter Ships
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

  // Safe portion of radial charge arc
  const safeEnd = canOverheat ? Math.min(currentAngle, safeLimitAngle) : currentAngle;
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(ship.x, ship.y, ringRadius, startAngle, safeEnd);
  ctx.stroke();

  // Overheat portion beyond 75% (fighters only)
  if (canOverheat && activeFire.power > SAFE_POWER_LIMIT) {
    ctx.strokeStyle = '#EF4444';
    ctx.shadowColor = '#EF4444';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(ship.x, ship.y, ringRadius, safeLimitAngle, currentAngle);
    ctx.stroke();
  }

  // Compact power, pixel range, and overheat risk readout offset cleanly from ship
  ctx.shadowBlur = 0;
  ctx.font = '500 11px "IBM Plex Mono", monospace';
  ctx.fillStyle = isOverheating ? '#FCA5A5' : '#F4F4F5';
  const label = isOverheating
    ? `PWR ${pct}% · ${rangePx}px · RISK ${overheatPct}%`
    : `PWR ${pct}% · ${rangePx}px`;
  const maxLabelX = isOverheating ? LOGICAL_WIDTH - 220 : LOGICAL_WIDTH - 135;
  const labelX = Math.min(maxLabelX, Math.max(36, ship.x + ship.radius + 18));
  const labelY = Math.max(46, ship.y - ship.radius - 10);
  ctx.fillText(label, labelX, labelY);
  ctx.restore();
}

function drawMoveOverlay(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
  moveDraft: MoveDraft | null
) {
  if (!moveDraft) return;
  const ship = world.ships.find((s) => s.id === moveDraft.shipId && s.alive);
  if (!ship) return;

  const color = getPlayerColor(ship.owner);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = 1.25;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.arc(ship.x, ship.y, MAX_MOVE_DISTANCE, 0, Math.PI * 2);
  ctx.stroke();

  if (!moveDraft.cancelled) {
    let targetColor = '#22C55E';
    let outcomeLabel = '';
    if (moveDraft.outcome === 'kamikaze') {
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

function drawCornerLabels(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.font = '500 11px "IBM Plex Mono", monospace';
  ctx.fillStyle = 'rgba(56, 189, 248, 0.52)';
  ctx.fillText('P1 BASE', P1_BASE.x - 24, P1_BASE.y + SHIELD_RADIUS + 20);

  ctx.fillStyle = 'rgba(251, 146, 60, 0.52)';
  ctx.fillText('P2 BASE', P2_BASE.x - 24, P2_BASE.y - SHIELD_RADIUS - 12);
  ctx.restore();
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
  remoteAim: OpponentAimState | null = null
) {
  ctx.save();

  if (world.screenShake > 0.2) {
    const sx = (Math.random() - 0.5) * world.screenShake;
    const sy = (Math.random() - 0.5) * world.screenShake;
    ctx.translate(sx, sy);
  }

  drawPaperFrame(ctx);
  drawCornerLabels(ctx);
  drawAsteroids(ctx, world);

  for (const seg of world.shields) {
    drawShieldSegment(ctx, seg);
  }

  const activeShipId = activeFire ? activeFire.shipId : moveDraft ? moveDraft.shipId : null;
  drawTurnReticles(ctx, world, hoveredShipId, activeShipId, actionMode, timeSec, isHumanTurn);
  if (!activeFire) {
    drawRemoteAimOverlay(ctx, world, remoteAim, timeSec);
  }

  for (const ship of world.ships) {
    if (!ship.alive) continue;
    if (ship.kind === 'mothership') {
      drawMotherShipVector(ctx, ship);
    } else {
      drawFighterShipVector(ctx, ship);
    }
  }

  for (const proj of world.projectiles) {
    if (!proj.active) continue;
    const color = getPlayerColor(proj.owner);

    ctx.save();
    if (proj.trail.length > 1) {
      ctx.beginPath();
      ctx.moveTo(proj.trail[0].x, proj.trail[0].y);
      for (let i = 1; i < proj.trail.length; i++) {
        ctx.lineTo(proj.trail[i].x, proj.trail[i].y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.globalAlpha = 0.65;
      ctx.stroke();
    }

    const angle = Math.atan2(proj.vy, proj.vx);
    ctx.translate(proj.x, proj.y);
    ctx.rotate(angle);
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-6, 0);
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

  drawChargeRingOverlay(ctx, world, activeFire);
  drawMoveOverlay(ctx, world, moveDraft);

  ctx.restore();
}
