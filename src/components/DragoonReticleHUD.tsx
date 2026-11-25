import React from 'react';
import { Crosshair, AlertTriangle, Zap, Target } from 'lucide-react';
import { ShipEntity } from '../types';

interface DragoonReticleHUDProps {
  ship: ShipEntity;
  targetEnemy: ShipEntity | null;
}

export const DragoonReticleHUD: React.FC<DragoonReticleHUDProps> = ({ ship, targetEnemy }) => {
  if (!ship || ship.isDestroyed) return null;

  const isDragoon = ship.shipClass.id.includes('dragoon') || ship.shipClass.id.includes('interceptor');
  if (!isDragoon) return null;

  const pc = ship.plasmaCharge;
  const isCharging = pc ? pc.isCharging : false;
  const chargeTime = pc ? pc.chargeTime : 0;

  // Overheat timer check
  const isOverheated = ship.hardpointOverheatTimer && ship.hardpointOverheatTimer > 0;

  // 1. Calculate Target Alignment with 45° Bow Arc Cone (22.5° offset from center line)
  let isAlignedInBowCone = false;
  let targetAngleDeg = 0;

  if (targetEnemy && !targetEnemy.isDestroyed) {
    const dx = targetEnemy.position.x - ship.position.x;
    const dz = targetEnemy.position.z - ship.position.z;
    const targetAngleRad = Math.atan2(dx, dz);
    const shipHeadingRad = ship.rotation.y;

    const angleDiffRad = Math.abs(
      Math.atan2(Math.sin(targetAngleRad - shipHeadingRad), Math.cos(targetAngleRad - shipHeadingRad))
    );
    targetAngleDeg = Math.round((angleDiffRad * 180) / Math.PI);

    // 45° total cone angle means <= 22.5° offset from forward axis
    isAlignedInBowCone = angleDiffRad <= (22.5 * Math.PI) / 180;
  }

  // 2. Charge progress & state styling
  const maxTime = pc ? pc.overchargeThreshold : 2.0; // 2.0s
  const chargeRatio = Math.min(1.0, Math.max(0.0, chargeTime / maxTime));
  const isSweetSpot = chargeTime >= 0.5 && chargeTime <= 1.8;
  const isDangerZone = chargeTime > 1.8;

  // Gauge styling
  let gaugeColor = '#00f0ff'; // Cyan
  let statusText = 'CHARGING PLASMA';
  let barBg = 'bg-cyan-500';

  if (isDangerZone) {
    gaugeColor = '#ef4444';
    statusText = 'OVERCHARGE DANGER!';
    barBg = 'bg-red-500';
  } else if (isSweetSpot) {
    gaugeColor = '#f59e0b';
    statusText = 'SWEET SPOT READY';
    barBg = 'bg-amber-400';
  }

  // SVG mini circular arc math (Radius = 18px)
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - chargeRatio * circumference;

  return (
    <>
      {/* Red Vignette Screen Flashing when entering Overcharge Danger Zone (> 1.8s) */}
      {isDangerZone && (
        <div className="absolute inset-0 bg-red-600/15 animate-ping pointer-events-none border-4 border-red-600/60 z-30" />
      )}

      {/* Top-Center Tactical Dragoon HUD Panel - Positioned cleanly off the ship */}
      <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1.5 select-none">
        {/* Sleek Tactical HUD Bar */}
        <div className="flex items-center gap-3 px-4 py-2 bg-slate-950/90 border border-slate-800 rounded-xl shadow-2xl backdrop-blur-md">
          {/* Circular Charge Ring Gauge */}
          <div className="relative flex items-center justify-center w-9 h-9">
            <svg className="w-9 h-9 -rotate-90 transform overflow-visible" viewBox="0 0 44 44">
              <circle
                cx="22"
                cy="22"
                r={radius}
                className="stroke-slate-800"
                strokeWidth="4"
                fill="transparent"
              />
              <circle
                cx="22"
                cy="22"
                r={radius}
                stroke={isCharging ? gaugeColor : '#334155'}
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={isCharging ? strokeDashoffset : circumference}
                fill="transparent"
                className="transition-all duration-75"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <Zap className={`w-3.5 h-3.5 ${isCharging ? (isDangerZone ? 'text-red-400 animate-bounce' : 'text-cyan-400 animate-pulse') : 'text-slate-500'}`} />
            </div>
          </div>

          {/* Plasma Charging Info & Bar */}
          <div className="flex flex-col min-w-[150px]">
            <div className="flex items-center justify-between text-[11px] font-mono mb-1">
              <span className={`font-bold tracking-wide ${isDangerZone ? 'text-red-400 animate-pulse' : isSweetSpot ? 'text-amber-300' : isCharging ? 'text-cyan-300' : 'text-slate-400'}`}>
                {isOverheated ? 'OVERHEATED' : isCharging ? statusText : 'DRAGOON BOW PLASMA'}
              </span>
              <span className="text-slate-400 text-[10px]">
                {isCharging ? `${chargeTime.toFixed(1)}s / 1.8s` : 'READY'}
              </span>
            </div>

            {/* Horizontal Charge Progress Bar */}
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden relative">
              {/* Sweet spot marker tick */}
              <div className="absolute top-0 bottom-0 left-[25%] w-0.5 bg-slate-600/60 z-10" />
              <div className="absolute top-0 bottom-0 left-[90%] w-0.5 bg-amber-400/80 z-10" />
              <div
                className={`h-full transition-all duration-75 rounded-full ${barBg}`}
                style={{ width: `${(chargeRatio * 100).toFixed(1)}%` }}
              />
            </div>
          </div>

          {/* Divider */}
          <div className="h-7 w-px bg-slate-800" />

          {/* 45° Bow Cone Target Alignment Status */}
          <div className="flex items-center gap-2">
            <div
              className={`p-1.5 rounded-lg border transition-all ${
                isAlignedInBowCone
                  ? 'bg-emerald-950/80 border-emerald-500/80 text-emerald-400 shadow-lg shadow-emerald-500/20'
                  : 'bg-slate-900/80 border-slate-800 text-slate-500'
              }`}
            >
              <Target className="w-3.5 h-3.5" />
            </div>

            <div className="flex flex-col text-[10px] font-mono">
              <span className="text-slate-400 tracking-wider">BOW CONE LOCK</span>
              <span className={`font-bold ${isAlignedInBowCone ? 'text-emerald-300' : 'text-slate-400'}`}>
                {targetEnemy && !targetEnemy.isDestroyed
                  ? isAlignedInBowCone
                    ? `LOCKED (${targetAngleDeg}°)`
                    : `${targetAngleDeg}° OFFSET`
                  : 'NO TARGET'}
              </span>
            </div>
          </div>
        </div>

        {/* Overheated Alert Badge */}
        {isOverheated && (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-red-950/90 border border-red-500 text-red-300 font-bold text-xs rounded-md shadow-xl animate-pulse font-mono">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span>HARDPOINT OVERHEAT ({ship.hardpointOverheatTimer?.toFixed(1)}s)</span>
          </div>
        )}
      </div>
    </>
  );
};
