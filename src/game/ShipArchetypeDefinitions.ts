import { Faction, FiringArc, ShipClass, Weapon } from '../types';
import { WeaponHardpoint, WeaponHardpointConfig } from './WeaponHardpoint';

export interface ShipArchetypeDefinition extends ShipClass {
  assetModelPath: string; // e.g. 'assets/models/spaceships/Warship.obj'
  mass: number;           // EVE-style heavy inertia mass scalar
  hardpoints: WeaponHardpointConfig[];
}

/**
 * 1. Existing Asset Model Mapping & Playable Ship Archetypes
 * 
 * Maps Max Parata Voxel Spaceships asset models:
 * 1. `Warship.obj`           -> The Dreadnought (Heavy Bastion)
 * 2. `InterstellarRunner.obj` -> The Interceptor (Vector Strike)
 * 3. `RedFighter.obj`         -> The Shield Breaker (Quadrant Collapser)
 * 4. `Transtellar.obj`        -> The Carrier / Tactical Escort
 * 5. `MicroRecon.obj`         -> Friendly MOBA Minion Wave
 * 6. `InfraredFurtive.obj`   -> Enemy MOBA Minion Wave Raider
 */
export const PLAYABLE_SHIP_ARCHETYPES: Record<string, ShipArchetypeDefinition> = {
  // -------------------------------------------------------------------------
  // 1. Ship A: The Vanguard Brawler (Pocket Battleship)
  // -------------------------------------------------------------------------
  vanguard_brawler: {
    id: 'vanguard_brawler',
    name: 'The Vanguard Brawler',
    faction: 'federation',
    modelType: 'dreadnought',
    assetModelPath: '/assets/spaceships/Warship/Package/Warship.obj',
    description: 'Heavy pocket battleship built for broadside dominance and shield cycling. Features Fore Shield-Stripper Beam and dual flank Pulse Batteries.',
    maxHull: 2200,
    maxShieldPerArc: 500, // 4 x 500 = 2000 total shields
    mass: 3800,           // High mass, heavy inertia momentum
    turnRate: 18,         // Slow, deliberate yaw rotation (18°/s)
    maxSpeed: 10.0,       // Heavy top speed (10.0 m/s)
    acceleration: 2.5,
    defaultPower: { weapons: 85, shields: 85, engines: 40, auxiliary: 50 },
    
    // Transform Hierarchy Hardpoint Configuration
    hardpoints: [
      {
        id: 'brawler_fore_shield_stripper',
        name: 'Fore Shield-Stripper Beam',
        weaponType: 'disruptor_beam',
        baseDamage: 48,
        cooldown: 2.0,
        currentCooldown: 0,
        energyCost: 15,
        range: 100,
        color: '#10b981',
        isTorpedo: false,
        isPulse: false,
        thickness: 2.5,
        soundName: 'phaser',
        arcAngleDegrees: 60, // 60° forward arc
        localFacingAngle: 0, // Fore (0°)
        localPosition: { x: 0, y: 0, z: 14 },
      },
      {
        id: 'brawler_port_pulse_battery',
        name: 'Port Pulse Battery',
        weaponType: 'phaser_beam',
        baseDamage: 34,
        cooldown: 1.8,
        currentCooldown: 0,
        energyCost: 12,
        range: 88,
        color: '#a855f7',
        isTorpedo: false,
        isPulse: true,
        pulseCount: 3,
        soundName: 'phaser',
        arcAngleDegrees: 90, // 90° flank arc
        localFacingAngle: -Math.PI / 2, // Port (-90°)
        localPosition: { x: -8, y: 0, z: 0 },
      },
      {
        id: 'brawler_starboard_pulse_battery',
        name: 'Starboard Pulse Battery',
        weaponType: 'phaser_beam',
        baseDamage: 34,
        cooldown: 1.8,
        currentCooldown: 0,
        energyCost: 12,
        range: 88,
        color: '#a855f7',
        isTorpedo: false,
        isPulse: true,
        pulseCount: 3,
        soundName: 'phaser',
        arcAngleDegrees: 90, // 90° flank arc
        localFacingAngle: Math.PI / 2, // Starboard (+90°)
        localPosition: { x: 8, y: 0, z: 0 },
      },
    ],
    get weaponSlots(): Weapon[] {
      return this.hardpoints.map((hp) => new WeaponHardpoint(hp).toWeapon());
    },
  },

  // Alias for backward compatibility
  get dreadnought(): ShipArchetypeDefinition {
    return this.vanguard_brawler;
  },

  // -------------------------------------------------------------------------
  // 2. Ship B: The Vector Dragoon (Skirmisher / Finisher)
  // -------------------------------------------------------------------------
  vector_dragoon: {
    id: 'vector_dragoon',
    name: 'The Vector Dragoon',
    faction: 'klingon',
    modelType: 'interceptor',
    assetModelPath: '/assets/spaceships/Interstellar Runner/Package/InterstellarRunner.obj',
    description: 'High-speed Boom-and-Zoom Strafing Bomber featuring a 360° Omnidirectional Phaser stream, Charged Bow Plasma Ball, and momentum-canceling Vector Burst.',
    maxHull: 800,
    maxShieldPerArc: 250, // 4 x 250 = 1000 total shields
    mass: 750,            // Low mass, explosive acceleration & high speed drift
    turnRate: 48,         // Agile maneuverability (48°/s)
    maxSpeed: 19.5,       // Max speed 19.5 m/s
    acceleration: 12.0,
    defaultPower: { weapons: 100, shields: 35, engines: 90, auxiliary: 25 },

    hardpoints: [
      {
        id: 'dragoon_omnidirectional_turret',
        name: '360° Omnidirectional Phaser',
        weaponType: 'phaser_beam',
        baseDamage: 7,
        cooldown: 3.0, // 3.0 second cooldown between phaser bursts
        currentCooldown: 0,
        energyCost: 0,
        range: 200,
        color: '#a855f7',
        isTorpedo: false,
        soundName: 'phaser',
        arcAngleDegrees: 360, // 360° omnidirectional tracking
        localFacingAngle: 0,
        localPosition: { x: 0, y: 0, z: 0 },
      },
      {
        id: 'dragoon_charged_bow_plasma',
        name: 'Charged Bow Plasma Ball',
        weaponType: 'photon_torpedo',
        baseDamage: 100, // 100 min to 600 max (3.0x bare hull / 0.5x active shields)
        cooldown: 3.5,
        currentCooldown: 0,
        energyCost: 20,
        range: 150,
        color: '#00f0ff',
        isTorpedo: true,
        soundName: 'torpedo',
        arcAngleDegrees: 45, // 45° locked forward bow cone
        localFacingAngle: 0, // Fore (0°)
        localPosition: { x: 0, y: 0, z: 10 },
      },
    ],
    get weaponSlots(): Weapon[] {
      return this.hardpoints.map((hp) => new WeaponHardpoint(hp).toWeapon());
    },
  },

  // Alias for backward compatibility
  get interceptor(): ShipArchetypeDefinition {
    return this.vector_dragoon;
  },

  // -------------------------------------------------------------------------
  // 3. Ship C: The Aegis Hive-Carrier ("The Commander")
  // -------------------------------------------------------------------------
  aegis_hive_carrier: {
    id: 'aegis_hive_carrier',
    name: 'The Aegis Hive-Carrier',
    faction: 'federation',
    modelType: 'carrier',
    carrierDesign: 'solaris',
    assetModelPath: '/assets/spaceships/Transtellar/Package/Transtellar.obj',
    description: 'Heavy low-mobility brawler that projects force through 6 semi-autonomous Interceptor Drones controlled via spatial waypoints.',
    maxHull: 2500,
    maxShieldPerArc: 450, // 4 x 450 = 1800 total shields
    mass: 4500,           // 4,500 kg
    turnRate: 15,         // 15°/s turn rate
    maxSpeed: 8.0,        // 8.0 m/s
    acceleration: 3.5,    // 3.5 m/s²
    defaultPower: { weapons: 70, shields: 80, engines: 50, auxiliary: 50 },

    hardpoints: [
      {
        id: 'carrier_twin_pdc',
        name: 'Twin Point-Defense Cannons',
        weaponType: 'phaser_beam',
        baseDamage: 10,
        cooldown: 0.1, // continuous light ballistic rounds (~100 DPS)
        currentCooldown: 0,
        energyCost: 0,
        range: 150,
        color: '#f59e0b',
        isTorpedo: false,
        soundName: 'phaser',
        arcAngleDegrees: 120, // 120° forward arc
        localFacingAngle: 0,
        localPosition: { x: 0, y: 0, z: 12 },
      },
    ],
    get weaponSlots(): Weapon[] {
      return this.hardpoints.map((hp) => new WeaponHardpoint(hp).toWeapon());
    },
  },

  // Alias for backward compatibility
  get carrier(): ShipArchetypeDefinition {
    return this.aegis_hive_carrier;
  },

  // -------------------------------------------------------------------------
  // 3. Minion / Drone Creep (Micro Recon - Allied Wave)
  // -------------------------------------------------------------------------
  micro_recon: {
    id: 'micro_recon_drone_creep',
    name: 'Micro Recon Drone',
    faction: 'federation',
    modelType: 'micro_recon',
    assetModelPath: '/assets/spaceships/MicroRecon/Package/MicroRecon.obj',
    description: 'Fast automated minion drone creep spawned in waves to escort allied starbases and draw turret aggro.',
    maxHull: 250,
    maxShieldPerArc: 0,
    mass: 400,
    turnRate: 45,
    maxSpeed: 28,
    acceleration: 10,
    defaultPower: { weapons: 70, shields: 50, engines: 80, auxiliary: 20 },

    hardpoints: [
      {
        id: 'recon_light_pulse',
        name: 'Light Pulse Laser',
        weaponType: 'phaser_beam',
        baseDamage: 12,
        cooldown: 1.5,
        currentCooldown: 0,
        energyCost: 5,
        range: 63,
        color: '#38bdf8',
        isTorpedo: false,
        soundName: 'phaser',
        arcAngleDegrees: 90,
        localFacingAngle: 0,
        localPosition: { x: 0, y: 0, z: 3 },
      },
    ],
    get weaponSlots(): Weapon[] {
      return this.hardpoints.map((hp) => new WeaponHardpoint(hp).toWeapon());
    },
  },

  // -------------------------------------------------------------------------
  // 6. Enemy Wave Raider (Infrared Furtive)
  // -------------------------------------------------------------------------
  infrared_furtive: {
    id: 'infrared_furtive_stealth_raider',
    name: 'Infrared Furtive Raider',
    faction: 'pirate',
    modelType: 'infrared_furtive',
    assetModelPath: '/assets/spaceships/InfraredFurtive/Package/InfraredFurtive.obj',
    description: 'Aggressive covert enemy raider with infrared sensor array, spawned in opposing wave pushes.',
    maxHull: 260,
    maxShieldPerArc: 0,
    mass: 400,
    turnRate: 48,
    maxSpeed: 30,
    acceleration: 11,
    defaultPower: { weapons: 80, shields: 50, engines: 80, auxiliary: 20 },

    hardpoints: [
      {
        id: 'furtive_disruptor_pulse',
        name: 'Infrared Disruptor Cannon',
        weaponType: 'disruptor_beam',
        baseDamage: 14,
        cooldown: 1.4,
        currentCooldown: 0,
        energyCost: 6,
        range: 65,
        color: '#ef4444',
        isTorpedo: false,
        soundName: 'disruptor',
        arcAngleDegrees: 90,
        localFacingAngle: 0,
        localPosition: { x: 0, y: 0, z: 3 },
      },
    ],
    get weaponSlots(): Weapon[] {
      return this.hardpoints.map((hp) => new WeaponHardpoint(hp).toWeapon());
    },
  },

  // -------------------------------------------------------------------------
  // 7. Ship D: The Sanctuary Support (Shield & Hull Restoration Frigate)
  // -------------------------------------------------------------------------
  sanctuary_support: {
    id: 'sanctuary_support',
    name: 'The Sanctuary Support',
    faction: 'federation',
    modelType: 'support',
    assetModelPath: '',
    description: 'Fleet logistics & medical support frigate equipped with 360° Shield Transfer Beams, Nanite Hull Repair Emitters, and Aegis Restoration Waves.',
    maxHull: 1250,
    maxShieldPerArc: 320, // 4 x 320 = 1280 total shields
    mass: 1400,
    turnRate: 36,
    maxSpeed: 14.5,
    acceleration: 7.5,
    defaultPower: { weapons: 55, shields: 80, engines: 70, auxiliary: 85 },

    hardpoints: [
      {
        id: 'support_shield_transfer_beam',
        name: 'Shield Transfer Beam',
        weaponType: 'shield_transfer_beam',
        baseDamage: 160, // Shield HP restored
        cooldown: 1.6,
        currentCooldown: 0,
        energyCost: 10,
        range: 220,
        color: '#38bdf8',
        isTorpedo: false,
        thickness: 1.8,
        soundName: 'phaser',
        arcAngleDegrees: 360,
        localFacingAngle: 0,
        localPosition: { x: -1.8, y: 0.4, z: 2 },
        isHealShield: true,
      },
      {
        id: 'support_hull_repair_beam',
        name: 'Nanite Hull Repair Beam',
        weaponType: 'hull_repair_beam',
        baseDamage: 145, // Hull HP restored
        cooldown: 2.0,
        currentCooldown: 0,
        energyCost: 10,
        range: 220,
        color: '#10b981',
        isTorpedo: false,
        thickness: 1.8,
        soundName: 'plasma',
        arcAngleDegrees: 360,
        localFacingAngle: 0,
        localPosition: { x: 1.8, y: 0.4, z: 2 },
        isHealHull: true,
      },
      {
        id: 'support_defensive_phaser',
        name: 'Defensive Light Phaser',
        weaponType: 'phaser_beam',
        baseDamage: 20,
        cooldown: 2.2,
        currentCooldown: 0,
        energyCost: 8,
        range: 115,
        color: '#a855f7',
        isTorpedo: false,
        thickness: 1.0,
        soundName: 'phaser',
        arcAngleDegrees: 360,
        localFacingAngle: 0,
        localPosition: { x: 0, y: 0.2, z: 4 },
      },
    ],
    get weaponSlots(): Weapon[] {
      return this.hardpoints.map((hp) => new WeaponHardpoint(hp).toWeapon());
    },
  },

  // -------------------------------------------------------------------------
  // 8. Raid Boss: Omega Leviathan Dreadnought (Stationary MMO Raid Boss)
  // -------------------------------------------------------------------------
  omega_leviathan_boss: {
    id: 'omega_leviathan_boss',
    name: 'Omega Leviathan Dreadnought',
    faction: 'borg',
    modelType: 'boss_leviathan',
    assetModelPath: '',
    description: 'Colossal stationary siege fortress armed with tank-buster disruptor batteries and a devastating targeted Obliteration Beam.',
    maxHull: 9000,
    maxShieldPerArc: 1500, // 4 x 1500 = 6000 total shields
    mass: 999999,
    turnRate: 0,
    maxSpeed: 0,
    acceleration: 0,
    defaultPower: { weapons: 95, shields: 80, engines: 0, auxiliary: 50 },

    hardpoints: [
      {
        id: 'boss_siege_disruptor',
        name: 'Leviathan Heavy Disruptor',
        weaponType: 'disruptor_beam',
        baseDamage: 72,
        cooldown: 2.5,
        currentCooldown: 0,
        energyCost: 0,
        range: 250,
        color: '#ef4444',
        isTorpedo: false,
        thickness: 2.2,
        soundName: 'disruptor',
        arcAngleDegrees: 360,
        localFacingAngle: 0,
        localPosition: { x: -5, y: 1.5, z: 8 },
      },
      {
        id: 'boss_apex_plasma_barrage',
        name: 'Apex Plasma Barrage',
        weaponType: 'phaser_beam',
        baseDamage: 54,
        cooldown: 3.2,
        currentCooldown: 0,
        energyCost: 0,
        range: 250,
        color: '#f97316',
        isTorpedo: false,
        isPulse: true,
        pulseCount: 3,
        soundName: 'phaser',
        arcAngleDegrees: 360,
        localFacingAngle: 0,
        localPosition: { x: 5, y: 1.5, z: 8 },
      },
    ],
    get weaponSlots(): Weapon[] {
      return this.hardpoints.map((hp) => new WeaponHardpoint(hp).toWeapon());
    },
  },
};
