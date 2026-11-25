import React, { useState } from 'react';
import { ShipEntity, CarrierDesignId } from '../types';
import { CARRIER_DESIGNS, getCarrierDesign } from '../game/carrierDesigns';
import { Shield, Zap, Flame, Radio, Target, RefreshCw, Crosshair, ArrowDownCircle, Box, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';

interface HangarStatusHUDProps {
  ship: ShipEntity;
  onLaunch?: () => void;
  onRecall?: () => void;
  onDetonate?: () => void;
  onSelectCarrierDesign?: (designId: CarrierDesignId) => void;
}

export const HangarStatusHUD: React.FC<HangarStatusHUDProps> = ({
  ship,
  onLaunch,
  onRecall,
  onDetonate,
  onSelectCarrierDesign,
}) => {
  const [showModelPicker, setShowModelPicker] = useState(false);

  const isCarrier =
    ship.shipClass.modelType === 'carrier' ||
    ship.shipClass.id.includes('carrier') ||
    ship.shipClass.id.includes('aegis') ||
    ship.shipClass.id.includes('hive') ||
    !!ship.hangarState;

  if (!isCarrier) return null;

  const activeDesignId = ship.carrierDesign || ship.shipClass.carrierDesign || 'solaris';
  const activeDesign = getCarrierDesign(activeDesignId);

  const hangarState = ship.hangarState;
  const drones = hangarState?.drones || [];
  const activeCount = drones.filter((d) => d.state === 'active').length;
  const readyCount = drones.filter((d) => d.state === 'docked').length;
  const rebuildingCount = drones.filter((d) => d.state === 'rebuilding').length;

  const weaponsPowerPercent = ship.power?.weapons ?? 50;
  // Rebuild rate formula: 1.0 at W=25% (8.0s), 2.0 at W=100% (4.0s)
  const rebuildRate = 1.0 + Math.max(0, (weaponsPowerPercent - 25) / 75.0);

  return (
    <div className="absolute bottom-4 right-4 z-20 flex flex-col items-end gap-2 select-none pointer-events-auto">
      {/* Carrier 3D Model Quick Switcher Dropdown */}
      {showModelPicker && (
        <div className="bg-slate-900/95 border border-cyan-500/50 rounded-xl p-3 shadow-2xl backdrop-blur-md w-72 text-slate-100 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
              <Box className="w-3.5 h-3.5 text-cyan-400" />
              Select 3D Carrier Hull Variant
            </span>
            <button
              onClick={() => setShowModelPicker(false)}
              className="text-[10px] font-mono text-slate-400 hover:text-slate-200"
            >
              CLOSE ✕
            </button>
          </div>
          <div className="space-y-1.5">
            {CARRIER_DESIGNS.map((design) => {
              const isActive = activeDesignId === design.id;
              return (
                <button
                  key={design.id}
                  onClick={() => {
                    onSelectCarrierDesign?.(design.id);
                    setShowModelPicker(false);
                  }}
                  className={`w-full text-left p-2 rounded-lg border text-xs font-mono transition flex items-center justify-between ${
                    isActive
                      ? 'bg-cyan-950/80 border-cyan-400 text-cyan-300 font-bold ring-1 ring-cyan-400/50'
                      : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800/80 hover:text-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 border border-slate-700"
                      style={{ backgroundColor: design.accentColor }}
                    />
                    <div>
                      <div className="font-bold text-[11px] leading-none">{design.name}</div>
                      <div className="text-[9px] text-slate-400 mt-0.5">{design.launchType}</div>
                    </div>
                  </div>
                  {isActive && (
                    <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 bg-cyan-500 text-slate-950 rounded">
                      ACTIVE
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Primary Hangar Module Window */}
      <div className="bg-slate-900/90 border border-cyan-500/40 rounded-xl p-3 shadow-2xl backdrop-blur-md w-72 text-slate-100">
        {/* Module Header & Active 3D Model Badge */}
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-300">
              Hangar Status & Swarm Control
            </h3>
          </div>
          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
            {activeCount}/6 ACTIVE
          </span>
        </div>

        {/* 3D Model Variant Indicator Bar */}
        <div className="flex items-center justify-between text-[10px] font-mono mb-2.5 p-1.5 rounded bg-slate-950/80 border border-cyan-900/60">
          <div className="flex items-center gap-1.5 overflow-hidden">
            <Box className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="text-slate-400">MODEL:</span>
            <span className="font-bold text-cyan-300 truncate">{activeDesign.name}</span>
          </div>
          <button
            onClick={() => setShowModelPicker(!showModelPicker)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-300 border border-cyan-500/50 text-[9px] font-bold transition shrink-0"
          >
            <span>CHANGE</span>
            {showModelPicker ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {/* 6 Segmented Drone Status Slots */}
        <div className="grid grid-cols-6 gap-1.5 mb-3">
          {Array.from({ length: 6 }).map((_, idx) => {
            const drone = drones[idx];
            const state = drone?.state || 'docked';
            const hp = drone?.hp ?? 160;
            const maxHp = drone?.maxHp ?? 160;
            const hpPercent = Math.max(0, Math.min(100, (hp / maxHp) * 100));
            const rebuildTimeLeft = drone?.rebuildTimer ?? 8.0;

            // Compute rebuilding progress (8.0s down to 0s)
            const rebuildProgress = Math.max(0, Math.min(100, (1 - rebuildTimeLeft / 8.0) * 100));

            return (
              <div
                key={idx}
                className={`relative flex flex-col items-center justify-between p-1.5 rounded-lg border transition ${
                  state === 'active'
                    ? 'bg-emerald-950/60 border-emerald-500/60 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
                    : state === 'docked'
                    ? 'bg-cyan-950/60 border-cyan-500/50'
                    : 'bg-amber-950/40 border-amber-500/50 animate-pulse'
                }`}
              >
                {/* Slot Label */}
                <span className="text-[9px] font-mono font-bold text-slate-400">
                  #{idx + 1}
                </span>

                {/* State Icon / Indicator */}
                <div className="my-1 flex items-center justify-center">
                  {state === 'active' ? (
                    <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 flex items-center justify-center text-[8px] font-bold text-black shadow">
                      ✓
                    </div>
                  ) : state === 'docked' ? (
                    <div className="w-3.5 h-3.5 rounded-full bg-cyan-500 flex items-center justify-center text-[8px] font-bold text-black">
                      H
                    </div>
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                  )}
                </div>

                {/* Status Bar / Rebuild Time */}
                {state === 'active' ? (
                  <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden mt-0.5">
                    <div
                      className={`h-full transition-all duration-300 ${
                        hpPercent > 50 ? 'bg-emerald-400' : hpPercent > 25 ? 'bg-amber-400' : 'bg-red-500'
                      }`}
                      style={{ width: `${hpPercent}%` }}
                    />
                  </div>
                ) : state === 'rebuilding' ? (
                  <span className="text-[8px] font-mono font-bold text-amber-400">
                    {rebuildTimeLeft.toFixed(1)}s
                  </span>
                ) : (
                  <span className="text-[8px] font-mono font-bold text-cyan-400">
                    READY
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Rebuild Speed Indicator (Power Shunting) */}
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-2 px-1 py-0.5 bg-slate-950/60 rounded border border-slate-800">
          <span>REBUILD RATE:</span>
          <span className="text-amber-300 font-bold">
            {(8.0 / rebuildRate).toFixed(1)}s ({rebuildRate.toFixed(1)}x SPEED @ W={weaponsPowerPercent}%)
          </span>
        </div>

        {/* Command Buttons & Hotkeys */}
        <div className="grid grid-cols-2 gap-1.5 pt-1">
          <button
            onClick={onLaunch}
            disabled={readyCount === 0}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-mono font-bold transition border ${
              readyCount > 0
                ? 'bg-cyan-600 hover:bg-cyan-500 text-white border-cyan-400 shadow-md active:scale-95'
                : 'bg-slate-800/60 text-slate-500 border-slate-700 cursor-not-allowed'
            }`}
          >
            <ArrowDownCircle className="w-3.5 h-3.5" />
            <span>LAUNCH [SPACE]</span>
          </button>

          <button
            onClick={onRecall}
            disabled={activeCount === 0}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-mono font-bold transition border ${
              activeCount > 0
                ? 'bg-blue-600 hover:bg-blue-500 text-white border-blue-400 shadow-md active:scale-95'
                : 'bg-slate-800/60 text-slate-500 border-slate-700 cursor-not-allowed'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>RECALL [R]</span>
          </button>
        </div>

        <div className="mt-1.5">
          <button
            onClick={onDetonate}
            disabled={activeCount === 0}
            className={`w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-mono font-bold transition border ${
              activeCount > 0
                ? 'bg-red-600 hover:bg-red-500 text-white border-red-400 shadow-lg shadow-red-900/40 active:scale-95 animate-pulse'
                : 'bg-slate-800/60 text-slate-500 border-slate-700 cursor-not-allowed'
            }`}
          >
            <Flame className="w-4 h-4 text-amber-300" />
            <span>SWARM DETONATION [E] (250 AoE)</span>
          </button>
        </div>

        {/* Waypoint Command Hint */}
        <div className="mt-2 text-[10px] font-mono text-cyan-400/90 text-center flex items-center justify-center gap-1 border-t border-slate-800/80 pt-1.5">
          <Target className="w-3 h-3 text-cyan-400" />
          <span>RIGHT-CLICK ARENA GRID TO SET WAYPOINT</span>
        </div>
      </div>
    </div>
  );
};
