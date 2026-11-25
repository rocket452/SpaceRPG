import React, { useState } from 'react';
import { CombatLogEntry } from '../types';
import { Terminal, ChevronDown, ChevronUp } from 'lucide-react';

interface CombatLogWidgetProps {
  logs: CombatLogEntry[];
}

export const CombatLogWidget: React.FC<CombatLogWidgetProps> = ({ logs }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const getLogStyle = (log: CombatLogEntry) => {
    const { type, source, text } = log;

    // 1. Damage Taken (Shields/Hull when player is hit) -> Soft Crimson/Orange
    if (source === 'enemy' || text.includes('Vanguard Brawler absorbed') || text.includes('THE VANGUARD BRAWLER absorbed')) {
      if (type === 'damage_hull') return 'text-rose-400 font-bold';
      return 'text-orange-400 font-semibold';
    }

    // 2. Damage Dealt (Player attacking target) -> Bright Cyan/Yellow
    if (source === 'player' || type === 'damage_shield' || type === 'damage_hull') {
      if (type === 'damage_hull') return 'text-yellow-300 font-bold';
      return 'text-cyan-300 font-semibold';
    }

    // 3. System / Power Shunt Alerts -> Electric Blue
    if (
      type === 'system' ||
      type === 'power_shunt' ||
      text.startsWith('POWER SHUNT') ||
      text.startsWith('SHIELD EQUALIZE') ||
      text.startsWith('Tactical systems') ||
      text.startsWith('[COMMAND')
    ) {
      return 'text-blue-400 font-medium';
    }

    // 4. Kills & Destruction -> Vibrant Purple
    if (type === 'kill') {
      return 'text-purple-300 font-black animate-pulse';
    }

    // 5. Abilities & Heals -> Amber / Emerald
    if (type === 'ability') return 'text-amber-400 font-bold';
    if (type === 'heal') return 'text-emerald-400 font-bold';

    return 'text-slate-300';
  };

  return (
    <div className="rounded-xl bg-slate-900/90 backdrop-blur border border-slate-800 text-slate-100 shadow-2xl w-80 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 border-b border-slate-800 flex items-center justify-between text-xs font-semibold tracking-wide text-slate-300 hover:bg-slate-800/50 transition"
      >
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <span className="uppercase text-[11px]">Tactical Telemetry</span>
        </div>
        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
      </button>

      {/* Log Entries */}
      <div
        className={`p-3 space-y-1.5 font-mono text-[10px] overflow-y-auto transition-all ${
          isExpanded ? 'h-64' : 'h-24'
        }`}
      >
        {logs.length === 0 ? (
          <div className="text-slate-600 italic text-center py-4">No tactical events logged...</div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex items-start gap-1.5 leading-tight">
              <span className="text-slate-600 shrink-0">[{log.timestamp}]</span>
              <span className={getLogStyle(log)}>{log.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
