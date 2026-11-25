import { Faction, ShieldArcs, ShipEntity } from '../types';
import { MinionHealth } from './MinionHealth';
import { DirectionalShieldSystem, ShieldQuadrant } from './DirectionalShieldSystem';
import { WeaponHardpoint, WeaponHardpointConfig } from './WeaponHardpoint';
import { SHIP_CLASSES } from './shipPresets';
import { PLAYABLE_SHIP_ARCHETYPES } from './ShipArchetypeDefinitions';
import { ShipCollisionHandler } from './ShipCollisionHandler';

/**
 * Team Affiliation Identifiers:
 * - 'alpha': Player faction team (e.g. Federation Starfleet)
 * - 'beta': Opposing invading alliance team (e.g. Klingon / Romulan / Borg)
 */
export type Team = 'alpha' | 'beta';

export interface StarbaseTurret {
  id: string;
  hardpoint: WeaponHardpoint;
}

export interface Starbase extends ShipEntity {
  id: string;
  name: string;
  team: Team;
  faction: Faction;
  position: { x: number; y: number; z: number };
  rotationY: number;
  
  // Health & Heavy Directional Shields
  hull: number;
  maxHull: number;
  shields: ShieldArcs;
  isDestroyed: boolean;

  // Multiple Defense Turrets (360° Heavy Beams & 180° Torpedo Hardpoints)
  turrets: StarbaseTurret[];

  // Threat & Aggro Management Table (Map target ID to threat score)
  aggroTable: Map<string, number>;
  primaryTargetId: string | null;
}

export class StarbaseSystem {
  /**
   * Creates a high-tier Starbase MOBA Tower / Base structure
   */
  public static createStarbase(
    id: string,
    name: string,
    team: Team,
    faction: Faction,
    position: { x: number; y: number; z: number }
  ): Starbase {
    const shieldPerArc = 2500;
    const maxHull = 12000;
    const rotationY = team === 'alpha' ? 0 : Math.PI;

    // Build multiple heavy defense turrets (360° Point Defense & Heavy 180° Frontal Battery)
    const turrets: StarbaseTurret[] = [
      {
        id: `${id}_turret_1`,
        hardpoint: new WeaponHardpoint({
          id: `${id}_weapon_1`,
          name: 'Starbase Heavy Phaser Array',
          weaponType: 'phaser_beam',
          baseDamage: 60,
          cooldown: 2.5,
          currentCooldown: 0,
          energyCost: 0,
          range: 56,
          color: '#38bdf8',
          isTorpedo: false,
          soundName: 'phaser',
          arcAngleDegrees: 360, // 360° Turret Coverage
          localFacingAngle: 0,
          localPosition: { x: 0, y: 15, z: 0 },
        }),
      },
      {
        id: `${id}_turret_2`,
        hardpoint: new WeaponHardpoint({
          id: `${id}_weapon_2`,
          name: 'Starbase Quantum Mortar',
          weaponType: 'quantum_torpedo',
          baseDamage: 125,
          cooldown: 4.0,
          currentCooldown: 0,
          energyCost: 0,
          range: 63,
          color: '#c084fc',
          isTorpedo: true,
          soundName: 'torpedo',
          arcAngleDegrees: 180, // 180° Sector Battery
          localFacingAngle: 0,
          localPosition: { x: 0, y: -10, z: 0 },
        }),
      },
      {
        id: `${id}_turret_3`,
        hardpoint: new WeaponHardpoint({
          id: `${id}_weapon_3`,
          name: 'Starbase Heavy Disruptor Battery',
          weaponType: 'disruptor_beam',
          baseDamage: 70,
          cooldown: 2.0,
          currentCooldown: 0,
          energyCost: 0,
          range: 50,
          color: '#4ade80',
          isTorpedo: false,
          soundName: 'disruptor',
          arcAngleDegrees: 360,
          localFacingAngle: Math.PI,
          localPosition: { x: 0, y: 10, z: 0 },
        }),
      },
    ];

    const weapons = turrets.map((t) => t.hardpoint.toWeapon());

    const shipClass = {
      id: `${id}_class`,
      name,
      faction,
      description: 'Orbital Defense Starbase',
      maxHull,
      maxShieldPerArc: shieldPerArc,
      turnRate: 0,
      maxSpeed: 0,
      acceleration: 0,
      weaponSlots: weapons,
      modelType: 'station' as const,
      defaultPower: { weapons: 100, shields: 100, engines: 100, auxiliary: 100 },
    };

    return {
      id,
      name,
      isPlayer: false,
      team,
      faction,
      shipClass,
      position,
      rotation: { x: 0, y: rotationY, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      speed: 0,
      targetSpeed: 0,
      rotationY,
      hull: maxHull,
      maxHull,
      shields: {
        front: { current: shieldPerArc, max: shieldPerArc },
        starboard: { current: shieldPerArc, max: shieldPerArc },
        back: { current: shieldPerArc, max: shieldPerArc },
        port: { current: shieldPerArc, max: shieldPerArc },
      },
      subsystems: { weapons: 100, shields: 100, engines: 100, auxiliary: 100 },
      power: { weapons: 100, shields: 100, engines: 100, auxiliary: 100 },
      powerPreset: 'balanced',
      weapons,
      abilities: [],
      targetId: null,
      targetedSubsystem: null,
      isDestroyed: false,
      turrets,
      aggroTable: new Map(),
      primaryTargetId: null,
    };
  }

  /**
   * Generates or escalates threat on Starbase aggro table.
   * HIGH-THREAT OVERRIDE: If an enemy player attacks an allied drone/minion or Starbase,
   * the Starbase instantly generates massive threat score to protect the minion wave!
   */
  public static addThreat(starbase: Starbase, attackerId: string, amount: number, isPlayer: boolean) {
    const current = starbase.aggroTable.get(attackerId) || 0;
    // Player threat multiplier to enforce "Hero Escort / Minion Tank" mechanics
    const threatBonus = isPlayer ? amount * 3.5 : amount;
    starbase.aggroTable.set(attackerId, current + threatBonus);
  }
}

/**
 * Wave Spawner System: Periodically spawns opposing waves of drone/frigate minions.
 */
export class WaveSpawner {
  public team: Team;
  public spawnPosition: { x: number; y: number; z: number };
  public targetBasePosition: { x: number; y: number; z: number };
  
  // CONFIGURABLE WAVE TIMER:
  // Adjust spawnIntervalSeconds to control spawn frequency (e.g. 30s per wave)
  public spawnIntervalSeconds: number = 30;
  public timer: number = 2; // Initial spawn countdown
  public waveCount: number = 0;

  constructor(
    team: Team,
    spawnPosition: { x: number; y: number; z: number },
    targetBasePosition: { x: number; y: number; z: number },
    spawnIntervalSeconds: number = 30
  ) {
    this.team = team;
    this.spawnPosition = spawnPosition;
    this.targetBasePosition = targetBasePosition;
    this.spawnIntervalSeconds = spawnIntervalSeconds;
  }

  /**
   * Spawns a wave of 3 light escort frigate/drone minions
   */
  public spawnWave(): ShipEntity[] {
    this.waveCount++;
    const isAlpha = this.team === 'alpha';
    const faction: Faction = isAlpha ? 'federation' : 'pirate';
    // Friendly NPC waves (Alpha team): Micro Recon models
    // Enemy ship waves (Beta team): Infrared Furtive models
    const archetype = isAlpha
      ? PLAYABLE_SHIP_ARCHETYPES.micro_recon
      : PLAYABLE_SHIP_ARCHETYPES.infrared_furtive;

    const minions: ShipEntity[] = [];
    const count = 1;

    for (let i = 0; i < count; i++) {
      const offsetX = 0;
      const minionId = `minion_${this.team}_w${this.waveCount}`;
      const name = isAlpha
        ? `Allied Micro Recon ${this.waveCount}`
        : `Infrared Furtive Raider ${this.waveCount}`;

      const minionHealth = new MinionHealth({
        max_hull: 450,
        max_shield: 250,
        shield_recharge_rate: 15.0,
        shield_recharge_delay: 3.5,
        last_hit_threshold: 120.0,
      });

      const sQuarter = minionHealth.current_shield / 4;
      const sMaxQuarter = minionHealth.max_shield / 4;

      minions.push({
        id: minionId,
        name,
        isPlayer: false,
        faction,
        shipClass: {
          ...archetype,
          maxHull: 450,
          maxSpeed: 30,
        },
        position: {
          x: this.spawnPosition.x + offsetX,
          y: this.spawnPosition.y,
          z: this.spawnPosition.z,
        },
        rotation: { x: 0, y: isAlpha ? 0 : Math.PI, z: 0 },
        speed: 6,
        targetSpeed: 6,
        hull: 450,
        maxHull: 450,
        shields: {
          front: { current: sQuarter, max: sMaxQuarter },
          starboard: { current: sQuarter, max: sMaxQuarter },
          back: { current: sQuarter, max: sMaxQuarter },
          port: { current: sQuarter, max: sMaxQuarter },
        },
        subsystems: { weapons: 100, shields: 100, engines: 100, auxiliary: 100 },
        power: { weapons: 80, shields: 70, engines: 70, auxiliary: 50 },
        powerPreset: 'balanced',
        weapons: archetype.weaponSlots,
        abilities: [],
        targetId: null,
        targetedSubsystem: null,
        isDestroyed: false,
        minionHealth,
      });

      // Attach team tag
      (minions[i] as any).team = this.team;
      (minions[i] as any).isMinion = true;
    }

    return minions;
  }
}

/**
 * Minion AI Controller: Navigates central lane toward enemy Starbase,
 * engaging enemy minions on sight or focusing Starbase shields.
 */
export class MinionShipAI {
  public static updateMinion(
    minion: ShipEntity,
    targetBasePos: { x: number; y: number; z: number },
    enemies: ShipEntity[],
    starbase: Starbase | null,
    delta: number,
    engine?: any
  ) {
    if (minion.isDestroyed) return;

    if (minion.minionHealth) {
      minion.minionHealth.update(delta);
      minion.hull = minion.minionHealth.current_hull;
      minion.maxHull = minion.minionHealth.max_hull;
      const sQuarter = minion.minionHealth.current_shield / 4;
      const sMaxQuarter = minion.minionHealth.max_shield / 4;
      minion.shields = {
        front: { current: sQuarter, max: sMaxQuarter },
        starboard: { current: sQuarter, max: sMaxQuarter },
        back: { current: sQuarter, max: sMaxQuarter },
        port: { current: sQuarter, max: sMaxQuarter },
      };
    }

    // 1. Target Selection Priority:
    // Priority A: Nearby enemy minion or ship in range (< 88)
    // Priority B: Enemy Starbase
    // Priority C: Enemy base lane objective
    let currentTarget: { position: { x: number; y: number; z: number }; id: string; entityRef?: ShipEntity } | null = null;

    const nearbyEnemy = enemies.find((e) => {
      if (e.isDestroyed) return false;
      const dx = e.position.x - minion.position.x;
      const dz = e.position.z - minion.position.z;
      return Math.sqrt(dx * dx + dz * dz) < 88;
    });

    if (nearbyEnemy) {
      currentTarget = { position: nearbyEnemy.position, id: nearbyEnemy.id, entityRef: nearbyEnemy };
      minion.targetId = nearbyEnemy.id;
    } else if (starbase && !starbase.isDestroyed) {
      currentTarget = { position: starbase.position, id: starbase.id, entityRef: starbase };
      minion.targetId = starbase.id;
    } else {
      currentTarget = { position: targetBasePos, id: 'lane_objective' };
    }

    // 2. Navigation along lane towards target with Asteroid Avoidance
    if (currentTarget) {
      const dx = currentTarget.position.x - minion.position.x;
      const dz = currentTarget.position.z - minion.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      let targetAngle = Math.atan2(dx, dz);

      // Apply Asteroid Obstacle Avoidance if combat engine reference is available
      if (engine && engine.asteroids && engine.asteroids.length > 0) {
        const { adjustedHeading, threatWeight } = ShipCollisionHandler.calculateAsteroidAvoidanceHeading(
          minion,
          engine.asteroids,
          targetAngle,
          35.0
        );
        targetAngle = adjustedHeading;
      }

      minion.targetAngularVelocity = Math.atan2(
        Math.sin(targetAngle - minion.rotation.y),
        Math.cos(targetAngle - minion.rotation.y)
      ) * 2.0;

      // Determine weapon firing range
      const maxWeaponRange = (minion.weapons && minion.weapons.length > 0)
        ? Math.max(...minion.weapons.map((w) => w.range))
        : 65;

      const hostileTarget = currentTarget.entityRef && !currentTarget.entityRef.isDestroyed ? currentTarget.entityRef : null;
      const isInFiringRange = hostileTarget !== null && dist <= maxWeaponRange;

      if (isInFiringRange) {
        // Stop moving completely when in range to fire at a target!
        minion.targetSpeed = 0;
        minion.speed = Math.max(0, minion.speed - delta * 30.0);
      } else {
        // Move slowly while marching towards objective (slow minion pace)
        minion.targetSpeed = 6.0;
      }

      // 3. Fire weapons at hostile target (enemy ship, minion, or starbase) when in range
      if (hostileTarget && engine) {
        minion.weapons.forEach((w, idx) => {
          if (w.currentCooldown <= 0 && dist <= w.range) {
            engine.fireWeapon(minion, idx, hostileTarget);
          }
        });
      }
    }
  }
}
