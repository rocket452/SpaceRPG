import React from 'react';
import { Compass, Gauge } from 'lucide-react';

interface HelmControlsProps {
  speed: number;
  maxSpeed: number;
  targetSpeed: number;
  rotationY: number;
  onSetTargetSpeed: (val: number) => void;
  onTurnLeft: () => void;
  onTurnRight: () => void;
  onStopTurning?: () => void;
  onStop: () => void;
  onFullSpeed: () => void;
}

export const HelmControls: React.FC<HelmControlsProps> = ({
  speed,
  maxSpeed,
  targetSpeed,
  rotationY,
  onSetTargetSpeed,
  onTurnLeft,
  onTurnRight,
  onStopTurning,
  onStop,
  onFullSpeed,
}) => {
  const minReverseSpeed = -maxSpeed * 0.25;
  const speedPercent = Math.round((speed / maxSpeed) * 100);
  const targetPercent = Math.round((targetSpeed / maxSpeed) * 100);
  const headingDeg = Math.round((((rotationY * 180) / Math.PI) % 360 + 360) % 360);

  const isReverse = speed < -0.1 || targetSpeed < -0.1;

  const thresholdPresets = [
    { label: 'REV', percent: -25, val: minReverseSpeed, title: 'Reverse (-25% Throttle)' },
    { label: '0%', percent: 0, val: 0, title: 'Full Stop (0%)' },
    { label: '25%', percent: 25, val: maxSpeed * 0.25, title: '25% Impulse' },
    { label: '50%', percent: 50, val: maxSpeed * 0.5, title: '50% Impulse' },
    { label: '100%', percent: 100, val: maxSpeed, title: '100% Full Impulse' },
  ];

  return (
    <div className="p-4 rounded-xl bg-slate-900/90 backdrop-blur border border-slate-800 text-slate-100 shadow-2xl w-80 select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Gauge className="w-5 h-5 text-emerald-400" />
          <span className="font-semibold text-sm tracking-wide text-slate-200 uppercase">Helm & Impulse</span>
        </div>
        <div className="flex items-center gap-1 font-mono text-xs text-emerald-400">
          <Compass className="w-3.5 h-3.5" />
          <span>{headingDeg}°</span>
        </div>
      </div>

      {/* Impulse Throttle Section with Slider */}
      <div className="mb-4 space-y-2">
        <div className="flex justify-between text-xs font-semibold">
          <span className="text-slate-400">Impulse Throttle</span>
          <span className="font-mono">
            {isReverse ? (
              <span className="text-amber-400 font-bold">REV ({Math.abs(Math.round(speed))} u/s)</span>
            ) : (
              <span className="text-emerald-400">{Math.round(speed)} / {Math.round(maxSpeed)} u/s ({speedPercent}%)</span>
            )}
            <span className="text-slate-500 text-[10px] ml-1">
              ({targetPercent}%)
            </span>
          </span>
        </div>

        {/* Range Slider */}
        <div className="relative pt-1 pb-1">
          <input
            type="range"
            min={minReverseSpeed}
            max={maxSpeed}
            step={maxSpeed * 0.05}
            value={targetSpeed}
            onChange={(e) => onSetTargetSpeed(parseFloat(e.target.value))}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 focus:outline-none"
          />
        </div>

        {/* Preset Threshold Tick Buttons */}
        <div className="flex justify-between items-center text-[10px] font-mono font-bold text-slate-400 px-0.5">
          {thresholdPresets.map((preset) => {
            const isNear = Math.abs(targetSpeed - preset.val) < (maxSpeed * 0.08);
            return (
              <button
                key={preset.label}
                onClick={() => onSetTargetSpeed(preset.val)}
                title={preset.title}
                className={`hover:text-emerald-400 transition-colors px-1 py-0.5 rounded ${
                  isNear
                    ? preset.percent < 0
                      ? 'text-amber-400 font-black underline'
                      : preset.percent === 0
                      ? 'text-red-400 font-black underline'
                      : 'text-emerald-400 font-black underline'
                    : ''
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Helm Steering Buttons */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <button
          onPointerDown={onTurnLeft}
          onPointerUp={onStopTurning}
          onPointerLeave={onStopTurning}
          onPointerCancel={onStopTurning}
          className="py-2.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-cyan-600 border border-slate-700 font-bold text-slate-200 transition touch-none select-none text-[11px] flex items-center justify-center gap-1 shadow-md"
        >
          ◄ PORT TURN
        </button>
        <button
          onPointerDown={onTurnRight}
          onPointerUp={onStopTurning}
          onPointerLeave={onStopTurning}
          onPointerCancel={onStopTurning}
          className="py-2.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-cyan-600 border border-slate-700 font-bold text-slate-200 transition touch-none select-none text-[11px] flex items-center justify-center gap-1 shadow-md"
        >
          STBD TURN ►
        </button>
      </div>

      <div className="mt-2 text-[10px] text-slate-400 text-center font-mono">
        KEYBOARD: [W/S/↑/↓] Impulse (incl. Reverse) | [A/D/←/→] Helm | [SPACE] Phasers
      </div>
    </div>
  );
};
