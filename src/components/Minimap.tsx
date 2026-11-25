import React, { useRef, useEffect, useState } from 'react';
import { SpaceCombatEngine } from '../game/spaceCombatEngine';
import { ShipEntity } from '../types';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Compass,
  Crosshair,
  Shield,
  Radio,
} from 'lucide-react';

interface MinimapProps {
  engine: SpaceCombatEngine;
  onSelectTarget?: (shipId: string) => void;
  className?: string;
  defaultExpanded?: boolean;
}

export const Minimap: React.FC<MinimapProps> = ({
  engine,
  onSelectTarget,
  className = '',
  defaultExpanded = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [zoomRange, setZoomRange] = useState<number>(600); // Radar radius in meters/units
  const [northUp, setNorthUp] = useState<boolean>(true); // North Up vs Heading Up
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
  const [hoveredInfo, setHoveredInfo] = useState<string | null>(null);

  const sweepAngleRef = useRef<number>(0);

  // Available ranges suited for compact MOBA arena
  const rangeOptions = [300, 600, 900, 1500];

  const cycleZoom = (delta: number) => {
    setZoomRange((prev) => {
      const idx = rangeOptions.indexOf(prev);
      if (idx === -1) return 600;
      const nextIdx = Math.max(0, Math.min(rangeOptions.length - 1, idx + delta));
      return rangeOptions[nextIdx];
    });
  };

  // Main canvas render loop
  useEffect(() => {
    let animationFrameId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) / 2 - 8;

      const player = engine.player;
      const isSiegeActive = engine.siegeController?.isSiegeActive;

      // Increment radar sweep angle
      sweepAngleRef.current = (sweepAngleRef.current + 0.03) % (Math.PI * 2);

      // Clear background
      ctx.clearRect(0, 0, width, height);

      // Clip to circular radar frame
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();

      // Background gradient
      const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      bgGrad.addColorStop(0, 'rgba(3, 7, 18, 0.95)');
      bgGrad.addColorStop(0.7, 'rgba(15, 23, 42, 0.92)');
      bgGrad.addColorStop(1, 'rgba(2, 6, 23, 0.98)');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Calculate Rotation Matrix based on North Up vs Heading Up
      // World coordinates: X = East (+), Z = South (+), -Z = North (-)
      // Heading Up: rotate map by -player.rotation.y
      const mapRotation = northUp ? 0 : -player.rotation.y;

      // Coordinate transform function (World Pos -> Radar Canvas Pos)
      const pRot = player.rotation.y;

      const worldToCanvas = (wx: number, wz: number) => {
        // Relative to player
        const dx = wx - player.position.x;
        const dz = wz - player.position.z;

        let rx = 0;
        let rz = 0;

        if (northUp) {
          // North-Up Mode: North (-Z) is UP (-Y canvas), East (+X) is RIGHT (+X canvas)
          rx = dx;
          rz = dz;
        } else {
          // Heading-Up Mode: Player forward is UP (-Y canvas), Starboard (+Right) is RIGHT (+X canvas)
          rx = dx * Math.cos(pRot) - dz * Math.sin(pRot);
          rz = -(dx * Math.sin(pRot) + dz * Math.cos(pRot));
        }

        // Scale to radar canvas (radius represents zoomRange)
        const scale = radius / zoomRange;
        const canvasX = cx + rx * scale;
        const canvasY = cy + rz * scale;

        return { x: canvasX, y: canvasY, scale };
      };

      // Draw Grid / Distance Rings
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
      ctx.lineWidth = 1;

      // 3 Concentric Rings
      [0.33, 0.66, 1.0].forEach((ratio) => {
        ctx.beginPath();
        ctx.arc(cx, cy, radius * ratio, 0, Math.PI * 2);
        ctx.stroke();

        // Ring label
        ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
        ctx.font = '8px monospace';
        const rangeMeters = Math.round(zoomRange * ratio);
        ctx.fillText(`${rangeMeters}m`, cx + 4, cy - radius * ratio + 10);
      });

      // Crosshair Axes (N-S, E-W)
      ctx.beginPath();
      ctx.moveTo(cx, cy - radius);
      ctx.lineTo(cx, cy + radius);
      ctx.moveTo(cx - radius, cy);
      ctx.lineTo(cx + radius, cy);
      ctx.stroke();

      // Radar Sweep Line
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(sweepAngleRef.current);
      const sweepGrad = ctx.createLinearGradient(0, 0, radius, 0);
      sweepGrad.addColorStop(0, 'rgba(56, 189, 248, 0.3)');
      sweepGrad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
      ctx.fillStyle = sweepGrad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, -0.3, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Draw Cardinal Direction Indicators (N, S, E, W)
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const cardinalDist = radius - 10;
      const cardinals = [
        { label: 'N', angle: -Math.PI / 2 },
        { label: 'E', angle: 0 },
        { label: 'S', angle: Math.PI / 2 },
        { label: 'W', angle: Math.PI },
      ];

      cardinals.forEach(({ label, angle }) => {
        const effAngle = angle + mapRotation;
        const x = cx + Math.cos(effAngle) * cardinalDist;
        const y = cy + Math.sin(effAngle) * cardinalDist;
        ctx.fillText(label, x, y);
      });

      // Draw Asteroids
      if (engine.asteroids) {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
        ctx.strokeStyle = 'rgba(203, 213, 225, 0.6)';
        ctx.lineWidth = 1;
        engine.asteroids.forEach((ast) => {
          const p = worldToCanvas(ast.position.x, ast.position.z);
          // Check inside radar bounds
          if (Math.hypot(p.x - cx, p.y - cy) <= radius) {
            const astRad = Math.max(1.8, (ast.radius / zoomRange) * radius * 0.85);
            ctx.beginPath();
            ctx.arc(p.x, p.y, astRad, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
        });
      }

      // Draw Starbases (MOBA Mode)
      if (engine.siegeController) {
        const siege = engine.siegeController;
        const playerTeam = player.team || 'alpha';
        const bases = [
          { base: siege.alphaStarbase, name: 'ALPHA', isAlly: (siege.alphaStarbase.team || 'alpha') === playerTeam },
          { base: siege.betaStarbase, name: 'BETA', isAlly: (siege.betaStarbase.team || 'beta') === playerTeam },
        ];

        bases.forEach(({ base, name, isAlly }) => {
          if (!base || base.isDestroyed) return;
          const p = worldToCanvas(base.position.x, base.position.z);
          const distToCenter = Math.hypot(p.x - cx, p.y - cy);

          // If starbase is beyond radar edge, clamp to edge icon
          let drawX = p.x;
          let drawY = p.y;
          let isClamped = false;
          if (distToCenter > radius - 12) {
            const angle = Math.atan2(p.y - cy, p.x - cx);
            drawX = cx + Math.cos(angle) * (radius - 12);
            drawY = cy + Math.sin(angle) * (radius - 12);
            isClamped = true;
          }

          ctx.save();
          ctx.translate(drawX, drawY);

          const baseColor = isAlly ? '#38bdf8' : '#f43f5e';

          // Outer pulsing ring
          ctx.strokeStyle = baseColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, 8, 0, Math.PI * 2);
          ctx.stroke();

          // Starbase Diamond Icon
          ctx.fillStyle = baseColor;
          ctx.beginPath();
          ctx.moveTo(0, -6);
          ctx.lineTo(6, 0);
          ctx.moveTo(0, 6);
          ctx.lineTo(-6, 0);
          ctx.closePath();
          ctx.fill();

          // Health bar above base icon
          const hpRatio = Math.max(0, base.hull / base.maxHull);
          ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
          ctx.fillRect(-12, -13, 24, 3);
          ctx.fillStyle = hpRatio > 0.5 ? '#10b981' : hpRatio > 0.25 ? '#f59e0b' : '#ef4444';
          ctx.fillRect(-12, -13, 24 * hpRatio, 3);

          // Name label
          ctx.fillStyle = '#f8fafc';
          ctx.font = 'bold 8px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(name, 0, 14);

          ctx.restore();
        });
      }

      // Draw Torpedo Projectiles
      if (engine.torpedoes) {
        engine.torpedoes.forEach((torp) => {
          const p = worldToCanvas(torp.position.x, torp.position.z);
          if (Math.hypot(p.x - cx, p.y - cy) <= radius) {
            ctx.fillStyle = (torp.team || 'alpha') === (player.team || 'alpha') ? '#06b6d4' : '#f97316';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        });
      }

      // Draw Active Waypoint Destination
      if (player.waypoint) {
        const wp = worldToCanvas(player.waypoint.x, player.waypoint.z);
        const pp = worldToCanvas(player.position.x, player.position.z);
        
        ctx.save();
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(pp.x, pp.y);
        ctx.lineTo(wp.x, wp.y);
        ctx.stroke();

        ctx.fillStyle = '#22d3ee';
        ctx.beginPath();
        ctx.arc(wp.x, wp.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Draw Ships / Minions
      const allShips = [player, ...engine.enemies].filter((s) => !s.isDestroyed);

      allShips.forEach((ship) => {
        const isPlayer = ship.id === player.id;
        const isTargeted = ship.id === player.targetId;
        const playerTeam = player.team || (player.isPlayer ? 'alpha' : 'beta');
        const shipTeam = ship.team || (ship.isPlayer ? 'alpha' : 'beta');
        const isAlly = shipTeam === playerTeam;

        const p = worldToCanvas(ship.position.x, ship.position.z);
        const distFromCenter = Math.hypot(p.x - cx, p.y - cy);

        // Clamp to radar perimeter if off-screen
        let drawX = p.x;
        let drawY = p.y;
        const isOffscreen = distFromCenter > radius - 6;

        if (isOffscreen) {
          const angle = Math.atan2(p.y - cy, p.x - cx);
          drawX = cx + Math.cos(angle) * (radius - 6);
          drawY = cy + Math.sin(angle) * (radius - 6);
        }

        ctx.save();
        ctx.translate(drawX, drawY);

        // Ship Heading Angle on Canvas
        const renderAngle = northUp
          ? Math.PI - ship.rotation.y
          : ship.rotation.y - player.rotation.y;

        if (isPlayer) {
          // PLAYER SHIP DISPLAY (Cyan Chevron with FOV Cone)
          // FOV cone (pointing in renderAngle direction, 2D canvas 0° is East (+X), UP is -90° / -PI/2)
          const fovCenter = renderAngle - Math.PI / 2;
          ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, 38, fovCenter - Math.PI / 4, fovCenter + Math.PI / 4);
          ctx.closePath();
          ctx.fill();

          // Player chevron (drawn pointing UP)
          ctx.rotate(renderAngle);
          ctx.fillStyle = '#38bdf8';
          ctx.shadowColor = '#0284c7';
          ctx.shadowBlur = 8;

          ctx.beginPath();
          ctx.moveTo(0, -9); // Forward tip (UP)
          ctx.lineTo(-6, 6);
          ctx.lineTo(0, 2);
          ctx.lineTo(6, 6);
          ctx.closePath();
          ctx.fill();
        } else {
          // OTHER SHIPS & MINIONS
          const color = isAlly ? '#10b981' : '#ef4444';

          // If targeted, draw glowing lock reticle
          if (isTargeted) {
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(0, 0, 8, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = '#f59e0b';
            ctx.fillRect(-1, -10, 2, 4);
            ctx.fillRect(-1, 6, 2, 4);
            ctx.fillRect(-10, -1, 4, 2);
            ctx.fillRect(6, -1, 4, 2);
          }

          ctx.rotate(renderAngle);
          ctx.fillStyle = color;

          if (ship.shipClass?.modelType === 'boss_leviathan') {
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.moveTo(0, -9);
            ctx.lineTo(8, 0);
            ctx.lineTo(0, 9);
            ctx.lineTo(-8, 0);
            ctx.closePath();
            ctx.fill();
          } else if (ship.shipClass?.modelType === 'station') {
            // Station / Base minion icon
            ctx.fillRect(-4, -4, 8, 8);
          } else {
            // Standard ship triangle (drawn pointing UP)
            ctx.beginPath();
            ctx.moveTo(0, -6);
            ctx.lineTo(-4, 4);
            ctx.lineTo(4, 4);
            ctx.closePath();
            ctx.fill();
          }
        }

        ctx.restore();
      });

      // Outer Ring Frame Border
      ctx.restore(); // Restore clip

      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      // Outer subtle border glow
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
      ctx.stroke();

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [engine, zoomRange, northUp]);

  // Click handler to select target on minimap
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const width = canvas.width;
    const height = canvas.height;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) / 2 - 8;

    const player = engine.player;
    const mapRotation = northUp ? 0 : -player.rotation.y;
    const scale = radius / zoomRange;

    // Convert Click Pos back to World Pos
    const rx = (clickX - cx) / scale;
    const rz = (clickY - cy) / scale;

    const pRot = player.rotation.y;
    let dx = 0;
    let dz = 0;

    if (northUp) {
      dx = rx;
      dz = rz;
    } else {
      dx = rx * Math.cos(pRot) - rz * Math.sin(pRot);
      dz = -rx * Math.sin(pRot) - rz * Math.cos(pRot);
    }

    const wx = player.position.x + dx;
    const wz = player.position.z + dz;

    // Find closest enemy ship to click coordinate
    let closestEnemy: ShipEntity | null = null;
    let minDistance = 120; // Hit tolerance radius in world units

    engine.enemies.forEach((enemy) => {
      if (enemy.isDestroyed) return;
      const dist = Math.hypot(enemy.position.x - wx, enemy.position.z - wz);
      if (dist < minDistance) {
        minDistance = dist;
        closestEnemy = enemy;
      }
    });

    const isCarrier =
      player.shipClass.modelType === 'carrier' ||
      player.shipClass.id.includes('carrier') ||
      player.shipClass.id.includes('aegis') ||
      player.shipClass.id.includes('hive') ||
      !!player.hangarState;

    if (closestEnemy && onSelectTarget) {
      const enemy = closestEnemy as ShipEntity;
      onSelectTarget(enemy.id);
      player.waypoint = { x: enemy.position.x, z: enemy.position.z };
      player.targetSpeed = player.shipClass.maxSpeed;
      if (isCarrier) {
        engine.setSwarmWaypoint(enemy.position.x, enemy.position.z, player, enemy.id);
      }
      setHoveredInfo(`LOCKED & ENGAGING: ${enemy.name}`);
      setTimeout(() => setHoveredInfo(null), 2000);
    } else {
      player.waypoint = { x: wx, z: wz };
      player.targetSpeed = player.shipClass.maxSpeed;
      if (isCarrier) {
        engine.setSwarmWaypoint(wx, wz, player);
      }
      setHoveredInfo(`WAYPOINT SET: (${Math.round(wx)}, ${Math.round(wz)})`);
      setTimeout(() => setHoveredInfo(null), 2000);
    }
  };

  const isSiegeActive = !!engine.siegeController?.isSiegeActive;

  return (
    <div
      className={`relative flex flex-col items-center bg-slate-950/90 backdrop-blur border border-slate-800/90 rounded-2xl p-2.5 shadow-2xl transition-all ${
        isExpanded ? 'w-80 h-96' : 'w-52 h-60'
      } ${className}`}
    >
      {/* Minimap Top Header */}
      <div className="w-full flex items-center justify-between pb-1.5 border-b border-slate-800/80 mb-1 px-1">
        <div className="flex items-center gap-1.5 text-cyan-400 font-mono font-bold text-[11px] tracking-wider">
          <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span>{isSiegeActive ? 'MOBA ARENA MAP' : 'TACTICAL RADAR'}</span>
        </div>

        {/* Controls Bar */}
        <div className="flex items-center gap-1">
          {/* North Up toggle */}
          <button
            onClick={() => setNorthUp(!northUp)}
            className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border transition ${
              northUp
                ? 'bg-cyan-950/80 border-cyan-500/70 text-cyan-300'
                : 'bg-slate-900 border-slate-700 text-slate-400'
            }`}
            title={northUp ? 'North Up Orientation' : 'Heading Up Orientation'}
          >
            {northUp ? 'N-UP' : 'HDG'}
          </button>

          {/* Zoom Out */}
          <button
            onClick={() => cycleZoom(1)}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Zoom Out"
          >
            <ZoomOut className="w-3 h-3" />
          </button>

          {/* Zoom In */}
          <button
            onClick={() => cycleZoom(-1)}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Zoom In"
          >
            <ZoomIn className="w-3 h-3" />
          </button>

          {/* Expand / Collapse */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title={isExpanded ? 'Minimize Radar' : 'Expand Radar'}
          >
            {isExpanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Radar Canvas Container */}
      <div className="relative flex-1 flex items-center justify-center w-full overflow-hidden cursor-crosshair">
        <canvas
          ref={canvasRef}
          width={isExpanded ? 270 : 180}
          height={isExpanded ? 270 : 180}
          onClick={handleCanvasClick}
          className="rounded-full shadow-inner active:scale-[0.99] transition-transform"
        />

        {/* Hover / Target Status Overlay */}
        {hoveredInfo && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-amber-950/90 border border-amber-500/70 text-amber-300 text-[10px] font-mono px-2 py-0.5 rounded-full shadow-lg pointer-events-none animate-bounce">
            {hoveredInfo}
          </div>
        )}
      </div>

      {/* Footer Info & Legend */}
      <div className="w-full pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[9px] font-mono text-slate-400 px-1 mt-1">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" /> YOU
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> ALLY
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" /> ENEMY
          </span>
        </div>
        <span className="text-cyan-400/90 font-bold">{zoomRange}m</span>
      </div>
    </div>
  );
};
