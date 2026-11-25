import React from 'react';
import { PowerLevels, PowerPreset } from '../types';
import { Zap, Shield, Navigation, Radio, Sliders } from 'lucide-react';

interface PowerManagementWidgetProps {
  power: PowerLevels;
  preset: PowerPreset;
  onSelectPreset: (preset: PowerPreset) => void;
  onPowerChange: (subsystem: keyof PowerLevels, value: number) => void;
}

export const PowerManagementWidget: React.FC<PowerManagementWidgetProps> = ({
  power,
  preset,
  onSelectPreset,
  onPowerChange,
}) => {
  const presets: { id: PowerPreset; label: string; color: string; icon: React.ElementType }[] = [
    { id: 'weapons', label: 'WEAPONS', color: 'bg-red-500/20 text-red-400 border-red-500/50 hover:bg-red-500/30', icon: Zap },
    { id: 'shields', label: 'SHIELDS', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50 hover:bg-cyan-500/30', icon: Shield },
    { id: 'engines', label: 'ENGINES', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 hover:bg-emerald-500/30', icon: Navigation },
    { id: 'auxiliary', label: 'AUX', color: 'bg-amber-500/20 text-amber-400 border-amber-500/50 hover:bg-amber-500/30', icon: Radio },
    { id: 'balanced', label: 'BALANCED', color: 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700', icon: Sliders },
  ];

  return (
    <div className="p-4 rounded-xl bg-slate-900/90 backdrop-blur border border-slate-800 text-slate-100 shadow-2xl w-80">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-400" />
          <span className="font-semibold text-sm tracking-wide text-slate-200 uppercase">Power Allocation</span>
        </div>
        <span className="text-xs font-mono text-slate-400">STO Core</span>
      </div>

      {/* Quick Power Presets */}
      <div className="grid grid-cols-5 gap-1.5 mb-4">
        {presets.map((p) => {
          const Icon = p.icon;
          const isActive = preset === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onSelectPreset(p.id)}
              className={`flex flex-col items-center justify-center p-2 rounded-lg border text-[10px] font-bold tracking-wider transition ${
                p.color
              } ${isActive ? 'ring-2 ring-amber-400/80 font-black' : 'opacity-80'}`}
              title={`Set ${p.label} power preset`}
            >
              <Icon className="w-3.5 h-3.5 mb-1" />
              <span>{p.label.slice(0, 3)}</span>
            </button>
          );
        })}
      </div>

      {/* Power Sliders */}
      <div className="space-y-2.5">
        {/* Weapons Power */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-red-400 font-semibold">
              <Zap className="w-3.5 h-3.5" /> Weapons Power
            </span>
            <span className="font-mono text-red-300 font-bold">{power.weapons} PWR</span>
          </div>
          <input
            type="range"
            min={25}
            max={100}
            value={power.weapons}
            onChange={(e) => onPowerChange('weapons', parseInt(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-red-500"
          />
        </div>

        {/* Shields Power */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-cyan-400 font-semibold">
              <Shield className="w-3.5 h-3.5" /> Shields Power
            </span>
            <span className="font-mono text-cyan-300 font-bold">{power.shields} PWR</span>
          </div>
          <input
            type="range"
            min={25}
            max={100}
            value={power.shields}
            onChange={(e) => onPowerChange('shields', parseInt(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
          />
        </div>

        {/* Engines Power */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
              <Navigation className="w-3.5 h-3.5" /> Engines Power
            </span>
            <span className="font-mono text-emerald-300 font-bold">{power.engines} PWR</span>
          </div>
          <input
            type="range"
            min={25}
            max={100}
            value={power.engines}
            onChange={(e) => onPowerChange('engines', parseInt(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
          />
        </div>

        {/* Auxiliary Power */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-amber-400 font-semibold">
              <Radio className="w-3.5 h-3.5" /> Auxiliary Power
            </span>
            <span className="font-mono text-amber-300 font-bold">{power.auxiliary} PWR</span>
          </div>
          <input
            type="range"
            min={25}
            max={100}
            value={power.auxiliary}
            onChange={(e) => onPowerChange('auxiliary', parseInt(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />
        </div>
      </div>
    </div>
  );
};
