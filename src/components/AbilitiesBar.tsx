import React from 'react';
import { Ability } from '../types';
import { Shield, Zap, Flame, Navigation, Radio, Activity } from 'lucide-react';

interface AbilitiesBarProps {
  abilities: Ability[];
  onUseAbility: (id: string) => void;
}

export const AbilitiesBar: React.FC<AbilitiesBarProps> = ({ abilities, onUseAbility }) => {
  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'Shield': return Shield;
      case 'Zap': return Zap;
      case 'Flame': return Flame;
      case 'Navigation': return Navigation;
      case 'Radio': return Radio;
      case 'Activity': return Activity;
      default: return Shield;
    }
  };

  return (
    <div className="p-3 rounded-xl bg-slate-900/90 backdrop-blur border border-slate-800 text-slate-100 shadow-2xl flex items-center gap-2 max-w-xl">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 shrink-0">
        BOff Skills
      </div>

      <div className="flex items-center gap-2 overflow-x-auto py-1">
        {abilities.map((ability, index) => {
          const Icon = getIcon(ability.iconName);
          const isReady = ability.currentCooldown <= 0;
          const cdPercent = isReady ? 0 : (ability.currentCooldown / ability.cooldown) * 100;
          const wasdHotkeys = ['Q', 'R', 'F', 'C', 'V', 'G'];
          const hotkeyLabel = wasdHotkeys[index] || `${index + 1}`;

          return (
            <button
              key={ability.id}
              onClick={() => onUseAbility(ability.id)}
              disabled={!isReady}
              className={`relative px-3 py-2 rounded-lg border text-left transition flex items-center gap-2 min-w-[125px] overflow-hidden ${
                !isReady
                  ? 'bg-slate-950/80 border-slate-800 opacity-60 cursor-not-allowed text-slate-500'
                  : ability.category === 'tactical'
                  ? 'bg-red-950/40 border-red-800/80 hover:bg-red-900/60 text-red-200'
                  : ability.category === 'engineering'
                  ? 'bg-amber-950/40 border-amber-800/80 hover:bg-amber-900/60 text-amber-200'
                  : 'bg-cyan-950/40 border-cyan-800/80 hover:bg-cyan-900/60 text-cyan-200'
              }`}
              title={`${ability.name} (Hotkey [${hotkeyLabel}] / [${index + 3}]): ${ability.description}`}
            >
              <div className="relative shrink-0">
                <Icon className="w-4 h-4" />
                <span className="absolute -top-1.5 -left-1.5 px-1 py-0.2 text-[8px] font-mono font-bold bg-slate-950 text-cyan-300 border border-slate-700 rounded shadow-xs">
                  {hotkeyLabel}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold tracking-wider uppercase truncate">
                  {ability.name}
                </span>
                <span className="text-[9px] font-mono opacity-80">
                  {isReady ? 'READY' : `${ability.currentCooldown.toFixed(1)}s`}
                </span>
              </div>

              {/* Cooldown Overlay */}
              {!isReady && (
                <div
                  className="absolute bottom-0 left-0 right-0 bg-slate-700/40 transition-all"
                  style={{ height: `${cdPercent}%` }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
