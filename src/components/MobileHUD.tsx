import React, { useState, useRef } from 'react';
import { SpaceCombatEngine } from '../game/spaceCombatEngine';
import { ShipEntity, SubsystemType, PowerPreset, ShieldArcKey } from '../types';
import { groupShipWeapons, getWeaponColorTheme } from '../utils/weaponUtils';
import { Minimap } from './Minimap';
import {
  Shield,
  Gauge,
  Zap,
  Crosshair,
  Radio,
  FileText,
  Menu,
  X,
  Camera,
  Eye,
  Compass,
  Ship,
  Volume2,
  VolumeX,
  RefreshCw,
  Flame,
  Activity,
  Navigation,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  Target,
  MapPin,
} from 'lucide-react';

interface MobileHUDProps {
  engine: SpaceCombatEngine;
  player: ShipEntity;
  targetEnemy: ShipEntity | null;
  targetDistance: number | null;
  autoFire: boolean;
  cameraMode: 'follow' | 'target' | 'isometric';
  isMuted: boolean;
  useCompactHud: boolean;
  onSetCameraMode: (mode: 'follow' | 'target' | 'isometric') => void;
  onToggleCompactHud: () => void;
  onOpenHangar: () => void;
  onOpenMissions: () => void;
  onRestart: () => void;
  onToggleMute: () => void;
  onToggleAutoFire: () => void;
  onCycleTarget: () => void;
}

type DrawerTab = 'shields' | 'power' | 'target' | 'abilities' | 'log' | 'map' | null;

export const MobileHUD: React.FC<MobileHUDProps> = ({
  engine,
  player,
  targetEnemy,
  targetDistance,
  autoFire,
  cameraMode,
  isMuted,
  useCompactHud,
  onSetCameraMode,
  onToggleCompactHud,
  onOpenHangar,
  onOpenMissions,
  onRestart,
  onToggleMute,
  onToggleAutoFire,
  onCycleTarget,
}) => {
  const [activeTab, setActiveTab] = useState<DrawerTab>(null);
  const [showMenuModal, setShowMenuModal] = useState(false);

  // Turn interval ref for continuous touch turn
  const turnIntervalRef = useRef<number | null>(null);
  const tapTimeoutRef = useRef<number | null>(null);
  const pointerStartTimeRef = useRef<number>(0);

  const startTurning = (direction: 'left' | 'right', e?: React.PointerEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (turnIntervalRef.current) clearInterval(turnIntervalRef.current);
    if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);

    pointerStartTimeRef.current = Date.now();
    const turnRateRad = (player.shipClass.turnRate * Math.PI) / 180;
    const targetVel = direction === 'left' ? turnRateRad : -turnRateRad;

    player.targetAngularVelocity = targetVel;
    turnIntervalRef.current = window.setInterval(() => {
      player.targetAngularVelocity = targetVel;
    }, 30);
  };

  const stopTurning = (e?: React.PointerEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const pressDuration = Date.now() - pointerStartTimeRef.current;
    if (turnIntervalRef.current) {
      clearInterval(turnIntervalRef.current);
      turnIntervalRef.current = null;
    }

    // If it was a quick tap (< 250ms), sustain turn for 350ms so a single tap turns smoothly
    if (pressDuration < 250 && pressDuration > 0) {
      tapTimeoutRef.current = window.setTimeout(() => {
        player.targetAngularVelocity = 0;
      }, 350);
    } else {
      player.targetAngularVelocity = 0;
    }
  };

  // Shield Arc calculations
  const hullRatio = Math.max(0, Math.min(1, player.hull / player.maxHull));
  const hullPercent = Math.round(hullRatio * 100);

  const getArcPercent = (key: ShieldArcKey) => {
    const arc = player.shields[key];
    return Math.round(Math.max(0, Math.min(1, arc.current / arc.max)) * 100);
  };

  const frontShield = getArcPercent('front');
  const portShield = getArcPercent('port');
  const starboardShield = getArcPercent('starboard');
  const backShield = getArcPercent('back');

  // Target Arc calculations
  const targetHullPercent = targetEnemy
    ? Math.round(Math.max(0, Math.min(1, targetEnemy.hull / targetEnemy.maxHull)) * 100)
    : 0;

  // Weapon group calculations for Mobile HUD
  const weaponGroups = groupShipWeapons(player.weapons);

  return (
    <div className="absolute inset-0 pointer-events-none z-20 flex flex-col justify-between p-2">
      {/* --- TOP HUD BAR --- */}
      <div className="pointer-events-auto flex flex-col gap-1.5 w-full">
        {/* Top Header Row */}
        <div className="flex items-center justify-between bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl p-2 px-3 shadow-lg">
          {/* App Title */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-500/50 flex items-center justify-center text-cyan-400 font-black text-xs">
              🖖
            </div>
            <div>
              <h1 className="font-black text-xs tracking-wider uppercase text-slate-100 leading-none">
                STARSHIP TAC COMBAT
              </h1>
              <span className="text-[9px] font-mono text-cyan-400">
                {player.name}
              </span>
            </div>
          </div>

          {/* Quick Camera Mode, Map & Menu Trigger */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab(activeTab === 'map' ? null : 'map')}
              className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 active:scale-95 transition ${
                activeTab === 'map'
                  ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-black'
                  : 'bg-slate-800 border-slate-700 text-cyan-400'
              }`}
              title="Tactical Map"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>MAP</span>
            </button>

            <button
              onClick={() => {
                const modes: ('follow' | 'target' | 'isometric')[] = ['follow', 'target', 'isometric'];
                const nextIdx = (modes.indexOf(cameraMode) + 1) % modes.length;
                onSetCameraMode(modes[nextIdx]);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-[11px] font-bold text-cyan-400 flex items-center gap-1 active:scale-95 transition"
            >
              {cameraMode === 'follow' && <Camera className="w-3.5 h-3.5" />}
              {cameraMode === 'target' && <Crosshair className="w-3.5 h-3.5" />}
              {cameraMode === 'isometric' && <Compass className="w-3.5 h-3.5" />}
              <span className="uppercase">{cameraMode}</span>
            </button>

            <button
              onClick={() => setShowMenuModal(true)}
              className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 active:scale-95 transition"
              title="Tactical Menu"
            >
              <Menu className="w-5 h-5 text-slate-300" />
            </button>
          </div>
        </div>

        {/* Compact Tactical Status Row (Player & Target Status) */}
        <div className="grid grid-cols-2 gap-1.5">
          {/* Player Compact Box */}
          <div
            onClick={() => setActiveTab(activeTab === 'shields' ? null : 'shields')}
            className="bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl p-2 flex flex-col justify-center gap-1 cursor-pointer active:bg-slate-800 transition"
          >
            <div className="flex justify-between items-center text-[10px] font-bold">
              <span className="text-slate-300 flex items-center gap-1">
                <Shield className="w-3 h-3 text-cyan-400" /> HULL
              </span>
              <span
                className={`font-mono ${
                  hullPercent < 25 ? 'text-red-500' : hullPercent < 60 ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                {hullPercent}%
              </span>
            </div>
            {/* Hull Progress Bar */}
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  hullPercent < 25 ? 'bg-red-500' : hullPercent < 60 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${hullPercent}%` }}
              />
            </div>
            {/* Shield Quadrants Grid */}
            <div className="grid grid-cols-4 gap-1 text-[9px] font-mono font-bold text-center">
              <span className={frontShield < 30 ? 'text-red-400' : 'text-cyan-400'}>F:{frontShield}%</span>
              <span className={portShield < 30 ? 'text-red-400' : 'text-cyan-400'}>P:{portShield}%</span>
              <span className={starboardShield < 30 ? 'text-red-400' : 'text-cyan-400'}>S:{starboardShield}%</span>
              <span className={backShield < 30 ? 'text-red-400' : 'text-cyan-400'}>B:{backShield}%</span>
            </div>
          </div>

          {/* Target Compact Box */}
          <div
            onClick={onCycleTarget}
            className={`bg-slate-900/90 backdrop-blur border rounded-xl p-2 flex flex-col justify-center gap-1 cursor-pointer active:bg-slate-800 transition ${
              targetEnemy ? 'border-red-900/70' : 'border-slate-800'
            }`}
          >
            <div className="flex justify-between items-center text-[10px] font-bold">
              <span className="text-red-400 flex items-center gap-1 truncate max-w-[90px]">
                <Target className="w-3 h-3 text-red-500" />
                {targetEnemy ? targetEnemy.name : 'NO TARGET'}
              </span>
              <span className="font-mono text-cyan-400">
                {targetDistance !== null ? `${Math.round(targetDistance)}u` : 'NEXT 🎯'}
              </span>
            </div>

            {targetEnemy ? (
              <>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      targetHullPercent < 25 ? 'bg-red-500' : targetHullPercent < 60 ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${targetHullPercent}%` }}
                  />
                </div>
                <div className="text-[9px] text-slate-400 font-mono flex justify-between">
                  <span>HULL: {targetHullPercent}%</span>
                  <span className="text-amber-400 font-bold">TAP TO CYCLE</span>
                </div>
              </>
            ) : (
              <div className="text-[9px] text-slate-500 font-mono text-center py-1">
                TAP HERE TO LOCK TARGET
              </div>
            )}
          </div>
        </div>

        {/* Compact Boss Raid Strip (Mobile / Tablet) */}
        {engine.bossRaidController && (
          <div className="bg-slate-950/90 backdrop-blur border border-red-900/70 rounded-xl px-2.5 py-1.5 text-[10px] font-mono tabular-nums flex items-center justify-between gap-2">
            <span className="text-red-300 font-bold truncate">
              BOSS: {Math.round(engine.bossRaidController.bossShip.hull)}/{engine.bossRaidController.bossShip.maxHull}
            </span>
            {engine.bossRaidController.targetedAttack.state === 'charging' ? (
              <span
                className={`font-black px-1.5 py-0.5 rounded ${
                  engine.bossRaidController.targetedAttack.isIntercepted
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-red-500/25 text-red-200'
                }`}
              >
                {engine.bossRaidController.targetedAttack.isIntercepted ? 'TANK BLOCKING' : 'HIDE BEHIND TANK!'}{' '}
                {engine.bossRaidController.targetedAttack.chargeTimer.toFixed(1)}s
              </span>
            ) : (
              <span className="text-slate-400">AGGRO: VANGUARD</span>
            )}
          </div>
        )}
      </div>

      {/* --- MIDDLE DRAWER SHEET (If tab selected) --- */}
      {activeTab && (
        <div className="pointer-events-auto bg-slate-900/95 backdrop-blur border border-slate-800 rounded-2xl p-3 shadow-2xl my-auto max-h-[50vh] overflow-y-auto z-30 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex justify-between items-center pb-2 mb-2 border-b border-slate-800">
            <span className="font-bold text-xs tracking-wider uppercase text-cyan-400 flex items-center gap-1.5">
              {activeTab === 'map' && <MapPin className="w-4 h-4" />}
              {activeTab === 'shields' && <Shield className="w-4 h-4" />}
              {activeTab === 'power' && <Zap className="w-4 h-4" />}
              {activeTab === 'target' && <Crosshair className="w-4 h-4" />}
              {activeTab === 'abilities' && <Radio className="w-4 h-4" />}
              {activeTab === 'log' && <FileText className="w-4 h-4" />}
              <span>{activeTab} SYSTEM CONTROLS</span>
            </span>
            <button
              onClick={() => setActiveTab(null)}
              className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* TAB 0: MINIMAP RADAR */}
          {activeTab === 'map' && (
            <div className="flex justify-center p-1">
              <Minimap
                engine={engine}
                onSelectTarget={(id) => (player.targetId = id)}
                defaultExpanded={true}
              />
            </div>
          )}

          {/* TAB 1: SHIELDS & HULL */}
          {activeTab === 'shields' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-center text-xs font-mono">
                <div className="p-2 bg-slate-950 border border-slate-800 rounded-lg">
                  <span className="text-[10px] text-slate-500 block">FRONT</span>
                  <span className="font-bold text-cyan-400">{frontShield}%</span>
                </div>
                <div className="p-2 bg-slate-950 border border-slate-800 rounded-lg">
                  <span className="text-[10px] text-slate-500 block">PORT</span>
                  <span className="font-bold text-cyan-400">{portShield}%</span>
                </div>
                <div className="p-2 bg-slate-950 border border-slate-800 rounded-lg">
                  <span className="text-[10px] text-slate-500 block">STARBOARD</span>
                  <span className="font-bold text-cyan-400">{starboardShield}%</span>
                </div>
                <div className="p-2 bg-slate-950 border border-slate-800 rounded-lg">
                  <span className="text-[10px] text-slate-500 block">BACK</span>
                  <span className="font-bold text-cyan-400">{backShield}%</span>
                </div>
              </div>
              <button
                onClick={() => {
                  engine.useAbility(player, 'distribute_shields');
                  setActiveTab(null);
                }}
                className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs tracking-wider flex items-center justify-center gap-2 active:scale-95 transition"
              >
                <Shield className="w-4 h-4" /> EQUALIZE SHIELD ARCS
              </button>
            </div>
          )}

          {/* TAB 2: POWER MANAGEMENT */}
          {activeTab === 'power' && (
            <div className="space-y-2">
              <span className="text-[10px] text-slate-400 uppercase font-mono block">Power Presets</span>
              <div className="grid grid-cols-5 gap-1 text-[11px] font-bold">
                {(['weapons', 'shields', 'engines', 'auxiliary', 'balanced'] as PowerPreset[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => engine.setPowerPreset(player, p)}
                    className={`py-2 rounded-lg border uppercase transition ${
                      player.powerPreset === p
                        ? 'bg-amber-500 text-slate-950 border-amber-400 font-black'
                        : 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}
                  >
                    {p.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: TARGET SUBSYSTEMS */}
          {activeTab === 'target' && (
            <div className="space-y-2">
              <span className="text-[10px] text-slate-400 uppercase font-mono block">Target Subsystem Lock</span>
              {targetEnemy ? (
                <div className="grid grid-cols-2 gap-2">
                  {(['weapons', 'shields', 'engines', 'auxiliary'] as SubsystemType[]).map((sub) => {
                    const isSelected = player.targetedSubsystem === sub;
                    return (
                      <button
                        key={sub}
                        onClick={() => {
                          player.targetedSubsystem = isSelected ? null : sub;
                          setActiveTab(null);
                        }}
                        className={`p-2 rounded-xl border text-xs font-bold uppercase transition flex justify-between items-center ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950 border-amber-400 font-black'
                            : 'bg-slate-800 text-slate-200 border-slate-700'
                        }`}
                      >
                        <span>{sub}</span>
                        <span className="font-mono text-[10px]">{targetEnemy.subsystems[sub]}%</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs text-slate-500 text-center py-3 font-mono">
                  No target locked. Tap target button above first.
                </div>
              )}
            </div>
          )}

          {/* TAB 4: BOFF OFFICER ABILITIES */}
          {activeTab === 'abilities' && (
            <div className="grid grid-cols-2 gap-1.5">
              {player.abilities.map((ab) => {
                const isOnCooldown = ab.currentCooldown > 0;
                return (
                  <button
                    key={ab.id}
                    disabled={isOnCooldown}
                    onClick={() => {
                      engine.useAbility(player, ab.id);
                      setActiveTab(null);
                    }}
                    className={`p-2 rounded-xl border text-left transition flex flex-col justify-between ${
                      isOnCooldown
                        ? 'bg-slate-900 border-slate-800 text-slate-500 opacity-60'
                        : 'bg-slate-800 hover:bg-slate-700 border-cyan-800/60 text-slate-100 active:scale-95'
                    }`}
                  >
                    <span className="font-bold text-[11px] leading-tight block mb-1">{ab.name}</span>
                    <span className="text-[9px] font-mono text-cyan-400">
                      {isOnCooldown ? `CD: ${Math.ceil(ab.currentCooldown)}s` : `PWR: ${ab.powerCost}`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* TAB 5: COMBAT LOG */}
          {activeTab === 'log' && (
            <div className="space-y-1 font-mono text-[10px] max-h-36 overflow-y-auto text-slate-300">
              {engine.combatLogs.length === 0 ? (
                <div className="text-slate-500 text-center py-2">No combat log entries yet.</div>
              ) : (
                engine.combatLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`py-0.5 border-b border-slate-800/50 ${
                      log.type === 'hit'
                        ? 'text-red-400'
                        : log.type === 'shield_drain'
                        ? 'text-cyan-400'
                        : log.type === 'ability'
                        ? 'text-emerald-400'
                        : 'text-slate-400'
                    }`}
                  >
                    [{log.timestamp}] {log.text}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* --- BOTTOM TOUCH CONTROLS & TAB BAR --- */}
      <div className="pointer-events-auto flex flex-col gap-2 w-full">
        {/* Thumb Controls Row */}
        <div className="flex items-end justify-between w-full">
          {/* LEFT THUMB: Helm Steering & Impulse Speed Controls */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  const max = player.shipClass.maxSpeed;
                  const steps = [-max * 0.25, 0, max * 0.25, max * 0.5, max];
                  const current = player.targetSpeed;
                  const next = steps.find((s) => s > current + 0.1);
                  player.targetSpeed = next !== undefined ? next : max;
                }}
                className="p-3 rounded-xl bg-slate-900/90 border border-slate-700 text-emerald-400 font-bold active:scale-90 transition shadow-lg flex items-center justify-center min-w-[48px] min-h-[48px]"
                title="Speed Up"
              >
                <ChevronUp className="w-5 h-5" />
              </button>

              <button
                onClick={() => {
                  const max = player.shipClass.maxSpeed;
                  const steps = [-max * 0.25, 0, max * 0.25, max * 0.5, max];
                  const current = player.targetSpeed;
                  const prev = [...steps].reverse().find((s) => s < current - 0.1);
                  player.targetSpeed = prev !== undefined ? prev : -max * 0.25;
                }}
                className="p-3 rounded-xl bg-slate-900/90 border border-slate-700 text-amber-400 font-bold active:scale-90 transition shadow-lg flex items-center justify-center min-w-[48px] min-h-[48px]"
                title="Slow Down / Reverse"
              >
                <ChevronDown className="w-5 h-5" />
              </button>

              <button
                onClick={() => (player.targetSpeed = 0)}
                className="px-2.5 py-3 rounded-xl bg-red-950/80 border border-red-800 text-red-300 font-bold text-xs active:scale-90 transition shadow-lg min-h-[48px]"
              >
                STOP
              </button>
            </div>

            {/* Turn Steering Buttons (Hold or Tap) */}
            <div className="flex items-center gap-1 w-full">
              <button
                onPointerDown={(e) => startTurning('left', e)}
                onPointerUp={(e) => stopTurning(e)}
                onPointerLeave={(e) => stopTurning(e)}
                onPointerCancel={(e) => stopTurning(e)}
                className="px-3 py-3 rounded-xl bg-slate-900/95 border border-cyan-700/60 text-cyan-400 font-black text-xs tracking-wider active:bg-cyan-500 active:text-slate-950 transition shadow-lg flex-1 text-center min-h-[50px] select-none touch-none flex items-center justify-center gap-1"
              >
                ◄ PORT
              </button>

              <button
                onPointerDown={(e) => startTurning('right', e)}
                onPointerUp={(e) => stopTurning(e)}
                onPointerLeave={(e) => stopTurning(e)}
                onPointerCancel={(e) => stopTurning(e)}
                className="px-3 py-3 rounded-xl bg-slate-900/95 border border-cyan-700/60 text-cyan-400 font-black text-xs tracking-wider active:bg-cyan-500 active:text-slate-950 transition shadow-lg flex-1 text-center min-h-[50px] select-none touch-none flex items-center justify-center gap-1"
              >
                STBD ►
              </button>
            </div>
          </div>

          {/* RIGHT THUMB: Weapon Volley & Combat Action Controls */}
          <div className="flex flex-col gap-1 items-end">
            <div className="flex items-center gap-1">
              <button
                onClick={onToggleAutoFire}
                className={`px-3 py-2.5 rounded-xl border text-[11px] font-bold tracking-wider transition min-h-[48px] ${
                  autoFire
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-amber-500/20 font-black'
                    : 'bg-slate-900/90 text-slate-400 border-slate-700'
                }`}
              >
                AUTO: {autoFire ? 'ON' : 'OFF'}
              </button>

              <button
                onClick={onCycleTarget}
                className="p-3 rounded-xl bg-slate-900/90 border border-slate-700 text-cyan-400 active:scale-90 transition shadow-lg min-w-[48px] min-h-[48px] flex items-center justify-center"
                title="Next Target"
              >
                <Target className="w-5 h-5 text-red-400" />
              </button>
            </div>

            {/* INDEPENDENT WEAPON BUTTONS FOR EACH WEAPON SYSTEM */}
            <div className="flex items-center gap-1.5 w-full overflow-x-auto pb-0.5">
              {weaponGroups.map((group) => {
                const isReady = group.weapons.some((w) => w.currentCooldown <= 0);
                const dist = player && targetEnemy && !targetEnemy.isDestroyed
                  ? Math.hypot(
                      player.position.x - targetEnemy.position.x,
                      (player.position.y || 0) - (targetEnemy.position.y || 0),
                      player.position.z - targetEnemy.position.z
                    )
                  : Infinity;
                const isInArcAndRange = player && targetEnemy && !targetEnemy.isDestroyed
                  ? group.weapons.some(
                      (w) =>
                        dist <= w.range &&
                        SpaceCombatEngine.isInFiringArc(
                          player.position,
                          player.rotation.y,
                          targetEnemy.position,
                          w.firingArc,
                          w
                        )
                    )
                  : false;
                const minCd = Math.min(...group.weapons.map((w) => w.currentCooldown));
                const maxCd = Math.max(...group.weapons.map((w) => w.cooldown));
                const cdPercent = isReady ? 0 : (minCd / maxCd) * 100;
                const theme = getWeaponColorTheme(group.color, group.isTorpedo);

                return (
                  <button
                    key={group.id}
                    title={`${group.name} (${group.arcLabel})`}
                    onClick={() => {
                      if (group.isTorpedo) {
                        engine.fireWeaponGroup(player, group.indices, targetEnemy || undefined);
                      } else if (targetEnemy) {
                        engine.fireWeaponGroup(player, group.indices, targetEnemy);
                      } else {
                        onCycleTarget();
                      }
                    }}
                    disabled={!isReady}
                    className={`relative px-2 py-1.5 rounded-lg border font-mono text-xs tracking-tight uppercase shadow-md transition flex items-center justify-between gap-1 min-h-[38px] overflow-hidden flex-1 ${
                      !isReady
                        ? 'bg-slate-950/80 border-slate-800 opacity-60 text-slate-400'
                        : isInArcAndRange
                        ? `bg-gradient-to-r ${theme.activeGradient} ${theme.activeBorder} ${theme.activeRing} text-white shadow-lg ${theme.activeShadow} animate-pulse`
                        : `bg-gradient-to-r ${theme.activeGradient} ${theme.activeBorder} ${theme.activeText} shadow-md hover:brightness-125 active:scale-95`
                    }`}
                  >
                    <div className="flex items-center gap-1 relative z-10 shrink-0">
                      {group.isTorpedo ? (
                        <Flame className={`w-3.5 h-3.5 fill-current shrink-0 ${isInArcAndRange ? 'text-white' : theme.activeText}`} />
                      ) : (
                        <Zap className={`w-3.5 h-3.5 fill-current shrink-0 ${isInArcAndRange ? 'text-white' : theme.activeText}`} />
                      )}
                      <span className="font-extrabold text-xs">{group.shortName}</span>
                    </div>
                    <span className="text-[9px] relative z-10 font-bold shrink-0 opacity-90">
                      {isInArcAndRange ? 'READY ✓' : isReady ? 'RDY' : `${minCd.toFixed(1)}s`}
                    </span>

                    {!isReady && (
                      <div
                        className="absolute inset-y-0 left-0 bg-slate-950/80 border-r border-slate-700"
                        style={{ width: `${cdPercent}%` }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Floating System Dock Tabs */}
        <div className="grid grid-cols-6 gap-1 bg-slate-900/95 backdrop-blur border border-slate-800 rounded-xl p-1 shadow-2xl">
          <button
            onClick={() => setActiveTab(activeTab === 'map' ? null : 'map')}
            className={`py-2 rounded-lg text-[10px] font-bold flex flex-col items-center justify-center gap-0.5 transition ${
              activeTab === 'map' ? 'bg-cyan-500 text-slate-950 font-black' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>MAP</span>
          </button>

          <button
            onClick={() => setActiveTab(activeTab === 'shields' ? null : 'shields')}
            className={`py-2 rounded-lg text-[10px] font-bold flex flex-col items-center justify-center gap-0.5 transition ${
              activeTab === 'shields' ? 'bg-cyan-500 text-slate-950 font-black' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>SHIELDS</span>
          </button>

          <button
            onClick={() => setActiveTab(activeTab === 'target' ? null : 'target')}
            className={`py-2 rounded-lg text-[10px] font-bold flex flex-col items-center justify-center gap-0.5 transition ${
              activeTab === 'target' ? 'bg-cyan-500 text-slate-950 font-black' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>TARGET</span>
          </button>

          <button
            onClick={() => setActiveTab(activeTab === 'abilities' ? null : 'abilities')}
            className={`py-2 rounded-lg text-[10px] font-bold flex flex-col items-center justify-center gap-0.5 transition ${
              activeTab === 'abilities' ? 'bg-cyan-500 text-slate-950 font-black' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>SKILLS</span>
          </button>

          <button
            onClick={() => setActiveTab(activeTab === 'log' ? null : 'log')}
            className={`py-2 rounded-lg text-[10px] font-bold flex flex-col items-center justify-center gap-0.5 transition ${
              activeTab === 'log' ? 'bg-cyan-500 text-slate-950 font-black' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>LOG</span>
          </button>
        </div>
      </div>

      {/* --- MOBILE FULL MENU OVERLAY MODAL --- */}
      {showMenuModal && (
        <div className="pointer-events-auto fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex flex-col p-6 animate-in fade-in">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <h2 className="text-lg font-black tracking-widest text-slate-100 uppercase flex items-center gap-2">
              <Ship className="w-5 h-5 text-cyan-400" /> TACTICAL COMMAND MENU
            </h2>
            <button
              onClick={() => setShowMenuModal(false)}
              className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="flex-1 flex flex-col justify-center gap-3 max-w-sm mx-auto w-full py-6">
            <button
              onClick={onToggleCompactHud}
              className="w-full py-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-400 font-bold text-sm tracking-wider flex items-center justify-center gap-3 transition"
            >
              <Compass className="w-5 h-5 text-amber-400" />
              <span>HUD MODE: {useCompactHud ? 'COMPACT (TOUCH)' : 'DESKTOP (FULL)'}</span>
            </button>

            <button
              onClick={() => {
                setShowMenuModal(false);
                onOpenHangar();
              }}
              className="w-full py-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 font-bold text-sm tracking-wider flex items-center justify-center gap-3 transition"
            >
              <Ship className="w-5 h-5 text-cyan-400" /> HANGAR DOCK & SHIP CLASS
            </button>

            <button
              onClick={() => {
                setShowMenuModal(false);
                onOpenMissions();
              }}
              className="w-full py-4 rounded-xl bg-amber-950/80 hover:bg-amber-900 border border-amber-800 text-amber-300 font-bold text-sm tracking-wider flex items-center justify-center gap-3 transition"
            >
              <Crosshair className="w-5 h-5 text-amber-400" /> SELECT MISSION SECTOR
            </button>

            <button
              onClick={() => {
                setShowMenuModal(false);
                onRestart();
              }}
              className="w-full py-4 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 font-bold text-sm tracking-wider flex items-center justify-center gap-3 transition"
            >
              <RefreshCw className="w-5 h-5 text-emerald-400" /> RESTART SECTOR COMBAT
            </button>

            <button
              onClick={onToggleMute}
              className="w-full py-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-sm tracking-wider flex items-center justify-center gap-3 transition"
            >
              {isMuted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5 text-cyan-400" />}
              <span>{isMuted ? 'UNMUTE AUDIO EFFECTS' : 'MUTE AUDIO EFFECTS'}</span>
            </button>
          </div>

          <button
            onClick={() => setShowMenuModal(false)}
            className="w-full py-3 rounded-xl bg-cyan-500 text-slate-950 font-black text-xs tracking-widest uppercase"
          >
            RETURN TO BATTLE
          </button>
        </div>
      )}
    </div>
  );
};
