import React from 'react';
import { ShipEntity, Weapon, Ability, ShieldArcKey } from '../types';
import { SpaceCombatEngine } from '../game/spaceCombatEngine';
import { groupShipWeapons, getWeaponColorTheme } from '../utils/weaponUtils';
import { Zap, Flame, Shield, Navigation, RotateCw, Radio } from 'lucide-react';

interface WeaponsBarProps {
  weapons: Weapon[];
  abilities: Ability[];
  autoFire: boolean;
  player?: ShipEntity;
  target?: ShipEntity | null;
  onFireWeaponGroup: (indices: number[]) => void;
  onUseAbility: (id: string) => void;
  onToggleAutoFire: () => void;
}

export const WeaponsBar: React.FC<WeaponsBarProps> = ({
  weapons,
  abilities,
  autoFire,
  player,
  target,
  onFireWeaponGroup,
  onUseAbility,
  onToggleAutoFire,
}) => {
  // Identify Ship Special Ability (Brawler: Magnetic Mine, Carrier: Launch Fighter, Dragoon: Vector Burst, Support: Aegis Wave)
  const specialAbility = abilities.find(
    (a) =>
      a.id === 'inertial_mine' ||
      a.id === 'launch_drone' ||
      a.id === 'launch_fighter' ||
      a.id === 'vector_burst' ||
      a.id === 'swarm_detonation' ||
      a.id === 'aegis_restoration_pulse'
  ) || abilities[0];

  // Group weapons by system (multiple arcs for same weapon system merged into 1 button)
  const weaponGroups = groupShipWeapons(weapons);

  // Helper: Check if target's facing quadrant is collapsed
  const isFacingQuadrantCollapsed = (): boolean => {
    if (!player || !target || target.isDestroyed) return false;

    const dxT = player.position.x - target.position.x;
    const dzT = player.position.z - target.position.z;
    const angleToPlayer = Math.atan2(dxT, dzT);
    let targetRelAngle = angleToPlayer - target.rotation.y;
    targetRelAngle = Math.atan2(Math.sin(targetRelAngle), Math.cos(targetRelAngle));
    const targetRelDeg = (targetRelAngle * 180) / Math.PI;

    let arcKey: ShieldArcKey = 'front';
    if (targetRelDeg >= -45 && targetRelDeg <= 45) {
      arcKey = 'front';
    } else if (targetRelDeg > 45 && targetRelDeg < 135) {
      arcKey = 'starboard';
    } else if (targetRelDeg > -135 && targetRelDeg < -45) {
      arcKey = 'port';
    } else {
      arcKey = 'back';
    }

    const s = target.shields[arcKey];
    return s ? (s.max > 0 ? (s.current / s.max) <= 0.05 : s.current <= 0) : true;
  };

  const targetUnshielded = isFacingQuadrantCollapsed();

  return (
    <div className="p-3 rounded-2xl bg-slate-900/95 backdrop-blur border border-slate-800 text-slate-100 shadow-2xl flex flex-col md:flex-row items-stretch gap-3 max-w-4xl w-full">
      {/* Auto Fire Toggle Button */}
      <button
        onClick={onToggleAutoFire}
        className={`px-3 py-2 rounded-xl border text-xs font-bold tracking-wide transition flex flex-col items-center justify-center shrink-0 min-w-[70px] ${
          autoFire
            ? 'bg-amber-500/20 text-amber-400 border-amber-500/80 shadow-lg shadow-amber-500/10'
            : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
        }`}
        title="Toggle automatic weapon sequencing when target is in arc"
      >
        <RotateCw className={`w-4 h-4 mb-1 ${autoFire ? 'animate-spin text-amber-400' : 'text-slate-500'}`} />
        <span className="text-[9px] uppercase font-mono font-bold">AUTO-FIRE</span>
        <span className="font-mono text-[10px] font-black">{autoFire ? 'ON' : 'OFF'}</span>
      </button>

      {/* WEAPON CARDS GRID */}
      <div className={`grid gap-3 flex-1 ${weaponGroups.length > 2 ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'}`}>
        {weaponGroups.map((group, index) => {
          const isReady = group.weapons.some((w) => w.currentCooldown <= 0);
          const minCurrentCd = Math.min(...group.weapons.map((w) => w.currentCooldown));
          const maxCd = Math.max(...group.weapons.map((w) => w.cooldown));
          const cdRatio = isReady ? 0 : minCurrentCd / maxCd;

          const dist = player && target && !target.isDestroyed
            ? Math.hypot(
                player.position.x - target.position.x,
                (player.position.y || 0) - (target.position.y || 0),
                player.position.z - target.position.z
              )
            : Infinity;

          const isInArc = player && target && !target.isDestroyed
            ? group.weapons.some((w) => SpaceCombatEngine.isInFiringArc(player.position, player.rotation.y, target.position, w.firingArc, w))
            : false;

          const isInRange = player && target && !target.isDestroyed
            ? group.weapons.some((w) => dist <= w.range)
            : false;

          const isInArcAndRange = player && target && !target.isDestroyed
            ? group.weapons.some((w) =>
                dist <= w.range && SpaceCombatEngine.isInFiringArc(player.position, player.rotation.y, target.position, w.firingArc, w)
              )
            : false;

          const theme = getWeaponColorTheme(group.color, group.isTorpedo);
          const isHealShieldGroup = group.weapons.some((w) => w.isHealShield || w.type === 'shield_transfer_beam');
          const isHealHullGroup = group.weapons.some((w) => w.isHealHull || w.type === 'hull_repair_beam');
          const isSupportWeapon = isHealShieldGroup || isHealHullGroup;

          // Determine damage / support type label
          let damageTypeLabel = '1.0x SHIELD & HULL';
          if (isHealShieldGroup) {
            damageTypeLabel = 'RESTORES ALLY SHIELDS';
          } else if (isHealHullGroup) {
            damageTypeLabel = 'REPAIRS ALLY HULL';
          } else if (group.isTorpedo) {
            damageTypeLabel = targetUnshielded
              ? '⚡ 3.0x HULL BLEED!'
              : '0.25x SHIELD / 3.0x HULL';
          } else if (group.type === 'disruptor_beam' || group.name.toLowerCase().includes('stripper')) {
            damageTypeLabel = 'HIGH VS SHIELDS';
          }

          const isDragoon = player ? (player.shipClass.id.includes('dragoon') || player.shipClass.id.includes('interceptor')) : false;
          const isPlasmaBall = isDragoon && group.isTorpedo;
          const hotkeyLabel = index === 0 ? 'SPACE / 1' : isPlasmaBall ? 'HOLD E' : index === 1 ? 'E / 2' : index === 2 ? 'T / 3' : `${index + 1}`;
          const showReadyHighlight = isSupportWeapon ? isReady : isInArcAndRange;

          return (
            <div key={group.id} className="flex flex-col gap-1">
              <button
                onClick={() => {
                  if (!isPlasmaBall) {
                    onFireWeaponGroup(group.indices);
                  }
                }}
                disabled={!isReady}
                className={`relative p-3 rounded-xl border text-left transition-all overflow-hidden flex flex-col justify-between min-h-[72px] ${
                  !isReady
                    ? 'bg-slate-950/90 border-slate-800 opacity-60 cursor-not-allowed text-slate-500'
                    : showReadyHighlight
                    ? `bg-gradient-to-r ${theme.activeGradient} ${theme.activeBorder} ${theme.activeRing} ${theme.activeText} shadow-xl ${theme.activeShadow}`
                    : `bg-gradient-to-r ${theme.activeGradient} ${theme.activeBorder} ${theme.activeText} shadow-md hover:brightness-125`
                }`}
              >
                {/* Header Row */}
                <div className="flex items-center justify-between relative z-10 w-full mb-1">
                  <div className="flex items-center gap-2 truncate">
                    <div className={`p-1.5 rounded-lg shrink-0 ${
                      isReady
                        ? theme.badgeBg
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {isSupportWeapon ? (
                        <Shield className="w-4 h-4 fill-current" />
                      ) : group.isTorpedo ? (
                        <Flame className="w-4 h-4 fill-current" />
                      ) : (
                        <Zap className="w-4 h-4 fill-current" />
                      )}
                    </div>
                    <div className="truncate">
                      <span className="font-black text-xs uppercase tracking-wider block truncate leading-none">
                        {group.name.toUpperCase()}
                      </span>
                      <span className="text-[9px] font-mono opacity-80 uppercase block mt-0.5">
                        ARC: {group.arcLabel}
                      </span>
                    </div>
                  </div>

                  {/* Hotkey Badge */}
                  <span className="text-[9px] font-mono font-bold bg-slate-900 text-cyan-300 border border-slate-700 px-1.5 py-0.5 rounded shrink-0">
                    [{hotkeyLabel}]
                  </span>
                </div>

                {/* Sub-Header: Arc Status & Damage Readout */}
                <div className="flex items-center justify-between relative z-10 w-full font-mono text-[9px] mt-1">
                  {/* Arc Badge */}
                  <span
                    className={`px-1.5 py-0.5 rounded font-black uppercase tracking-wide border transition-colors ${
                      !isReady
                        ? 'bg-slate-900 text-slate-500 border-slate-800'
                        : isSupportWeapon
                        ? `${theme.badgeBg} border-white/50 shadow-md`
                        : isInArcAndRange
                        ? `${theme.badgeBg} border-white/50 shadow-md`
                        : group.isTorpedo
                        ? 'bg-slate-800/90 text-slate-300 border-slate-700'
                        : 'bg-red-950/90 text-red-300 border-red-800/80'
                    }`}
                  >
                    {isSupportWeapon
                      ? 'AUTO-ALLY READY'
                      : !target || target.isDestroyed
                      ? 'NO TARGET'
                      : isInArcAndRange
                      ? 'IN ARC & RANGE ✓'
                      : isInArc
                      ? 'OUT OF RANGE'
                      : 'OUT OF ARC'}
                  </span>

                  {/* Damage Type Readout */}
                  <span
                    className={`px-1.5 py-0.5 rounded font-bold uppercase tracking-tight ${
                      group.isTorpedo && targetUnshielded
                        ? 'bg-amber-500 text-slate-950 font-black animate-bounce shadow-md'
                        : 'bg-slate-900 text-slate-400'
                    }`}
                  >
                    {damageTypeLabel}
                  </span>
                </div>

                {/* Cooldown Overlay */}
                {!isReady && (
                  <div
                    className="absolute inset-y-0 left-0 bg-slate-900/80 border-r border-slate-700 transition-all duration-100"
                    style={{ width: `${cdRatio * 100}%` }}
                  />
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* DISTINCT SPECIAL ABILITY SLOT */}
      {specialAbility && (
        <div className="flex flex-col shrink-0 min-w-[170px]">
          <span className="text-[9px] font-mono font-bold text-amber-400 uppercase tracking-widest mb-1 block text-center">
            SPECIAL ABILITY
          </span>
          <button
            onClick={() => onUseAbility(specialAbility.id)}
            disabled={specialAbility.currentCooldown > 0}
            className={`relative p-3 rounded-xl border text-left transition-all overflow-hidden flex flex-col justify-between h-full min-h-[72px] ${
              specialAbility.currentCooldown > 0
                ? 'bg-slate-950/90 border-slate-800 opacity-60 cursor-not-allowed text-slate-500'
                : 'bg-gradient-to-r from-amber-950/80 via-amber-900/60 to-amber-950/80 hover:from-amber-900 hover:to-amber-800 border-amber-600/80 text-amber-100 shadow-lg shadow-amber-500/20 active:scale-98'
            }`}
            title={`${specialAbility.name}: ${specialAbility.description}`}
          >
            <div className="flex items-center justify-between relative z-10 w-full mb-1">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40">
                  {specialAbility.id === 'inertial_mine' ? (
                    <Flame className="w-4 h-4 fill-current text-amber-400" />
                  ) : specialAbility.id === 'launch_drone' || specialAbility.id === 'launch_fighter' ? (
                    <Radio className="w-4 h-4 fill-current text-cyan-400" />
                  ) : specialAbility.id === 'vector_burst' ? (
                    <Navigation className="w-4 h-4 fill-current text-amber-400" />
                  ) : (
                    <Zap className="w-4 h-4 fill-current text-amber-400" />
                  )}
                </div>
                <div>
                  <span className="font-black text-xs uppercase tracking-wider block leading-none text-amber-300">
                    {specialAbility.name.toUpperCase()}
                  </span>
                  <span className="text-[9px] font-mono opacity-80 block mt-0.5 text-amber-400/80">
                    {specialAbility.id === 'inertial_mine'
                      ? 'MAGNETIC MINE'
                      : specialAbility.id === 'launch_drone' || specialAbility.id === 'launch_fighter'
                      ? 'DEPLOY FIGHTER DRONE'
                      : specialAbility.id === 'vector_burst'
                      ? '90° PIVOT BURST'
                      : specialAbility.id === 'aegis_restoration_pulse'
                      ? 'FLEET SHIELD & HULL WAVE'
                      : 'SPECIAL SYSTEM'}
                  </span>
                </div>
              </div>

              <span className="text-[9px] font-mono font-bold bg-slate-950 text-amber-300 border border-amber-800 px-1.5 py-0.5 rounded">
                [Q]
              </span>
            </div>

            <div className="flex items-center justify-between relative z-10 w-full font-mono text-[9px] mt-1">
              <span className="text-amber-400 font-bold uppercase">HOTKEY [Q]</span>
              <span className={`px-1.5 py-0.5 rounded font-black ${
                specialAbility.currentCooldown <= 0 ? 'bg-amber-400 text-slate-950' : 'text-slate-400'
              }`}>
                {specialAbility.currentCooldown <= 0 ? 'READY' : `${specialAbility.currentCooldown.toFixed(1)}s`}
              </span>
            </div>

            {/* Cooldown Overlay */}
            {specialAbility.currentCooldown > 0 && (
              <div
                className="absolute inset-y-0 left-0 bg-slate-950/80 border-r border-amber-600/40 transition-all duration-100"
                style={{ width: `${(specialAbility.currentCooldown / specialAbility.cooldown) * 100}%` }}
              />
            )}
          </button>
        </div>
      )}
    </div>
  );
};
