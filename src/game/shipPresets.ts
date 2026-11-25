import { Ability, Mission, ShipClass, Weapon } from '../types';
import { PLAYABLE_SHIP_ARCHETYPES } from './ShipArchetypeDefinitions';

export const DEFAULT_WEAPONS: Record<string, Weapon> = {
  phaser_array: {
    id: 'phaser_array',
    name: 'Phaser Array',
    type: 'phaser_beam',
    firingArc: 'broadside',
    baseDamage: 21,
    cooldown: 2.0,
    currentCooldown: 0,
    energyCost: 15,
    range: 100,
    color: '#38bdf8',
    isTorpedo: false,
    soundName: 'phaser',
  },
  broadside_phaser: {
    id: 'broadside_phaser',
    name: 'Broadside Phaser Bank',
    type: 'phaser_beam',
    firingArc: 'broadside',
    baseDamage: 18,
    cooldown: 2.2,
    currentCooldown: 0,
    energyCost: 12,
    range: 88,
    color: '#0284c7',
    isTorpedo: false,
    soundName: 'phaser',
  },
  heavy_disruptor: {
    id: 'heavy_disruptor',
    name: 'Heavy Disruptor Cannon',
    type: 'disruptor_beam',
    firingArc: 'broadside',
    baseDamage: 33,
    cooldown: 3.0,
    currentCooldown: 0,
    energyCost: 22,
    range: 95,
    color: '#ef4444',
    isTorpedo: false,
    soundName: 'disruptor',
  },
  plasma_beam: {
    id: 'plasma_beam',
    name: 'Plasma Beam Emitter',
    type: 'plasma_beam',
    firingArc: 'broadside',
    baseDamage: 24,
    cooldown: 2.5,
    currentCooldown: 0,
    energyCost: 18,
    range: 88,
    color: '#10b981',
    isTorpedo: false,
    soundName: 'plasma',
  },
  photon_torpedo: {
    id: 'photon_torpedo',
    name: 'Photon Torpedo Launcher',
    type: 'photon_torpedo',
    firingArc: 'forward_45',
    baseDamage: 70, // High burst damage against unshielded hulls!
    cooldown: 5.0,
    currentCooldown: 0,
    energyCost: 25,
    range: 113,
    color: '#f97316',
    isTorpedo: true,
    soundName: 'photon',
  },
  quantum_torpedo: {
    id: 'quantum_torpedo',
    name: 'Quantum Torpedo Tube',
    type: 'quantum_torpedo',
    firingArc: 'forward_45',
    baseDamage: 95,
    cooldown: 7.0,
    currentCooldown: 0,
    energyCost: 35,
    range: 125,
    color: '#8b5cf6',
    isTorpedo: true,
    soundName: 'quantum',
  },
  aft_torpedo: {
    id: 'aft_torpedo',
    name: 'Aft Photon Torpedo',
    type: 'photon_torpedo',
    firingArc: 'aft_45',
    baseDamage: 60,
    cooldown: 5.5,
    currentCooldown: 0,
    energyCost: 20,
    range: 100,
    color: '#f97316',
    isTorpedo: true,
    soundName: 'photon',
  },
};

export const DEFAULT_ABILITIES: Ability[] = [
  {
    id: 'inertial_mine',
    name: 'MAGNETIC MINE [E]',
    description: 'Ejects a heavy stationary Inertial Magnetic Mine at current location. Arms in 1.2s and projects a 30m Gravity Hazard Field for 12s that detonates on enemy proximity for 800 Kinetic damage & shockwave push.',
    category: 'tactical',
    cooldown: 16,
    currentCooldown: 0,
    powerCost: 20,
    iconName: 'Flame',
  },
  {
    id: 'shield_rebalance',
    name: 'Shield Rebalance',
    description: 'Redirects 25% shield capacity from healthy quadrants to replenish a collapsing quadrant.',
    category: 'engineering',
    cooldown: 15, // 15s cooldown
    currentCooldown: 0,
    powerCost: 20,
    iconName: 'Shield',
  },
  {
    id: 'vector_burst',
    name: 'Vector Burst',
    description: 'Instantly cancels active drift momentum, applies 25 m/s directional impulse thrust, and grants 0.2s I-Frame invulnerability for strafing peel-offs.',
    category: 'tactical',
    cooldown: 18, // 18.0s cooldown
    currentCooldown: 0,
    powerCost: 20,
    iconName: 'Navigation',
  },
  {
    id: 'distribute_shields',
    name: 'Distribute Shields',
    description: 'Equalizes energy evenly across all 4 shield arcs, transferring power from stronger quadrants to bolster damaged ones.',
    category: 'engineering',
    cooldown: 12,
    currentCooldown: 0,
    powerCost: 20,
    iconName: 'Shield',
  },
  {
    id: 'fire_at_will',
    name: 'Beams: Fire at Will',
    description: 'Overcharges all beam arrays for 8 seconds, firing at multiple targets with increased rate of fire.',
    category: 'tactical',
    cooldown: 20,
    currentCooldown: 0,
    duration: 8,
    powerCost: 30,
    iconName: 'Zap',
  },
  {
    id: 'torpedo_high_yield',
    name: 'Torpedo: High Yield',
    description: 'Empowers next torpedo attack to deal 80% bonus damage and cause a kinetic shockwave.',
    category: 'tactical',
    cooldown: 18,
    currentCooldown: 0,
    duration: 10,
    powerCost: 25,
    iconName: 'Flame',
  },
  {
    id: 'evasive_maneuvers',
    name: 'Evasive Maneuvers',
    description: 'Surges impulse engines by +75% speed for 3.6 seconds, widening turning radius for fast tactical passes.',
    category: 'engineering',
    cooldown: 25,
    currentCooldown: 0,
    duration: 3.6,
    powerCost: 15,
    iconName: 'Navigation',
  },
  {
    id: 'tachyon_beam',
    name: 'Tachyon Beam Siphon',
    description: 'Drains enemy shield arc facing you and transfers energy to your weakest shield arc.',
    category: 'science',
    cooldown: 15,
    currentCooldown: 0,
    powerCost: 25,
    iconName: 'Radio',
  },
  {
    id: 'hazard_emitters',
    name: 'Hazard Emitters',
    description: 'Repairs hull integrity over 10 seconds and cleanses subsystem disruptions.',
    category: 'science',
    cooldown: 22,
    currentCooldown: 0,
    duration: 10,
    powerCost: 20,
    iconName: 'Activity',
  },
];

export function getShipAbilities(sc: ShipClass): Ability[] {
  const abilities: Ability[] = [
    {
      id: 'distribute_shields',
      name: 'Distribute Shields',
      description: 'Equalize energy across all 4 shield arcs, draining stronger arcs to bolster damaged ones.',
      category: 'engineering',
      cooldown: 12,
      currentCooldown: 0,
      powerCost: 20,
      iconName: 'Shield',
    },
    {
      id: 'fire_at_will',
      name: 'Beams: Fire at Will',
      description: 'Overcharge beam arrays for 8s across all targets.',
      category: 'tactical',
      cooldown: 20,
      currentCooldown: 0,
      duration: 8,
      powerCost: 30,
      iconName: 'Zap',
    },
    {
      id: 'torpedo_high_yield',
      name: 'Torpedo: High Yield',
      description: 'Empower next torpedo payload by +80% kinetic damage.',
      category: 'tactical',
      cooldown: 18,
      currentCooldown: 0,
      duration: 10,
      powerCost: 25,
      iconName: 'Flame',
    },
    {
      id: 'evasive_maneuvers',
      name: 'Evasive Maneuvers',
      description: 'Surges impulse engines by +75% speed for 3.6s, widening turn radius for fast tactical passes.',
      category: 'engineering',
      cooldown: 25,
      currentCooldown: 0,
      duration: 3.6,
      powerCost: 15,
      iconName: 'Navigation',
    },
  ];

  if (sc.id.includes('brawler') || sc.id.includes('dreadnought')) {
    abilities.unshift({
      id: 'inertial_mine',
      name: 'Magnetic Mine',
      description: 'Ejects a heavy stationary Inertial Magnetic Mine at current location. Arms in 1.2s and projects a 30m Gravity Hazard Field for 12s that detonates on enemy proximity for 800 Kinetic damage & shockwave push.',
      category: 'tactical',
      cooldown: 12,
      currentCooldown: 0,
      powerCost: 20,
      iconName: 'Flame',
    });
  }

  if (sc.id.includes('dragoon') || sc.id.includes('interceptor')) {
    abilities.unshift({
      id: 'vector_burst',
      name: 'Vector Burst',
      description: 'Cancels linear drift momentum, delivers 25 m/s directional impulse, and grants 0.2s I-Frame invulnerability.',
      category: 'tactical',
      cooldown: 18,
      currentCooldown: 0,
      powerCost: 20,
      iconName: 'Navigation',
    });
  }

  if (sc.id.includes('carrier') || sc.id.includes('aegis')) {
    abilities.unshift({
      id: 'launch_drone',
      name: 'Launch Fighter',
      description: 'Launches an Interceptor Fighter Drone from the hangar bay to intercept targets and defend the carrier (max 6 active).',
      category: 'tactical',
      cooldown: 1.0,
      currentCooldown: 0,
      powerCost: 10,
      iconName: 'Radio',
    });
    abilities.splice(1, 0, {
      id: 'swarm_detonation',
      name: 'Swarm Detonation',
      description: 'Overloads active drone fusion cores for 1.2s (+40% speed). Drones detonate on arrival or contact, dealing 250 AoE Heavy Kinetic Damage (10m radius).',
      category: 'tactical',
      cooldown: 18,
      currentCooldown: 0,
      powerCost: 20,
      iconName: 'Flame',
    });
  }

  if (sc.id.includes('support') || sc.id.includes('sanctuary')) {
    abilities.unshift({
      id: 'aegis_restoration_pulse',
      name: 'Aegis Restoration Wave',
      description: 'Projects an omni-directional repair pulse restoring +100 shield HP per quadrant and +180 hull HP to all allied vessels within 220m.',
      category: 'science',
      cooldown: 14,
      currentCooldown: 0,
      powerCost: 20,
      iconName: 'Shield',
    });
    abilities.push({
      id: 'hazard_emitters',
      name: 'Hazard Emitters',
      description: 'Repairs own hull integrity over 10s and cleanses subsystem disruptions.',
      category: 'science',
      cooldown: 22,
      currentCooldown: 0,
      duration: 10,
      powerCost: 20,
      iconName: 'Activity',
    });
  }

  return abilities;
}

export const SHIP_CLASSES: ShipClass[] = [
  PLAYABLE_SHIP_ARCHETYPES.vanguard_brawler,
  PLAYABLE_SHIP_ARCHETYPES.vector_dragoon,
  PLAYABLE_SHIP_ARCHETYPES.sanctuary_support,
  PLAYABLE_SHIP_ARCHETYPES.aegis_hive_carrier,
  PLAYABLE_SHIP_ARCHETYPES.micro_recon,
  PLAYABLE_SHIP_ARCHETYPES.infrared_furtive,
];

export const MISSIONS: Mission[] = [
  {
    id: 'mission_boss_raid',
    title: 'MMO Boss Raid: Omega Leviathan',
    description: 'Holy-Trinity MMO Raid: Pilot Vanguard (Tank), Dragoon (DPS), or Sanctuary (Support). The stationary Boss locks regular fire onto the Tank and periodically charges an Obliteration Beam on the Support—hide behind the Tank to intercept it!',
    difficulty: 'Admiral',
    objectives: [
      'Vanguard (Tank) holds stationary Boss fire while Dragoon (DPS) burns Boss HP',
      'Sanctuary (Support) restores allied shields and hull HP',
      'Position Support directly behind Tank to intercept the Boss Obliteration Beam',
      'Destroy the Omega Leviathan Dreadnought'
    ],
    isBossRaidMode: true,
    enemies: [],
  },
  {
    id: 'mission_1v1_duel',
    title: '1v1 Asymmetric Duel',
    description: 'High-stakes tactical 1v1 duel between The Vanguard Brawler and The Vector Dragoon. Master broadsides, shield cycling, and 90° thrust-vector bursts!',
    difficulty: 'Admiral',
    objectives: [
      'Deplete target shield quadrant to trigger hull bleed-through',
      'Use Shield_Rebalance or Vector_Burst active utilities',
      'Destroy target primary hull health'
    ],
    enemies: [
      { shipClassId: 'vector_dragoon', count: 1, namePrefix: 'Vector Dragoon Skirmisher' },
    ],
  },
  {
    id: 'mission_1',
    title: 'Neutral Zone Patrol',
    description: 'Scout Sector 001 near the asteroid field. Intercept an enemy Vector Dragoon skirmisher in a tactical 1v1 duel.',
    difficulty: 'Cadet',
    objectives: ['Eliminate the Vector Dragoon Skirmisher', 'Protect your ship\'s 4 shield arcs from being depleted'],
    enemies: [
      { shipClassId: 'vector_dragoon', count: 1, namePrefix: 'IKS Dragoon' },
    ],
  },
  {
    id: 'mission_2',
    title: 'Starbase Sector Defense',
    description: 'An enemy flagship has arrived near Starbase 47. Protect the starbase in 1v1 combat!',
    difficulty: 'Commander',
    objectives: ['Defend Starbase 47', 'Destroy opposing flagship in 1v1 combat', 'Target enemy subsystems'],
    hasStation: true,
    enemies: [
      { shipClassId: 'vector_dragoon', count: 1, namePrefix: 'Vector Dragoon Leader' },
    ],
  },
  {
    id: 'mission_4',
    title: 'Starbase Siege (MOBA Wave Push)',
    description: 'Tactical MOBA match: Escort automated drone waves down the central lane. Draw Starbase turret aggro with allied minions, strip enemy base directional shields, and destroy the enemy station!',
    difficulty: 'Admiral',
    objectives: [
      'Escort allied drone waves down the central lane',
      'Use minion wave to absorb Starbase turret aggro',
      'Maneuver to strip Starbase 4-quadrant shields',
      'Destroy Starbase Beta before Alpha falls'
    ],
    hasStation: true,
    isSiegeMode: true,
    enemies: [],
  },
];
