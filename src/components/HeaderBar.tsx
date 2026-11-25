import React from 'react';
import { Volume2, VolumeX, Eye, Camera, Crosshair, RefreshCw, Ship, Compass } from 'lucide-react';
import { soundManager } from '../audio/soundManager';

interface HeaderBarProps {
  cameraMode: 'follow' | 'target' | 'isometric';
  useCompactHud: boolean;
  onSetCameraMode: (mode: 'follow' | 'target' | 'isometric') => void;
  onToggleCompactHud: () => void;
  onOpenHangar: () => void;
  onOpenMissions: () => void;
  onRestart: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  cameraMode,
  useCompactHud,
  onSetCameraMode,
  onToggleCompactHud,
  onOpenHangar,
  onOpenMissions,
  onRestart,
  isMuted,
  onToggleMute,
}) => {
  return (
    <header className="p-3 bg-slate-900/90 backdrop-blur border-b border-slate-800 text-slate-100 flex items-center justify-between shadow-2xl z-20">
      {/* Title */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/50 flex items-center justify-center text-cyan-400 font-black">
          ⚔️
        </div>
        <div>
          <h1 className="font-black text-base tracking-widest uppercase text-slate-100 leading-none">
            TACTICAL 1V1 SPACE DUEL
          </h1>
          <span className="text-[10px] font-mono text-cyan-400 tracking-wider">
            VANGUARD BRAWLER vs VECTOR DRAGOON
          </span>
        </div>
      </div>

      {/* Center Controls: Camera & Layout Selector */}
      <div className="flex items-center gap-2">
        {/* Camera Selector */}
        <div className="p-1 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-1">
          <button
            onClick={() => onSetCameraMode('follow')}
            className={`px-2.5 py-1 rounded text-xs font-bold transition flex items-center gap-1 ${
              cameraMode === 'follow'
                ? 'bg-cyan-500 text-slate-950 font-black'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Camera className="w-3.5 h-3.5" /> FOLLOW
          </button>
          <button
            onClick={() => onSetCameraMode('target')}
            className={`px-2.5 py-1 rounded text-xs font-bold transition flex items-center gap-1 ${
              cameraMode === 'target'
                ? 'bg-cyan-500 text-slate-950 font-black'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Follow Targeted Ship Camera"
          >
            <Crosshair className="w-3.5 h-3.5" /> TARGET
          </button>
          <button
            onClick={() => onSetCameraMode('isometric')}
            className={`px-2.5 py-1 rounded text-xs font-bold transition flex items-center gap-1 ${
              cameraMode === 'isometric'
                ? 'bg-cyan-500 text-slate-950 font-black'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Isometric 3/4 Tactical View"
          >
            <Compass className="w-3.5 h-3.5" /> ISOMETRIC
          </button>
        </div>

        {/* HUD Mode Switcher */}
        <button
          onClick={onToggleCompactHud}
          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-amber-400 transition"
          title="Switch HUD Layout Mode"
        >
          HUD: {useCompactHud ? 'COMPACT' : 'DESKTOP'}
        </button>

        {/* Hangar Dock */}
        <button
          onClick={onOpenHangar}
          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 transition flex items-center gap-1.5"
        >
          <Ship className="w-4 h-4 text-cyan-400" /> HANGAR DOCK
        </button>

        {/* Mission Dispatch */}
        <button
          onClick={onOpenMissions}
          className="px-3 py-1.5 rounded-lg bg-amber-950/60 hover:bg-amber-900 border border-amber-800 text-xs font-bold text-amber-300 transition flex items-center gap-1.5"
        >
          <Crosshair className="w-4 h-4 text-amber-400" /> MISSIONS
        </button>
      </div>

      {/* Audio & Reset */}
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleMute}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition"
          title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
        >
          {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
        </button>

        <button
          onClick={onRestart}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition"
          title="Restart Sector Simulation"
        >
          <RefreshCw className="w-4 h-4 text-emerald-400" />
        </button>
      </div>
    </header>
  );
};
