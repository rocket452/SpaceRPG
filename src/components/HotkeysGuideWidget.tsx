import React, { useState, useEffect } from 'react';
import { Keyboard, ChevronDown, ChevronUp, Zap, Shield, Target, Navigation, Disc, Crosshair, X } from 'lucide-react';
import { ShipEntity } from '../types';

interface HotkeysGuideWidgetProps {
  ship: ShipEntity | null;
  defaultExpanded?: boolean;
}

export const HotkeysGuideWidget: React.FC<HotkeysGuideWidgetProps> = ({
  ship,
  defaultExpanded = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultExpanded);

  // Keyboard shortcut listener for 'K' or '?' to toggle hotkey menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing inside an input or textarea
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      if (e.code === 'KeyK' || e.key === '?') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!ship) return null;

  const shipClassId = ship.shipClass?.id || '';
  const isDragoon = shipClassId.includes('dragoon') || shipClassId.includes('interceptor');
  const isCarrier = shipClassId.includes('carrier') || shipClassId.includes('aegis');
  const isBrawler = shipClassId.includes('brawler') || shipClassId.includes('dreadnought');
  const isSupport = shipClassId.includes('support') || ship.shipClass?.modelType === 'support';

  // Abilities mapping
  const abilities = ship.abilities || [];

  return (
    <div className="relative">
      {/* Collapsible Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`px-3 py-1.5 rounded-xl border transition-all flex items-center gap-2 shadow-lg backdrop-blur text-xs font-bold ${
          isOpen
            ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 shadow-amber-500/10'
            : 'bg-slate-900/90 hover:bg-slate-800/90 border-slate-700/80 text-slate-200 hover:text-white'
        }`}
        title="Toggle Keyboard Hotkeys Reference (Key: K)"
      >
        <Keyboard className="w-4 h-4 text-amber-400" />
        <span className="tracking-wide">HOTKEYS</span>
        <kbd className="px-1 py-0.5 rounded bg-slate-950 border border-slate-700 text-[10px] font-mono text-amber-400">
          K
        </kbd>
        {isOpen ? (
          <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        )}
      </button>

      {/* Expanded Hotkeys Guide Panel */}
      {isOpen && (
        <div className="absolute top-11 left-0 z-50 w-80 sm:w-96 p-4 rounded-2xl bg-slate-950/95 backdrop-blur-xl border border-amber-500/30 text-slate-100 shadow-2xl shadow-black/80 origin-top-left animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <Keyboard className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-black tracking-widest uppercase text-slate-100 flex items-center gap-1.5">
                  COMMAND HOTKEYS
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono border border-amber-500/40">
                    {ship.name || 'CURRENT SHIP'}
                  </span>
                </h3>
                <p className="text-[10px] text-slate-400 font-mono">
                  Tactical controls for {ship.shipClass?.name || 'Active Ship'}
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Close Guide"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content Sections */}
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1 text-xs">
            {/* SECTION 1: SHIP-SPECIFIC COMBAT CONTROLS */}
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-cyan-500/30 space-y-2">
              <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-[11px] uppercase tracking-wider">
                <Zap className="w-3.5 h-3.5" />
                <span>
                  {isDragoon
                    ? 'DRAGOON SPECIFIC COMMANDS'
                    : isCarrier
                    ? 'CARRIER HANGAR COMMANDS'
                    : isBrawler
                    ? 'BRAWLER TACTICAL COMMANDS'
                    : isSupport
                    ? 'SANCTUARY SUPPORT COMMANDS'
                    : 'SHIP WEAPON & UTILITY COMMANDS'}
                </span>
              </div>

              <div className="space-y-1.5 font-mono">
                {isDragoon && (
                  <>
                    <div className="flex items-center justify-between bg-slate-950/60 p-1.5 rounded border border-amber-500/40">
                      <div className="flex items-center gap-1.5">
                        <kbd className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400 text-amber-300 font-bold text-xs shadow-sm">
                          HOLD E
                        </kbd>
                        <span className="text-slate-200 text-xs font-sans font-semibold">
                          Charge Bow Plasma Ball
                        </span>
                      </div>
                      <span className="text-[10px] text-amber-400 font-sans">
                        Release to launch
                      </span>
                    </div>

                    <div className="flex items-center justify-between bg-slate-950/40 p-1.5 rounded border border-slate-800">
                      <div className="flex items-center gap-1.5">
                        <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 text-slate-200 font-bold text-xs">
                          SPACE
                        </kbd>
                        <span className="text-slate-200 text-xs font-sans">
                          Omnidirectional Phaser Stream
                        </span>
                      </div>
                      <span className="text-[10px] text-cyan-400 font-sans">360° Arc</span>
                    </div>

                    <div className="flex items-center justify-between bg-slate-950/40 p-1.5 rounded border border-slate-800">
                      <div className="flex items-center gap-1.5">
                        <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 text-slate-200 font-bold text-xs">
                          Q
                        </kbd>
                        <span className="text-slate-200 text-xs font-sans">Vector Burst</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-sans">Momentum Dodge</span>
                    </div>
                  </>
                )}

                {isCarrier && (
                  <>
                    <div className="flex items-center justify-between bg-slate-950/60 p-1.5 rounded border border-cyan-500/40">
                      <div className="flex items-center gap-1.5">
                        <kbd className="px-2 py-0.5 rounded bg-cyan-500/20 border border-cyan-400 text-cyan-300 font-bold text-xs">
                          SPACE
                        </kbd>
                        <span className="text-slate-200 text-xs font-sans font-semibold">
                          Launch Attack Drone
                        </span>
                      </div>
                      <span className="text-[10px] text-cyan-400 font-sans">Hangar Bay</span>
                    </div>

                    <div className="flex items-center justify-between bg-slate-950/40 p-1.5 rounded border border-slate-800">
                      <div className="flex items-center gap-1.5">
                        <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 text-slate-200 font-bold text-xs">
                          R
                        </kbd>
                        <span className="text-slate-200 text-xs font-sans">Recall Drone Swarm</span>
                      </div>
                      <span className="text-[10px] text-emerald-400 font-sans">Dock & Repair</span>
                    </div>
                  </>
                )}

                {isBrawler && (
                  <>
                    <div className="flex items-center justify-between bg-slate-950/60 p-1.5 rounded border border-amber-500/40">
                      <div className="flex items-center gap-1.5">
                        <kbd className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400 text-amber-300 font-bold text-xs">
                          C
                        </kbd>
                        <span className="text-slate-200 text-xs font-sans font-semibold">
                          Launch Guided Ordnance Missile
                        </span>
                      </div>
                      <span className="text-[10px] text-amber-400 font-sans">
                        Zoning Barrier
                      </span>
                    </div>

                    <div className="flex items-center justify-between bg-slate-950/60 p-1.5 rounded border border-amber-500/30">
                      <div className="flex items-center gap-1.5">
                        <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-amber-400/60 text-amber-300 font-bold text-[11px]">
                          RIGHT CLICK
                        </kbd>
                        <span className="text-slate-200 text-xs font-sans font-semibold">
                          Guide Active Missile Vector
                        </span>
                      </div>
                      <span className="text-[10px] text-amber-400 font-sans">
                        Steer Map
                      </span>
                    </div>

                    <div className="flex items-center justify-between bg-slate-950/40 p-1.5 rounded border border-amber-500/30">
                      <div className="flex items-center gap-1.5">
                        <kbd className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400 text-amber-300 font-bold text-xs">
                          Q
                        </kbd>
                        <span className="text-slate-200 text-xs font-sans font-semibold">
                          Deploy Magnetic Mine
                        </span>
                      </div>
                      <span className="text-[10px] text-amber-400 font-sans">Gravity Hazard</span>
                    </div>

                    <div className="flex items-center justify-between bg-slate-950/40 p-1.5 rounded border border-slate-800">
                      <div className="flex items-center gap-1.5">
                        <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 text-slate-200 font-bold text-xs">
                          SPACE
                        </kbd>
                        <span className="text-slate-200 text-xs font-sans">
                          Fore Shield-Stripper Beam
                        </span>
                      </div>
                      <span className="text-[10px] text-emerald-400 font-sans">Fore Arc</span>
                    </div>

                    <div className="flex items-center justify-between bg-slate-950/60 p-1.5 rounded border border-purple-500/40">
                      <div className="flex items-center gap-1.5">
                        <kbd className="px-2 py-0.5 rounded bg-purple-500/20 border border-purple-400 text-purple-300 font-bold text-xs">
                          E
                        </kbd>
                        <span className="text-slate-200 text-xs font-sans font-semibold">
                          Port & Starboard Pulse Batteries
                        </span>
                      </div>
                      <span className="text-[10px] text-purple-400 font-sans">Flank Arcs</span>
                    </div>
                  </>
                )}

                {isSupport && (
                  <>
                    <div className="flex items-center justify-between bg-slate-950/60 p-1.5 rounded border border-cyan-500/40">
                      <div className="flex items-center gap-1.5">
                        <kbd className="px-2 py-0.5 rounded bg-cyan-500/20 border border-cyan-400 text-cyan-300 font-bold text-xs">
                          SPACE
                        </kbd>
                        <span className="text-slate-200 text-xs font-sans font-semibold">
                          Shield Transfer Beam
                        </span>
                      </div>
                      <span className="text-[10px] text-cyan-400 font-sans">Restores Shields</span>
                    </div>

                    <div className="flex items-center justify-between bg-slate-950/60 p-1.5 rounded border border-emerald-500/40">
                      <div className="flex items-center gap-1.5">
                        <kbd className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-400 text-emerald-300 font-bold text-xs">
                          E
                        </kbd>
                        <span className="text-slate-200 text-xs font-sans font-semibold">
                          Nanite Hull Repair Beam
                        </span>
                      </div>
                      <span className="text-[10px] text-emerald-400 font-sans">Repairs Hull</span>
                    </div>

                    <div className="flex items-center justify-between bg-slate-950/40 p-1.5 rounded border border-amber-500/30">
                      <div className="flex items-center gap-1.5">
                        <kbd className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400 text-amber-300 font-bold text-xs">
                          Q
                        </kbd>
                        <span className="text-slate-200 text-xs font-sans font-semibold">
                          Aegis Restoration Wave
                        </span>
                      </div>
                      <span className="text-[10px] text-amber-400 font-sans">AoE Fleet Heal</span>
                    </div>

                    <div className="flex items-center justify-between bg-slate-950/40 p-1.5 rounded border border-slate-800">
                      <div className="flex items-center gap-1.5">
                        <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 text-slate-200 font-bold text-xs">
                          T
                        </kbd>
                        <span className="text-slate-200 text-xs font-sans">Defensive Light Phaser</span>
                      </div>
                      <span className="text-[10px] text-purple-400 font-sans">360° Arc</span>
                    </div>
                  </>
                )}

                {!isDragoon && !isCarrier && !isBrawler && !isSupport && (
                  <>
                    <div className="flex items-center justify-between bg-slate-950/40 p-1.5 rounded border border-slate-800">
                      <div className="flex items-center gap-1.5">
                        <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 text-slate-200 font-bold text-xs">
                          SPACE
                        </kbd>
                        <span className="text-slate-200 text-xs font-sans">
                          Fire Primary Weapon Group
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between bg-slate-950/40 p-1.5 rounded border border-slate-800">
                      <div className="flex items-center gap-1.5">
                        <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 text-slate-200 font-bold text-xs">
                          E
                        </kbd>
                        <span className="text-slate-200 text-xs font-sans">
                          Fire Secondary Battery / Torpedoes
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* SECTION 2: BRIDGE OFFICER ABILITIES */}
            {abilities.length > 0 && (
              <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[11px] uppercase tracking-wider">
                  <Disc className="w-3.5 h-3.5" />
                  <span>BRIDGE OFFICER ABILITIES</span>
                </div>

                <div className="grid grid-cols-1 gap-1.5">
                  {abilities.map((ab, idx) => {
                    const keys = ['Q', 'R', 'F', 'C', 'V', 'G'];
                    const hotkey = keys[idx] || `${idx + 1}`;
                    return (
                      <div
                        key={ab.id}
                        className="flex items-center justify-between bg-slate-950/50 p-1.5 rounded border border-slate-800/80"
                      >
                        <div className="flex items-center gap-2">
                          <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-amber-500/40 text-amber-300 font-bold text-xs">
                            {hotkey}
                          </kbd>
                          <span className="text-slate-200 text-xs font-sans font-medium">
                            {ab.name}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {ab.cooldown}s CD
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SECTION 3: STEERING & HELM */}
            <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
              <div className="flex items-center gap-1.5 text-indigo-400 font-bold text-[11px] uppercase tracking-wider">
                <Navigation className="w-3.5 h-3.5" />
                <span>FLIGHT & STEERING CONTROLS</span>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <div className="flex items-center gap-1.5 bg-slate-950/50 p-1.5 rounded border border-slate-800">
                  <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-600 text-slate-200 font-bold text-[11px]">
                    W / S
                  </kbd>
                  <span className="text-slate-300 text-[11px] font-sans">Speed Up / Slow</span>
                </div>

                <div className="flex items-center gap-1.5 bg-slate-950/50 p-1.5 rounded border border-slate-800">
                  <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-600 text-slate-200 font-bold text-[11px]">
                    A / D
                  </kbd>
                  <span className="text-slate-300 text-[11px] font-sans">Yaw Steering</span>
                </div>

                <div className="flex items-center gap-1.5 bg-slate-950/50 p-1.5 rounded border border-slate-800">
                  <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-600 text-slate-200 font-bold text-[11px]">
                    X
                  </kbd>
                  <span className="text-slate-300 text-[11px] font-sans">All Stop</span>
                </div>

                <div className="flex items-center gap-1.5 bg-slate-950/50 p-1.5 rounded border border-slate-800">
                  <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-600 text-slate-200 font-bold text-[11px]">
                    TAB / H
                  </kbd>
                  <span className="text-slate-300 text-[11px] font-sans">Cycle Target</span>
                </div>
              </div>
            </div>

            {/* SECTION 4: POWER GRID & SHIELD ARCS */}
            <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
              <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[11px] uppercase tracking-wider">
                <Shield className="w-3.5 h-3.5" />
                <span>POWER PRESETS & SHIELD REROUTING</span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
                <div className="flex items-center gap-1.5 bg-slate-950/50 p-1.5 rounded border border-slate-800">
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 text-emerald-400 font-bold">
                    1
                  </kbd>
                  <span className="text-slate-300 font-sans">Max Weapons</span>
                </div>

                <div className="flex items-center gap-1.5 bg-slate-950/50 p-1.5 rounded border border-slate-800">
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 text-emerald-400 font-bold">
                    2
                  </kbd>
                  <span className="text-slate-300 font-sans">Max Engines</span>
                </div>

                <div className="flex items-center gap-1.5 bg-slate-950/50 p-1.5 rounded border border-slate-800">
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 text-emerald-400 font-bold">
                    3
                  </kbd>
                  <span className="text-slate-300 font-sans">Max Shields</span>
                </div>

                <div className="flex items-center gap-1.5 bg-slate-950/50 p-1.5 rounded border border-slate-800">
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 text-emerald-400 font-bold">
                    4
                  </kbd>
                  <span className="text-slate-300 font-sans">Equalize Power</span>
                </div>
              </div>

              <div className="pt-1 border-t border-slate-800/80">
                <div className="flex items-center justify-between bg-slate-950/50 p-1.5 rounded border border-slate-800 text-[11px]">
                  <div className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-600 text-amber-300 font-bold">
                      NUM 8/2/4/6
                    </kbd>
                  </div>
                  <span className="text-slate-300 font-sans">
                    Reroute Shields (Fwd/Rear/Port/Stbd)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
