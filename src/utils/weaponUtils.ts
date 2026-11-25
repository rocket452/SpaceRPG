import { FiringArc, Weapon } from '../types';

export interface WeaponGroup {
  id: string;
  name: string;
  shortName: string;
  type: string;
  isTorpedo: boolean;
  indices: number[]; // Indices in ship.weapons
  weapons: Weapon[];
  firingArcs: FiringArc[];
  arcLabel: string;
  color: string;
}

/**
 * Generates concise 2-4 letter initials for weapon group buttons (e.g., "Heavy Phaser Array" -> "HPA", "Photon Torpedoes" -> "PT")
 */
export function getWeaponInitials(name: string): string {
  const clean = getBaseWeaponName(name);
  const words = clean.split(/\s+/);
  if (words.length === 1) {
    return words[0].slice(0, 3).toUpperCase();
  }
  return words.map((w) => w[0]).join('').toUpperCase();
}

/**
 * Strips direction prefix from a weapon name (e.g. "Port Pulse Battery" -> "Pulse Battery")
 */
export function getBaseWeaponName(name: string): string {
  return name
    .replace(/^(Port|Starboard|Fore|Aft|Left|Right)\s+/i, '')
    .trim();
}

/**
 * Converts a base weapon name into a clean plural or group display name if it covers multiple hardpoints
 */
export function getGroupDisplayName(baseName: string, count: number): string {
  if (count <= 1) return baseName;

  const lower = baseName.toLowerCase();
  if (lower.endsWith('battery')) {
    return baseName.replace(/battery$/i, 'Batteries');
  }
  if (lower.endsWith('beam') || lower.endsWith('turret') || lower.endsWith('launcher') || lower.endsWith('cannon') || lower.endsWith('tube') || lower.endsWith('array')) {
    return `${baseName}s`;
  }

  return `${baseName}s`;
}

/**
 * Groups a ship's weapons into distinct weapon system groups.
 * Weapons that share the same base name / type across multiple firing arcs on the same ship
 * are merged into a single weapon group button.
 */
export function groupShipWeapons(weapons: Weapon[]): WeaponGroup[] {
  if (!weapons || weapons.length === 0) return [];

  const groupsMap = new Map<string, { weapons: Weapon[]; indices: number[] }>();

  weapons.forEach((w, index) => {
    const baseName = getBaseWeaponName(w.name);
    // Group key based on clean base name, type, and torpedo status
    const groupKey = `${baseName.toLowerCase()}_${w.type}_${w.isTorpedo}`;

    if (!groupsMap.has(groupKey)) {
      groupsMap.set(groupKey, { weapons: [], indices: [] });
    }
    const entry = groupsMap.get(groupKey)!;
    entry.weapons.push(w);
    entry.indices.push(index);
  });

  const result: WeaponGroup[] = [];
  const usedColorIds = new Set<string>();

  groupsMap.forEach((entry, groupKey) => {
    const firstWeapon = entry.weapons[0];
    const baseName = getBaseWeaponName(firstWeapon.name);
    const displayName = getGroupDisplayName(baseName, entry.weapons.length);
    const firingArcs = Array.from(new Set(entry.weapons.map((w) => w.firingArc)));

    // Format Arc Label
    let arcLabel = '';
    const hasPort = firingArcs.some((a) => a.includes('port') || a === 'broadside');
    const hasStarboard = firingArcs.some((a) => a.includes('starboard') || a === 'broadside');
    const hasFore = firingArcs.some((a) => a.includes('forward') || a.includes('fore'));
    const hasAft = firingArcs.some((a) => a.includes('aft'));

    if (firingArcs.length > 1) {
      if (hasPort && hasStarboard) {
        arcLabel = 'PORT / STARBOARD';
      } else if (hasFore && hasAft) {
        arcLabel = 'FORE / AFT';
      } else {
        arcLabel = 'MULTI-ARC';
      }
    } else {
      const arc = firingArcs[0];
      if (arc === 'broadside_360') {
        arcLabel = '360° OMNI';
      } else if (arc === 'broadside') {
        arcLabel = 'PORT / STARBOARD 180°';
      } else {
        arcLabel = arc.replace('_', ' ').toUpperCase();
      }
    }

    // Determine candidate color ID (Green for 1st weapon group, Purple for 2nd weapon group)
    let candidateId = result.length === 0 ? 'green' : result.length === 1 ? 'purple' : 'cyan';
    if (firstWeapon.color) {
      const hexLower = firstWeapon.color.toLowerCase();
      if (hexLower.includes('10b981') || hexLower.includes('4ade80') || hexLower.includes('22c55e')) candidateId = 'green';
      else if (hexLower.includes('8b5cf6') || hexLower.includes('c084fc') || hexLower.includes('a855f7')) candidateId = 'purple';
      else if (hexLower.includes('38bdf8') || hexLower.includes('0284c7')) candidateId = 'cyan';
      else if (hexLower.includes('ef4444')) candidateId = 'red';
      else if (hexLower.includes('f97316')) candidateId = 'orange';
      else if (hexLower.includes('ec4899')) candidateId = 'pink';
      else if (hexLower.includes('eab308')) candidateId = 'yellow';
    }

    // Pick a unique color from WEAPON_PALETTE so no color is used twice on the same ship
    let chosenItem = WEAPON_PALETTE.find((p) => p.id === candidateId);
    if (!chosenItem || usedColorIds.has(chosenItem.id)) {
      const unused = WEAPON_PALETTE.find((p) => !usedColorIds.has(p.id));
      if (unused) {
        chosenItem = unused;
      } else {
        chosenItem = WEAPON_PALETTE[result.length % WEAPON_PALETTE.length];
      }
    }

    usedColorIds.add(chosenItem.id);
    const assignedHex = chosenItem.hexStr;

    // Mutate weapons in group to share this unique color
    entry.weapons.forEach((w) => {
      w.color = assignedHex;
    });

    result.push({
      id: groupKey,
      name: displayName,
      shortName: getWeaponInitials(displayName),
      type: firstWeapon.type,
      isTorpedo: firstWeapon.isTorpedo,
      indices: entry.indices,
      weapons: entry.weapons,
      firingArcs,
      arcLabel,
      color: assignedHex,
    });
  });

  return result;
}

export interface WeaponColorTheme {
  hex: number;
  brightHex: number;
  activeGradient: string;
  activeBorder: string;
  activeRing: string;
  activeText: string;
  activeShadow: string;
  iconBg: string;
  iconText: string;
  badgeBg: string;
}

// Full palette of high-contrast, distinct weapon color themes
export const WEAPON_PALETTE: { id: string; hexStr: string; theme: WeaponColorTheme }[] = [
  {
    id: 'green',
    hexStr: '#10b981',
    theme: {
      hex: 0x22c55e,
      brightHex: 0x86efac,
      activeGradient: 'from-emerald-950 via-green-900 to-emerald-900',
      activeBorder: 'border-emerald-400',
      activeRing: 'ring-2 ring-emerald-400/80',
      activeText: 'text-emerald-100',
      activeShadow: 'shadow-emerald-500/40',
      iconBg: 'bg-emerald-500',
      iconText: 'text-slate-950',
      badgeBg: 'bg-emerald-500 text-slate-950',
    },
  },
  {
    id: 'purple',
    hexStr: '#a855f7',
    theme: {
      hex: 0xa855f7,
      brightHex: 0xe9d5ff,
      activeGradient: 'from-purple-950 via-fuchsia-900 to-purple-900',
      activeBorder: 'border-purple-400',
      activeRing: 'ring-2 ring-purple-400/80',
      activeText: 'text-purple-100',
      activeShadow: 'shadow-purple-500/40',
      iconBg: 'bg-purple-500',
      iconText: 'text-slate-950',
      badgeBg: 'bg-purple-500 text-slate-950',
    },
  },
  {
    id: 'cyan',
    hexStr: '#38bdf8',
    theme: {
      hex: 0x38bdf8,
      brightHex: 0xbae6fd,
      activeGradient: 'from-cyan-950 via-sky-900 to-cyan-900',
      activeBorder: 'border-cyan-400',
      activeRing: 'ring-2 ring-cyan-400/80',
      activeText: 'text-cyan-100',
      activeShadow: 'shadow-cyan-500/40',
      iconBg: 'bg-cyan-400',
      iconText: 'text-slate-950',
      badgeBg: 'bg-cyan-400 text-slate-950',
    },
  },
  {
    id: 'orange',
    hexStr: '#f97316',
    theme: {
      hex: 0xf97316,
      brightHex: 0xfde68a,
      activeGradient: 'from-amber-950 via-orange-900 to-amber-900',
      activeBorder: 'border-orange-400',
      activeRing: 'ring-2 ring-orange-400/80',
      activeText: 'text-orange-100',
      activeShadow: 'shadow-orange-500/40',
      iconBg: 'bg-orange-500',
      iconText: 'text-slate-950',
      badgeBg: 'bg-orange-500 text-slate-950',
    },
  },
  {
    id: 'red',
    hexStr: '#ef4444',
    theme: {
      hex: 0xef4444,
      brightHex: 0xfca5a5,
      activeGradient: 'from-red-950 via-rose-900 to-red-900',
      activeBorder: 'border-red-400',
      activeRing: 'ring-2 ring-red-400/80',
      activeText: 'text-red-100',
      activeShadow: 'shadow-red-500/40',
      iconBg: 'bg-red-500',
      iconText: 'text-slate-950',
      badgeBg: 'bg-red-500 text-slate-950',
    },
  },
  {
    id: 'pink',
    hexStr: '#ec4899',
    theme: {
      hex: 0xec4899,
      brightHex: 0xfbcfe8,
      activeGradient: 'from-pink-950 via-fuchsia-900 to-pink-900',
      activeBorder: 'border-pink-400',
      activeRing: 'ring-2 ring-pink-400/80',
      activeText: 'text-pink-100',
      activeShadow: 'shadow-pink-500/40',
      iconBg: 'bg-pink-500',
      iconText: 'text-slate-950',
      badgeBg: 'bg-pink-500 text-slate-950',
    },
  },
  {
    id: 'yellow',
    hexStr: '#eab308',
    theme: {
      hex: 0xeab308,
      brightHex: 0xfef08a,
      activeGradient: 'from-yellow-950 via-amber-900 to-yellow-900',
      activeBorder: 'border-yellow-400',
      activeRing: 'ring-2 ring-yellow-400/80',
      activeText: 'text-yellow-100',
      activeShadow: 'shadow-yellow-500/40',
      iconBg: 'bg-yellow-400',
      iconText: 'text-slate-950',
      badgeBg: 'bg-yellow-400 text-slate-950',
    },
  },
];

export function getWeaponColorTheme(colorHex?: string, isTorpedo?: boolean): WeaponColorTheme {
  const hexString = (colorHex || '').toLowerCase();

  if (hexString.includes('10b981') || hexString.includes('22c55e') || hexString.includes('4ade80') || hexString.includes('green')) {
    return WEAPON_PALETTE.find((p) => p.id === 'green')!.theme;
  }
  if (hexString.includes('a855f7') || hexString.includes('8b5cf6') || hexString.includes('c084fc') || hexString.includes('purple')) {
    return WEAPON_PALETTE.find((p) => p.id === 'purple')!.theme;
  }
  if (hexString.includes('38bdf8') || hexString.includes('0284c7') || hexString.includes('06b6d4') || hexString.includes('cyan') || hexString.includes('sky')) {
    return WEAPON_PALETTE.find((p) => p.id === 'cyan')!.theme;
  }
  if (hexString.includes('f97316') || hexString.includes('f59e0b') || hexString.includes('orange') || hexString.includes('amber')) {
    return WEAPON_PALETTE.find((p) => p.id === 'orange')!.theme;
  }
  if (hexString.includes('ef4444') || hexString.includes('dc2626') || hexString.includes('ff0044') || hexString.includes('red')) {
    return WEAPON_PALETTE.find((p) => p.id === 'red')!.theme;
  }
  if (hexString.includes('ec4899') || hexString.includes('d946ef') || hexString.includes('pink')) {
    return WEAPON_PALETTE.find((p) => p.id === 'pink')!.theme;
  }
  if (hexString.includes('eab308') || hexString.includes('facc15') || hexString.includes('yellow') || hexString.includes('gold')) {
    return WEAPON_PALETTE.find((p) => p.id === 'yellow')!.theme;
  }

  if (isTorpedo) {
    return WEAPON_PALETTE.find((p) => p.id === 'green')!.theme;
  }
  return WEAPON_PALETTE.find((p) => p.id === 'purple')!.theme;
}
