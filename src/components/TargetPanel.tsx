import React from 'react';
import { ShipEntity, ShieldArcKey } from '../types';
import { Crosshair, AlertTriangle, Target, Compass } from 'lucide-react';

interface TargetPanelProps {
  target: ShipEntity | null;
  playerPos?: { x: number; y: number; z: number };
  playerRotY?: number;
  playerTeam?: 'alpha' | 'beta';
  onClearTarget: () => void;
}

export const TargetPanel: React.FC<TargetPanelProps> = ({
  target,
  playerPos,
  playerRotY = 0,
  playerTeam = 'alpha',
  onClearTarget,
}) => {
  if (!target || target.isDestroyed) {
    return (
      <div className="p-4 rounded-xl bg-slate-900/90 backdrop-blur border border-slate-800 text-slate-400 text-xs flex items-center justify-between w-[360px] shadow-xl">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-slate-500" />
          <span className="font-mono uppercase font-semibold">NO TARGET ACQUIRED</span>
        </div>
        <span className="text-[10px] text-slate-600 font-mono">CLICK ENEMY SHIP</span>
      </div>
    );
  }

  const hullRatio = Math.max(0, Math.min(1, target.hull / target.maxHull));
  const hullPercent = Math.round(hullRatio * 100);

  // Distance & Bearing Calculations
  let distance = 0;
  let bearingLabel = 'FORE';
  let targetHitQuadrant: 'FORE' | 'PORT' | 'STARBOARD' | 'AFT' = 'FORE';

  if (playerPos) {
    const dx = target.position.x - playerPos.x;
    const dz = target.position.z - playerPos.z;
    distance = Math.round(Math.sqrt(dx * dx + dz * dz));

    // Player bearing to target
    const angleToTarget = Math.atan2(dx, dz);
    let playerRelAngle = angleToTarget - playerRotY;
    playerRelAngle = Math.atan2(Math.sin(playerRelAngle), Math.cos(playerRelAngle));
    const playerRelDeg = (playerRelAngle * 180) / Math.PI;

    if (playerRelDeg >= -45 && playerRelDeg <= 45) {
      bearingLabel = 'FORE';
    } else if (playerRelDeg > 45 && playerRelDeg < 135) {
      bearingLabel = 'STARBOARD FLANK';
    } else if (playerRelDeg > -135 && playerRelDeg < -45) {
      bearingLabel = 'PORT FLANK';
    } else {
      bearingLabel = 'AFT';
    }

    // Which target quadrant player is facing
    const dxT = playerPos.x - target.position.x;
    const dzT = playerPos.z - target.position.z;
    const angleToPlayer = Math.atan2(dxT, dzT);
    let targetRelAngle = angleToPlayer - target.rotation.y;
    targetRelAngle = Math.atan2(Math.sin(targetRelAngle), Math.cos(targetRelAngle));
    const targetRelDeg = (targetRelAngle * 180) / Math.PI;

    if (targetRelDeg >= -45 && targetRelDeg <= 45) {
      targetHitQuadrant = 'FORE';
    } else if (targetRelDeg > 45 && targetRelDeg < 135) {
      targetHitQuadrant = 'PORT';
    } else if (targetRelDeg > -135 && targetRelDeg < -45) {
      targetHitQuadrant = 'STARBOARD';
    } else {
      targetHitQuadrant = 'AFT';
    }
  }

  // Calculate 4 Quadrant Shield Status for Target
  const getQuadrantInfo = (keys: ShieldArcKey[]) => {
    const curSum = keys.reduce((sum, k) => sum + target.shields[k].current, 0);
    const maxSum = keys.reduce((sum, k) => sum + target.shields[k].max, 0);
    const ratio = maxSum > 0 ? Math.max(0, Math.min(1, curSum / maxSum)) : 0;
    const percent = Math.round(ratio * 100);
    const isCollapsed = percent <= 5 || keys.some((k) => target.shields[k].max > 0 && (target.shields[k].current / target.shields[k].max) <= 0.05);

    let colorClass = 'bg-cyan-500 border-cyan-400';
    let textClass = 'text-cyan-400';

    if (isCollapsed) {
      colorClass = 'bg-transparent border-transparent opacity-0';
      textClass = 'text-red-500 font-black animate-pulse';
    } else if (percent < 30) {
      colorClass = 'bg-red-500 border-red-400';
      textClass = 'text-red-400 font-bold';
    } else if (percent < 60) {
      colorClass = 'bg-amber-500 border-amber-400';
      textClass = 'text-amber-400 font-bold';
    }

    return { curSum, maxSum, ratio, percent, isCollapsed, colorClass, textClass };
  };

  const fore = getQuadrantInfo(['front']);
  const port = getQuadrantInfo(['port']);
  const starboard = getQuadrantInfo(['starboard']);
  const aft = getQuadrantInfo(['back']);

  const hitQuadData =
    targetHitQuadrant === 'FORE'
      ? fore
      : targetHitQuadrant === 'PORT'
      ? port
      : targetHitQuadrant === 'STARBOARD'
      ? starboard
      : aft;

  const isAllyTarget = (target.team || (target.isPlayer ? 'alpha' : 'beta')) === playerTeam;

  return (
    <div
      className={`relative p-4 rounded-xl bg-slate-900/95 backdrop-blur border text-slate-100 shadow-2xl w-[360px] ${
        isAllyTarget ? 'border-emerald-700/70' : 'border-red-900/70'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1 pr-1">
          <Crosshair
            className={`w-5 h-5 shrink-0 ${isAllyTarget ? 'text-emerald-400' : 'text-red-500 animate-pulse'}`}
          />
          <div className="min-w-0 flex-1">
            <span
              className={`font-black text-xs tracking-wider uppercase block leading-tight break-words ${
                isAllyTarget ? 'text-emerald-300' : 'text-red-400'
              }`}
            >
              {isAllyTarget ? 'ALLY VESSEL' : 'TARGET'}: {target.name.toUpperCase()}
            </span>
            <span className="text-[10px] text-slate-400 capitalize font-mono block mt-0.5">
              {target.shipClass.name}
            </span>
          </div>
        </div>
        <button
          onClick={onClearTarget}
          className="text-[10px] font-mono font-bold text-slate-500 hover:text-slate-300 transition uppercase tracking-wider shrink-0"
        >
          CLEAR
        </button>
      </div>

      {/* Distance & Relative Bearing Readout Panel */}
      <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 mb-3 flex items-center justify-between font-mono">
        <div className="flex items-center gap-1.5 text-cyan-400 text-xs font-bold">
          <Compass className="w-4 h-4 text-cyan-400" />
          <span>RANGE: {distance}m</span>
        </div>
        <div className="text-[11px] font-black text-amber-400 tracking-wider">
          BEARING: {bearingLabel}
        </div>
      </div>

      {/* Minion Execution Range & Last-Hit Alert Badge */}
      {target.minionHealth && target.minionHealth.is_in_execution_range(100) && (
        <div className="p-2 rounded-lg bg-amber-500/20 border border-amber-400/80 text-amber-300 font-mono text-[11px] font-black mb-3 flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>EXECUTION READY!</span>
          </div>
          <span className="text-[10px] text-amber-200 uppercase tracking-widest bg-amber-900/60 px-1.5 py-0.5 rounded">
            LAST-HIT HARVEST
          </span>
        </div>
      )}

      {/* Minion Single-Pool Omnidirectional Shield Bar */}
      {target.minionHealth ? (
        <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 mb-3 font-mono">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-400 text-[10px] uppercase tracking-wider font-bold">
              OMNIDIRECTIONAL SHIELD
            </span>
            <span
              className={`font-bold ${
                target.minionHealth.is_shield_active() ? 'text-cyan-400' : 'text-red-500 animate-pulse'
              }`}
            >
              {target.minionHealth.is_shield_active()
                ? `${Math.round(target.minionHealth.current_shield)} / ${target.minionHealth.max_shield}`
                : 'SHIELD BROKEN'}
            </span>
          </div>
          <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-700">
            <div
              className={`h-full transition-all duration-300 ${
                target.minionHealth.is_shield_active() ? 'bg-cyan-400' : 'bg-red-600'
              }`}
              style={{
                width: `${Math.max(
                  0,
                  Math.min(100, (target.minionHealth.current_shield / target.minionHealth.max_shield) * 100)
                )}%`,
              }}
            />
          </div>
        </div>
      ) : (
        /* Facing Quadrant Highlight Readout for Starbases & Ships */
        <div
          className={`p-2 rounded-lg border text-[10px] font-mono mb-3 flex items-center justify-between ${
            hitQuadData.isCollapsed
              ? 'bg-red-950/80 border-red-600 text-red-300 font-bold animate-pulse'
              : 'bg-slate-950 border-slate-800 text-slate-300'
          }`}
        >
          <span>FACING QUADRANT: {targetHitQuadrant}</span>
          <span className={hitQuadData.isCollapsed ? 'text-amber-300 font-black' : 'text-cyan-400'}>
            {hitQuadData.isCollapsed ? 'COLLAPSED (3.0x HULL!)' : `${hitQuadData.percent}% SHIELD`}
          </span>
        </div>
      )}

      {/* 4 Shield Arcs Tactical Ring Diagram */}
      <div className="relative my-2 w-full aspect-square max-w-[200px] mx-auto flex items-center justify-center">
        {/* Background Ring */}
        <div className="absolute inset-0 rounded-full border-2 border-slate-800 bg-slate-950/80" />

        {/* Center Ship Silhouette & Target Hull Integrity */}
        <div className="relative z-10 flex flex-col items-center justify-center text-center p-2.5 rounded-xl bg-slate-900/95 border border-slate-800 w-28 h-28 shadow-xl">
          <span className="text-[9px] text-slate-400 uppercase tracking-widest font-mono">TARGET HULL</span>
          <span
            className={`text-2xl font-black font-mono my-0.5 ${
              hullPercent < 25 ? 'text-red-500 animate-pulse' : hullPercent < 60 ? 'text-amber-400' : 'text-emerald-400'
            }`}
          >
            {hullPercent}%
          </span>

          {/* Hull Bar */}
          <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden mt-1 border border-slate-700/80">
            <div
              className={`h-full transition-all duration-300 ${
                hullPercent < 25 ? 'bg-red-500' : hullPercent < 60 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${hullPercent}%` }}
            />
          </div>
        </div>

        {/* FORE Quadrant */}
        <div className="absolute top-0 inset-x-2 flex flex-col items-center z-20">
          <span className={`text-[9px] font-mono font-bold ${fore.textClass}`}>
            FORE: {fore.percent}%
          </span>
          <div className="w-28 h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-700 mt-0.5">
            <div className={`h-full transition-all duration-300 ${fore.colorClass}`} style={{ width: `${fore.percent}%` }} />
          </div>
        </div>

        {/* PORT Quadrant */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 flex flex-col items-start z-20 w-16">
          <span className={`text-[8px] font-mono font-bold ${port.textClass}`}>PORT</span>
          <span className={`text-[9px] font-mono font-bold ${port.textClass}`}>{port.percent}%</span>
          <div className="w-14 h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-700 mt-0.5">
            <div className={`h-full transition-all duration-300 ${port.colorClass}`} style={{ width: `${port.percent}%` }} />
          </div>
        </div>

        {/* STARBOARD Quadrant */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 flex flex-col items-end z-20 w-16">
          <span className={`text-[8px] font-mono font-bold ${starboard.textClass}`}>STARBOARD</span>
          <span className={`text-[9px] font-mono font-bold ${starboard.textClass}`}>{starboard.percent}%</span>
          <div className="w-14 h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-700 mt-0.5">
            <div className={`h-full transition-all duration-300 ${starboard.colorClass}`} style={{ width: `${starboard.percent}%` }} />
          </div>
        </div>

        {/* AFT Quadrant */}
        <div className="absolute bottom-0 inset-x-2 flex flex-col items-center z-20">
          <div className="w-28 h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-700 mb-0.5">
            <div className={`h-full transition-all duration-300 ${aft.colorClass}`} style={{ width: `${aft.percent}%` }} />
          </div>
          <span className={`text-[9px] font-mono font-bold ${aft.textClass}`}>
            AFT: {aft.percent}%
          </span>
        </div>
      </div>
    </div>
  );
};
