import { MinionHealth } from './game/MinionHealth';

export type ShieldArcKey = 'front' | 'starboard' | 'back' | 'port';

export interface ShieldArcs {
  front: { current: number; max: number };
  starboard: { current: number; max: number };
  back: { current: number; max: number };
  port: { current: number; max: number };
}

export type PowerPreset = 'balanced' | 'weapons' | 'shields' | 'engines' | 'auxiliary';

export interface PowerLevels {
  weapons: number; // 25-100
  shields: number; // 25-100
  engines: number; // 25-100
  auxiliary: number; // 25-100
}

export type SubsystemType = 'weapons' | 'shields' | 'engines' | 'auxiliary';

export interface SubsystemStatus {
  weapons: number; // 0 - 100%
  shields: number;
  engines: number;
  auxiliary: number;
}

export type Faction = 'federation' | 'klingon' | 'romulan' | 'borg' | 'pirate';

export type WeaponType =
  | 'phaser_beam'
  | 'disruptor_beam'
  | 'plasma_beam'
  | 'photon_torpedo'
  | 'quantum_torpedo'
  | 'heavy_cannon'
  | 'shield_transfer_beam'
  | 'hull_repair_beam';

export type FiringArc =
  | 'forward_15'
  | 'forward_30'
  | 'forward_45'
  | 'forward_90'
  | 'forward_180'
  | 'port_45'
  | 'port_90'
  | 'port_180'
  | 'starboard_45'
  | 'starboard_90'
  | 'starboard_180'
  | 'broadside_port'
  | 'broadside_starboard'
  | 'aft_45'
  | 'aft_90'
  | 'aft_180'
  | 'broadside'
  | 'broadside_360';

export interface Weapon {
  id: string;
  name: string;
  type: WeaponType;
  firingArc: FiringArc;
  baseDamage: number;
  cooldown: number; // seconds
  currentCooldown: number; // seconds remaining
  energyCost: number;
  range: number; // unit distance
  color: string;
  isTorpedo: boolean;
  isPulse?: boolean;
  pulseCount?: number;
  thickness?: number;
  soundName: string;
  localFacingAngle?: number;
  arcAngleDegrees?: number;
  isHealShield?: boolean;
  isHealHull?: boolean;
}

export type ModelType =
  | 'dreadnought'
  | 'interceptor'
  | 'shield_breaker'
  | 'carrier'
  | 'micro_recon'
  | 'infrared_furtive'
  | 'cruiser'
  | 'escort'
  | 'science'
  | 'warbird'
  | 'bird_of_prey'
  | 'cube'
  | 'sphere'
  | 'station'
  | 'support'
  | 'boss_leviathan';

export type CarrierDesignId =
  | 'transtellar'
  | 'fortress'
  | 'stealth'
  | 'solaris'
  | 'hyperion_ring'
  | 'vortex_hive'
  | 'celestial_forge'
  | 'chronos_phantom';

export interface CarrierDesignInfo {
  id: CarrierDesignId;
  name: string;
  subtitle: string;
  description: string;
  badge: string;
  badgeColor: string;
  accentColor: string;
  launchType: string;
  features: string[];
}

export interface ShipClass {
  id: string;
  name: string;
  faction: Faction;
  description: string;
  maxHull: number;
  maxShieldPerArc: number;
  turnRate: number; // deg/sec
  maxSpeed: number; // units/sec
  acceleration: number;
  mass?: number;
  weaponSlots: Weapon[];
  modelType: ModelType;
  defaultPower: PowerLevels;
  carrierDesign?: CarrierDesignId;
}

export interface Ability {
  id: string;
  name: string;
  description: string;
  category: 'tactical' | 'engineering' | 'science';
  cooldown: number; // seconds
  currentCooldown: number;
  duration?: number; // duration if active
  activeTimer?: number;
  powerCost: number;
  iconName: string;
}

export interface ShipEntity {
  id: string;
  name: string;
  isPlayer: boolean;
  faction: Faction;
  shipClass: ShipClass;
  carrierDesign?: CarrierDesignId;
  
  // 3D Transform
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number }; // Euler angles in rads
  velocity?: { x: number; y: number; z: number };
  speed: number;
  targetSpeed: number;
  angularVelocity?: number;
  targetAngularVelocity?: number;
  
  // Health & Defense
  hull: number;
  maxHull: number;
  shields: ShieldArcs;
  shieldTargets?: Record<ShieldArcKey, number>;
  
  // Subsystems
  subsystems: SubsystemStatus;
  power: PowerLevels;
  powerPreset: PowerPreset;
  powerController?: any;
  
  // Combat
  weapons: Weapon[];
  abilities: Ability[];
  targetId: string | null;
  targetedSubsystem: SubsystemType | null;
  
  // Status flags
  isDestroyed: boolean;
  is_lockable?: boolean;
  isLockable?: boolean;
  team?: 'alpha' | 'beta';
  isMinion?: boolean;
  minionHealth?: MinionHealth;
  shieldsDistributedRecently?: boolean;
  evasiveActiveTimer?: number;
  beamFireAtWillTimer?: number;
  highYieldTimer?: number;
  hazardActiveTimer?: number;
  waypoint?: { x: number; z: number } | null;

  // Hangar Economy & Drone Swarm State
  hangarState?: HangarState;

  // Plasma Charge Mechanics & Dragoon Overheat Status
  plasmaCharge?: PlasmaChargeState;
  hardpointOverheatTimer?: number;
  iFrameTimer?: number;

  // MMO Boss Raid Role
  raidRole?: 'tank' | 'dps' | 'support' | 'boss';
}

export interface DroneStatus {
  id: string;
  hp: number; // Max 160 HP
  maxHp: number; // 160 HP
  state: 'docked' | 'active' | 'rebuilding';
  rebuildTimer?: number; // 8.0s base countdown
  entityId?: string; // Active entity ID in combat engine
  fuseTimer?: number; // 1.2s fusion core overload timer
  isDetonating?: boolean;
}

export interface HangarState {
  drones: DroneStatus[]; // 6 drone slots
  swarmWaypoint: { x: number; z: number } | null;
  targetEntityId?: string | null;
  isRecalled: boolean;
  launchCooldown: number; // 0.8s launch interval
}

export interface PlasmaChargeState {
  isCharging: boolean;
  chargeTime: number; // Seconds held (0.0s to 2.0s)
  minChargeTime: number; // 0.0s
  maxChargeTime: number; // 1.8s
  overchargeThreshold: number; // 2.0s
  selfDamageAmount: number; // 0.20 (20% hull)
}

export interface InertialMine {
  id: string;
  name: string;
  ownerId: string;
  team?: 'alpha' | 'beta';
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  targetPoint?: { x: number; z: number } | null;
  speed?: number;
  maxSpeed?: number;
  accel?: number;
  radius: number; // 2.5m physical Area3D collider radius for skillshots
  hazardRadius: number; // 30.0m proximity hazard radius
  is_lockable: boolean; // false
  isLockable: boolean; // false
  isDestroyed?: boolean;
  damage: number; // 800 base kinetic damage
  armingTimer: number; // 1.2s arming phase
  isArmed: boolean;
  lifetime: number; // 12.0s armed duration
  invulnerableTimer?: number;
  health: number; // 150 HP for skillshot interception
  maxHealth: number;
  color?: string;
}

export type ZoningOrdnance = InertialMine;

export interface Asteroid {
  id: string;
  position: { x: number; y: number; z: number };
  radius: number;
  health?: number;
  maxHealth?: number;
  mass?: number;
}

export interface Projectile {
  id: string;
  ownerId: string;
  targetId: string | null;
  weaponType: WeaponType;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  damage: number;
  isTorpedo: boolean;
  isPulse?: boolean;
  launchDelay?: number;
  hasLaunched?: boolean;
  weaponIndex?: number;
  firingArc?: FiringArc;
  color: string;
  lifetime: number; // remaining seconds
  targetPosition?: { x: number; y: number; z: number };
  radius?: number;
  scale?: number;
}

export interface BeamEffect {
  id: string;
  shooterId?: string;
  targetId?: string;
  weaponIndex?: number;
  firingArc?: FiringArc;
  sourcePos: { x: number; y: number; z: number };
  targetPos: { x: number; y: number; z: number };
  color: string;
  thickness?: number;
  duration: number; // remaining seconds
  maxDuration: number;
}

export interface ShieldImpactEffect {
  id: string;
  shipId: string;
  position: { x: number; y: number; z: number };
  arc: ShieldArcKey;
  intensity: number;
  duration: number;
  beamId?: string;
}

export interface ExplosionParticle {
  id: string;
  position: { x: number; y: number; z: number };
  color: string;
  size: number;
  velocity: { x: number; y: number; z: number };
  lifetime: number;
  maxLifetime: number;
  opacity?: number;
}

export interface CombatLogEntry {
  id: string;
  timestamp: string;
  text: string;
  type: 'damage_shield' | 'damage_hull' | 'heal' | 'ability' | 'system' | 'kill' | 'power_shunt';
  value?: number;
  source?: 'player' | 'enemy' | 'system';
}

export interface Mission {
  id: string;
  title: string;
  description: string;
  difficulty: 'Cadet' | 'Lieutenant' | 'Commander' | 'Admiral';
  objectives: string[];
  enemies: { shipClassId: string; count: number; namePrefix: string }[];
  hasStation?: boolean;
  isSiegeMode?: boolean;
  isBossRaidMode?: boolean;
}
