import React, { useState, useEffect, useRef } from 'react';
import { ShieldArcs, ShieldArcKey } from '../types';
import { Shield, AlertTriangle, Zap } from 'lucide-react';

interface ShieldStatusWidgetProps {
  shields: ShieldArcs;
  shieldTargets?: Record<ShieldArcKey, number>;
  hull: number;
  maxHull: number;
  shipName: string;
  rebalanceCooldown?: number;
  maxRebalanceCooldown?: number;
  onDistributeShields?: () => void;
  onRerouteShields?: (arcKey: ShieldArcKey) => void;
}

// Helper for SVG Arc Paths in degrees
function getArcPath(cx: number, cy: number, r: number, startAngleDeg: number, endAngleDeg: number): string {
  if (endAngleDeg <= startAngleDeg) return '';
  const startRad = (startAngleDeg * Math.PI) / 180;
  const endRad = (endAngleDeg * Math.PI) / 180;

  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);

  const largeArcFlag = endAngleDeg - startAngleDeg > 180 ? 1 : 0;

  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArcFlag} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export const ShieldStatusWidget: React.FC<ShieldStatusWidgetProps> = ({
  shields,
  shieldTargets,
  hull,
  maxHull,
  shipName,
  rebalanceCooldown = 0,
  maxRebalanceCooldown = 15,
  onDistributeShields,
  onRerouteShields,
}) => {
  const [hoveredArc, setHoveredArc] = useState<ShieldArcKey | null>(null);
  const [isFlashingHull, setIsFlashingHull] = useState(false);
  const [transferringArcs, setTransferringArcs] = useState<Record<ShieldArcKey, boolean>>({
    front: false,
    back: false,
    port: false,
    starboard: false,
  });

  const prevHullRef = useRef(hull);
  const prevShieldsRef = useRef<Record<ShieldArcKey, number>>({
    front: shields.front?.current ?? 0,
    back: shields.back?.current ?? 0,
    port: shields.port?.current ?? 0,
    starboard: shields.starboard?.current ?? 0,
  });

  // Detect when HP is actively increasing in an arc (transfer in progress)
  useEffect(() => {
    const keys: ShieldArcKey[] = ['front', 'back', 'port', 'starboard'];
    const updatedTransferring = { ...transferringArcs };
    let hasNewTransfer = false;

    keys.forEach((key) => {
      const cur = shields[key]?.current ?? 0;
      const prev = prevShieldsRef.current[key] ?? cur;
      if (cur > prev + 0.1) {
        updatedTransferring[key] = true;
        hasNewTransfer = true;
      }
      prevShieldsRef.current[key] = cur;
    });

    if (hasNewTransfer) {
      setTransferringArcs(updatedTransferring);
      const timer = setTimeout(() => {
        setTransferringArcs({
          front: false,
          back: false,
          port: false,
          starboard: false,
        });
      }, 1600);
      return () => clearTimeout(timer);
    }
  }, [shields]);

  // Trigger flash animation on center ship vector when taking direct hull damage
  useEffect(() => {
    if (hull < prevHullRef.current) {
      setIsFlashingHull(true);
      const timer = setTimeout(() => setIsFlashingHull(false), 650);
      prevHullRef.current = hull;
      return () => clearTimeout(timer);
    }
    prevHullRef.current = hull;
  }, [hull]);

  const handleRerouteClick = (arcKey: ShieldArcKey) => {
    setTransferringArcs((prev) => ({ ...prev, [arcKey]: true }));
    onRerouteShields?.(arcKey);
    setTimeout(() => {
      setTransferringArcs((prev) => ({ ...prev, [arcKey]: false }));
    }, 1800);
  };

  const hullRatio = Math.max(0, Math.min(1, hull / maxHull));
  const hullPercent = Math.round(hullRatio * 100);

  const getQuadrantInfo = (key: ShieldArcKey) => {
    const cur = shields[key]?.current ?? 0;
    const max = shields[key]?.max ?? 1;
    const ratio = Math.max(0, Math.min(1, cur / max));
    const percent = Math.round(ratio * 100);
    const isCollapsed = percent <= 5;

    const isTargetIncreasing = Boolean(
      shieldTargets && (shieldTargets[key] ?? 0) > cur + 0.1
    );
    const isTransferring = transferringArcs[key] || isTargetIncreasing;

    let strokeColor = '#00F0FF'; // Bright Tactical Cyan (100%-70%)
    let textColor = 'text-cyan-300';
    let badgeBg = 'bg-cyan-950/90 border-cyan-500/60 text-cyan-200 shadow-cyan-950/50';

    if (isTransferring) {
      strokeColor = '#38BDF8';
      textColor = 'text-cyan-200 font-black animate-pulse';
      badgeBg = 'bg-cyan-500/30 border-cyan-300 text-white animate-pulse shadow-cyan-400/80 shadow-lg';
    } else if (isCollapsed) {
      strokeColor = '#1F2937'; // Dark Translucent Gray for collapsed track
      textColor = 'text-red-500 font-black animate-pulse';
      badgeBg = 'bg-red-950/95 border-red-600/90 text-red-400 shadow-red-950/80';
    } else if (percent <= 29) {
      strokeColor = '#EF4444'; // Critical Red (1%-29%)
      textColor = 'text-red-400 font-bold animate-pulse';
      badgeBg = 'bg-red-950/80 border-red-600/70 text-red-300';
    } else if (percent <= 69) {
      strokeColor = '#F59E0B'; // Warning Amber (30%-69%)
      textColor = 'text-amber-400 font-bold';
      badgeBg = 'bg-amber-950/80 border-amber-600/70 text-amber-300';
    }

    return { cur, max, ratio, percent, isCollapsed, isTransferring, strokeColor, textColor, badgeBg };
  };

  const fore = getQuadrantInfo('front');
  const port = getQuadrantInfo('port');
  const starboard = getQuadrantInfo('starboard');
  const aft = getQuadrantInfo('back');

  const anyCollapsed = fore.isCollapsed || port.isCollapsed || starboard.isCollapsed || aft.isCollapsed;

  const isRebalanceReady = rebalanceCooldown <= 0;
  const cdRatio = isRebalanceReady ? 0 : rebalanceCooldown / maxRebalanceCooldown;

  // Arc Circle Geometry Config (cx=100, cy=100, radius=70)
  const cx = 100;
  const cy = 100;
  const radius = 70;
  const strokeWidth = 9;
  const totalSweep = 82; // 82 deg sweep per quadrant arc (with 8 deg gap)

  const arcDefs: { key: ShieldArcKey; label: string; keybind: string; centerAngle: number; info: ReturnType<typeof getQuadrantInfo> }[] = [
    { key: 'front', label: 'FORE', keybind: 'NUM 8', centerAngle: 270, info: fore },
    { key: 'starboard', label: 'STBD', keybind: 'NUM 6', centerAngle: 0, info: starboard },
    { key: 'back', label: 'AFT', keybind: 'NUM 2', centerAngle: 90, info: aft },
    { key: 'port', label: 'PORT', keybind: 'NUM 4', centerAngle: 180, info: port },
  ];

  return (
    <div className="relative p-4 rounded-xl bg-slate-900/95 backdrop-blur border border-slate-800 text-slate-100 shadow-2xl w-80 select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-cyan-400" />
          <span className="font-bold text-xs tracking-wider text-slate-100 uppercase">{shipName}</span>
        </div>
        {anyCollapsed && (
          <div className="flex items-center gap-1 text-[10px] text-red-400 font-black animate-pulse bg-red-950/80 border border-red-600 px-2 py-0.5 rounded">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span>SHIELD COLLAPSED</span>
          </div>
        )}
      </div>

      {/* 4 Shield Arcs Circle & Ship Wireframe Vector Container */}
      <div className="relative my-2 w-full aspect-square max-w-[240px] mx-auto flex items-center justify-center">
        {/* SVG Circle with 4 Directional Shield Arcs */}
        <svg viewBox="0 0 200 200" className="w-full h-full overflow-visible">
          <defs>
            {/* Cyan Shield Glow Filter */}
            <filter id="cyanGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>

            {/* Amber Warning Glow Filter */}
            <filter id="amberGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>

            {/* Red Critical Glow Filter */}
            <filter id="redGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>

            {/* High Intensity Shield Transfer / Reroute Glow Filter */}
            <filter id="transferGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>

            {/* Wireframe Hull Gradient */}
            <linearGradient id="wireframeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={isFlashingHull ? '#ef4444' : '#38bdf8'} stopOpacity="0.9" />
              <stop offset="60%" stopColor={isFlashingHull ? '#dc2626' : '#0284c7'} stopOpacity="0.8" />
              <stop offset="100%" stopColor={isFlashingHull ? '#7f1d1d' : '#0f172a'} stopOpacity="0.95" />
            </linearGradient>
          </defs>

          {/* Background Structural Guide Rings */}
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="rgba(30, 41, 59, 0.7)" strokeWidth={strokeWidth} />
          <circle cx={cx} cy={cy} r={radius - strokeWidth / 2 - 4} fill="none" stroke="rgba(51, 65, 85, 0.35)" strokeWidth="1" strokeDasharray="3 3" />

          {/* Render 4 Quadrant Arcs around the circle */}
          {arcDefs.map(({ key, centerAngle, info }) => {
            const isHovered = hoveredArc === key;
            const isTransferring = info.isTransferring;
            const startAngleTrack = centerAngle - totalSweep / 2;
            const endAngleTrack = centerAngle + totalSweep / 2;
            const trackPath = getArcPath(cx, cy, radius, startAngleTrack, endAngleTrack);

            // Reactive Arc Depletion: arc physically shrinks symmetrically from both sides toward center as percentage drops
            const activeSweep = totalSweep * info.ratio;
            const startAngleActive = centerAngle - activeSweep / 2;
            const endAngleActive = centerAngle + activeSweep / 2;
            const activePath = getArcPath(cx, cy, radius, startAngleActive, endAngleActive);

            const glowFilter = isTransferring ? 'url(#transferGlow)' : info.percent >= 70 ? 'url(#cyanGlow)' : info.percent >= 30 ? 'url(#amberGlow)' : 'url(#redGlow)';

            return (
              <g
                key={key}
                className="cursor-pointer group transition-transform"
                onMouseEnter={() => setHoveredArc(key)}
                onMouseLeave={() => setHoveredArc(null)}
                onClick={() => handleRerouteClick(key)}
              >
                {/* Background Track Arc */}
                <path
                  d={trackPath}
                  fill="none"
                  stroke={info.isCollapsed ? 'rgba(31, 41, 55, 0.95)' : 'rgba(15, 23, 42, 0.85)'}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                />

                {/* Collapsed Warning Flashing Outline (Anchored in place) */}
                {info.isCollapsed && (
                  <>
                    <path
                      d={trackPath}
                      fill="none"
                      stroke="rgba(239, 68, 68, 0.25)"
                      strokeWidth={strokeWidth + 2}
                      strokeLinecap="round"
                    />
                    <path
                      d={trackPath}
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="2.5"
                      strokeDasharray="6 4"
                      className="animate-pulse"
                      filter="url(#redGlow)"
                      opacity="0.9"
                    />
                  </>
                )}

                {/* Shield HP Transfer / Reroute Flashing Aura (Anchored in place) */}
                {isTransferring && info.ratio > 0.05 && (
                  <path
                    d={activePath}
                    fill="none"
                    stroke="#00F0FF"
                    strokeWidth={strokeWidth + 6}
                    strokeLinecap="round"
                    className="animate-pulse opacity-60 pointer-events-none"
                    filter="url(#transferGlow)"
                  />
                )}

                {/* Active Shield Arc Segment */}
                {info.ratio > 0.05 && (
                  <path
                    d={activePath}
                    fill="none"
                    stroke={isTransferring ? '#38bdf8' : info.strokeColor}
                    strokeWidth={isTransferring ? strokeWidth + 4 : isHovered ? strokeWidth + 3 : strokeWidth}
                    strokeLinecap="round"
                    className={`transition-all duration-200 ${
                      isTransferring ? 'animate-pulse' : info.percent <= 29 ? 'animate-pulse' : ''
                    }`}
                    filter={glowFilter}
                    opacity={isTransferring ? 1 : isHovered ? 1 : 0.9}
                  />
                )}
              </g>
            );
          })}

          {/* Center Vanguard Brawler 2D Wireframe Silhouette Vector */}
          <g
            transform="translate(100, 92) scale(1.05)"
            className={`transition-colors duration-200 ${isFlashingHull ? 'animate-pulse' : ''}`}
          >
            {/* Impulse Engine Plasma Glow */}
            <ellipse cx="0" cy="22" rx="4.5" ry="2.5" fill={isFlashingHull ? '#ef4444' : '#00F0FF'} opacity="0.9" className="animate-pulse" />
            <polygon points="-3,20 0,30 3,20" fill={isFlashingHull ? '#f87171' : '#38bdf8'} opacity="0.85" />

            {/* Vanguard Brawler Saucer Primary Hull */}
            <path
              d="M 0 -26 C 18 -26, 22 -12, 18 0 C 13 8, -13 8, -18 0 C -22 -12, -18 -26, 0 -26 Z"
              fill="url(#wireframeGrad)"
              stroke={isFlashingHull ? '#ef4444' : hullPercent < 25 ? '#ef4444' : hullPercent < 60 ? '#f59e0b' : '#00F0FF'}
              strokeWidth="1.5"
            />

            {/* Saucer Inner Sensor Grid Lines */}
            <ellipse cx="0" cy="-13" rx="10" ry="7" fill="none" stroke={isFlashingHull ? '#fca5a5' : '#0284c7'} strokeWidth="1" strokeDasharray="2 2" />
            <circle cx="0" cy="-13" r="3" fill={isFlashingHull ? '#ef4444' : '#00F0FF'} opacity="0.9" />

            {/* Secondary Engineering Body */}
            <path
              d="M -6 5 L -4 20 L 4 20 L 6 5 Z"
              fill="url(#wireframeGrad)"
              stroke={isFlashingHull ? '#ef4444' : '#0284c7'}
              strokeWidth="1.2"
            />

            {/* Nacelle Pylons */}
            <line x1="-5" y1="10" x2="-20" y2="14" stroke={isFlashingHull ? '#ef4444' : '#38bdf8'} strokeWidth="2" />
            <line x1="5" y1="10" x2="20" y2="14" stroke={isFlashingHull ? '#ef4444' : '#38bdf8'} strokeWidth="2" />

            {/* Port & Starboard Nacelles */}
            <rect
              x="-23"
              y="2"
              width="5"
              height="20"
              rx="2.5"
              fill={isFlashingHull ? '#7f1d1d' : '#0f172a'}
              stroke={isFlashingHull ? '#ef4444' : '#00F0FF'}
              strokeWidth="1.2"
            />
            <rect
              x="18"
              y="2"
              width="5"
              height="20"
              rx="2.5"
              fill={isFlashingHull ? '#7f1d1d' : '#0f172a'}
              stroke={isFlashingHull ? '#ef4444' : '#00F0FF'}
              strokeWidth="1.2"
            />

            {/* Bussard Collector Caps on Nacelles */}
            <ellipse cx="-20.5" cy="3" rx="2" ry="1.5" fill={isFlashingHull ? '#ef4444' : '#38bdf8'} />
            <ellipse cx="20.5" cy="3" rx="2" ry="1.5" fill={isFlashingHull ? '#ef4444' : '#38bdf8'} />
          </g>
        </svg>

        {/* Outer Frame Pinned Numpad Hotkey Badges */}
        {/* NUM 8 - Top Left */}
        <div className="absolute top-0 left-2 pointer-events-none">
          <span className="text-[7px] font-mono font-black bg-slate-950/90 text-cyan-400 border border-cyan-800/80 px-1 py-0.5 rounded shadow">
            NUM 8
          </span>
        </div>
        {/* NUM 4 - Mid Left */}
        <div className="absolute top-1/2 -translate-y-6 left-0 pointer-events-none">
          <span className="text-[7px] font-mono font-black bg-slate-950/90 text-cyan-400 border border-cyan-800/80 px-1 py-0.5 rounded shadow">
            NUM 4
          </span>
        </div>
        {/* NUM 6 - Mid Right */}
        <div className="absolute top-1/2 -translate-y-6 right-0 pointer-events-none">
          <span className="text-[7px] font-mono font-black bg-slate-950/90 text-cyan-400 border border-cyan-800/80 px-1 py-0.5 rounded shadow">
            NUM 6
          </span>
        </div>
        {/* NUM 2 - Bottom Left */}
        <div className="absolute bottom-0 left-2 pointer-events-none">
          <span className="text-[7px] font-mono font-black bg-slate-950/90 text-cyan-400 border border-cyan-800/80 px-1 py-0.5 rounded shadow">
            NUM 2
          </span>
        </div>

        {/* Center Hull Integrity Percentage Badge embedded cleanly below ship silhouette */}
        <div className="absolute top-[134px] inset-x-0 flex flex-col items-center justify-center pointer-events-none z-10">
          <div
            className={`px-2 py-0.5 rounded-full bg-slate-950/95 border shadow-md flex items-center gap-1.5 transition-colors ${
              isFlashingHull
                ? 'border-red-500 bg-red-950/90 animate-pulse'
                : 'border-slate-800'
            }`}
          >
            <span className="text-[8px] font-mono font-black text-slate-400">HULL</span>
            <span
              className={`text-xs font-mono font-black ${
                isFlashingHull || hullPercent < 25
                  ? 'text-red-500 animate-pulse'
                  : hullPercent < 60
                  ? 'text-amber-400'
                  : 'text-cyan-400'
              }`}
            >
              {hullPercent}%
            </span>
          </div>
        </div>

        {/* Quadrant Health Tooltip Badges (Grouped Labels + Percentages) */}
        {/* 1. FORE (Top) */}
        <div
          onClick={() => handleRerouteClick('front')}
          onMouseEnter={() => setHoveredArc('front')}
          onMouseLeave={() => setHoveredArc(null)}
          className={`absolute top-0 inset-x-0 flex flex-col items-center z-20 cursor-pointer transition-transform ${
            hoveredArc === 'front' ? 'scale-105' : ''
          }`}
          title="Reroute Shield HP to Forward Arc (Numpad 8)"
        >
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border shadow ${fore.badgeBg}`}>
            {fore.isTransferring && <Zap className="w-2.5 h-2.5 text-cyan-200 animate-bounce shrink-0" />}
            <span className={`text-[9px] font-mono font-black tracking-wide ${fore.textColor}`}>
              FORE {fore.isCollapsed ? 'COLLAPSED' : `${fore.percent}%`}
            </span>
          </div>
        </div>

        {/* 2. PORT (Left) */}
        <div
          onClick={() => handleRerouteClick('port')}
          onMouseEnter={() => setHoveredArc('port')}
          onMouseLeave={() => setHoveredArc(null)}
          className={`absolute left-0 top-1/2 -translate-y-1/2 flex flex-col items-start z-20 cursor-pointer transition-transform ${
            hoveredArc === 'port' ? 'scale-105' : ''
          }`}
          title="Reroute Shield HP to Port Arc (Numpad 4)"
        >
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border shadow ${port.badgeBg}`}>
            {port.isTransferring && <Zap className="w-2.5 h-2.5 text-cyan-200 animate-bounce shrink-0" />}
            <span className={`text-[9px] font-mono font-black tracking-wide ${port.textColor}`}>
              PORT {port.isCollapsed ? 'COLLAPSED' : `${port.percent}%`}
            </span>
          </div>
        </div>

        {/* 3. STARBOARD (Right) */}
        <div
          onClick={() => handleRerouteClick('starboard')}
          onMouseEnter={() => setHoveredArc('starboard')}
          onMouseLeave={() => setHoveredArc(null)}
          className={`absolute right-0 top-1/2 -translate-y-1/2 flex flex-col items-end z-20 cursor-pointer transition-transform ${
            hoveredArc === 'starboard' ? 'scale-105' : ''
          }`}
          title="Reroute Shield HP to Starboard Arc (Numpad 6)"
        >
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border shadow ${starboard.badgeBg}`}>
            {starboard.isTransferring && <Zap className="w-2.5 h-2.5 text-cyan-200 animate-bounce shrink-0" />}
            <span className={`text-[9px] font-mono font-black tracking-wide ${starboard.textColor}`}>
              STBD {starboard.isCollapsed ? 'COLLAPSED' : `${starboard.percent}%`}
            </span>
          </div>
        </div>

        {/* 4. AFT (Bottom) */}
        <div
          onClick={() => handleRerouteClick('back')}
          onMouseEnter={() => setHoveredArc('back')}
          onMouseLeave={() => setHoveredArc(null)}
          className={`absolute bottom-0 inset-x-0 flex flex-col items-center z-20 cursor-pointer transition-transform ${
            hoveredArc === 'back' ? 'scale-105' : ''
          }`}
          title="Reroute Shield HP to Aft Arc (Numpad 2)"
        >
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border shadow ${aft.badgeBg}`}>
            {aft.isTransferring && <Zap className="w-2.5 h-2.5 text-cyan-200 animate-bounce shrink-0" />}
            <span className={`text-[9px] font-mono font-black tracking-wide ${aft.textColor}`}>
              AFT {aft.isCollapsed ? 'COLLAPSED' : `${aft.percent}%`}
            </span>
          </div>
        </div>
      </div>

      {/* Prominent Tactical Action Bar: EQUALIZE SHIELD ARCS Button */}
      {onDistributeShields && (
        <button
          onClick={onDistributeShields}
          disabled={!isRebalanceReady}
          className={`relative w-full py-2.5 px-3 rounded-xl border text-xs font-black tracking-wider uppercase transition overflow-hidden flex items-center justify-between shadow-lg mt-2 group ${
            !isRebalanceReady
              ? 'bg-slate-950 text-slate-500 border-slate-800/80 cursor-not-allowed'
              : 'bg-gradient-to-r from-cyan-950 via-cyan-900 to-cyan-950 hover:from-cyan-900 hover:to-cyan-800 text-cyan-200 border-cyan-500/80 hover:border-cyan-400 active:scale-98 shadow-cyan-500/20'
          }`}
        >
          <div className="flex items-center gap-2 z-10">
            {/* High-Contrast Accent Box for Hotkey */}
            <span className="text-[10px] font-mono font-black bg-cyan-400 text-slate-950 px-2 py-0.5 rounded shadow-sm group-hover:bg-white transition-colors">
              [ 5 ]
            </span>
            <span className="font-mono text-xs font-black tracking-wider">
              {isRebalanceReady ? 'EQUALIZE SHIELD ARCS' : `REBALANCE (${rebalanceCooldown.toFixed(1)}s)`}
            </span>
          </div>

          <div className="flex items-center gap-1.5 z-10">
            <Zap className={`w-4 h-4 ${isRebalanceReady ? 'text-cyan-400 animate-pulse' : 'text-slate-600'}`} />
          </div>

          {/* Linear Progress / Cooldown Sweep Fill Overlay */}
          {!isRebalanceReady && (
            <div
              className="absolute inset-y-0 left-0 bg-cyan-950/70 border-r-2 border-cyan-400 transition-all duration-100 opacity-90"
              style={{ width: `${cdRatio * 100}%` }}
            />
          )}
        </button>
      )}
    </div>
  );
};

