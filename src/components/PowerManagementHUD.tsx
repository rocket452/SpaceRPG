import React, { useEffect, useState } from 'react';
import {
  PowerAllocationManager,
  PowerProfile,
  POWER_PROFILES,
  PowerDistribution,
  SystemPowerModifiers,
} from '../game/PowerAllocationManager';
import { Zap, Navigation, Shield } from 'lucide-react';

interface PowerManagementHUDProps {
  controller: PowerAllocationManager;
  onSelectProfile?: (profile: PowerProfile) => void;
}

export const PowerManagementHUD: React.FC<PowerManagementHUDProps> = ({
  controller,
  onSelectProfile,
}) => {
  const [profile, setProfile] = useState<PowerProfile>(controller.getActiveProfile());
  const [distribution, setDistribution] = useState<PowerDistribution>(controller.getPowerDistribution());
  const [modifiers, setModifiers] = useState<SystemPowerModifiers>(controller.getModifiers());
  const [isShunting, setIsShunting] = useState<boolean>(controller.isShunting);

  useEffect(() => {
    // Event listener subscription to power changes
    const unsubscribe = controller.subscribe((newProfile, newDist, newMods) => {
      setProfile(newProfile);
      setDistribution(newDist);
      setModifiers(newMods);
      setIsShunting(true);
      setTimeout(() => setIsShunting(false), 200);
    });

    // 60 FPS animation ticker for smooth 0.15s LERP gauge movement
    const interval = setInterval(() => {
      setDistribution(controller.getPowerDistribution());
      setModifiers(controller.getModifiers());
      setIsShunting(controller.isShunting);
    }, 16);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [controller]);

  const handleProfileClick = (p: PowerProfile) => {
    controller.setProfile(p, true);
    if (onSelectProfile) onSelectProfile(p);
  };

  // Triangle Gauge Geometry Math (Center 50, 42; Radius 30)
  const cx = 50;
  const cy = 42;
  const radius = 30;

  // Vertex Coordinates:
  // Top: Weapons
  const topV = { x: cx, y: cy - radius };
  // Bottom Left: Engines
  const botLeftV = { x: cx - radius * Math.cos(Math.PI / 6), y: cy + radius * Math.sin(Math.PI / 6) };
  // Bottom Right: Shields
  const botRightV = { x: cx + radius * Math.cos(Math.PI / 6), y: cy + radius * Math.sin(Math.PI / 6) };

  // Calculate Weighted Barycentric Position for Power Node
  const totalPower = distribution.weapons + distribution.engines + distribution.shields;
  const wWep = distribution.weapons / Math.max(1, totalPower);
  const wEng = distribution.engines / Math.max(1, totalPower);
  const wShd = distribution.shields / Math.max(1, totalPower);

  const nodeX = wWep * topV.x + wEng * botLeftV.x + wShd * botRightV.x;
  const nodeY = wWep * topV.y + wEng * botLeftV.y + wShd * botRightV.y;

  const currentDef = POWER_PROFILES[profile];

  return (
    <div
      className={`p-3.5 rounded-xl bg-slate-900/95 backdrop-blur-md border text-slate-100 shadow-2xl w-80 transition-all duration-150 select-none ${
        isShunting
          ? 'border-amber-400/80 ring-2 ring-amber-400/90 shadow-amber-500/30 scale-[1.02]'
          : 'border-slate-800'
      }`}
    >
      {/* Header & Active State Badge */}
      <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400 animate-pulse" />
          <span className="font-bold text-xs tracking-wider uppercase text-slate-200">
            TRI-POWER REACTOR
          </span>
        </div>
        <div
          className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-black border transition-all duration-200 ${
            profile === 'weapons'
              ? 'bg-[#FF6B00]/20 text-[#FF6B00] border-[#FF6B00] shadow-[#FF6B00]/30 shadow-md ring-1 ring-[#FF6B00]/50'
              : profile === 'engines'
              ? 'bg-[#00E5FF]/20 text-[#00E5FF] border-[#00E5FF] shadow-[#00E5FF]/30 shadow-md ring-1 ring-[#00E5FF]/50'
              : profile === 'shields'
              ? 'bg-[#00FF66]/20 text-[#00FF66] border-[#00FF66] shadow-[#00FF66]/30 shadow-md ring-1 ring-[#00FF66]/50'
              : 'bg-slate-800/90 text-amber-300 border-amber-500/60 ring-1 ring-amber-400/30'
          }`}
        >
          {currentDef.label}
        </div>
      </div>

      <div className="flex gap-3 items-center mb-3">
        {/* Triangular 2D Power Grid SVG Vector Gauge */}
        <div className="relative shrink-0 w-24 h-24 bg-slate-950/90 rounded-lg border border-slate-800/90 p-1 flex items-center justify-center">
          <svg viewBox="0 0 100 85" className="w-full h-full overflow-visible">
            {/* Outer Grid Triangle */}
            <polygon
              points={`${topV.x},${topV.y} ${botLeftV.x},${botLeftV.y} ${botRightV.x},${botRightV.y}`}
              fill="rgba(15, 23, 42, 0.7)"
              stroke="rgba(71, 85, 105, 0.7)"
              strokeWidth="1.5"
            />
            {/* Center Axes Lines */}
            <line x1={cx} y1={cy} x2={topV.x} y2={topV.y} stroke="#FF6B00" strokeWidth="1" strokeOpacity="0.4" strokeDasharray="2 2" />
            <line x1={cx} y1={cy} x2={botLeftV.x} y2={botLeftV.y} stroke="#00E5FF" strokeWidth="1" strokeOpacity="0.4" strokeDasharray="2 2" />
            <line x1={cx} y1={cy} x2={botRightV.x} y2={botRightV.y} stroke="#00FF66" strokeWidth="1" strokeOpacity="0.4" strokeDasharray="2 2" />

            {/* Vertex Labels */}
            <text x={topV.x} y={topV.y - 4} fill="#FF6B00" fontSize="8" fontWeight="bold" textAnchor="middle">W</text>
            <text x={botLeftV.x - 3} y={botLeftV.y + 9} fill="#00E5FF" fontSize="8" fontWeight="bold" textAnchor="middle">E</text>
            <text x={botRightV.x + 3} y={botRightV.y + 9} fill="#00FF66" fontSize="8" fontWeight="bold" textAnchor="middle">S</text>

            {/* Line from Center to Power Node */}
            <line x1={cx} y1={cy} x2={nodeX} y2={nodeY} stroke="#fbbf24" strokeWidth="1.5" />

            {/* Glowing Moving Power Node Circle */}
            <circle cx={nodeX} cy={nodeY} r="4" fill="#fbbf24" stroke="#ffffff" strokeWidth="1.5" />
            <circle cx={nodeX} cy={nodeY} r="7" fill="none" stroke="#fbbf24" strokeWidth="1" opacity="0.6" className="animate-ping" />
          </svg>
        </div>

        {/* Subsystem Power Tri-Bar Indicator Meters */}
        <div className="flex-1 space-y-1.5 min-w-0">
          {/* WEAPONS BAR: Orange (#FF6B00) */}
          <div>
            <div className="flex items-center justify-between text-[11px] font-mono leading-none mb-0.5">
              <span className="font-bold flex items-center gap-1 text-[#FF6B00]">
                <Zap className="w-3 h-3 text-[#FF6B00]" /> WEAPONS
              </span>
              <span className="font-bold text-[#FF8533]">
                W: {Math.round(distribution.weapons)}%
              </span>
            </div>
            <div className="h-2 w-full bg-slate-950 rounded border border-slate-800 overflow-hidden">
              <div
                className="h-full transition-all duration-75"
                style={{
                  backgroundColor: '#FF6B00',
                  width: `${Math.min(100, distribution.weapons)}%`,
                  boxShadow: distribution.weapons > 0 ? '0 0 8px rgba(255, 107, 0, 0.6)' : 'none',
                }}
              />
            </div>
          </div>

          {/* ENGINES BAR: Cyan (#00E5FF) */}
          <div>
            <div className="flex items-center justify-between text-[11px] font-mono leading-none mb-0.5">
              <span className="font-bold flex items-center gap-1 text-[#00E5FF]">
                <Navigation className="w-3 h-3 text-[#00E5FF]" /> ENGINES
              </span>
              <span className="font-bold text-[#33ECFF]">
                E: {Math.round(distribution.engines)}%
              </span>
            </div>
            <div className="h-2 w-full bg-slate-950 rounded border border-slate-800 overflow-hidden">
              <div
                className="h-full transition-all duration-75"
                style={{
                  backgroundColor: '#00E5FF',
                  width: `${Math.min(100, distribution.engines)}%`,
                  boxShadow: distribution.engines > 0 ? '0 0 8px rgba(0, 229, 255, 0.6)' : 'none',
                }}
              />
            </div>
          </div>

          {/* SHIELDS BAR: Green/Blue (#00FF66) */}
          <div>
            <div className="flex items-center justify-between text-[11px] font-mono leading-none mb-0.5">
              <span className="font-bold flex items-center gap-1 text-[#00FF66]">
                <Shield className="w-3 h-3 text-[#00FF66]" /> SHIELDS
              </span>
              <span className="font-bold text-[#33FF85]">
                S: {Math.round(distribution.shields)}%
              </span>
            </div>
            <div className="h-2 w-full bg-slate-950 rounded border border-slate-800 overflow-hidden">
              <div
                className="h-full transition-all duration-75"
                style={{
                  backgroundColor: '#00FF66',
                  width: `${Math.min(100, distribution.shields)}%`,
                  boxShadow: distribution.shields > 0 ? '0 0 8px rgba(0, 255, 102, 0.6)' : 'none',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Visual State Badges / Keybind Shunt Selector Buttons */}
      <div className="grid grid-cols-4 gap-1.5">
        <button
          onClick={() => handleProfileClick('weapons')}
          className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-lg border text-[10px] font-mono font-black transition-all ${
            profile === 'weapons'
              ? 'bg-[#FF6B00]/30 text-[#FF6B00] border-[#FF6B00] ring-2 ring-[#FF6B00]/80 shadow-md shadow-[#FF6B00]/30'
              : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:bg-[#FF6B00]/20 hover:text-[#FF6B00]'
          }`}
          title="[1] Full Weapons (100% W / 0% E / 0% S)"
        >
          <span className="text-[9px] text-[#FF6B00] font-bold">[1]</span>
          <span>WPN</span>
        </button>

        <button
          onClick={() => handleProfileClick('engines')}
          className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-lg border text-[10px] font-mono font-black transition-all ${
            profile === 'engines'
              ? 'bg-[#00E5FF]/30 text-[#00E5FF] border-[#00E5FF] ring-2 ring-[#00E5FF]/80 shadow-md shadow-[#00E5FF]/30'
              : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:bg-[#00E5FF]/20 hover:text-[#00E5FF]'
          }`}
          title="[2] Full Engines (0% W / 100% E / 0% S)"
        >
          <span className="text-[9px] text-[#00E5FF] font-bold">[2]</span>
          <span>ENG</span>
        </button>

        <button
          onClick={() => handleProfileClick('shields')}
          className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-lg border text-[10px] font-mono font-black transition-all ${
            profile === 'shields'
              ? 'bg-[#00FF66]/30 text-[#00FF66] border-[#00FF66] ring-2 ring-[#00FF66]/80 shadow-md shadow-[#00FF66]/30'
              : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:bg-[#00FF66]/20 hover:text-[#00FF66]'
          }`}
          title="[3] Full Shields (0% W / 0% E / 100% S)"
        >
          <span className="text-[9px] text-[#00FF66] font-bold">[3]</span>
          <span>SHD</span>
        </button>

        <button
          onClick={() => handleProfileClick('balanced')}
          className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-lg border text-[10px] font-mono font-black transition-all ${
            profile === 'balanced'
              ? 'bg-amber-500/30 text-amber-300 border-amber-500 ring-2 ring-amber-400/80 shadow-md shadow-amber-500/30'
              : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
          }`}
          title="[4] Neutral / Balanced (33.3% W / 33.3% E / 33.3% S)"
        >
          <span className="text-[9px] text-amber-400 font-bold">[4]</span>
          <span>BAL</span>
        </button>
      </div>
    </div>
  );
};
