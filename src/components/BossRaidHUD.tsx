import React from 'react';
import { Shield, Crosshair, HeartHandshake, Swords, AlertTriangle, ShieldCheck, Navigation } from 'lucide-react';
import { BossRaidModeController } from '../game/BossRaidModeController';
import { ShipEntity } from '../types';

interface BossRaidHUDProps {
  raidController: BossRaidModeController;
  playerShipId: string;
  selectedTargetId: string | null;
  onSelectTarget: (shipId: string) => void;
  onTakeControlOfShip: (shipId: string) => void;
}

export const BossRaidHUD: React.FC<BossRaidHUDProps> = ({
  raidController,
  playerShipId,
  selectedTargetId,
  onSelectTarget,
  onTakeControlOfShip,
}) => {
  const { bossShip, tankShip, dpsShip, supportShip, targetedAttack } = raidController;

  const getTotalShield = (ship: ShipEntity) => {
    const cur =
      ship.shields.front.current +
      ship.shields.starboard.current +
      ship.shields.back.current +
      ship.shields.port.current;
    const max =
      ship.shields.front.max +
      ship.shields.starboard.max +
      ship.shields.back.max +
      ship.shields.port.max;
    return { cur: Math.round(cur), max: Math.round(max), pct: max > 0 ? Math.round((cur / max) * 100) : 0 };
  };

  const bossHullPct = Math.max(0, Math.min(100, Math.round((bossShip.hull / Math.max(1, bossShip.maxHull)) * 100)));
  const bossShield = getTotalShield(bossShip);

  const isCharging = targetedAttack.state === 'charging';
  const chargePct = isCharging
    ? Math.max(0, Math.min(100, ((targetedAttack.maxChargeTime - targetedAttack.chargeTimer) / targetedAttack.maxChargeTime) * 100))
    : 0;

  const partyEntries = [
    { ship: tankShip, roleLabel: 'TANK', icon: Shield, accent: 'cyan' as const },
    { ship: dpsShip, roleLabel: 'DPS', icon: Swords, accent: 'amber' as const },
    { ship: supportShip, roleLabel: 'SUPPORT', icon: HeartHandshake, accent: 'emerald' as const },
  ];

  const isPlayerSupport = playerShipId === supportShip.id;

  return (
    <div className="pointer-events-none flex flex-col items-center gap-1.5 w-full max-w-[540px]">
      {/* Boss Health & Aggro Banner */}
      <div className="pointer-events-auto w-full rounded-xl bg-slate-950/90 backdrop-blur border border-red-900/70 px-3 py-2 shadow-2xl">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <Crosshair className="w-4 h-4 text-red-400 shrink-0" />
            <span className="text-xs font-black tracking-wider text-red-300 uppercase truncate">
              {bossShip.name}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono tabular-nums shrink-0">
            <span className="text-cyan-300">
              SHIELD {bossShield.cur}/{bossShield.max}
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-red-300 font-bold">
              HULL {Math.round(bossShip.hull)}/{bossShip.maxHull} ({bossHullPct}%)
            </span>
          </div>
        </div>

        {/* Boss Hull & Shield Combined Bar */}
        <div className="space-y-1">
          <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-red-950">
            <div
              className="h-full bg-gradient-to-r from-red-700 via-red-500 to-rose-400 transition-all duration-150"
              style={{ width: `${bossHullPct}%` }}
            />
          </div>
          <div className="grid grid-cols-4 gap-1 text-[9px] font-mono tabular-nums text-slate-400">
            {(['front', 'port', 'starboard', 'back'] as const).map((arcKey) => {
              const arc = bossShip.shields[arcKey];
              const pct = arc.max > 0 ? Math.round((arc.current / arc.max) * 100) : 0;
              return (
                <div key={arcKey} className="flex items-center gap-1">
                  <span className="uppercase text-[8px] w-4 text-slate-500">
                    {arcKey === 'front' ? 'F' : arcKey === 'back' ? 'A' : arcKey === 'port' ? 'P' : 'S'}
                  </span>
                  <div className="flex-1 h-1 bg-slate-900 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${pct <= 5 ? 'bg-red-700' : pct < 35 ? 'bg-amber-400' : 'bg-cyan-400'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Obliteration Beam Targeted Attack Cast Bar */}
        {isCharging && (
          <div
            className={`mt-2 p-1.5 rounded-lg border text-[11px] font-mono ${
              targetedAttack.isIntercepted
                ? 'bg-emerald-950/80 border-emerald-500/70 text-emerald-200'
                : 'bg-red-950/90 border-red-500/80 text-red-200'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5 font-bold uppercase tracking-wide">
                {targetedAttack.isIntercepted ? (
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                )}
                <span>
                  {targetedAttack.beamName} &rarr; {supportShip.name}
                </span>
              </div>
              <div className="flex items-center gap-2 tabular-nums">
                <span
                  className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${
                    targetedAttack.isIntercepted
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-red-500/20 text-red-300 border border-red-500/40'
                  }`}
                >
                  {targetedAttack.isIntercepted
                    ? 'TANK INTERCEPTING'
                    : isPlayerSupport
                    ? 'HIDE BEHIND TANK!'
                    : 'SUPPORT EXPOSED'}
                </span>
                <span className="font-black text-xs">{Math.max(0, targetedAttack.chargeTimer).toFixed(1)}s</span>
              </div>
            </div>
            <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-75 ${
                  targetedAttack.isIntercepted ? 'bg-emerald-400' : 'bg-red-500'
                }`}
                style={{ width: `${chargePct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Compact Holy-Trinity Raid Party Strip */}
      <div className="pointer-events-auto grid grid-cols-3 gap-1.5 w-full">
        {partyEntries.map(({ ship, roleLabel, icon: Icon, accent }) => {
          const isPlayer = ship.id === playerShipId;
          const isSelected = ship.id === selectedTargetId;
          const isDead = ship.isDestroyed || ship.hull <= 0;
          const hullPct = Math.max(0, Math.min(100, Math.round((ship.hull / Math.max(1, ship.maxHull)) * 100)));
          const shield = getTotalShield(ship);

          const isBossAggro = bossShip.targetId === ship.id && !isDead;
          const isBeamLocked = isCharging && targetedAttack.targetShipId === ship.id && !isDead;

          const borderCls = isDead
            ? 'border-slate-800 bg-slate-950/75 opacity-60'
            : isPlayer
            ? 'border-cyan-400/80 bg-slate-900/95 ring-1 ring-cyan-400/30'
            : isSelected
            ? 'border-emerald-400/80 bg-slate-900/95'
            : 'border-slate-800 bg-slate-950/90 hover:border-slate-700';

          const roleColor =
            accent === 'cyan' ? 'text-cyan-400' : accent === 'amber' ? 'text-amber-400' : 'text-emerald-400';

          return (
            <div
              key={ship.id}
              onClick={() => !isDead && onSelectTarget(ship.id)}
              className={`rounded-lg border px-2 py-1.5 cursor-pointer transition shadow-lg ${borderCls}`}
              title={`Click to target ${ship.name} (for healing/inspection)`}
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <div className="flex items-center gap-1 min-w-0">
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${roleColor}`} />
                  <span className={`text-[10px] font-black uppercase tracking-wider ${roleColor}`}>
                    {roleLabel}
                  </span>
                  {isPlayer && (
                    <span className="text-[9px] font-mono font-bold text-cyan-200 uppercase">(YOU)</span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {isBeamLocked && (
                    <span className="text-[8px] font-mono font-black px-1 rounded bg-red-600/80 text-white">
                      BEAM
                    </span>
                  )}
                  {isBossAggro && !isBeamLocked && (
                    <span className="text-[8px] font-mono font-bold px-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      AGGRO
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-1 font-mono text-[9px] tabular-nums">
                <div className="flex items-center gap-1">
                  <span className="text-cyan-400 w-6">SHD</span>
                  <div className="flex-1 h-1.5 bg-slate-900 rounded-full overflow-hidden">
                    <div className="h-full bg-cyan-400 transition-all duration-150" style={{ width: `${shield.pct}%` }} />
                  </div>
                  <span className="text-slate-300 w-7 text-right">{shield.pct}%</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-emerald-400 w-6">HUL</span>
                  <div className="flex-1 h-1.5 bg-slate-900 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-150 ${
                        hullPct < 30 ? 'bg-red-500' : hullPct < 60 ? 'bg-amber-400' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${hullPct}%` }}
                    />
                  </div>
                  <span className="text-slate-300 w-7 text-right">{hullPct}%</span>
                </div>
              </div>

              {!isPlayer && !isDead && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTakeControlOfShip(ship.id);
                  }}
                  className="mt-1.5 w-full py-0.5 rounded bg-slate-800 hover:bg-cyan-600 text-[9px] font-mono font-bold text-slate-200 hover:text-white transition flex items-center justify-center gap-1"
                >
                  <Navigation className="w-2.5 h-2.5" />
                  <span>TAKE HELM</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
