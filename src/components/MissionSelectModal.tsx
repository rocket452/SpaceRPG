import React from 'react';
import { MISSIONS } from '../game/shipPresets';
import { Mission } from '../types';
import { Crosshair, ShieldAlert, Skull, Check, X } from 'lucide-react';

import { RaidRole } from '../game/BossRaidModeController';

interface MissionSelectModalProps {
  currentMission: Mission;
  selectedRaidRole: RaidRole;
  onSelectMission: (mission: Mission) => void;
  onSelectRaidRole: (role: RaidRole) => void;
  onClose: () => void;
}

export const MissionSelectModal: React.FC<MissionSelectModalProps> = ({
  currentMission,
  selectedRaidRole,
  onSelectMission,
  onSelectRaidRole,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full p-6 text-slate-100 shadow-2xl overflow-y-auto max-h-[90vh] transform scale-[0.91] origin-center">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-bold tracking-wide uppercase text-amber-400">Sector Mission Dispatch</h2>
            <p className="text-xs text-slate-400">Select tactical objective sector</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Missions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {MISSIONS.map((mission) => {
            const isSelected = currentMission.id === mission.id;
            return (
              <div
                key={mission.id}
                onClick={() => onSelectMission(mission)}
                className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
                  isSelected
                    ? 'bg-amber-950/40 border-amber-500 ring-2 ring-amber-500/50'
                    : 'bg-slate-950/60 border-slate-800 hover:bg-slate-800/50'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm text-slate-100 uppercase">{mission.title}</span>
                    {isSelected && <Check className="w-4 h-4 text-amber-400" />}
                  </div>

                  <div className="inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase mb-2 bg-slate-800 text-amber-400 border border-amber-500/30">
                    Difficulty: {mission.difficulty}
                  </div>

                  <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">{mission.description}</p>
                </div>

                <div className="space-y-2 pt-3 border-t border-slate-800">
                  {mission.isBossRaidMode && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="p-2 rounded-lg bg-slate-900/90 border border-slate-700/80 mb-2"
                    >
                      <span className="text-[10px] font-mono font-bold text-cyan-300 uppercase block mb-1.5">
                        Starting Raid Role (Switchable Mid-Battle)
                      </span>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(
                          [
                            { id: 'tank', label: 'Tank: Vanguard' },
                            { id: 'dps', label: 'DPS: Dragoon' },
                            { id: 'support', label: 'Healer: Sanctuary' },
                          ] as const
                        ).map((r) => (
                          <button
                            key={r.id}
                            onClick={() => {
                              onSelectRaidRole(r.id);
                              if (!isSelected) onSelectMission(mission);
                            }}
                            className={`px-2 py-1 rounded text-[10px] font-bold transition border ${
                              selectedRaidRole === r.id && isSelected
                                ? 'bg-cyan-500 text-slate-950 border-cyan-300'
                                : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
                            }`}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-1 text-[10px] text-slate-400">
                    <span className="font-bold text-slate-300 block mb-1">Objectives:</span>
                    {mission.objectives.map((obj, i) => (
                      <div key={i} className="flex items-start gap-1">
                        <span className="text-amber-400">►</span>
                        <span>{obj}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Start Mission Button */}
        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 font-bold text-slate-950 tracking-wide text-sm transition shadow-lg shadow-amber-500/20"
          >
            ENGAGE WARP & BEGIN MISSION
          </button>
        </div>
      </div>
    </div>
  );
};
