import {
  Asteroid,
  BeamEffect,
  CombatLogEntry,
  ExplosionParticle,
  PowerLevels,
  PowerPreset,
  Projectile,
  ShieldArcKey,
  ShieldImpactEffect,
  ShipEntity,
  SubsystemType,
  Weapon,
  ZoningOrdnance,
} from '../types';
import { soundManager } from '../audio/soundManager';
import { ShipFlightController } from './ShipFlightController';
import { DirectionalShieldSystem } from './DirectionalShieldSystem';
import { StarbaseSiegeModeController } from './StarbaseSiegeModeController';
import { ShipModelBuilder } from './shipModelBuilder';
import { PLAYABLE_SHIP_ARCHETYPES } from './ShipArchetypeDefinitions';
import { DuelGameManager } from './DuelGameManager';
import { ShipCollisionHandler } from './ShipCollisionHandler';
import { AsteroidObject } from './Asteroid';
import { PowerManagementController } from './PowerManagementController';
import { WeaponHardpoint } from './WeaponHardpoint';
import { BossRaidModeController } from './BossRaidModeController';

export const DRONE_CONTROL_RANGE = 180;

export class SpaceCombatEngine {
  public player: ShipEntity;
  public enemies: ShipEntity[] = [];
  public asteroids: Asteroid[] = [];
  public projectiles: Projectile[] = [];
  public beamEffects: BeamEffect[] = [];
  public ordnances: ZoningOrdnance[] = [];
  public shieldImpacts: ShieldImpactEffect[] = [];
  public particles: ExplosionParticle[] = [];
  public combatLogs: CombatLogEntry[] = [];
  public siegeController: StarbaseSiegeModeController | null = null;
  public bossRaidController: BossRaidModeController | null = null;
  public duelManager: DuelGameManager = new DuelGameManager();

  // Custom signals / event callbacks for Dragoon Plasma Ball
  public onPlasmaChargeStarted?: (ship: ShipEntity) => void;
  public onPlasmaFired?: (ship: ShipEntity, chargeRatio: number, damage: number, speed: number) => void;
  public onPlasmaOvercharged?: (ship: ShipEntity, selfDamage: number) => void;
  public activeMovementKeys?: { x: number; z: number };

  public getOrCreatePlasmaChargeState(ship: ShipEntity) {
    if (!ship.plasmaCharge) {
      ship.plasmaCharge = {
        isCharging: false,
        chargeTime: 0,
        minChargeTime: 0.0,
        maxChargeTime: 1.8,
        overchargeThreshold: 2.0,
        selfDamageAmount: 0.20, // 20% direct Hull Damage
      };
    }
    return ship.plasmaCharge;
  }

  public startPlasmaCharge(ship: ShipEntity): boolean {
    if (ship.isDestroyed) return false;
    if (ship.hardpointOverheatTimer && ship.hardpointOverheatTimer > 0) {
      if (ship.isPlayer) {
        this.addLog(`HARDPOINT OVERHEAT: Containment locked for ${ship.hardpointOverheatTimer.toFixed(1)}s!`, 'system');
        soundManager.playErrorAlert?.();
      }
      return false;
    }

    const pc = this.getOrCreatePlasmaChargeState(ship);
    if (!pc.isCharging) {
      pc.isCharging = true;
      pc.chargeTime = 0;
      this.addLog(`PLASMA CHARGE INITIATED: ${ship.name} drawing containment power to bow hardpoint!`, 'ability');
      if (this.onPlasmaChargeStarted) {
        this.onPlasmaChargeStarted(ship);
      }
      soundManager.playPowerPreset();
    }
    return true;
  }

  public releasePlasmaCharge(ship: ShipEntity, target?: ShipEntity): boolean {
    if (ship.isDestroyed) return false;
    const pc = ship.plasmaCharge;
    if (!pc || !pc.isCharging || pc.chargeTime <= 0) return false;

    if (ship.hardpointOverheatTimer && ship.hardpointOverheatTimer > 0) {
      pc.isCharging = false;
      pc.chargeTime = 0;
      return false;
    }

    const holdTime = pc.chargeTime;
    pc.isCharging = false;
    pc.chargeTime = 0;

    // Charge ratio: min 0.0s to max sweet spot 1.8s
    const r = Math.min(1.0, Math.max(0.0, holdTime / pc.maxChargeTime));

    const baseDamage = Math.round(100 + r * 500); // 100 to 600
    const projectileSpeed = 30 + r * 15; // 30 to 45 m/s
    const scaleRatio = 1.0 + r * 1.5; // 1.0x to 2.5x scale
    const radius = 0.5 + r * 0.75; // 0.5m to 1.25m physical radius

    const heading = ship.rotation.y;
    const bowPos = {
      x: ship.position.x + Math.sin(heading) * 10,
      y: ship.position.y,
      z: ship.position.z + Math.cos(heading) * 10,
    };

    const velocity = {
      x: Math.sin(heading) * projectileSpeed,
      y: 0,
      z: Math.cos(heading) * projectileSpeed,
    };

    const colorHex = r >= 0.5 ? '#f59e0b' : '#00f0ff';

    this.projectiles.push({
      id: `plasma_ball_${Date.now()}_${Math.random()}`,
      ownerId: ship.id,
      targetId: target ? target.id : null,
      weaponType: 'photon_torpedo',
      weaponIndex: 1,
      firingArc: 'forward_45',
      position: bowPos,
      velocity: velocity,
      damage: baseDamage,
      isTorpedo: true,
      isPulse: false,
      hasLaunched: true,
      color: colorHex,
      lifetime: 4.5,
      radius: radius,
      scale: scaleRatio,
    });

    // Put Hardpoint 2 on cooldown
    const plasmaWeapon = ship.weapons.find((w) => w.id.includes('plasma') || w.isTorpedo);
    if (plasmaWeapon) {
      plasmaWeapon.currentCooldown = plasmaWeapon.cooldown || 3.5;
    }

    soundManager.playTorpedoLaunch();
    this.addLog(
      `CHARGED PLASMA BALL LAUNCHED: ${ship.name} unleashed Bow Plasma Ball (${Math.round(r * 100)}% charge, ${baseDamage} damage at ${Math.round(projectileSpeed)}m/s)!`,
      'ability',
      0,
      ship.isPlayer ? 'player' : 'enemy'
    );

    if (this.onPlasmaFired) {
      this.onPlasmaFired(ship, r, baseDamage, projectileSpeed);
    }
    return true;
  }

  constructor(player: ShipEntity, enemies: ShipEntity[]) {
    this.player = player;
    if (!this.player.powerController) {
      this.player.powerController = new PowerManagementController('balanced');
    }
    if (!this.player.team) this.player.team = 'alpha';
    this.enemies = enemies;
    this.enemies.forEach((enemy) => {
      if (!enemy.powerController) {
        enemy.powerController = new PowerManagementController('balanced');
      }
    });
    this.generateAsteroids();
    this.addLog('Tactical systems initialized. All 4 shield arcs operational.', 'system');
  }

  public generateAsteroids(isMoba: boolean = false) {
    this.asteroids = [];
    const count = isMoba ? 5 : 3;
    const shipsToCheck = [this.player, ...(this.enemies || [])].filter((s) => s && s.position);
    const minSafeDistance = 45;

    for (let i = 0; i < count; i++) {
      const size = 5.5 + Math.random() * 8.5;
      const hp = Math.round(size * 120);
      let x = 0;
      let z = 0;
      let valid = false;
      let attempts = 0;

      while (!valid && attempts < 50) {
        attempts++;
        if (isMoba) {
          // Distribute along the MOBA arena lane flanks (Z between -212.5 and +212.5)
          const laneZ = (Math.random() - 0.5) * 425;
          const flankSide = Math.random() < 0.5 ? 1 : -1;
          const flankX = flankSide * (25 + Math.random() * 85);
          x = flankX;
          z = laneZ;
        } else {
          const angle = Math.random() * Math.PI * 2;
          const dist = 50 + Math.random() * 100;
          x = Math.cos(angle) * dist;
          z = Math.sin(angle) * dist;
        }

        // Check clearance distance to starting ships
        const tooClose = shipsToCheck.some((ship) => {
          const dx = x - ship.position.x;
          const dz = z - ship.position.z;
          return Math.hypot(dx, dz) < (minSafeDistance + size);
        });

        if (!tooClose || attempts >= 49) {
          valid = true;
        }
      }

      const astObj = new AsteroidObject(
        `ast_${i}_${Date.now()}_${Math.random()}`,
        { x, y: (Math.random() - 0.5) * 1.5, z },
        size,
        hp
      );

      // Register collision signal listener for impact sparks and sound effects
      astObj.onCollision((_ast, _shipName, _damage, impactPoint) => {
        this.createImpactSparks(impactPoint, '#f97316', 10);
        this.createImpactSparks(impactPoint, '#cbd5e1', 8);
        soundManager.playHullImpact();
      });

      this.asteroids.push(astObj);
    }
  }

  public damageAsteroid(
    asteroid: Asteroid,
    damage: number,
    attackerName: string,
    weaponName: string,
    impactPoint: { x: number; y: number; z: number }
  ) {
    if (asteroid.health === undefined) {
      asteroid.maxHealth = Math.round(asteroid.radius * 40);
      asteroid.health = asteroid.maxHealth;
    }

    asteroid.health -= damage;

    this.createImpactSparks(impactPoint, '#f97316', 14);
    this.createImpactSparks(impactPoint, '#cbd5e1', 10);

    if (asteroid.health <= 0) {
      this.createExplosionParticles(impactPoint, 35);
      this.createImpactSparks(impactPoint, '#e2e8f0', 30);
      soundManager.playExplosion();
      this.addLog(`${attackerName}'s ${weaponName} destroyed an asteroid!`, 'system');
      this.asteroids = this.asteroids.filter((a) => a.id !== asteroid.id);
    } else {
      soundManager.playHullImpact();
      this.addLog(
        `${attackerName}'s ${weaponName} struck an asteroid for ${Math.round(damage)} damage! (${Math.max(0, Math.round(asteroid.health))}/${asteroid.maxHealth} HP)`,
        'system'
      );
    }
  }

  /**
   * Helper: Ray-sphere intersection check.
   */
  public static raySphereIntersection(
    startPos: { x: number; y: number; z: number },
    dir: { x: number; y: number; z: number },
    spherePos: { x: number; y: number; z: number },
    sphereRadius: number
  ): { hit: boolean; distance: number; impactPoint: { x: number; y: number; z: number } } {
    const vx = spherePos.x - startPos.x;
    const vy = spherePos.y - startPos.y;
    const vz = spherePos.z - startPos.z;

    const tProj = vx * dir.x + vy * dir.y + vz * dir.z;
    const vSq = vx * vx + vy * vy + vz * vz;
    const rSq = sphereRadius * sphereRadius;

    if (tProj < 0 && vSq > rSq) {
      return { hit: false, distance: Infinity, impactPoint: startPos };
    }

    const dSq = vSq - tProj * tProj;
    if (dSq > rSq) {
      return { hit: false, distance: Infinity, impactPoint: startPos };
    }

    const tDet = Math.sqrt(Math.max(0, rSq - dSq));
    let tHit = tProj - tDet;
    if (tHit < 0) {
      tHit = 0;
    }

    const impactPoint = {
      x: startPos.x + dir.x * tHit,
      y: startPos.y + dir.y * tHit,
      z: startPos.z + dir.z * tHit,
    };

    return { hit: true, distance: tHit, impactPoint };
  }

  /**
   * Finds the first valid target entity (or asteroid/ordnance) hit by a phaser beam along its line of sight.
   */
  public findFirstBeamHit(
    shooter: ShipEntity,
    sourcePos: { x: number; y: number; z: number },
    intendedTarget: ShipEntity
  ): {
    hitType: 'ship' | 'asteroid' | 'ordnance';
    targetShip?: ShipEntity;
    asteroidHit?: { asteroid: Asteroid; impactPoint: { x: number; y: number; z: number } };
    ordnance?: ZoningOrdnance;
    impactPoint: { x: number; y: number; z: number };
    distance: number;
  } {
    const dx = intendedTarget.position.x - sourcePos.x;
    const dy = intendedTarget.position.y - sourcePos.y;
    const dz = intendedTarget.position.z - sourcePos.z;
    const distToTarget = Math.hypot(dx, dy, dz);

    if (distToTarget < 0.001) {
      return {
        hitType: 'ship',
        targetShip: intendedTarget,
        impactPoint: { ...intendedTarget.position },
        distance: 0,
      };
    }

    const dir = { x: dx / distToTarget, y: dy / distToTarget, z: dz / distToTarget };
    const shooterTeam = shooter.team || (shooter.isPlayer ? 'alpha' : 'beta');

    let closestHit: {
      hitType: 'ship' | 'asteroid' | 'ordnance';
      targetShip?: ShipEntity;
      asteroidHit?: { asteroid: Asteroid; impactPoint: { x: number; y: number; z: number } };
      ordnance?: ZoningOrdnance;
      impactPoint: { x: number; y: number; z: number };
      distance: number;
    } | null = null;

    let minDistance = distToTarget + 2.0;

    // 1. Check Zoning Ordnance
    for (const ord of this.ordnances) {
      if (ord.isDestroyed || ord.team === shooterTeam || (ord.invulnerableTimer && ord.invulnerableTimer > 0)) continue;
      const res = SpaceCombatEngine.raySphereIntersection(sourcePos, dir, ord.position, ord.radius || 2.5);
      if (res.hit && res.distance < minDistance) {
        minDistance = res.distance;
        closestHit = {
          hitType: 'ordnance',
          ordnance: ord,
          impactPoint: res.impactPoint,
          distance: res.distance,
        };
      }
    }

    // 2. Check Asteroids
    if (this.asteroids) {
      for (const ast of this.asteroids) {
        const r = ast.radius * 1.45 + 0.6;
        const res = SpaceCombatEngine.raySphereIntersection(sourcePos, dir, ast.position, r);
        if (res.hit && res.distance < minDistance) {
          minDistance = res.distance;
          closestHit = {
            hitType: 'asteroid',
            asteroidHit: { asteroid: ast, impactPoint: res.impactPoint },
            impactPoint: res.impactPoint,
            distance: res.distance,
          };
        }
      }
    }

    // 3. Check Valid Target Ships / Drones (Hostile targetable entities)
    const allShips = [this.player, ...this.enemies];
    for (const candidate of allShips) {
      if (!candidate || candidate.isDestroyed || candidate.id === shooter.id) continue;

      const candidateTeam = candidate.team || (candidate.isPlayer ? 'alpha' : 'beta');
      if (candidateTeam === shooterTeam) continue;

      const shieldRadius = ShipModelBuilder.getShieldRadius(candidate.shipClass?.modelType);
      const hullRadius = ShipModelBuilder.getHullRadius(candidate.shipClass?.modelType);
      const facingArcKey = SpaceCombatEngine.calculateShieldArcHit(candidate.position, candidate.rotation.y, sourcePos);
      const facingArc = candidate.shields ? candidate.shields[facingArcKey] : undefined;
      const isShieldVisible = candidate.minionHealth
        ? candidate.minionHealth.is_shield_active()
        : (facingArc && facingArc.max > 0 && (facingArc.current / facingArc.max) > 0.05);
      const hitRadius = isShieldVisible ? shieldRadius : hullRadius;

      const res = SpaceCombatEngine.raySphereIntersection(sourcePos, dir, candidate.position, hitRadius);
      if (res.hit && res.distance < minDistance) {
        minDistance = res.distance;
        const preciseImpact = SpaceCombatEngine.getTargetImpactPoint(candidate, sourcePos, hitRadius);
        closestHit = {
          hitType: 'ship',
          targetShip: candidate,
          impactPoint: preciseImpact,
          distance: res.distance,
        };
      }
    }

    if (closestHit) {
      return closestHit;
    }

    const targetImpact = SpaceCombatEngine.getTargetImpactPoint(intendedTarget, sourcePos);
    return {
      hitType: 'ship',
      targetShip: intendedTarget,
      impactPoint: targetImpact,
      distance: distToTarget,
    };
  }

  /**
   * Helper: Check if line segment between startPos and endPos intersects any asteroid sphere.
   * Returns closest hit if blocked, or null if line of sight is clear.
   */
  public checkLineOfSightAsteroidHit(
    startPos: { x: number; y: number; z: number },
    endPos: { x: number; y: number; z: number }
  ): { asteroid: Asteroid; impactPoint: { x: number; y: number; z: number }; distance: number } | null {
    if (!this.asteroids || this.asteroids.length === 0) return null;

    const dx = endPos.x - startPos.x;
    const dy = endPos.y - startPos.y;
    const dz = endPos.z - startPos.z;
    const segLen = Math.hypot(dx, dy, dz);

    if (segLen < 0.0001) return null;

    const ux = dx / segLen;
    const uy = dy / segLen;
    const uz = dz / segLen;

    let closestHit: { asteroid: Asteroid; impactPoint: { x: number; y: number; z: number }; distance: number } | null = null;
    let minDistance = Infinity;

    for (const ast of this.asteroids) {
      // Bounding collision radius scaled to match the visual 3D voxel mesh
      const r = ast.radius * 1.45 + 0.6;

      const wx = ast.position.x - startPos.x;
      const wy = ast.position.y - startPos.y;
      const wz = ast.position.z - startPos.z;

      // Project center onto ray segment
      const t = wx * ux + wy * uy + wz * uz;
      const wLenSq = wx * wx + wy * wy + wz * wz;
      const perpDistSq = wLenSq - t * t;

      if (perpDistSq <= r * r) {
        const halfChord = Math.sqrt(Math.max(0, r * r - perpDistSq));
        const tEntry = t - halfChord;
        const tExit = t + halfChord;

        // Intersection exists if the segment [0, segLen] overlaps [tEntry, tExit]
        if (tExit >= 0 && tEntry <= segLen) {
          const hitDist = Math.max(0, tEntry);
          if (hitDist <= segLen && hitDist < minDistance) {
            minDistance = hitDist;
            closestHit = {
              asteroid: ast,
              impactPoint: {
                x: startPos.x + ux * hitDist,
                y: startPos.y + uy * hitDist,
                z: startPos.z + uz * hitDist,
              },
              distance: hitDist,
            };
          }
        }
      }
    }

    return closestHit;
  }

  /**
   * Returns a list of targetable hostile ships/structures sorted tactically:
   * 1. Targets in front of the player's facing angle (cone threshold ~108°) sorted by distance (closest first).
   * 2. Targets behind the player sorted by angular alignment and distance.
   */
  public getSortedTargets(player: ShipEntity = this.player): ShipEntity[] {
    const playerTeam = player.team || (player.isPlayer ? 'alpha' : 'beta');

    const hostiles = this.enemies.filter((e) => {
      if (e.isDestroyed || e.id === player.id) return false;
      if (e.is_lockable === false || e.isLockable === false) return false;
      const enemyTeam = e.team || (e.isPlayer ? 'alpha' : 'beta');
      return enemyTeam !== playerTeam;
    });

    if (hostiles.length === 0) return [];

    const px = player.position.x;
    const pz = player.position.z;
    const headingY = player.rotation.y;

    const evaluated = hostiles.map((e) => {
      const dx = e.position.x - px;
      const dz = e.position.z - pz;
      const dist = Math.hypot(dx, dz);

      const targetAngle = Math.atan2(dx, dz);
      const angleDiff = Math.abs(
        Math.atan2(Math.sin(targetAngle - headingY), Math.cos(targetAngle - headingY))
      );

      return { ship: e, dist, angleDiff };
    });

    const coneThreshold = Math.PI * 0.6; // ~108 degrees forward cone
    const inFront = evaluated.filter((item) => item.angleDiff <= coneThreshold);
    const behind = evaluated.filter((item) => item.angleDiff > coneThreshold);

    // Targets in front: sort by distance ascending (closest facing target is #1)
    inFront.sort((a, b) => {
      if (Math.abs(a.dist - b.dist) > 15) {
        return a.dist - b.dist;
      }
      return a.angleDiff - b.angleDiff;
    });

    // Targets behind: sort by angleDiff then distance
    behind.sort((a, b) => {
      if (Math.abs(a.angleDiff - b.angleDiff) > 0.15) {
        return a.angleDiff - b.angleDiff;
      }
      return a.dist - b.dist;
    });

    return [...inFront, ...behind].map((item) => item.ship);
  }

  /**
   * Rotates target to the next hostile target in tactical order.
   * If no target is currently selected, selects the closest target the player is facing.
   */
  public cycleTarget(player: ShipEntity = this.player): string | null {
    const sorted = this.getSortedTargets(player);
    if (sorted.length === 0) {
      player.targetId = null;
      return null;
    }

    const currentIdx = sorted.findIndex((s) => s.id === player.targetId);
    if (currentIdx === -1) {
      // Select the first target (closest facing target)
      player.targetId = sorted[0].id;
    } else {
      // Cycle to next target in list
      const nextIdx = (currentIdx + 1) % sorted.length;
      player.targetId = sorted[nextIdx].id;
    }

    return player.targetId;
  }

  // Determine which of the 4 Shield Arcs (Front, Starboard, Back, Port) is hit
  public static calculateShieldArcHit(
    targetPos: { x: number; y: number; z: number },
    targetRotY: number,
    shooterPos: { x: number; y: number; z: number }
  ): ShieldArcKey {
    // Relative vector from target to shooter/impact source
    const dx = shooterPos.x - targetPos.x;
    const dz = shooterPos.z - targetPos.z;

    // Transform into target ship's local coordinate space
    const sinR = Math.sin(targetRotY);
    const cosR = Math.cos(targetRotY);

    const localZ = dx * sinR + dz * cosR; // Forward (+) / Aft (-)
    const localX = dx * cosR - dz * sinR; // Starboard/Right (+) / Port/Left (-)

    const angle = Math.atan2(localX, localZ);
    const deg = (angle * 180) / Math.PI;

    if (deg >= -45 && deg <= 45) {
      return 'front';
    } else if (deg > 45 && deg < 135) {
      return 'starboard';
    } else if (deg >= 135 || deg <= -135) {
      return 'back';
    } else {
      return 'port';
    }
  }

  // Validate if target is within weapon firing arc
  public static isInFiringArc(
    shooterPos: { x: number; y: number; z: number },
    shooterRotY: number,
    targetPos: { x: number; y: number; z: number },
    firingArc: Weapon['firingArc'] | string,
    weapon?: Weapon
  ): boolean {
    if (firingArc === 'broadside_360') return true;

    // Direct hardpoint angle evaluation if weapon specifies localFacingAngle and arcAngleDegrees
    if (weapon && weapon.localFacingAngle !== undefined && weapon.arcAngleDegrees !== undefined && weapon.arcAngleDegrees < 360) {
      const dx = targetPos.x - shooterPos.x;
      const dz = targetPos.z - shooterPos.z;
      const absoluteBearing = Math.atan2(dx, dz);
      const hardpointHeading = shooterRotY + weapon.localFacingAngle;
      let relativeAngle = absoluteBearing - hardpointHeading;
      relativeAngle = Math.atan2(Math.sin(relativeAngle), Math.cos(relativeAngle));
      const relativeDeg = Math.abs((relativeAngle * 180) / Math.PI);
      return relativeDeg <= weapon.arcAngleDegrees / 2;
    }

    const dx = targetPos.x - shooterPos.x;
    const dz = targetPos.z - shooterPos.z;

    // Local angle relative to ship forward heading
    const angleToTarget = Math.atan2(dx, dz);
    const relativeAngle = Math.atan2(Math.sin(angleToTarget - shooterRotY), Math.cos(angleToTarget - shooterRotY));

    const deg = Math.abs((relativeAngle * 180) / Math.PI);

    switch (firingArc) {
      case 'port_45': {
        const hardpointHeading = shooterRotY - Math.PI / 2;
        let rel = Math.atan2(dx, dz) - hardpointHeading;
        rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        return Math.abs((rel * 180) / Math.PI) <= 22.5;
      }
      case 'port_90': {
        const hardpointHeading = shooterRotY - Math.PI / 2;
        let rel = Math.atan2(dx, dz) - hardpointHeading;
        rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        return Math.abs((rel * 180) / Math.PI) <= 45;
      }
      case 'port_180': {
        const hardpointHeading = shooterRotY - Math.PI / 2;
        let rel = Math.atan2(dx, dz) - hardpointHeading;
        rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        return Math.abs((rel * 180) / Math.PI) <= 90;
      }
      case 'starboard_45': {
        const hardpointHeading = shooterRotY + Math.PI / 2;
        let rel = Math.atan2(dx, dz) - hardpointHeading;
        rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        return Math.abs((rel * 180) / Math.PI) <= 22.5;
      }
      case 'starboard_90': {
        const hardpointHeading = shooterRotY + Math.PI / 2;
        let rel = Math.atan2(dx, dz) - hardpointHeading;
        rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        return Math.abs((rel * 180) / Math.PI) <= 45;
      }
      case 'starboard_180': {
        const hardpointHeading = shooterRotY + Math.PI / 2;
        let rel = Math.atan2(dx, dz) - hardpointHeading;
        rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        return Math.abs((rel * 180) / Math.PI) <= 90;
      }
      case 'broadside_port':
        return relativeAngle >= 0 && deg >= 45 && deg <= 135;
      case 'broadside_starboard':
        return relativeAngle < 0 && deg >= 45 && deg <= 135;
      case 'forward_15':
        return deg <= 7.5;
      case 'forward_30':
        return deg <= 15.0;
      case 'forward_45':
        return deg <= 22.5;
      case 'forward_90':
        return deg <= 45;
      case 'forward_180':
        return deg <= 90;
      case 'broadside':
        return deg >= 45 && deg <= 135;
      case 'aft_45':
        return deg >= 157.5;
      case 'aft_90':
        return deg >= 135;
      case 'aft_180':
        return deg >= 90;
      default:
        return true;
    }
  }

  // Update Game Loop tick
  public update(delta: number) {
    if (delta > 0.1) delta = 0.1; // Cap large delta lags

    const allShips = [this.player, ...this.enemies].filter((s) => !s.isDestroyed);

    // 1. Update Ship Physics & Movement
    allShips.forEach((ship) => {
      if (ship.powerController) {
        ship.powerController.update(delta);
      }
      this.updateShipMovement(ship, delta);
      this.updateShipRecharge(ship, delta);
      this.updateShipCooldowns(ship, delta);
    });

    // 1b. Ship Collision Detection (Environmental Sliding & Mass-Ratio Impulse Transfer)
    ShipCollisionHandler.processAllCollisions(
      allShips,
      this.asteroids,
      delta,
      (msg, type) => this.addLog(msg, type)
    );

    // 2. Update AI Decisions
    this.enemies
      .filter((e) => !e.isDestroyed)
      .forEach((enemy) => {
        const enemyTeam = enemy.team || 'beta';
        const playerTeam = this.player.team || 'alpha';

        // Skip standard enemy AI for allied ships, wave minions, or raid boss (handled by dedicated controllers)
        if (enemyTeam === playerTeam || enemy.isMinion || enemy.raidRole === 'boss') {
          return;
        }

        this.updateEnemyAI(enemy, delta);
      });

    // 2b. Update MOBA Starbase Siege Mode Controller (if active)
    if (this.siegeController && this.siegeController.isSiegeActive) {
      this.siegeController.update(delta, this);
    }

    // 2c. Update MMO Boss Raid Mode Controller (if active)
    if (this.bossRaidController && this.bossRaidController.isBossRaidActive) {
      this.bossRaidController.update(delta, this);
    }

    // 3. Update Projectiles
    this.updateProjectiles(delta);

    // 4. Update Effects
    this.updateEffects(delta);

    // 5. Update Zoning Ordnance Entities
    this.updateOrdnances(delta);

    // 6. Update Hangar Economy & Interceptor Drone Swarms
    this.updateHangarAndDrones(delta);
  }

  private updateOrdnances(delta: number) {
    for (let i = this.ordnances.length - 1; i >= 0; i--) {
      const ord = this.ordnances[i];
      if (ord.isDestroyed) {
        this.ordnances.splice(i, 1);
        continue;
      }

      // Skillshot interception check: if mine was shot down prior to proximity trigger
      if (ord.health !== undefined && ord.health <= 0) {
        this.triggerOrdnanceInterception(ord, ord.position, true);
        this.ordnances.splice(i, 1);
        continue;
      }

      if (ord.invulnerableTimer && ord.invulnerableTimer > 0) {
        ord.invulnerableTimer -= delta;
      }

      // Arming Phase (1.2 Seconds)
      if (!ord.isArmed) {
        ord.armingTimer -= delta;
        // Mine inherits 100% active linear velocity and coasts along inertia trajectory
        if (ord.velocity) {
          ord.position.x += ord.velocity.x * delta;
          ord.position.z += ord.velocity.z * delta;
        }

        if (ord.armingTimer <= 0) {
          ord.isArmed = true;
          // Halts its forward momentum via counter-thrusters
          ord.velocity = { x: 0, y: 0, z: 0 };
          this.addLog(
            `INERTIAL MINE ARMED: 30m Gravity Hazard Field Active!`,
            'ability',
            0,
            ord.ownerId === this.player?.id ? 'player' : 'enemy'
          );
        }
      } else {
        // Armed Phase & Proximity Field (12.0 Seconds)
        ord.lifetime -= delta;
        if (ord.lifetime <= 0) {
          // Self-detonates at end of lifetime
          this.triggerOrdnanceInterception(ord, ord.position, false);
          this.ordnances.splice(i, 1);
          continue;
        }

        // Proximity Trigger Rule: if an enemy ship enters 30-meter hazard radius, instantly detonates!
        const allShips = [this.player, ...this.enemies].filter((s) => !s.isDestroyed);
        for (const ship of allShips) {
          if (ship.id === ord.ownerId || (ord.team && ship.team === ord.team)) {
            continue;
          }

          const dx = ship.position.x - ord.position.x;
          const dz = ship.position.z - ord.position.z;
          const distToShip = Math.hypot(dx, dz);
          const hazardRadius = ord.hazardRadius || 30.0;

          if (distToShip <= hazardRadius) {
            this.triggerOrdnanceInterception(ord, ord.position, false);
            this.ordnances.splice(i, 1);
            break;
          }
        }
      }
    }
  }

  public static intersectsSphereSegment(
    p1: { x: number; y: number; z: number },
    p2: { x: number; y: number; z: number },
    spherePos: { x: number; y: number; z: number },
    sphereRadius: number = 2.5
  ): { hit: boolean; impactPoint: { x: number; y: number; z: number } } {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = p2.z - p1.z;
    const lenSq = dx * dx + dy * dy + dz * dz;

    let t = 0;
    if (lenSq > 0) {
      t = ((spherePos.x - p1.x) * dx + (spherePos.y - p1.y) * dy + (spherePos.z - p1.z) * dz) / lenSq;
      t = Math.max(0, Math.min(1, t));
    }

    const closestPoint = {
      x: p1.x + dx * t,
      y: p1.y + dy * t,
      z: p1.z + dz * t,
    };

    const distX = closestPoint.x - spherePos.x;
    const distY = closestPoint.y - spherePos.y;
    const distZ = closestPoint.z - spherePos.z;
    const distSq = distX * distX + distY * distY + distZ * distZ;

    if (distSq <= sphereRadius * sphereRadius) {
      return { hit: true, impactPoint: closestPoint };
    }

    return { hit: false, impactPoint: p2 };
  }

  public triggerOrdnanceInterception(
    ordnance: ZoningOrdnance,
    interceptPoint?: { x: number; y: number; z: number },
    isShotDownEarly: boolean = false
  ) {
    if (ordnance.isDestroyed) return;
    if (ordnance.invulnerableTimer && ordnance.invulnerableTimer > 0) return;
    ordnance.isDestroyed = true;

    const explosionPos = interceptPoint || { ...ordnance.position };

    soundManager.playExplosion();
    this.createImpactSparks(explosionPos, isShotDownEarly ? '#f59e0b' : '#00e5ff', 45);

    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 10 + Math.random() * 25;
      this.particles.push({
        id: `mine_exp_${Date.now()}_${Math.random()}`,
        position: { ...explosionPos },
        velocity: {
          x: Math.cos(angle) * speed,
          y: (Math.random() - 0.5) * 12,
          z: Math.sin(angle) * speed,
        },
        color: isShotDownEarly ? '#f59e0b' : Math.random() > 0.5 ? '#00e5ff' : '#ff4500',
        size: 0.5 + Math.random() * 1.0,
        lifetime: 0.5 + Math.random() * 0.6,
        maxLifetime: 1.1,
      });
    }

    // Skillshot Interception: if shot down prior to proximity trigger, detonates with reduced (30%) splash radius and damage
    const radiusMultiplier = isShotDownEarly ? 0.3 : 1.0;
    const blastRadius = (ordnance.hazardRadius || 30.0) * radiusMultiplier;
    const baseDamage = Math.round((ordnance.damage || 800) * radiusMultiplier);

    const allShips = [this.player, ...this.enemies].filter((s) => !s.isDestroyed);

    allShips.forEach((ship) => {
      if (ship.id === ordnance.ownerId || (ordnance.team && ship.team === ordnance.team)) {
        return;
      }

      const dx = ship.position.x - explosionPos.x;
      const dz = ship.position.z - explosionPos.z;
      const dist = Math.hypot(dx, dz) || 0.1;

      if (dist <= blastRadius) {
        const impactPoint = SpaceCombatEngine.getTargetImpactPoint(ship, explosionPos);
        const dummyAttacker: any = {
          id: ordnance.ownerId,
          name: 'Inertial Magnetic Mine Detonation',
          team: ordnance.team,
          position: explosionPos,
          rotation: { x: 0, y: 0, z: 0 },
        };

        // Deal Base Kinetic / Hull Damage
        this.applyDamage(dummyAttacker, ship, baseDamage, 'torpedo_photon', impactPoint);

        // Inertial Shockwave: Applies a strong physical momentum push directly away from mine center (skip stationary boss/stations)
        const isStationary =
          ship.raidRole === 'boss' ||
          ship.shipClass.modelType === 'boss_leviathan' ||
          ship.shipClass.modelType === 'station' ||
          ship.shipClass.maxSpeed === 0;
        if (!isStationary) {
          const pushDirX = dx / dist;
          const pushDirZ = dz / dist;
          const shockwaveForce = (1 - dist / blastRadius) * 28.0;

          ship.position.x += pushDirX * shockwaveForce * 0.35;
          ship.position.z += pushDirZ * shockwaveForce * 0.35;

          if (ship.velocity) {
            ship.velocity.x += pushDirX * shockwaveForce;
            ship.velocity.z += pushDirZ * shockwaveForce;
          }
        }

        if (isShotDownEarly) {
          this.addLog(
            `MINE INTERCEPTED: Shot down mid-flight! Detonated with 30% reduced splash (${Math.round(blastRadius)}m, ${baseDamage} HP)!`,
            'system'
          );
        } else {
          this.addLog(
            `MAGNETIC MINE DETONATED: ${ship.name} caught in ${Math.round(blastRadius)}m hazard field! Took ${baseDamage} Kinetic damage & shockwave push!`,
            'system'
          );
        }
      }
    });

    if (isShotDownEarly) {
      this.addLog(`INERTIAL MINE INTERCEPTED MID-FLIGHT`, 'ability', 0, 'player');
    } else {
      this.addLog(`INERTIAL MINE HAZARD TRIGGERED`, 'ability', 0, 'player');
    }
  }

  public deployInertialMine(owner: ShipEntity): ZoningOrdnance {
    const heading = owner.rotation.y;
    // Eject instantly out of Brawler's Aft/Stern hardpoint
    const launchPos = {
      x: owner.position.x - Math.sin(heading) * 6,
      y: owner.position.y,
      z: owner.position.z - Math.cos(heading) * 6,
    };

    // Inherits 100% of owner's active linear velocity & drift vector at release moment
    const mineVelocity = {
      x: 0,
      y: 0,
      z: 0,
    };

    const mine: ZoningOrdnance = {
      id: `mine_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      name: 'Inertial Magnetic Mine',
      ownerId: owner.id,
      team: owner.team || (owner.isPlayer ? 'alpha' : 'beta'),
      position: launchPos,
      velocity: mineVelocity,
      radius: 2.5,         // 2.5m physical Area3D collider radius for skillshots
      hazardRadius: 30.0,  // 30.0m proximity field
      is_lockable: false,  // NOT target-lockable by automated turrets
      isLockable: false,
      isDestroyed: false,
      damage: 800,         // 800 Base Kinetic / Hull damage
      armingTimer: 1.2,    // 1.2s arming delay
      isArmed: false,
      lifetime: 12.0,      // 12.0s armed duration
      health: 150,         // 150 HP for skillshots
      maxHealth: 150,
      color: '#00e5ff',
    };

    this.ordnances.push(mine);
    this.addLog(
      `${owner.name} deployed stationary Inertial Magnetic Mine! [E] (Arming in 1.2s at position)`,
      'ability',
      0,
      owner.isPlayer ? 'player' : 'enemy'
    );
    soundManager.playPowerPreset();
    return mine;
  }

  public deployZoningOrdnance(owner: ShipEntity): ZoningOrdnance {
    return this.deployInertialMine(owner);
  }

  public guideOrdnance(x: number, z: number, owner: ShipEntity): boolean {
    return false;
  }

  // Ship movement physics (slow and deliberate)
  private updateShipMovement(ship: ShipEntity, delta: number) {
    // Delegates EVE-style heavy inertia and momentum physics to ShipFlightController
    ShipFlightController.updateFlightPhysics(ship, delta);

    // 3. Spawn faint vapor trail behind impulse engines while traveling
    if (ship.speed > 0.5 && Math.random() < 0.65) {
      const backDist = 2.4; // Position behind stern engines
      const forwardX = Math.sin(ship.rotation.y);
      const forwardZ = Math.cos(ship.rotation.y);

      // Offset left/right slightly for dual impulse nozzle spread
      const sideSpread = (Math.random() - 0.5) * 0.9;
      const sideX = Math.cos(ship.rotation.y) * sideSpread;
      const sideZ = -Math.sin(ship.rotation.y) * sideSpread;

      const vaporX = ship.position.x - forwardX * backDist + sideX;
      const vaporZ = ship.position.z - forwardZ * backDist + sideZ;
      const vaporY = ship.position.y + (Math.random() - 0.5) * 0.2;

      // Color: soft translucent cyan for player, soft warm amber for enemies
      const vaporColor = ship.isPlayer ? '#a5f3fc' : '#fde68a';

      this.particles.push({
        id: `vapor_${Date.now()}_${Math.random()}`,
        position: { x: vaporX, y: vaporY, z: vaporZ },
        velocity: {
          x: -forwardX * (ship.speed * 0.15) + (Math.random() - 0.5) * 0.5,
          y: (Math.random() - 0.5) * 0.4,
          z: -forwardZ * (ship.speed * 0.15) + (Math.random() - 0.5) * 0.5,
        },
        color: vaporColor,
        size: 0.45 + Math.random() * 0.4,
        lifetime: 0.7 + Math.random() * 0.5,
        maxLifetime: 1.2,
        opacity: 0.30, // Faint wispy vapor mist
      });
    }
  }

  // Shield regeneration & Subsystem recovery
  private updateShipRecharge(ship: ShipEntity, delta: number) {
    DirectionalShieldSystem.regenerateShields(ship, delta);

    // Hazard Emitters hull repair over time
    if (ship.hazardActiveTimer && ship.hazardActiveTimer > 0) {
      ship.hazardActiveTimer -= delta;
      ship.hull = Math.min(ship.maxHull, ship.hull + 25 * delta);
    }
  }

  // Cooldown timers
  private updateShipCooldowns(ship: ShipEntity, delta: number) {
    // Weapons cooldown speed multiplier from PowerManagementController
    const pMods = ship.powerController ? ship.powerController.getModifiers() : null;
    const weaponPowerFactor = pMods
      ? pMods.weaponCooldownSpeedMult * (ship.subsystems.weapons / 100)
      : (0.7 + (ship.power.weapons / 100) * 0.6) * (ship.subsystems.weapons / 100);

    ship.weapons.forEach((w) => {
      WeaponHardpoint.tickWeaponCooldown(w, delta, weaponPowerFactor);
    });

    // Abilities cooldown
    ship.abilities.forEach((a) => {
      if (a.currentCooldown > 0) {
        a.currentCooldown = Math.max(0, a.currentCooldown - delta);
      }
    });


    if ((ship as any).thrusterFrozenTimer && (ship as any).thrusterFrozenTimer > 0) {
      (ship as any).thrusterFrozenTimer = Math.max(0, (ship as any).thrusterFrozenTimer - delta);
      ship.speed = 0;
      ship.targetSpeed = 0;
      if ((ship as any).flightState) {
        (ship as any).flightState.linearVelocity = { x: 0, y: 0, z: 0 };
      }
    }

    if (ship.evasiveActiveTimer && ship.evasiveActiveTimer > 0) {
      ship.evasiveActiveTimer = Math.max(0, ship.evasiveActiveTimer - delta);
    }
    if (ship.beamFireAtWillTimer && ship.beamFireAtWillTimer > 0) {
      ship.beamFireAtWillTimer = Math.max(0, ship.beamFireAtWillTimer - delta);
    }
    if (ship.highYieldTimer && ship.highYieldTimer > 0) {
      ship.highYieldTimer = Math.max(0, ship.highYieldTimer - delta);
    }

    // Tick Vector Burst 0.2s I-Frame Timer
    if (ship.iFrameTimer && ship.iFrameTimer > 0) {
      ship.iFrameTimer = Math.max(0, ship.iFrameTimer - delta);
    }

    // Tick Hardpoint Overheat Timer (2.0s weapons power lock on overcharge)
    if (ship.hardpointOverheatTimer && ship.hardpointOverheatTimer > 0) {
      ship.hardpointOverheatTimer = Math.max(0, ship.hardpointOverheatTimer - delta);
      if (ship.powerController) {
        ship.power.weapons = 0;
      }
    }

    // Tick Charged Plasma Ball state & Overcharge penalty
    if (ship.plasmaCharge && ship.plasmaCharge.isCharging) {
      if (ship.hardpointOverheatTimer && ship.hardpointOverheatTimer > 0) {
        ship.plasmaCharge.isCharging = false;
        ship.plasmaCharge.chargeTime = 0;
      } else {
        ship.plasmaCharge.chargeTime += delta;

        // Overcharge / Backfire check (> 2.0s without releasing)
        if (ship.plasmaCharge.chargeTime >= ship.plasmaCharge.overchargeThreshold) {
          const selfDamage = Math.round(ship.maxHull * ship.plasmaCharge.selfDamageAmount);
          ship.hull = Math.max(0, ship.hull - selfDamage);

          // Hardpoint Overheat status effect (2.0s lock)
          ship.hardpointOverheatTimer = 2.0;
          if (ship.powerController) {
            ship.power.weapons = 0;
          }

          const heading = ship.rotation.y;
          const bowPos = {
            x: ship.position.x + Math.sin(heading) * 10,
            y: ship.position.y,
            z: ship.position.z + Math.cos(heading) * 10,
          };

          this.createImpactSparks(bowPos, '#ef4444', 35);
          soundManager.playExplosion();

          this.addLog(
            `OVERCHARGE BACKFIRE! ${ship.name}'s Plasma Containment failed! Suffered ${selfDamage} self-damage & 2.0s Hardpoint Overheat!`,
            'system',
            0,
            ship.isPlayer ? 'player' : 'enemy'
          );

          if (this.onPlasmaOvercharged) {
            this.onPlasmaOvercharged(ship, selfDamage);
          }

          ship.plasmaCharge.isCharging = false;
          ship.plasmaCharge.chargeTime = 0;

          if (ship.hull <= 0) {
            ship.isDestroyed = true;
            this.addLog(`DESTROYED: ${ship.name} was destroyed by plasma backfire explosion!`, 'kill');
            this.createExplosionParticles(ship.position, 40);
          }
        }
      }
    }
  }

  /**
   * Computes the unit direction vector corresponding to the exact center
   * of a weapon's firing arc based on the shooter's heading (rotation.y).
   */
  public static getArcCenterDirection(
    shooterRotY: number,
    firingArc: Weapon['firingArc'],
    shooterPos?: { x: number; y: number; z: number },
    targetPos?: { x: number; y: number; z: number }
  ): { x: number; z: number } {
    let localAngle = 0; // Default: forward arc center = 0° (nose of ship)

    if (firingArc.startsWith('forward_')) {
      localAngle = 0;
    } else if (firingArc.startsWith('aft_')) {
      localAngle = Math.PI; // 180° (stern of ship)
    } else if (firingArc === 'broadside') {
      // Port or Starboard flank depending on which side target lies
      if (shooterPos && targetPos) {
        const dx = targetPos.x - shooterPos.x;
        const dz = targetPos.z - shooterPos.z;
        const angleToTarget = Math.atan2(dx, dz);
        const relativeAngle = Math.atan2(
          Math.sin(angleToTarget - shooterRotY),
          Math.cos(angleToTarget - shooterRotY)
        );
        localAngle = relativeAngle >= 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        localAngle = Math.PI / 2;
      }
    } else if (firingArc === 'broadside_360') {
      if (shooterPos && targetPos) {
        const dx = targetPos.x - shooterPos.x;
        const dz = targetPos.z - shooterPos.z;
        const len = Math.hypot(dx, dz) || 1;
        return { x: dx / len, z: dz / len };
      }
      localAngle = 0;
    }

    const worldAngle = shooterRotY + localAngle;
    return {
      x: Math.sin(worldAngle),
      z: Math.cos(worldAngle),
    };
  }

  /**
   * Calculates the exact 3D position of a weapon hardpoint/emitter on a ship's hull
   * based on the weapon's firing arc and slot index.
   */
  public static getWeaponHardpointPosition(
    shooter: ShipEntity,
    weapon: Weapon,
    weaponIndex: number = 0,
    targetPos?: { x: number; y: number; z: number }
  ): { x: number; y: number; z: number } {
    const shieldRadius = ShipModelBuilder.getShieldRadius(shooter.shipClass.modelType) || 4.5;
    const hullOffset = Math.max(1.8, shieldRadius * 0.45); // Emitter location on hull edge

    const arcDir = weapon.isTorpedo
      ? { x: Math.sin(shooter.rotation.y), z: Math.cos(shooter.rotation.y) }
      : SpaceCombatEngine.getArcCenterDirection(
          shooter.rotation.y,
          weapon.firingArc,
          shooter.position,
          targetPos
        );

    // Perpendicular vector for lateral bank offsets (emitter 0, 1, 2...)
    const perpDir = { x: -arcDir.z, z: arcDir.x };

    const bankSign = (weaponIndex % 2 === 0) ? -1 : 1;
    const bankNum = Math.floor(weaponIndex / 2) + 1;
    const latOffset = bankSign * bankNum * 0.8; // -0.8m for idx 0 (port), +0.8m for idx 1 (starboard), etc.

    return {
      x: shooter.position.x + arcDir.x * hullOffset + perpDir.x * latOffset,
      y: shooter.position.y + 0.1,
      z: shooter.position.z + arcDir.z * hullOffset + perpDir.z * latOffset,
    };
  }

  // Fire Weapon
  public fireWeapon(shooter: ShipEntity, weaponIndex: number, target?: ShipEntity): boolean {
    if (shooter.isDestroyed) return false;
    if (target && target.isDestroyed) return false;

    const weapon = shooter.weapons[weaponIndex];
    if (!weapon || weapon.currentCooldown > 0) return false;

    // Support healing / shield-transfer beams target friendly vessels
    if (
      weapon.isHealShield ||
      weapon.isHealHull ||
      weapon.type === 'shield_transfer_beam' ||
      weapon.type === 'hull_repair_beam'
    ) {
      return this.fireSupportBeam(shooter, weaponIndex, target);
    }

    // Friendly fire protection for offensive weapons
    if (target) {
      const shooterTeam = shooter.team || (shooter.isPlayer ? 'alpha' : 'beta');
      const targetTeam = target.team || (target.isPlayer ? 'alpha' : 'beta');
      if (shooterTeam === targetTeam) return false;
    }

    if (!weapon.isTorpedo) {
      if (!target) return false;

      // Check distance
      const dist = this.getDistance(shooter.position, target.position);
      if (dist > weapon.range) {
        if (shooter.isPlayer) {
          this.addLog(`Target out of range for ${weapon.name} (${Math.round(dist)}u / ${weapon.range}u)`, 'system');
        }
        return false;
      }

      // Check firing arc
      if (!SpaceCombatEngine.isInFiringArc(shooter.position, shooter.rotation.y, target.position, weapon.firingArc, weapon)) {
        if (shooter.isPlayer) {
          this.addLog(`${weapon.name} cannot fire - Target outside firing arc!`, 'system');
        }
        return false;
      }
    }

    // Set weapon cooldown
    weapon.currentCooldown = weapon.cooldown;

    // Power damage multiplier
    const powerMult = 0.6 + (shooter.power.weapons / 100) * 0.9;
    let finalDamage = weapon.baseDamage * powerMult;

    // High yield torpedo bonus
    if (weapon.isTorpedo && shooter.highYieldTimer && shooter.highYieldTimer > 0) {
      finalDamage *= 1.8;
      shooter.highYieldTimer = 0; // Consume charge
      this.addLog(`HIGH YIELD TORPEDO LAUNCHED by ${shooter.name}!`, 'ability');
    }

    const sourcePos = SpaceCombatEngine.getWeaponHardpointPosition(shooter, weapon, weaponIndex, target?.position);
    const isPulseWeapon = !!weapon.isPulse || weapon.type === 'heavy_cannon' || (weapon.id.includes('pulse') && !weapon.id.includes('stripper'));

    if (weapon.isTorpedo) {
      // Create physical traveling torpedo projectile launching straight ahead relative to ship heading
      const speed = 45;
      const forwardDir = {
        x: Math.sin(shooter.rotation.y),
        z: Math.cos(shooter.rotation.y),
      };

      this.projectiles.push({
        id: `proj_${Date.now()}_${Math.random()}`,
        ownerId: shooter.id,
        targetId: target?.id,
        weaponType: weapon.type,
        position: sourcePos,
        velocity: { x: forwardDir.x * speed, y: 0, z: forwardDir.z * speed },
        damage: finalDamage,
        isTorpedo: true,
        hasLaunched: true,
        color: weapon.color,
        lifetime: 4.0,
      });

      soundManager.playTorpedoLaunch(weapon.type === 'quantum_torpedo');
      if (target) {
        this.addLog(`${shooter.name} fired ${weapon.name} at ${target.name}`, 'system');
      } else {
        this.addLog(`${shooter.name} fired ${weapon.name} straight ahead`, 'system');
      }
    } else if (isPulseWeapon) {
      if (!target) return false;
      // Check if pulse is blocked by an asteroid along line of sight
      const asteroidHit = this.checkLineOfSightAsteroidHit(sourcePos, target.position);
      if (asteroidHit) {
        const pulseCount = weapon.pulseCount || 3;
        const damagePerPulse = finalDamage / pulseCount;
        for (let i = 0; i < pulseCount; i++) {
          this.projectiles.push({
            id: `pulse_${Date.now()}_${Math.random()}_${i}`,
            ownerId: shooter.id,
            targetId: target.id,
            weaponType: weapon.type,
            weaponIndex: weaponIndex,
            firingArc: weapon.firingArc,
            position: { ...sourcePos },
            velocity: { x: 0, y: 0, z: 0 },
            damage: damagePerPulse,
            isTorpedo: false,
            isPulse: true,
            launchDelay: i * 0.08,
            hasLaunched: false,
            color: weapon.color,
            lifetime: 2.5,
          });
        }
        return true;
      }

      // Fire 3 rapid fire pulse projectiles
      const pulseCount = weapon.pulseCount || 3;
      const damagePerPulse = finalDamage / pulseCount;

      for (let i = 0; i < pulseCount; i++) {
        this.projectiles.push({
          id: `pulse_${Date.now()}_${Math.random()}_${i}`,
          ownerId: shooter.id,
          targetId: target.id,
          weaponType: weapon.type,
          weaponIndex: weaponIndex,
          firingArc: weapon.firingArc,
          position: { ...sourcePos },
          velocity: { x: 0, y: 0, z: 0 },
          damage: damagePerPulse,
          isTorpedo: false,
          isPulse: true,
          launchDelay: i * 0.08, // 0.00s, 0.08s, 0.16s rapid burst
          hasLaunched: false,
          color: weapon.color,
          lifetime: 2.5,
        });
      }

      this.addLog(`${shooter.name} fired ${weapon.name} (3-round pulse burst) at ${target.name}`, 'system');
    } else {
      if (!target) return false;

      // Find first valid target entity (or asteroid/ordnance) hit by phaser beam along line of sight
      const beamHit = this.findFirstBeamHit(shooter, sourcePos, target);

      if (beamHit.hitType === 'ordnance' && beamHit.ordnance) {
        this.beamEffects.push({
          id: `beam_${Date.now()}_${Math.random()}`,
          shooterId: shooter.id,
          targetId: undefined,
          weaponIndex: weaponIndex,
          firingArc: weapon.firingArc,
          sourcePos: sourcePos,
          targetPos: beamHit.impactPoint,
          color: weapon.color,
          thickness: weapon.thickness || 1.0,
          duration: 1.40,
          maxDuration: 1.40,
        });

        soundManager.playPhaserBeam(weapon.color);
        this.triggerOrdnanceInterception(beamHit.ordnance, beamHit.impactPoint);
        return true;
      }

      if (beamHit.hitType === 'asteroid' && beamHit.asteroidHit) {
        this.beamEffects.push({
          id: `beam_${Date.now()}_${Math.random()}`,
          shooterId: shooter.id,
          targetId: undefined,
          weaponIndex: weaponIndex,
          firingArc: weapon.firingArc,
          sourcePos: sourcePos,
          targetPos: beamHit.impactPoint,
          color: weapon.color,
          thickness: weapon.thickness || 1.0,
          duration: 1.40,
          maxDuration: 1.40,
        });

        soundManager.playPhaserBeam(weapon.color);
        this.damageAsteroid(beamHit.asteroidHit.asteroid, finalDamage, shooter.name, weapon.name, beamHit.impactPoint);
        return true;
      }

      // Beam weapons strike the first valid target ship intersected!
      const actualTarget = beamHit.targetShip || target;
      const impactPos = beamHit.impactPoint;
      const beamId = `beam_${Date.now()}_${Math.random()}`;
      const beamDuration = 1.40;

      this.beamEffects.push({
        id: beamId,
        shooterId: shooter.id,
        targetId: actualTarget.id,
        weaponIndex: weaponIndex,
        firingArc: weapon.firingArc,
        sourcePos: sourcePos,
        targetPos: impactPos,
        color: weapon.color,
        thickness: weapon.thickness || 1.0,
        duration: beamDuration,
        maxDuration: beamDuration,
      });

      soundManager.playPhaserBeam(weapon.color);
      this.createImpactSparks(impactPos, weapon.color, 8);
      this.applyDamage(shooter, actualTarget, finalDamage, weapon.type, impactPos, beamDuration, beamId);
    }

    return true;
  }

  // Support Healing / Shield Transfer Beam Execution
  private fireSupportBeam(shooter: ShipEntity, weaponIndex: number, explicitTarget?: ShipEntity): boolean {
    const weapon = shooter.weapons[weaponIndex];
    if (!weapon || weapon.currentCooldown > 0) return false;

    const shooterTeam = shooter.team || (shooter.isPlayer ? 'alpha' : 'beta');
    const isShieldBeam = !!weapon.isHealShield || weapon.type === 'shield_transfer_beam';
    const isHullBeam = !!weapon.isHealHull || weapon.type === 'hull_repair_beam';

    const sameTeamAllies = [this.player, ...this.enemies].filter(
      (s) =>
        s &&
        !s.isDestroyed &&
        s.hull > 0 &&
        !s.isMinion &&
        (s.team || (s.isPlayer ? 'alpha' : 'beta')) === shooterTeam
    );

    let chosenAlly: ShipEntity | null = null;
    if (
      explicitTarget &&
      !explicitTarget.isDestroyed &&
      (explicitTarget.team || (explicitTarget.isPlayer ? 'alpha' : 'beta')) === shooterTeam &&
      this.getDistance(shooter.position, explicitTarget.position) <= weapon.range
    ) {
      chosenAlly = explicitTarget;
    } else {
      const inRangeAllies = sameTeamAllies.filter(
        (a) => a.id !== shooter.id && this.getDistance(shooter.position, a.position) <= weapon.range
      );
      const candidates = inRangeAllies.length > 0 ? inRangeAllies : sameTeamAllies.filter((a) => this.getDistance(shooter.position, a.position) <= weapon.range);

      if (candidates.length > 0) {
        candidates.sort((a, b) => {
          const scoreA = isShieldBeam
            ? (a.shields.front.current + a.shields.starboard.current + a.shields.back.current + a.shields.port.current) /
              Math.max(1, a.shields.front.max + a.shields.starboard.max + a.shields.back.max + a.shields.port.max)
            : a.hull / Math.max(1, a.maxHull);
          const scoreB = isShieldBeam
            ? (b.shields.front.current + b.shields.starboard.current + b.shields.back.current + b.shields.port.current) /
              Math.max(1, b.shields.front.max + b.shields.starboard.max + b.shields.back.max + b.shields.port.max)
            : b.hull / Math.max(1, b.maxHull);

          if (Math.abs(scoreA - scoreB) > 0.04) return scoreA - scoreB;
          if (a.raidRole === 'tank' && b.raidRole !== 'tank') return -1;
          if (b.raidRole === 'tank' && a.raidRole !== 'tank') return 1;
          return 0;
        });
        chosenAlly = candidates[0];
      }
    }

    if (!chosenAlly) {
      if (shooter.isPlayer) {
        this.addLog(`${weapon.name}: No allied vessel within ${weapon.range}m range.`, 'system');
        soundManager.playErrorAlert?.();
      }
      return false;
    }

    weapon.currentCooldown = weapon.cooldown;

    const auxMult = 0.85 + ((shooter.power.auxiliary || 50) / 100) * 0.35;
    const healAmount = Math.round(weapon.baseDamage * auxMult);

    const sourcePos = SpaceCombatEngine.getWeaponHardpointPosition(shooter, weapon, weaponIndex, chosenAlly.position);
    const impactPos = SpaceCombatEngine.getTargetImpactPoint(
      chosenAlly,
      sourcePos,
      ShipModelBuilder.getHullRadius(chosenAlly.shipClass?.modelType)
    );

    if (chosenAlly.id !== shooter.id) {
      this.beamEffects.push({
        id: `heal_beam_${Date.now()}_${Math.random()}`,
        shooterId: shooter.id,
        targetId: chosenAlly.id,
        weaponIndex,
        firingArc: weapon.firingArc,
        sourcePos,
        targetPos: impactPos,
        color: weapon.color || (isShieldBeam ? '#38bdf8' : '#10b981'),
        thickness: weapon.thickness || 1.8,
        duration: 1.2,
        maxDuration: 1.2,
      });
    }

    if (isShieldBeam) {
      const restored = DirectionalShieldSystem.restoreShields(chosenAlly, healAmount);
      this.createImpactSparks(impactPos, '#38bdf8', 10);
      if (shooter.isPlayer || chosenAlly.isPlayer) {
        soundManager.playPowerPreset();
      }
      this.addLog(
        `SHIELD TRANSFER: ${shooter.name} restored +${restored} shields to ${chosenAlly.name}!`,
        'heal',
        restored,
        shooter.isPlayer ? 'player' : 'system'
      );
    } else if (isHullBeam) {
      const beforeHull = chosenAlly.hull;
      chosenAlly.hull = Math.min(chosenAlly.maxHull, chosenAlly.hull + healAmount);
      const repaired = Math.round(chosenAlly.hull - beforeHull);
      this.createImpactSparks(impactPos, '#10b981', 10);
      if (shooter.isPlayer || chosenAlly.isPlayer) {
        soundManager.playPowerPreset();
      }
      this.addLog(
        `NANITE REPAIR: ${shooter.name} repaired +${repaired} hull HP on ${chosenAlly.name}!`,
        'heal',
        repaired,
        shooter.isPlayer ? 'player' : 'system'
      );
    }

    return true;
  }

  // Fire all ready weapons in a specific weapon group on target
  public fireWeaponGroup(shooter: ShipEntity, weaponIndices: number[], target?: ShipEntity): boolean {
    if (shooter.isDestroyed) return false;
    let firedAny = false;
    let readyCount = 0;
    let outOfArcCount = 0;

    weaponIndices.forEach((idx) => {
      const w = shooter.weapons[idx];
      if (w && w.currentCooldown <= 0) {
        readyCount++;
        const isHealingWeapon =
          w.isHealShield ||
          w.isHealHull ||
          w.type === 'shield_transfer_beam' ||
          w.type === 'hull_repair_beam';

        if (isHealingWeapon) {
          if (this.fireWeapon(shooter, idx, target)) {
            firedAny = true;
          }
        } else if (w.isTorpedo) {
          if (!target || !target.isDestroyed) {
            if (this.fireWeapon(shooter, idx, target)) {
              firedAny = true;
            }
          }
        } else if (target && !target.isDestroyed) {
          const inArc = SpaceCombatEngine.isInFiringArc(shooter.position, shooter.rotation.y, target.position, w.firingArc, w);
          const inRange = this.getDistance(shooter.position, target.position) <= w.range;
          if (inArc && inRange) {
            if (this.fireWeapon(shooter, idx, target)) {
              firedAny = true;
            }
          } else if (!inArc) {
            outOfArcCount++;
          }
        }
      }
    });

    if (!firedAny && readyCount > 0 && outOfArcCount > 0 && shooter.isPlayer && target) {
      const firstW = shooter.weapons[weaponIndices[0]];
      const wName = firstW ? firstW.name : 'Weapon';
      this.addLog(`${wName.toUpperCase()} OFFLINE: Target outside firing arc!`, 'system');
      soundManager.playErrorAlert?.();
    }

    return firedAny;
  }

  // Fire all ready Phaser / Beam weapons on target
  public firePhasers(shooter: ShipEntity, target?: ShipEntity): boolean {
    if (shooter.isDestroyed || (target && target.isDestroyed)) return false;
    if (!target) return false;
    let firedAny = false;
    let readyCount = 0;
    let outOfArcCount = 0;

    shooter.weapons.forEach((w, idx) => {
      if (!w.isTorpedo && w.currentCooldown <= 0) {
        readyCount++;
        const inArc = SpaceCombatEngine.isInFiringArc(shooter.position, shooter.rotation.y, target.position, w.firingArc, w);
        const inRange = this.getDistance(shooter.position, target.position) <= w.range;
        if (inArc && inRange) {
          if (this.fireWeapon(shooter, idx, target)) {
            firedAny = true;
          }
        } else if (!inArc) {
          outOfArcCount++;
        }
      }
    });

    if (!firedAny && readyCount > 0 && outOfArcCount > 0 && shooter.isPlayer) {
      this.addLog(`PHASERS OFFLINE: Target outside Broadside Arc! (Align Port/Starboard flanks)`, 'system');
      soundManager.playErrorAlert?.();
    }

    return firedAny;
  }

  // Fire all ready Torpedo launchers on target
  public fireTorpedoes(shooter: ShipEntity, target?: ShipEntity): boolean {
    if (shooter.isDestroyed) return false;
    if (target && target.isDestroyed) return false;
    let firedAny = false;

    shooter.weapons.forEach((w, idx) => {
      if (w.isTorpedo && w.currentCooldown <= 0) {
        if (this.fireWeapon(shooter, idx, target)) {
          firedAny = true;
        }
      }
    });

    return firedAny;
  }

  // Calculate exact weapon impact point (Shield Arc surface if shield active, or Hull surface if depleted/invisible)
  public static getTargetImpactPoint(
    target: ShipEntity,
    fromPos: { x: number; y: number; z: number },
    customRadius?: number
  ): { x: number; y: number; z: number } {
    const shieldRadius = ShipModelBuilder.getShieldRadius(target.shipClass.modelType);
    const hullRadius = ShipModelBuilder.getHullRadius(target.shipClass.modelType);
    const arcHitKey = SpaceCombatEngine.calculateShieldArcHit(target.position, target.rotation.y, fromPos);
    const targetArc = target.shields ? target.shields[arcHitKey] : undefined;
    const isShieldVisible = target.minionHealth
      ? target.minionHealth.is_shield_active()
      : (targetArc && targetArc.max > 0 && (targetArc.current / targetArc.max) > 0.05);

    const hitRadius = customRadius ?? (isShieldVisible ? shieldRadius : hullRadius);

    const dx = fromPos.x - target.position.x;
    const dy = fromPos.y - target.position.y;
    const dz = fromPos.z - target.position.z;
    const dist = Math.hypot(dx, dy, dz);

    if (dist <= 0.001) {
      return { ...target.position };
    }

    const factor = Math.min(1.0, hitRadius / dist);
    return {
      x: target.position.x + dx * factor,
      y: target.position.y + dy * factor,
      z: target.position.z + dz * factor,
    };
  }

  // Apply Damage calculating 4 Shield Arcs & Hull Integrity
  public applyDamage(
    shooter: ShipEntity,
    target: ShipEntity,
    rawDamage: number,
    weaponType: string,
    customImpactPos?: { x: number; y: number; z: number },
    impactDuration: number = 0.4,
    beamId?: string
  ) {
    if (target.isDestroyed) return;

    // Friendly fire protection
    const shooterTeam = shooter.team || (shooter.isPlayer ? 'alpha' : 'beta');
    const targetTeam = target.team || (target.isPlayer ? 'alpha' : 'beta');
    if (shooterTeam === targetTeam) return;

    // Check Vector Burst 0.2s I-Frame Invulnerability
    if (target.iFrameTimer && target.iFrameTimer > 0) {
      this.createImpactSparks(customImpactPos || target.position, '#38bdf8', 12);
      this.addLog(
        `I-FRAME DODGE! ${target.name} evaded incoming strike with Vector Burst!`,
        'heal',
        0,
        target.isPlayer ? 'player' : 'enemy'
      );
      return;
    }

    // Single-Pool Omnidirectional Minion Unit System Resolution
    if (target.minionHealth) {
      const originPos = shooter ? shooter.position : (customImpactPos || target.position);
      const impactPos = customImpactPos || SpaceCombatEngine.getTargetImpactPoint(target, originPos);

      let damageType = 'NORMAL';
      if (weaponType === 'em_shield_special' || weaponType === 'disruptor_beam') {
        damageType = 'EM_SHIELD_SPECIAL';
      } else if (weaponType.includes('torpedo') || weaponType === 'heavy_cannon') {
        damageType = 'KINETIC';
      } else if (weaponType.includes('corrosive')) {
        damageType = 'CORROSIVE';
      }

      const res = target.minionHealth.take_damage(rawDamage, damageType, shooter);

      // Sync ship entity state
      target.hull = target.minionHealth.current_hull;
      target.maxHull = target.minionHealth.max_hull;
      const sQuarter = target.minionHealth.current_shield / 4;
      const sMaxQuarter = target.minionHealth.max_shield / 4;
      target.shields = {
        front: { current: sQuarter, max: sMaxQuarter },
        starboard: { current: sQuarter, max: sMaxQuarter },
        back: { current: sQuarter, max: sMaxQuarter },
        port: { current: sQuarter, max: sMaxQuarter },
      };

      const hitLogSource: 'player' | 'enemy' | 'system' = target.isPlayer ? 'enemy' : (shooter && shooter.isPlayer) ? 'player' : 'system';

      if (res.shield_damage_applied > 0) {
        soundManager.playShieldHit();
        this.createImpactSparks(impactPos, '#38bdf8', 10);
        this.shieldImpacts.push({
          id: `shield_impact_${Date.now()}_${Math.random()}`,
          shipId: target.id,
          position: impactPos,
          arc: 'front',
          intensity: 1.0,
          duration: impactDuration,
          beamId: beamId,
        });

        this.addLog(
          `${target.name} [Omnidirectional Shield] absorbed ${Math.round(res.shield_damage_applied)} damage (${Math.round(target.minionHealth.current_shield)}/${target.minionHealth.max_shield})`,
          'damage_shield',
          Math.round(res.shield_damage_applied),
          hitLogSource
        );
      }

      if (res.shield_broken) {
        soundManager.playHullImpact();
        this.addLog(
          `MINION SHIELD BROKEN! ${target.name}'s omnidirectional shield collapsed!`,
          'damage_shield',
          0,
          hitLogSource
        );
      }

      if (res.hull_damage_applied > 0) {
        soundManager.playHullImpact();
        this.createImpactSparks(impactPos, '#ff4500', 12);
        this.addLog(
          `${target.name} took ${Math.round(res.hull_damage_applied)} HULL damage (${Math.round(target.hull)}/${target.maxHull})`,
          'damage_hull',
          Math.round(res.hull_damage_applied),
          hitLogSource
        );
      }

      if (res.minion_destroyed) {
        target.isDestroyed = true;
        soundManager.playExplosion();
        this.createExplosionParticles(target.position, 35);
        this.addLog(
          `MINION DESTROYED! ${shooter ? shooter.name : 'Unknown'} scored fatal blow on ${target.name}!`,
          'kill',
          0,
          hitLogSource
        );

        if (shooter && shooter.isPlayer) {
          this.addLog(
            `LAST-HIT REWARD! +120 Scrap harvested from ${target.name}!`,
            'heal',
            120,
            'player'
          );
        }
      }

      return;
    }

    // 1. Calculate which Shield Arc is hit (FL, FR, BL, BR) based on impact direction
    const originPos = shooter ? shooter.position : (customImpactPos || target.position);
    const arcHitKey = SpaceCombatEngine.calculateShieldArcHit(target.position, target.rotation.y, originPos);
    const targetArc = target.shields[arcHitKey];

    const isShieldVisible = targetArc && targetArc.max > 0 && (targetArc.current / targetArc.max) > 0.05;
    const impactPos = customImpactPos || SpaceCombatEngine.getTargetImpactPoint(target, originPos);

    // Shield power resistance modifier
    const shieldResistanceFactor = 1.0 - (target.power.shields / 100) * 0.25;
    let actualDamage = rawDamage * shieldResistanceFactor;

    let arcNamePretty = '';
    switch (arcHitKey) {
      case 'front': arcNamePretty = 'Front Arc'; break;
      case 'starboard': arcNamePretty = 'Starboard Arc'; break;
      case 'back': arcNamePretty = 'Back Arc'; break;
      case 'port': arcNamePretty = 'Port Arc'; break;
    }

    const isTorpedo = weaponType.includes('torpedo');
    const isDisruptor = weaponType.includes('disruptor');
    const isDragoonPhaser = weaponType === 'dragoon_360_phaser' || weaponType === 'dragoon_omnidirectional_turret' || (shooter && shooter.shipClass && shooter.shipClass.id.includes('dragoon') && !isTorpedo);
    const isPlasmaBall = weaponType === 'charged_plasma' || weaponType === 'plasma_ball' || (isTorpedo && shooter && shooter.shipClass && shooter.shipClass.id.includes('dragoon'));

    let shieldMult = isTorpedo ? 0.25 : (isDisruptor ? 2.5 : 1.0);
    let hullMult = isTorpedo ? 3.0 : (isDisruptor ? 0.2 : 1.0);

    if (isDragoonPhaser) {
      // Hardpoint 1: 360° Omnidirectional Phaser (1.2x vs Shields, 0.3x vs Hull)
      shieldMult = 1.2;
      hullMult = 0.3;
    } else if (isPlasmaBall) {
      // Hardpoint 2: Charged Bow Plasma Ball (3.0x vs Hull, 0.5x vs Shields)
      shieldMult = 0.5;
      hullMult = 3.0;
    }

    if (isShieldVisible) {
      // Add 3D Shield Impact Flash effect
      this.shieldImpacts.push({
        id: `shield_impact_${Date.now()}_${Math.random()}`,
        shipId: target.id,
        position: impactPos,
        arc: arcHitKey,
        intensity: 1.0,
        duration: impactDuration,
        beamId: beamId,
      });

      actualDamage *= shieldMult;

      soundManager.playShieldHit();

      // Emit threshold-colored impact sparks
      const shieldRatio = targetArc.max > 0 ? targetArc.current / targetArc.max : 0;
      const sparkColor = shieldRatio < 0.3 ? '#ef4444' : shieldRatio < 0.6 ? '#facc15' : '#38bdf8';
      this.createImpactSparks(impactPos, sparkColor, 10);

      const hitLogSource: 'player' | 'enemy' | 'system' = target.isPlayer ? 'enemy' : shooter.isPlayer ? 'player' : 'system';

      if (actualDamage <= targetArc.current) {
        targetArc.current -= actualDamage;
        this.addLog(
          `${target.name} [${arcNamePretty}] absorbed ${Math.round(actualDamage)} damage (${Math.round(targetArc.current)}/${targetArc.max})`,
          'damage_shield',
          Math.round(actualDamage),
          hitLogSource
        );
      } else {
        // Shield Arc DEPLETED! Overflow damage penetrates directly to hull with collapsed multiplier
        const overflowDamage = actualDamage - targetArc.current;
        targetArc.current = 0;

        soundManager.playHullImpact();
        
        const overflowBase = overflowDamage / shieldMult;
        const hullDamage = overflowBase * hullMult;
        target.hull = Math.max(0, target.hull - hullDamage);

        this.addLog(
          `SHIELD COLLAPSED! ${target.name}'s ${arcNamePretty} depleted! ${Math.round(hullDamage)} damage directly to HULL!`,
          'damage_hull',
          Math.round(hullDamage),
          hitLogSource
        );

        this.checkSubsystemDamage(target, shooter.targetedSubsystem, hullDamage);
      }
    } else {
      // Shield Arc not visible (<= 5% HP) -> Weapon strike passes through invisible shield and hits ship hull directly!
      soundManager.playHullImpact();

      const hasNoShieldCapacity = !target.shields || target.shields.front.max === 0;
      const effectiveHullMult = hasNoShieldCapacity ? Math.max(1.0, hullMult) : hullMult;

      const hullDamage = actualDamage * effectiveHullMult;
      target.hull = Math.max(0, target.hull - hullDamage);

      this.createImpactSparks(impactPos, '#ff4500', 12);

      const hitLogSource: 'player' | 'enemy' | 'system' = target.isPlayer ? 'enemy' : shooter.isPlayer ? 'player' : 'system';

      this.addLog(
        `DIRECT HULL HIT on ${target.name} (${arcNamePretty} unshielded)! Suffered ${Math.round(hullDamage)} hull damage!`,
        'damage_hull',
        Math.round(hullDamage),
        hitLogSource
      );

      this.checkSubsystemDamage(target, shooter.targetedSubsystem, hullDamage);
    }

    // Check Ship Destruction
    if (target.hull <= 0 && !target.isDestroyed) {
      target.isDestroyed = true;
      target.hull = 0;
      soundManager.playExplosion();

      this.addLog(`DESTROYED: ${target.name} exploded! Kinetic shockwave detected.`, 'kill');
      this.createExplosionParticles(target.position, target.shipClass.modelType === 'cube' ? 60 : 35);
    }
  }

  // Subsystem targeting (Weapons, Shields, Engines, Aux)
  private checkSubsystemDamage(target: ShipEntity, targetedSubsystem: SubsystemType | null, damageAmount: number) {
    if (!targetedSubsystem) return;

    // 25% chance to disrupt subsystem on heavy hull damage
    if (Math.random() < 0.35) {
      const dropAmount = Math.min(30, Math.round(damageAmount * 0.15));
      target.subsystems[targetedSubsystem] = Math.max(20, target.subsystems[targetedSubsystem] - dropAmount);

      this.addLog(
        `CRITICAL SUB-SYSTEM DISRUPTION: ${target.name}'s ${targetedSubsystem.toUpperCase()} offline by ${dropAmount}%!`,
        'system'
      );
    }
  }

  // Trigger Tactical Ability
  public useAbility(ship: ShipEntity, abilityId: string): boolean {
    if (ship.isDestroyed) return false;

    const ability = ship.abilities.find((a) => a.id === abilityId);
    if (!ability || ability.currentCooldown > 0) return false;

    ability.currentCooldown = ability.cooldown;
    soundManager.playAbilityUse();

    switch (abilityId) {
      case 'inertial_mine':
      case 'inertial_mine_deploy':
      case 'zoning_ordnance':
      case 'deploy_zoning_ordnance': {
        this.deployInertialMine(ship);
        if (this.duelManager) {
          this.duelManager.recordAbility(ship.id, abilityId);
        }
        break;
      }
      case 'launch_drone':
      case 'launch_fighter': {
        const success = this.launchDrone(ship);
        if (!success) {
          ability.currentCooldown = 0;
          return false;
        }
        if (this.duelManager) {
          this.duelManager.recordAbility(ship.id, abilityId);
        }
        break;
      }
      case 'shield_rebalance': {
        const res = DirectionalShieldSystem.executeShieldRebalance(ship.shields, ship);
        this.addLog(
          `SHIELD REBALANCE: ${ship.name} harvested healthy quadrant capacity to restore +${Math.round(res.totalRestored)} shield HP to collapsing ${res.targetArc.toUpperCase()} arc!`,
          'heal'
        );
        if (this.duelManager) {
          this.duelManager.recordAbility(ship.id, abilityId);
        }
        break;
      }
      case 'vector_burst': {
        const movementDir = ship.isPlayer ? this.activeMovementKeys : (ship as any).aiVectorDirection;
        const res = ShipFlightController.executeVectorBurst(ship, movementDir);
        this.addLog(
          `VECTOR BURST: ${ship.name} canceled active drift momentum & applied 25m/s impulse thrust (heading ${res.boostDirectionDeg}°) with 0.2s I-Frame!`,
          'ability'
        );
        soundManager.playPowerPreset();
        if (this.duelManager) {
          this.duelManager.recordAbility(ship.id, abilityId);
        }
        break;
      }
      case 'swarm_detonation': {
        const success = this.executeSwarmDetonation(ship);
        if (!success) {
          ability.currentCooldown = 0; // Refund cooldown if no active drones
          return false;
        }
        if (this.duelManager) {
          this.duelManager.recordAbility(ship.id, abilityId);
        }
        break;
      }
      case 'distribute_shields': {
        DirectionalShieldSystem.equalizeShields(ship.shields, ship);
        this.addLog(`${ship.name} redistributed shield energy evenly across all 4 arcs!`, 'heal');
        break;
      }
      case 'fire_at_will': {
        ship.beamFireAtWillTimer = ability.duration || 8;
        this.addLog(`${ship.name} activated BEAMS: FIRE AT WILL!`, 'ability');
        break;
      }
      case 'torpedo_high_yield': {
        ship.highYieldTimer = ability.duration || 10;
        this.addLog(`${ship.name} loaded HIGH YIELD TORPEDO payload!`, 'ability');
        break;
      }
      case 'evasive_maneuvers': {
        ship.evasiveActiveTimer = ability.duration || 3.6;
        ship.targetSpeed = ship.shipClass.maxSpeed * 1.75;
        this.addLog(`${ship.name} engaged EVASIVE MANEUVERS! Speed boosted +75%, turning radius expanded.`, 'ability');
        break;
      }
      case 'tachyon_beam': {
        if (ship.targetId) {
          const target = [this.player, ...this.enemies].find((s) => s.id === ship.targetId && !s.isDestroyed);
          if (target) {
            const arcKey = SpaceCombatEngine.calculateShieldArcHit(target.position, target.rotation.y, ship.position);
            const targetArc = target.shields[arcKey];
            const drained = Math.min(targetArc.current, 90);

            targetArc.current -= drained;

            // Give drained power to user's weakest arc
            const weakestArcKey = this.getWeakestShieldArc(ship);
            ship.shields[weakestArcKey].current = Math.min(
              ship.shields[weakestArcKey].max,
              ship.shields[weakestArcKey].current + drained
            );

            const siphonArc = 'forward_30';
            const tempWeapon = { firingArc: siphonArc } as Weapon;
            const sourcePos = SpaceCombatEngine.getWeaponHardpointPosition(ship, tempWeapon, 0, target.position);
            const impactPos = SpaceCombatEngine.getTargetImpactPoint(target, sourcePos);
            this.beamEffects.push({
              id: `beam_${Date.now()}_${Math.random()}`,
              shooterId: ship.id,
              targetId: target.id,
              weaponIndex: 0,
              firingArc: siphonArc,
              sourcePos: sourcePos,
              targetPos: impactPos,
              color: '#06b6d4',
              duration: 1.0,
              maxDuration: 1.0,
            });

            this.createImpactSparks(impactPos, '#06b6d4', 12);

            this.addLog(`TACHYON SIPHON: Drained ${Math.round(drained)} shields from ${target.name}!`, 'ability');
          }
        }
        break;
      }
      case 'hazard_emitters': {
        ship.hazardActiveTimer = ability.duration || 10;
        // Restore subsystems to 100%
        ship.subsystems.weapons = 100;
        ship.subsystems.shields = 100;
        ship.subsystems.engines = 100;
        ship.subsystems.auxiliary = 100;

        this.addLog(`${ship.name} deployed Hazard Emitters - Cleaning subsystems & repairing hull.`, 'heal');
        break;
      }
      case 'aegis_restoration_pulse': {
        const casterTeam = ship.team || (ship.isPlayer ? 'alpha' : 'beta');
        const allies = [this.player, ...this.enemies].filter(
          (a) =>
            a &&
            !a.isDestroyed &&
            !a.isMinion &&
            (a.team || (a.isPlayer ? 'alpha' : 'beta')) === casterTeam &&
            this.getDistance(ship.position, a.position) <= 220
        );

        let totalShieldRestored = 0;
        let totalHullRestored = 0;
        allies.forEach((ally) => {
          totalShieldRestored += DirectionalShieldSystem.restoreShields(ally, 400);
          const prevHull = ally.hull;
          ally.hull = Math.min(ally.maxHull, ally.hull + 180);
          totalHullRestored += Math.round(ally.hull - prevHull);
          this.createImpactSparks(ally.position, '#38bdf8', 12);

          if (ally.id !== ship.id) {
            this.beamEffects.push({
              id: `heal_beam_wave_${Date.now()}_${Math.random()}`,
              shooterId: ship.id,
              targetId: ally.id,
              firingArc: 'broadside_360',
              sourcePos: { ...ship.position },
              targetPos: { ...ally.position },
              color: '#34d399',
              thickness: 2.0,
              duration: 1.1,
              maxDuration: 1.1,
            });
          }
        });

        this.addLog(
          `AEGIS RESTORATION WAVE: ${ship.name} pulsed fleet healing (+${totalShieldRestored} shields, +${totalHullRestored} hull across ${allies.length} ships)!`,
          'heal',
          totalShieldRestored + totalHullRestored,
          ship.isPlayer ? 'player' : 'system'
        );
        break;
      }
    }

    return true;
  }

  // Set Power Preset (Weapons / Shields / Engines / Aux / Balanced)
  public setPowerPreset(ship: ShipEntity, preset: PowerPreset) {
    ship.powerPreset = preset;
    if (ship.powerController && (preset === 'balanced' || preset === 'weapons' || preset === 'engines' || preset === 'shields')) {
      ship.powerController.setProfile(preset, true);
    } else {
      soundManager.playPowerPreset();
    }

    switch (preset) {
      case 'weapons':
        ship.power = { weapons: 100, shields: 0, engines: 0, auxiliary: 0 };
        break;
      case 'engines':
        ship.power = { weapons: 0, shields: 0, engines: 100, auxiliary: 0 };
        break;
      case 'shields':
        ship.power = { weapons: 0, shields: 100, engines: 0, auxiliary: 0 };
        break;
      case 'balanced':
      default:
        ship.power = { weapons: 33.3, shields: 33.3, engines: 33.3, auxiliary: 33.3 };
        break;
    }

    if (ship.isPlayer) {
      this.addLog(`POWER SHUNT: Subsystem power redirected to [${preset.toUpperCase()}].`, 'system');
    }
  }

  public rerouteShields(arcKey: ShieldArcKey) {
    if (this.player.isDestroyed) return;
    const transferred = DirectionalShieldSystem.rerouteShieldsToArc(this.player.shields, arcKey, this.player);
    const arcNames: Record<ShieldArcKey, string> = {
      front: 'FORWARD',
      back: 'AFT',
      port: 'PORT',
      starboard: 'STARBOARD',
    };
    if (transferred > 0) {
      soundManager.playPowerPreset();
      this.addLog(
        `SHIELD REROUTE: Transferred +${Math.round(transferred)} HP to ${arcNames[arcKey]} shield arc!`,
        'heal'
      );
    } else {
      soundManager.playErrorAlert?.();
      this.addLog(
        `SHIELD REROUTE: ${arcNames[arcKey]} shield arc is at maximum or no auxiliary shield HP available.`,
        'system'
      );
    }
  }

  public equalizeShields(ship: ShipEntity = this.player) {
    if (ship.isDestroyed) return;
    DirectionalShieldSystem.equalizeShields(ship.shields, ship);
    soundManager.playPowerPreset();
    if (ship.isPlayer) {
      this.addLog(`SHIELD EQUALIZE: Balanced shield health evenly across all 4 arcs.`, 'heal');
    }
  }

  // AI Tactical Behavior with Dynamic Randomness, Predictive Lead Aiming & Torpedo Strike Runs
  private updateEnemyAI(enemy: ShipEntity, delta: number) {
    const playerTeam = this.player.team || 'alpha';

    // Respect active movement waypoint on enemy AI ship if far from destination
    if (enemy.waypoint) {
      const dxWp = enemy.waypoint.x - enemy.position.x;
      const dzWp = enemy.waypoint.z - enemy.position.z;
      if (Math.hypot(dxWp, dzWp) > 5.5) {
        return; // ShipFlightController will handle movement toward waypoint
      } else {
        enemy.waypoint = null;
      }
    }

    // Attach dynamic tactical state onto enemy if absent
    const aiState = (enemy as any).aiTactics || ((enemy as any).aiTactics = {
      mode: 'lateral_starboard',
      timer: 0,
      strafeSign: Math.random() > 0.5 ? 1 : -1,
      speedMult: 0.65 + Math.random() * 0.3,
      currentTargetId: null,
      retargetTimer: 0,
    });

    // Dynamic Target Selection: Choose between Player Carrier and active Player Interceptor Drones/Fighters
    const activePlayerFighters = this.enemies.filter(
      (e) => !e.isDestroyed && e.hull > 0 && (e.team || 'alpha') === playerTeam && e.id !== enemy.id
    );

    aiState.retargetTimer -= delta;

    let target: ShipEntity | null = null;

    if (aiState.currentTargetId) {
      if (aiState.currentTargetId === this.player.id) {
        target = this.player;
      } else {
        target = activePlayerFighters.find((f) => f.id === aiState.currentTargetId) || null;
      }
    }

    if (!target || target.isDestroyed || target.hull <= 0 || aiState.retargetTimer <= 0) {
      aiState.retargetTimer = 2.5 + Math.random() * 3.0; // Re-evaluate target every 2.5s-5.5s

      if (activePlayerFighters.length > 0) {
        // Find closest fighter
        const fightersWithDist = activePlayerFighters
          .map((f) => {
            const dxF = f.position.x - enemy.position.x;
            const dzF = f.position.z - enemy.position.z;
            return { fighter: f, dist: Math.hypot(dxF, dzF) };
          })
          .sort((a, b) => a.dist - b.dist);

        const closestFighter = fightersWithDist[0];
        const switchRoll = Math.random();

        // 50% chance to attack nearby fighter, or 100% if player is destroyed or fighter is very close (< 45m)
        if (this.player.isDestroyed || closestFighter.dist < 45 || (closestFighter.dist < 110 && switchRoll < 0.50)) {
          target = closestFighter.fighter;
        } else if (switchRoll < 0.25) {
          target = closestFighter.fighter;
        } else {
          target = this.player;
        }
      } else {
        target = this.player;
      }

      aiState.currentTargetId = target ? target.id : this.player.id;
    }

    if (!target || target.isDestroyed || target.hull <= 0) return;

    // Delegate to dedicated Dragoon AI if enemy is a Vector Dragoon or Interceptor
    if (enemy.shipClass.id.includes('dragoon') || enemy.shipClass.id.includes('interceptor')) {
      this.updateDragoonAI(enemy, delta, target, activePlayerFighters);
      return;
    }

    // Identify primary forward torpedo weapon (if any)
    const primaryTorpedo = enemy.weapons.find(
      (w) =>
        (w.isTorpedo || w.type.includes('torpedo')) &&
        (w.firingArc.startsWith('forward') || w.firingArc === 'forward_45')
    );
    const isTorpedoShip =
      !!primaryTorpedo ||
      enemy.shipClass.id.includes('dragoon') ||
      enemy.shipClass.id.includes('interceptor') ||
      enemy.shipClass.id.includes('escort');

    // Compute target linear velocity vector
    const targetFlight = ShipFlightController.getFlightState(target);
    const targetVel =
      targetFlight.linearVelocity &&
      Math.hypot(targetFlight.linearVelocity.x, targetFlight.linearVelocity.z) > 0.5
        ? targetFlight.linearVelocity
        : {
            x: Math.sin(target.rotation.y) * target.speed,
            z: Math.cos(target.rotation.y) * target.speed,
          };

    // Calculate predictive interception lead heading & position for torpedo deflection aiming (torpedo speed = 45)
    const { leadHeading, leadPosition } = ShipCollisionHandler.calculatePredictiveLeadHeading(
      enemy.position,
      target.position,
      targetVel,
      45
    );

    const dx = target.position.x - enemy.position.x;
    const dz = target.position.z - enemy.position.z;
    const dist = Math.hypot(dx, dz);
    const directAngle = Math.atan2(dx, dz);

    // Check if main forward torpedo is ready or almost ready (< 1.2s remaining)
    const torpedoReady = primaryTorpedo && primaryTorpedo.currentCooldown <= 1.2 && dist <= (primaryTorpedo.range || 113) && dist >= 45;

    // 1. Tactic Selector & State Transitions
    aiState.timer -= delta;

    if (isTorpedoShip && torpedoReady && dist >= 45) {
      // Enter Torpedo Strike Run alignment mode only at safe stand-off range (>= 45)
      aiState.mode = 'torpedo_strike_run';
      aiState.timer = 2.5;
    } else if (isTorpedoShip && dist < 42 && aiState.mode === 'torpedo_strike_run') {
      // Abort strike run when closing inside safe engagement distance (42) to prevent ramming
      aiState.mode = aiState.strafeSign > 0 ? 'lateral_starboard' : 'lateral_port';
      aiState.timer = 2.5 + Math.random() * 2.0;
    } else if (aiState.timer <= 0) {
      // Pick next tactic duration (3.0s to 5.5s)
      aiState.timer = 3.0 + Math.random() * 2.5;
      aiState.speedMult = 0.55 + Math.random() * 0.4;

      const rand = Math.random();
      if (isTorpedoShip) {
        // While torpedo is cooling down, Dragoon uses agile lateral weaves and flank angles
        if (rand < 0.45) {
          aiState.mode = 'lateral_starboard';
        } else if (rand < 0.85) {
          aiState.mode = 'lateral_port';
        } else {
          aiState.mode = 'evasive_flank';
        }
      } else {
        if (rand < 0.40) {
          aiState.mode = 'lateral_starboard';
        } else if (rand < 0.65) {
          aiState.mode = 'lateral_port';
        } else if (rand < 0.82) {
          aiState.mode = 'broadside_orbit';
          aiState.strafeSign = Math.random() > 0.5 ? 1 : -1;
        } else {
          aiState.mode = 'charge';
        }
      }
    }

    // AI Tactical Subsystem Power Shunting
    if (enemy.powerController) {
      let desiredPowerProfile: PowerPreset = 'balanced';
      const shieldArcs = [enemy.shields.front, enemy.shields.starboard, enemy.shields.back, enemy.shields.port];
      const hasWeakShield = shieldArcs.some((arc) => arc.current < arc.max * 0.35);

      if (hasWeakShield) {
        desiredPowerProfile = 'shields';
      } else if (aiState.mode === 'torpedo_strike_run' || torpedoReady || dist < 35) {
        desiredPowerProfile = 'weapons';
      } else if (dist > 60 || aiState.mode === 'evasive_flank') {
        desiredPowerProfile = 'engines';
      }

      if (enemy.powerPreset !== desiredPowerProfile) {
        this.setPowerPreset(enemy, desiredPowerProfile);
      }
    }

    // 2. Compute Desired Navigation Heading
    let desiredHeading = directAngle;

    switch (aiState.mode) {
      case 'torpedo_strike_run': {
        // Line up heading with predictive lead heading while at safe distance
        desiredHeading = leadHeading;
        break;
      }
      case 'lateral_starboard': {
        desiredHeading = directAngle - Math.PI / 2 + 0.3;
        break;
      }
      case 'lateral_port': {
        desiredHeading = directAngle + Math.PI / 2 - 0.3;
        break;
      }
      case 'broadside_orbit': {
        const tangentOffset = (aiState.strafeSign || 1) * (Math.PI / 2);
        let radialAdjust = 0;
        if (dist > 50) radialAdjust = 0.4;
        if (dist < 35) radialAdjust = -0.6;
        desiredHeading = directAngle + tangentOffset + radialAdjust;
        break;
      }
      case 'evasive_flank': {
        const strafeSign = aiState.strafeSign || 1;
        desiredHeading = directAngle + strafeSign * (Math.PI / 2 + 0.5);
        break;
      }
      case 'charge':
      default: {
        desiredHeading = directAngle;
        break;
      }
    }

    // 2a. Target Ship Proximity Anti-Ramming Evasion (Applies universally to ALL tactics)
    const minSafeDist = isTorpedoShip ? 42.0 : 28.0;
    if (dist < minSafeDist) {
      const pushFactor = Math.pow((minSafeDist - dist) / minSafeDist, 1.2);
      const strafeSide = aiState.strafeSign || 1;
      const antiRamAngle = directAngle + strafeSide * (Math.PI / 2 + pushFactor * (Math.PI / 3));

      const blend = Math.min(1.0, pushFactor * 1.8);
      const dxCur = Math.sin(desiredHeading);
      const dzCur = Math.cos(desiredHeading);
      const dxAvoid = Math.sin(antiRamAngle);
      const dzAvoid = Math.cos(antiRamAngle);

      desiredHeading = Math.atan2(dxCur * (1 - blend) + dxAvoid * blend, dzCur * (1 - blend) + dzAvoid * blend);
    }

    // 2b. Asteroid Obstacle Avoidance Routing
    const { adjustedHeading, threatWeight } = ShipCollisionHandler.calculateAsteroidAvoidanceHeading(
      enemy,
      this.asteroids,
      desiredHeading,
      40.0
    );

    desiredHeading = adjustedHeading;

    // Turn toward desiredHeading with smooth angular inertia
    const angleDiff = Math.atan2(Math.sin(desiredHeading - enemy.rotation.y), Math.cos(desiredHeading - enemy.rotation.y));
    const turnRateMult = isTorpedoShip ? 1.35 : 0.85;
    const maxTurnSpeed = ((enemy.shipClass.turnRate * turnRateMult) * Math.PI) / 180;

    if (Math.abs(angleDiff) > 0.03) {
      enemy.targetAngularVelocity = Math.sign(angleDiff) * maxTurnSpeed;
    } else {
      enemy.targetAngularVelocity = 0;
    }

    // Speed control: Tactical speed variation based on tactic, distance, and obstacle clearance
    const maxEnemySpeed = enemy.shipClass.maxSpeed * (isTorpedoShip ? 0.85 : 0.6);
    let baseTargetSpeed = maxEnemySpeed * aiState.speedMult;

    if (aiState.mode === 'torpedo_strike_run') {
      if (dist > 80) baseTargetSpeed = maxEnemySpeed * 1.0;
      else if (dist < 32) baseTargetSpeed = maxEnemySpeed * 0.40;
      else baseTargetSpeed = maxEnemySpeed * 0.75;
    } else if (dist > 35) {
      baseTargetSpeed = maxEnemySpeed * 0.95;
    } else if (dist < 15) {
      // Dangerously close! Reverse engines or brake to prevent ramming collision
      baseTargetSpeed = -maxEnemySpeed * 0.25;
    } else if (dist < 28) {
      baseTargetSpeed = maxEnemySpeed * 0.25;
    }

    // Reduce speed when executing sharp asteroid avoidance maneuver
    if (threatWeight > 0.35) {
      enemy.targetSpeed = Math.min(baseTargetSpeed, maxEnemySpeed * 0.25);
    } else {
      enemy.targetSpeed = baseTargetSpeed;
    }

    // 3. Torpedo High Yield Pre-charge & Precision Firing AI
    enemy.targetId = target.id;

    const leadAngleDiff = Math.abs(
      Math.atan2(Math.sin(leadHeading - enemy.rotation.y), Math.cos(leadHeading - enemy.rotation.y))
    );

    // Pre-charge 'torpedo_high_yield' ability if available when aligned towards lead heading
    if (primaryTorpedo && primaryTorpedo.currentCooldown <= 0.15 && leadAngleDiff < 0.22 && dist <= primaryTorpedo.range) {
      const highYieldAbility = enemy.abilities?.find((a) => a.id === 'torpedo_high_yield');
      if (highYieldAbility && highYieldAbility.currentCooldown <= 0) {
        this.useAbility(enemy, 'torpedo_high_yield');
      }
    }

    // Special AI handling for Vector Dragoon archetype
    if (enemy.shipClass.id.includes('dragoon') || enemy.shipClass.id.includes('interceptor')) {
      const pc = enemy.plasmaCharge;

      // Hardpoint 1: 360° Omnidirectional Phaser (continuous pressure within 200m)
      const phaserIdx = enemy.weapons.findIndex((w) => !w.isTorpedo);
      if (phaserIdx >= 0 && enemy.weapons[phaserIdx].currentCooldown <= 0 && dist <= (enemy.weapons[phaserIdx].range || 200)) {
        this.fireWeapon(enemy, phaserIdx, target);
      }

      // Hardpoint 2: Charged Bow Plasma Ball (Charging & Sweet Spot Release)
      const plasmaWeapon = enemy.weapons.find((w) => w.isTorpedo);
      if (plasmaWeapon && plasmaWeapon.currentCooldown <= 0 && dist <= (plasmaWeapon.range || 150)) {
        if (!pc || !pc.isCharging) {
          if (aiState.mode === 'torpedo_strike_run' || dist <= 120) {
            this.startPlasmaCharge(enemy);
          }
        } else if (pc && pc.isCharging) {
          if (pc.chargeTime >= 0.8 && leadAngleDiff < 0.35) {
            this.releasePlasmaCharge(enemy, target);
            const vectorBurst = enemy.abilities?.find((a) => a.id === 'vector_burst' && a.currentCooldown <= 0);
            if (vectorBurst) {
              this.useAbility(enemy, 'vector_burst');
            }
            aiState.timer = 0;
          } else if (pc.chargeTime >= 1.7) {
            this.releasePlasmaCharge(enemy, target);
            const vectorBurst = enemy.abilities?.find((a) => a.id === 'vector_burst' && a.currentCooldown <= 0);
            if (vectorBurst) {
              this.useAbility(enemy, 'vector_burst');
            }
            aiState.timer = 0;
          }
        }
      }
    } else {
      // Attempt firing all ready weapons for non-Dragoon ships
      enemy.weapons.forEach((w, idx) => {
        if (w.currentCooldown <= 0) {
          let firingTarget = target;
          let firingDist = dist;
          let firingLeadPos = leadPosition;
          let firingLeadAngleDiff = leadAngleDiff;

          // Check if primary target is out of range or firing arc, but a fighter is in range and arc
          const inArcPrimary = SpaceCombatEngine.isInFiringArc(enemy.position, enemy.rotation.y, target.position, w.firingArc, w);
          if ((dist > w.range || !inArcPrimary) && activePlayerFighters.length > 0) {
            const oppFighter = activePlayerFighters.find((f) => {
              const d = Math.hypot(f.position.x - enemy.position.x, f.position.z - enemy.position.z);
              return d <= w.range && SpaceCombatEngine.isInFiringArc(enemy.position, enemy.rotation.y, f.position, w.firingArc, w);
            });
            if (oppFighter) {
              firingTarget = oppFighter;
              firingDist = Math.hypot(oppFighter.position.x - enemy.position.x, oppFighter.position.z - enemy.position.z);
              const fFlight = ShipFlightController.getFlightState(oppFighter);
              const fVel = fFlight.linearVelocity || { x: Math.sin(oppFighter.rotation.y) * oppFighter.speed, z: Math.cos(oppFighter.rotation.y) * oppFighter.speed };
              const leadData = ShipCollisionHandler.calculatePredictiveLeadHeading(enemy.position, oppFighter.position, fVel, 45);
              firingLeadPos = leadData.leadPosition;
              firingLeadAngleDiff = Math.abs(Math.atan2(Math.sin(leadData.leadHeading - enemy.rotation.y), Math.cos(leadData.leadHeading - enemy.rotation.y)));
            }
          }

          if (firingDist <= w.range) {
            const isTorpedo = w.isTorpedo || w.type.includes('torpedo');

            if (isTorpedo) {
              if (firingLeadAngleDiff < 0.25) {
                const asteroidInWay = this.checkLineOfSightAsteroidHit(enemy.position, firingLeadPos);
                if (!asteroidInWay) {
                  const launched = this.fireWeapon(enemy, idx, firingTarget);
                  if (launched && aiState.mode === 'torpedo_strike_run') {
                    const vectorBurst = enemy.abilities?.find((a) => a.id === 'vector_burst' && a.currentCooldown <= 0);
                    if (vectorBurst) {
                      this.useAbility(enemy, 'vector_burst');
                    }
                    aiState.timer = 0;
                  }
                }
              }
            } else {
              this.fireWeapon(enemy, idx, firingTarget);
            }
          }
        }
      });
    }

    // 4. Tactical Shield Distribution / Protection
    const weakestArcKey = this.getWeakestShieldArc(enemy);
    if (enemy.shields[weakestArcKey].current < enemy.shields[weakestArcKey].max * 0.2) {
      this.useAbility(enemy, 'distribute_shields');
    }
  }

  /**
   * Dedicated Tactical AI Routine for Vector Dragoon / Interceptor Archetype
   * Features:
   * 1. Boom-and-Zoom Strafing State Machine (Zoom In -> Charged Plasma Strike -> Vector Pivot Breakaway -> Flanking Kiting Arc -> Reposition)
   * 2. Reactive I-Frame Vector Burst Dodging against incoming torpedoes, hazard mines, and close-range frontal threat cones
   * 3. 360° Omnidirectional Phaser Stream continuous harassment against primary target and secondary fighters
   * 4. Smart Tactical Subsystem Power Shunting (WEAPONS during charge, ENGINES during breakaway, SHIELDS when low)
   * 5. Emergency Shield Rebalance / Distribution
   */
  public updateDragoonAI(
    enemy: ShipEntity,
    delta: number,
    target: ShipEntity,
    activePlayerFighters: ShipEntity[]
  ) {
    const enemyTeam = enemy.team || (enemy.isPlayer ? 'alpha' : 'beta');
    const isTargetPlayer = target.id === this.player.id;

    // Attach dynamic Dragoon AI state
    const dState = (enemy as any).dragoonAIState || ((enemy as any).dragoonAIState = {
      phase: 'zoom_in', // 'zoom_in' | 'strike' | 'vector_escape' | 'zoom_out_flank' | 'reposition'
      timer: 0,
      strafeSign: Math.random() > 0.5 ? 1 : -1,
      dodgeCooldown: 0,
    });

    dState.timer -= delta;
    dState.dodgeCooldown -= delta;

    // Target position and predictive lead heading
    const targetFlight = ShipFlightController.getFlightState(target);
    const targetVel =
      targetFlight.linearVelocity &&
      Math.hypot(targetFlight.linearVelocity.x, targetFlight.linearVelocity.z) > 0.5
        ? targetFlight.linearVelocity
        : {
            x: Math.sin(target.rotation.y) * target.speed,
            z: Math.cos(target.rotation.y) * target.speed,
          };

    const { leadHeading } = ShipCollisionHandler.calculatePredictiveLeadHeading(
      enemy.position,
      target.position,
      targetVel,
      45
    );

    const dx = target.position.x - enemy.position.x;
    const dz = target.position.z - enemy.position.z;
    const dist = Math.hypot(dx, dz);
    const directAngle = Math.atan2(dx, dz);
    const leadAngleDiff = Math.abs(
      Math.atan2(Math.sin(leadHeading - enemy.rotation.y), Math.cos(leadHeading - enemy.rotation.y))
    );

    // 1. REACTIVE I-FRAME VECTOR BURST DODGING
    const vectorBurstAbility = enemy.abilities?.find((a) => a.id === 'vector_burst');
    const isVectorBurstReady = vectorBurstAbility && vectorBurstAbility.currentCooldown <= 0;

    if (isVectorBurstReady && dState.dodgeCooldown <= 0) {
      let threatDetected = false;
      let dodgeDir = { x: dState.strafeSign, z: -0.2 };

      // Threat A: In-flight hostile torpedoes/plasma balls approaching Dragoon within 32m
      for (const proj of this.projectiles) {
        if (!proj.hasLaunched) continue;
        const pOwner = [this.player, ...this.enemies].find((s) => s.id === proj.ownerId);
        if (pOwner && (pOwner.team || 'alpha') === enemyTeam) continue;

        const pDx = enemy.position.x - proj.position.x;
        const pDz = enemy.position.z - proj.position.z;
        const pDist = Math.hypot(pDx, pDz);

        if (pDist <= 32) {
          const pSpeed = Math.hypot(proj.velocity.x, proj.velocity.z) || 1;
          const dot = (pDx * proj.velocity.x + pDz * proj.velocity.z) / (pDist * pSpeed);
          if (dot > 0.35) {
            threatDetected = true;
            const perpX = -proj.velocity.z;
            const perpZ = proj.velocity.x;
            const perpLen = Math.hypot(perpX, perpZ) || 1;
            const cosY = Math.cos(enemy.rotation.y);
            const sinY = Math.sin(enemy.rotation.y);
            const localX = (perpX / perpLen) * cosY - (perpZ / perpLen) * sinY;
            dodgeDir = { x: localX >= 0 ? 1 : -1, z: -0.3 };
            break;
          }
        }
      }

      // Threat B: Hostile magnetic hazard mines within 24m
      if (!threatDetected) {
        for (const ord of this.ordnances) {
          if (ord.isDestroyed || ord.team === enemyTeam) continue;
          const oDx = enemy.position.x - ord.position.x;
          const oDz = enemy.position.z - ord.position.z;
          const oDist = Math.hypot(oDx, oDz);
          if (oDist <= 24) {
            threatDetected = true;
            const cosY = Math.cos(enemy.rotation.y);
            const sinY = Math.sin(enemy.rotation.y);
            const localX = (oDx / oDist) * cosY - (oDz / oDist) * sinY;
            dodgeDir = { x: localX >= 0 ? 1 : -1, z: -0.5 };
            break;
          }
        }
      }

      // Threat C: Player is close (<30m) and pointing bow weapons directly at Dragoon
      if (!threatDetected && isTargetPlayer && dist < 30) {
        const targetFacingToEnemy = Math.abs(
          Math.atan2(Math.sin(directAngle + Math.PI - target.rotation.y), Math.cos(directAngle + Math.PI - target.rotation.y))
        );
        if (targetFacingToEnemy < 0.35) {
          threatDetected = true;
          dodgeDir = { x: dState.strafeSign, z: -0.4 };
        }
      }

      if (threatDetected) {
        (enemy as any).aiVectorDirection = dodgeDir;
        this.useAbility(enemy, 'vector_burst');
        dState.dodgeCooldown = 1.0;
        dState.phase = 'zoom_out_flank';
        dState.timer = 2.0;
        dState.strafeSign = -dState.strafeSign;
      }
    }

    // 2. SHIELD REBALANCE / EQUALIZATION
    const shieldArcs = [enemy.shields.front, enemy.shields.starboard, enemy.shields.back, enemy.shields.port];
    const lowShield = shieldArcs.some((arc) => arc && arc.max > 0 && arc.current / arc.max < 0.25);
    const rebalanceAbility = enemy.abilities?.find((a) => a.id === 'distribute_shields' || a.id === 'shield_rebalance');
    if (lowShield && rebalanceAbility && rebalanceAbility.currentCooldown <= 0) {
      this.useAbility(enemy, rebalanceAbility.id);
    }

    // 3. HARDPOINT 1: 360° OMNIDIRECTIONAL PHASER HARASSMENT
    const phaserIdx = enemy.weapons.findIndex((w) => !w.isTorpedo);
    if (phaserIdx >= 0 && enemy.weapons[phaserIdx].currentCooldown <= 0 && dist <= (enemy.weapons[phaserIdx].range || 200)) {
      this.fireWeapon(enemy, phaserIdx, target);
    }

    if (activePlayerFighters.length > 0 && phaserIdx >= 0 && enemy.weapons[phaserIdx].currentCooldown <= 0) {
      for (const fighter of activePlayerFighters) {
        const fDist = Math.hypot(fighter.position.x - enemy.position.x, fighter.position.z - enemy.position.z);
        if (fDist <= (enemy.weapons[phaserIdx].range || 180)) {
          this.fireWeapon(enemy, phaserIdx, fighter);
          break;
        }
      }
    }

    // 4. HARDPOINT 2: CHARGED BOW PLASMA BALL & STRAFING PHASE STATE MACHINE
    const pc = enemy.plasmaCharge;
    const plasmaWeapon = enemy.weapons.find((w) => w.isTorpedo);
    const isPlasmaReady = plasmaWeapon && plasmaWeapon.currentCooldown <= 0;

    if (dState.phase === 'zoom_in') {
      if (isPlasmaReady) {
        if (!pc || !pc.isCharging) {
          this.startPlasmaCharge(enemy);
        }
      }

      if (pc && pc.isCharging) {
        if ((pc.chargeTime >= 0.8 && leadAngleDiff < 0.35 && dist <= 120) || pc.chargeTime >= 1.6 || dist < 28) {
          this.releasePlasmaCharge(enemy, target);
          dState.phase = 'vector_escape';
        }
      } else if (!isPlasmaReady && dist < 45) {
        dState.phase = 'vector_escape';
      }
    } else if (dState.phase === 'vector_escape') {
      // Pick escape direction away from any nearby allied ships so Dragoon doesn't dash into allies
      const allVessels = [this.player, ...this.enemies].filter(
        (s) => s && !s.isDestroyed && !s.id.includes('_drone_') && !s.isMinion && s.id !== enemy.id && (s.team || (s.isPlayer ? 'alpha' : 'beta')) === enemyTeam
      );
      let escapeSign = dState.strafeSign;
      const rightX = Math.cos(enemy.rotation.y);
      const rightZ = -Math.sin(enemy.rotation.y);
      let sideDanger = 0;
      allVessels.forEach((ally) => {
        const adx = ally.position.x - enemy.position.x;
        const adz = ally.position.z - enemy.position.z;
        const adist = Math.hypot(adx, adz);
        if (adist < 55 && adist > 0.1) {
          const proj = (adx * rightX + adz * rightZ) / adist;
          sideDanger += proj * (1 - adist / 55);
        }
      });
      if (Math.abs(sideDanger) > 0.1) {
        escapeSign = sideDanger > 0 ? -1 : 1;
      }

      if (isVectorBurstReady) {
        (enemy as any).aiVectorDirection = { x: escapeSign, z: -0.25 };
        this.useAbility(enemy, 'vector_burst');
      }
      dState.phase = 'zoom_out_flank';
      dState.timer = 2.5 + Math.random() * 1.5;
      dState.strafeSign = Math.abs(sideDanger) > 0.1 ? escapeSign : (Math.random() > 0.5 ? 1 : -1);
    } else if (dState.phase === 'zoom_out_flank') {
      if (dState.timer <= 0 || dist > 110) {
        dState.phase = 'reposition';
      }
    } else if (dState.phase === 'reposition') {
      if (leadAngleDiff < 0.4 || dist > 90 || isPlasmaReady) {
        dState.phase = 'zoom_in';
      }
    }

    // 5. SUBSYSTEM POWER SHUNTING
    if (enemy.powerController) {
      let desiredPreset: PowerPreset = 'balanced';
      if (lowShield) {
        desiredPreset = 'shields';
      } else if (dState.phase === 'zoom_in' || (pc && pc.isCharging)) {
        desiredPreset = 'weapons';
      } else if (dState.phase === 'vector_escape' || dState.phase === 'zoom_out_flank') {
        desiredPreset = 'engines';
      }
      if (enemy.powerPreset !== desiredPreset) {
        this.setPowerPreset(enemy, desiredPreset);
      }
    }

    // 6. NAVIGATION & SPEED COMPUTATION
    let desiredHeading = directAngle;
    let targetSpeedRatio = 0.85;

    switch (dState.phase) {
      case 'zoom_in': {
        desiredHeading = leadHeading;
        targetSpeedRatio = dist > 60 ? 1.0 : 0.85;
        break;
      }
      case 'vector_escape':
      case 'zoom_out_flank': {
        const flankOffset = dState.strafeSign * (Math.PI / 2 + 0.45);
        desiredHeading = directAngle + flankOffset;
        targetSpeedRatio = 1.0;
        break;
      }
      case 'reposition': {
        desiredHeading = leadHeading;
        targetSpeedRatio = 0.70;
        break;
      }
    }

    // Anti-Ramming Proximity Buffer against primary target (scales with large bosses/stations)
    const targetAvoidDist = Math.max(30, ShipCollisionHandler.getShipRadius(target) + 22);
    if (dist < targetAvoidDist) {
      const pushFactor = Math.pow((targetAvoidDist - dist) / targetAvoidDist, 1.2);
      const antiRamAngle = directAngle + dState.strafeSign * (Math.PI / 2 + pushFactor * (Math.PI / 3));
      const blend = Math.min(1.0, pushFactor * 1.8);
      const dxCur = Math.sin(desiredHeading);
      const dzCur = Math.cos(desiredHeading);
      const dxAvoid = Math.sin(antiRamAngle);
      const dzAvoid = Math.cos(antiRamAngle);
      desiredHeading = Math.atan2(dxCur * (1 - blend) + dxAvoid * blend, dzCur * (1 - blend) + dzAvoid * blend);
    }

    // Allied Ship Avoidance (discourages ramming friendly Tank / Support / other allies)
    const { adjustedHeading: shipAvoidHeading, threatWeight: allyThreatWeight } =
      ShipCollisionHandler.calculateShipAvoidanceHeading(
        enemy,
        [this.player, ...this.enemies],
        desiredHeading,
        42.0
      );
    desiredHeading = shipAvoidHeading;

    // Asteroid Avoidance
    const { adjustedHeading, threatWeight } = ShipCollisionHandler.calculateAsteroidAvoidanceHeading(
      enemy,
      this.asteroids,
      desiredHeading,
      40.0
    );
    desiredHeading = adjustedHeading;

    // Turn control
    const angleDiff = Math.atan2(Math.sin(desiredHeading - enemy.rotation.y), Math.cos(desiredHeading - enemy.rotation.y));
    const turnRateMult = 1.45;
    const maxTurnSpeed = ((enemy.shipClass.turnRate * turnRateMult) * Math.PI) / 180;

    if (Math.abs(angleDiff) > 0.03) {
      enemy.targetAngularVelocity = Math.sign(angleDiff) * maxTurnSpeed;
    } else {
      enemy.targetAngularVelocity = 0;
    }

    // Speed control
    const maxEnemySpeed = enemy.shipClass.maxSpeed;
    let baseSpeed = maxEnemySpeed * targetSpeedRatio;
    if (threatWeight > 0.35 || allyThreatWeight > 0.35) {
      baseSpeed = Math.min(baseSpeed, maxEnemySpeed * 0.45);
    }
    enemy.targetSpeed = baseSpeed;
  }

  // Helper: Find weakest shield arc
  private getWeakestShieldArc(ship: ShipEntity): ShieldArcKey {
    const keys: ShieldArcKey[] = ['front', 'starboard', 'back', 'port'];
    let minVal = Infinity;
    let weakest: ShieldArcKey = 'front';

    keys.forEach((k) => {
      if (ship.shields[k].current < minVal) {
        minVal = ship.shields[k].current;
        weakest = k;
      }
    });

    return weakest;
  }

  // Update physical torpedo & pulse projectiles
  private updateProjectiles(delta: number) {
    const allShips = [this.player, ...this.enemies].filter((s) => !s.isDestroyed);

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];

      // Handle burst delay for rapid pulse rounds
      if (proj.launchDelay !== undefined && proj.launchDelay > 0) {
        proj.launchDelay -= delta;
        if (proj.launchDelay > 0) {
          continue; // Waiting for burst launch frame
        }
      }

      // Initialize pulse launch when delay expires
      if (!proj.hasLaunched) {
        proj.hasLaunched = true;
        const owner = allShips.find((s) => s.id === proj.ownerId);
        const target = allShips.find((s) => s.id === proj.targetId);

        if (owner && target) {
          const weapon = owner.weapons[proj.weaponIndex ?? 0];
          const launchPos = weapon
            ? SpaceCombatEngine.getWeaponHardpointPosition(owner, weapon, proj.weaponIndex ?? 0, target.position)
            : owner.position;

          proj.position = { ...launchPos };

          const dx = target.position.x - launchPos.x;
          const dz = target.position.z - launchPos.z;
          const dist = Math.hypot(dx, dz) || 1;
          const speed = proj.isPulse ? 135 : 45;

          proj.velocity = { x: (dx / dist) * speed, y: 0, z: (dz / dist) * speed };

          if (proj.isPulse) {
            soundManager.playPhaserBeam(proj.color);
          }
        } else if (owner && proj.velocity.x === 0 && proj.velocity.z === 0) {
          // Default forward flight vector
          const speed = proj.isPulse ? 135 : 45;
          proj.velocity = {
            x: Math.sin(owner.rotation.y) * speed,
            y: 0,
            z: Math.cos(owner.rotation.y) * speed,
          };
        }
      }

      proj.lifetime -= delta;

      const prevPos = { ...proj.position };
      proj.position.x += proj.velocity.x * delta;
      proj.position.z += proj.velocity.z * delta;

      // Spawning trailing plasma exhaust trail behind traveling torpedoes / pulse bolts
      if (Math.random() < (proj.isPulse ? 0.4 : 0.75)) {
        this.particles.push({
          id: `trail_${Date.now()}_${Math.random()}`,
          position: {
            x: proj.position.x + (Math.random() - 0.5) * 0.3,
            y: proj.position.y + (Math.random() - 0.5) * 0.3,
            z: proj.position.z + (Math.random() - 0.5) * 0.3,
          },
          velocity: {
            x: -proj.velocity.x * 0.15 + (Math.random() - 0.5) * 2.0,
            y: (Math.random() - 0.5) * 2.0,
            z: -proj.velocity.z * 0.15 + (Math.random() - 0.5) * 2.0,
          },
          color: proj.color,
          size: proj.isPulse ? 0.18 + Math.random() * 0.2 : 0.25 + Math.random() * 0.35,
          lifetime: proj.isPulse ? 0.15 + Math.random() * 0.15 : 0.3 + Math.random() * 0.25,
          maxLifetime: proj.isPulse ? 0.3 : 0.55,
        });
      }

      // Check collision with hostile Zoning Ordnance (2.5m Area3D collider)
      const projOwner = allShips.find((s) => s.id === proj.ownerId);
      const projOwnerTeam = projOwner ? projOwner.team || (projOwner.isPlayer ? 'alpha' : 'beta') : 'alpha';

      let ordHit = false;
      for (const ord of this.ordnances) {
        if (ord.isDestroyed || ord.team === projOwnerTeam || (ord.invulnerableTimer && ord.invulnerableTimer > 0)) continue;
        const test = SpaceCombatEngine.intersectsSphereSegment(prevPos, proj.position, ord.position, ord.radius || 2.5);
        if (test.hit) {
          this.triggerOrdnanceInterception(ord, test.impactPoint);
          this.projectiles.splice(i, 1);
          ordHit = true;
          break;
        }
      }
      if (ordHit) continue;

      // Check collision with asteroids along trajectory segment
      const asteroidHit = this.checkLineOfSightAsteroidHit(prevPos, proj.position);
      if (asteroidHit) {
        this.damageAsteroid(
          asteroidHit.asteroid,
          proj.damage,
          projOwner ? projOwner.name : 'Vessel',
          proj.isPulse ? 'Pulse Phaser' : 'Torpedo',
          asteroidHit.impactPoint
        );
        this.projectiles.splice(i, 1);
        continue;
      }

      // Check collision against any hostile ship in straight flight trajectory
      const candidateTargets = allShips.filter(
        (s) => s.id !== proj.ownerId && (s.team || (s.isPlayer ? 'alpha' : 'beta')) !== projOwnerTeam
      );

      let hitOccurred = false;
      for (const target of candidateTargets) {
        const arcHitKey = SpaceCombatEngine.calculateShieldArcHit(target.position, target.rotation.y, proj.position);
        const targetArc = target.shields[arcHitKey];
        const isShieldVisible = targetArc && targetArc.max > 0 && (targetArc.current / targetArc.max) > 0.05;
        const targetShieldRadius = ShipModelBuilder.getShieldRadius(target.shipClass.modelType);
        const targetHullRadius = ShipModelBuilder.getHullRadius(target.shipClass.modelType);
        const hitRadius = isShieldVisible ? targetShieldRadius : targetHullRadius;

        // Line segment trajectory intersection check to prevent fast projectile tunneling
        const segX = proj.position.x - prevPos.x;
        const segY = proj.position.y - prevPos.y;
        const segZ = proj.position.z - prevPos.z;
        const segLenSq = segX * segX + segY * segY + segZ * segZ;

        let closestPos = proj.position;
        let dist = this.getDistance(proj.position, target.position);

        if (segLenSq > 0) {
          let t = ((target.position.x - prevPos.x) * segX +
                   (target.position.y - prevPos.y) * segY +
                   (target.position.z - prevPos.z) * segZ) / segLenSq;
          t = Math.max(0, Math.min(1, t));
          const testPos = {
            x: prevPos.x + segX * t,
            y: prevPos.y + segY * t,
            z: prevPos.z + segZ * t,
          };
          const testDist = this.getDistance(testPos, target.position);
          if (testDist < dist) {
            dist = testDist;
            closestPos = testPos;
          }
        }

        if (dist <= hitRadius) {
          const impactPos = SpaceCombatEngine.getTargetImpactPoint(target, closestPos, hitRadius);

          // Impact!
          if (projOwner) {
            this.applyDamage(projOwner, target, proj.damage, proj.weaponType, impactPos);
          }
          this.createImpactSparks(impactPos, proj.color, proj.isPulse ? 10 : 18);
          this.projectiles.splice(i, 1);
          hitOccurred = true;
          break;
        }
      }

      if (hitOccurred) continue;

      if (proj.lifetime <= 0) {
        this.projectiles.splice(i, 1);
      }
    }
  }

  // Create weapon impact sparks
  public createImpactSparks(pos: { x: number; y: number; z: number }, color: string, count: number = 10) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 6 + Math.random() * 16;
      const vy = (Math.random() - 0.5) * 12;

      this.particles.push({
        id: `spark_${Date.now()}_${Math.random()}`,
        position: { ...pos },
        velocity: { x: Math.cos(angle) * speed, y: vy, z: Math.sin(angle) * speed },
        color: Math.random() > 0.3 ? color : '#ffffff',
        size: 0.25 + Math.random() * 0.6,
        lifetime: 0.3 + Math.random() * 0.45,
        maxLifetime: 0.75,
      });
    }
  }

  // Update visual effects
  private updateEffects(delta: number) {
    const allShips = [this.player, ...this.enemies];

    // Beams
    for (let i = this.beamEffects.length - 1; i >= 0; i--) {
      const beam = this.beamEffects[i];
      beam.duration -= delta;

      if (beam.duration <= 0) {
        this.beamEffects.splice(i, 1);
        continue;
      }

      // Dynamically track shooter and target ship positions as they move
      if (beam.shooterId) {
        const shooter = allShips.find((s) => s.id === beam.shooterId && !s.isDestroyed);
        if (shooter) {
          const target = beam.targetId ? allShips.find((s) => s.id === beam.targetId) : undefined;
          if (beam.firingArc) {
            const tempWeapon = { firingArc: beam.firingArc } as Weapon;
            beam.sourcePos = SpaceCombatEngine.getWeaponHardpointPosition(
              shooter,
              tempWeapon,
              beam.weaponIndex ?? 0,
              target?.position
            );
          } else {
            beam.sourcePos = { ...shooter.position };
          }
        }
      }
      if (beam.targetId) {
        const target = allShips.find((s) => s.id === beam.targetId && !s.isDestroyed);
        if (target) {
          if (beam.id.startsWith('heal_beam_')) {
            beam.targetPos = SpaceCombatEngine.getTargetImpactPoint(
              target,
              beam.sourcePos,
              ShipModelBuilder.getHullRadius(target.shipClass?.modelType)
            );
          } else if (beam.id.startsWith('boss_obliteration_')) {
            // Keep Obliteration Beam locked cleanly on impact hull/shield point
            beam.targetPos = SpaceCombatEngine.getTargetImpactPoint(target, beam.sourcePos);
          } else {
            const shooter = allShips.find((s) => s.id === beam.shooterId);
            if (shooter) {
              const beamHit = this.findFirstBeamHit(shooter, beam.sourcePos, target);
              if (beamHit.hitType === 'ordnance' && beamHit.ordnance) {
                beam.targetPos = beamHit.impactPoint;
                this.triggerOrdnanceInterception(beamHit.ordnance, beamHit.impactPoint);
                this.shieldImpacts.forEach((imp) => {
                  if (imp.beamId === beam.id) imp.duration = 0;
                });
              } else if (beamHit.hitType === 'asteroid' && beamHit.asteroidHit) {
                beam.targetPos = beamHit.impactPoint;
                this.createImpactSparks(beamHit.impactPoint, beam.color, 4);
                this.shieldImpacts.forEach((imp) => {
                  if (imp.beamId === beam.id) imp.duration = 0;
                });
              } else {
                const hitTarget = beamHit.targetShip || target;
                beam.targetPos = beamHit.impactPoint;
                const activeArc = SpaceCombatEngine.calculateShieldArcHit(hitTarget.position, hitTarget.rotation.y, beam.sourcePos);
                const targetArc = hitTarget.shields ? hitTarget.shields[activeArc] : undefined;
                const isShieldVisible = hitTarget.minionHealth
                  ? hitTarget.minionHealth.is_shield_active()
                  : (targetArc && targetArc.max > 0 && (targetArc.current / targetArc.max) > 0.05);
                const tiedImpact = this.shieldImpacts.find((imp) => imp.beamId === beam.id);
                if (tiedImpact) {
                  if (isShieldVisible) {
                    tiedImpact.duration = beam.duration;
                    tiedImpact.position = beamHit.impactPoint;
                    tiedImpact.arc = activeArc;
                  } else {
                    tiedImpact.duration = 0;
                  }
                }
              }
            } else {
              beam.targetPos = SpaceCombatEngine.getTargetImpactPoint(target, beam.sourcePos);
            }
          }
        } else {
          this.shieldImpacts.forEach((imp) => {
            if (imp.beamId === beam.id) imp.duration = 0;
          });
        }
      }
    }

    // Shield Impacts
    for (let i = this.shieldImpacts.length - 1; i >= 0; i--) {
      this.shieldImpacts[i].duration -= delta;
      if (this.shieldImpacts[i].duration <= 0) {
        this.shieldImpacts.splice(i, 1);
      }
    }

    // Particles
    if (this.particles.length > 120) {
      this.particles.splice(0, this.particles.length - 120);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.lifetime -= delta;
      p.position.x += p.velocity.x * delta;
      p.position.y += p.velocity.y * delta;
      p.position.z += p.velocity.z * delta;

      if (p.lifetime <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  // Create rich multi-stage debris particles on explosion
  private createExplosionParticles(pos: { x: number; y: number; z: number }, count: number = 30) {
    // Stage 1: Central White Flash Core
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        id: `core_${Date.now()}_${Math.random()}`,
        position: { ...pos },
        velocity: {
          x: (Math.random() - 0.5) * 4,
          y: (Math.random() - 0.5) * 4,
          z: (Math.random() - 0.5) * 4,
        },
        color: '#ffffff',
        size: 1.2 + Math.random() * 1.5,
        lifetime: 0.25 + Math.random() * 0.2,
        maxLifetime: 0.45,
      });
    }

    // Stage 2: Fiery Plasma Debris Sparks
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 12 + Math.random() * 28;
      const vy = (Math.random() - 0.5) * 18;

      const colors = ['#f97316', '#ef4444', '#f59e0b', '#38bdf8', '#22c55e'];
      const chosenColor = colors[Math.floor(Math.random() * colors.length)];

      this.particles.push({
        id: `p_${Date.now()}_${Math.random()}`,
        position: { ...pos },
        velocity: { x: Math.cos(angle) * speed, y: vy, z: Math.sin(angle) * speed },
        color: chosenColor,
        size: 0.4 + Math.random() * 0.9,
        lifetime: 1.0 + Math.random() * 1.8,
        maxLifetime: 2.8,
      });
    }
  }

  // Add tactical log entry
  public addLog(text: string, type: CombatLogEntry['type'], value?: number, source: 'player' | 'enemy' | 'system' = 'system') {
    const entry: CombatLogEntry = {
      id: `log_${Date.now()}_${Math.random()}`,
      timestamp: new Date().toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' }),
      text,
      type,
      value,
      source,
    };

    this.combatLogs.unshift(entry);
    if (this.combatLogs.length > 50) this.combatLogs.pop();
  }

  // Distance helper
  private getDistance(p1: { x: number; y: number; z: number }, p2: { x: number; y: number; z: number }): number {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const dz = p1.z - p2.z;
    return Math.hypot(dx, dy, dz);
  }

  // ---------------------------------------------------------------------------
  // Aegis Hive-Carrier Hangar Economy & Drone Swarm Logic
  // ---------------------------------------------------------------------------

  public initHangarState(ship: ShipEntity) {
    if (
      ship.shipClass.modelType === 'carrier' ||
      ship.shipClass.id.includes('carrier') ||
      ship.shipClass.id.includes('aegis') ||
      ship.shipClass.id.includes('hive') ||
      !!ship.hangarState
    ) {
      if (!ship.hangarState) {
        ship.hangarState = {
          drones: Array.from({ length: 6 }, (_, i) => ({
            id: `${ship.id}_drone_${i}`,
            hp: 50,
            maxHp: 50,
            state: 'docked',
          })),
          swarmWaypoint: null,
          isRecalled: false,
          launchCooldown: 0,
        };
      }
    }
  }

  public launchDrone(ship: ShipEntity = this.player): boolean {
    if (ship.isDestroyed) return false;
    this.initHangarState(ship);
    const hs = ship.hangarState;
    if (!hs) return false;

    if (hs.launchCooldown > 0) return false;

    const readyIndex = hs.drones.findIndex((d) => d.state === 'docked');
    if (readyIndex === -1) return false;

    const droneStatus = hs.drones[readyIndex];
    droneStatus.state = 'active';
    droneStatus.hp = 50;
    hs.launchCooldown = 0.8; // 1 drone every 0.8s launch rate

    const heading = ship.rotation.y;
    const carrierSpeed = Math.hypot(ship.velocity?.x || 0, ship.velocity?.z || 0) || (ship.speed || 0);
    // High-speed Catapult Launch Impulse: 38.0 units/s forward catapult launch burst
    const launchVelocity = Math.max(38.0, carrierSpeed + 30.0);

    // Launch position: directly in between the two forward rectangles (runway prongs) of the carrier hull model
    // Local model coordinates: twin prongs at x = -2.0 and x = +2.0, z = 0.0 to 4.8.
    // Central launch channel: localX = -0.4 / +0.4 (staggered), localY = 0.2 (deck height), localZ = 2.4 (center between the two forward rectangles).
    const localX = readyIndex % 2 === 0 ? -0.4 : 0.4;
    const localY = 0.2;
    const localZ = 2.4;

    const spawnPos = {
      x: ship.position.x + localX * Math.cos(heading) + localZ * Math.sin(heading),
      y: ship.position.y + localY,
      z: ship.position.z - localX * Math.sin(heading) + localZ * Math.cos(heading),
    };

    const entityInstanceId = `${droneStatus.id}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const droneEntity: ShipEntity = {
      id: entityInstanceId,
      name: `Interceptor Drone ${readyIndex + 1}`,
      isPlayer: false,
      isMinion: true,
      isLockable: true,
      is_lockable: true,
      team: ship.team || (ship.isPlayer ? 'alpha' : 'beta'),
      faction: ship.faction,
      shipClass: {
        ...PLAYABLE_SHIP_ARCHETYPES.micro_recon,
        maxHull: 50,
        maxSpeed: 9.6,
        turnRate: 180.0,
        acceleration: 12.0,
        mass: 200,
      },
      position: spawnPos,
      rotation: { x: 0, y: heading, z: 0 },
      velocity: {
        x: Math.sin(heading) * launchVelocity,
        y: 0,
        z: Math.cos(heading) * launchVelocity,
      },
      speed: launchVelocity,
      targetSpeed: 9.6,
      hull: 50,
      maxHull: 50,
      shields: {
        front: { current: 0, max: 0 },
        starboard: { current: 0, max: 0 },
        back: { current: 0, max: 0 },
        port: { current: 0, max: 0 },
      },
      subsystems: { weapons: 100, shields: 100, engines: 100, auxiliary: 100 },
      power: { weapons: 100, shields: 0, engines: 100, auxiliary: 0 },
      powerPreset: 'balanced',
      weapons: [
        {
          id: `drone_nose_laser_${entityInstanceId}`,
          name: 'Forward Nose Laser',
          type: 'phaser_beam',
          firingArc: 'forward_30',
          baseDamage: 18,
          cooldown: 3.0,
          currentCooldown: 0,
          energyCost: 0,
          range: 80,
          color: '#00f0ff',
          isTorpedo: false,
          soundName: 'phaser',
          arcAngleDegrees: 30, // 30° Nose Cone
          localFacingAngle: 0,
        },
      ],
      abilities: [],
      targetId: null,
      targetedSubsystem: null,
      isDestroyed: false,
    };

    droneStatus.entityId = droneEntity.id;
    this.enemies = this.enemies.filter((e) => e.id !== entityInstanceId && e.id !== droneStatus.id);
    this.enemies.push(droneEntity);

    this.createImpactSparks(spawnPos, '#00f0ff', 16);
    this.createImpactSparks(spawnPos, '#f59e0b', 8);

    soundManager.playPowerPreset();
    this.addLog(
      `DRONE LAUNCH: ${ship.name} deployed Interceptor Drone ${readyIndex + 1} from hangar bay!`,
      'ability',
      0,
      ship.isPlayer ? 'player' : 'enemy'
    );
    return true;
  }

  public setSwarmWaypoint(x: number, z: number, ship?: ShipEntity, targetEntityId?: string | null) {
    const carrier = ship || this.player;
    this.initHangarState(carrier);
    if (carrier.hangarState) {
      // Clamp waypoint within carrier's DRONE_CONTROL_RANGE
      const dx = x - carrier.position.x;
      const dz = z - carrier.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > DRONE_CONTROL_RANGE) {
        const scale = DRONE_CONTROL_RANGE / dist;
        x = carrier.position.x + dx * scale;
        z = carrier.position.z + dz * scale;
      }

      carrier.hangarState.swarmWaypoint = { x, z };
      carrier.hangarState.targetEntityId = targetEntityId || null;
      carrier.hangarState.isRecalled = false;
      this.addLog(
        `SWARM WAYPOINT: Interceptor Drones maneuvering to designated spatial target (${Math.round(x)}, ${Math.round(z)})!`,
        'system',
        0,
        carrier.isPlayer ? 'player' : 'enemy'
      );
    }
  }

  public recallSwarm(ship?: ShipEntity) {
    const carrier = ship || this.player;
    this.initHangarState(carrier);
    if (carrier.hangarState) {
      carrier.hangarState.isRecalled = true;
      carrier.hangarState.swarmWaypoint = null;
      carrier.hangarState.targetEntityId = null;
      this.addLog(
        `SWARM RECALL: Active Interceptor Drones returning to Mothership defensive orbit (15m radius)!`,
        'system',
        0,
        carrier.isPlayer ? 'player' : 'enemy'
      );
    }
  }

  public executeSwarmDetonation(carrier: ShipEntity): boolean {
    this.initHangarState(carrier);
    const hs = carrier.hangarState;
    if (!hs) return false;

    const activeDrones = hs.drones.filter((d) => d.state === 'active');
    if (activeDrones.length === 0) {
      if (carrier.isPlayer) {
        this.addLog('SWARM DETONATION FAILED: No active deployed drones available!', 'system');
        soundManager.playErrorAlert?.();
      }
      return false;
    }

    activeDrones.forEach((d) => {
      d.fuseTimer = 1.2; // 1.2 second fuse
      d.isDetonating = true;
    });

    this.addLog(
      `SWARM DETONATION INITIATED: ${carrier.name} overloaded fusion cores on ${activeDrones.length} drones (+40% speed)!`,
      'ability',
      0,
      carrier.isPlayer ? 'player' : 'enemy'
    );
    soundManager.playPowerPreset();
    return true;
  }

  private updateHangarAndDrones(delta: number) {
    const carrierShips = [this.player, ...this.enemies].filter(
      (s) =>
        !s.isDestroyed &&
        (s.shipClass.modelType === 'carrier' ||
          s.shipClass.id.includes('carrier') ||
          s.shipClass.id.includes('aegis') ||
          s.shipClass.id.includes('hive') ||
          !!s.hangarState)
    );

    carrierShips.forEach((carrier) => {
      this.initHangarState(carrier);
      const hs = carrier.hangarState;
      if (!hs) return;

      if (hs.launchCooldown > 0) {
        hs.launchCooldown -= delta;
      }

      // Subsystem Power Shunting Integration:
      // WEAPONS power (W %): At 100% W, drone rebuild time drops from 8.0s down to 4.0s (double rebuild rate).
      const weaponsPower = carrier.power?.weapons ?? 50;
      const rebuildSpeedRate = 1.0 + Math.max(0, (weaponsPower - 25) / 75.0);

      // 1. Process Hangar Rebuild Queue
      hs.drones.forEach((drone, slotIndex) => {
        if (drone.state === 'rebuilding' && drone.rebuildTimer !== undefined) {
          drone.rebuildTimer -= delta * rebuildSpeedRate;
          if (drone.rebuildTimer <= 0) {
            drone.state = 'docked';
            drone.hp = 50;
            delete drone.rebuildTimer;
            delete drone.entityId;
            delete drone.isDetonating;
            delete drone.fuseTimer;
            this.addLog(
              `HANGAR REBUILD COMPLETE: Interceptor Drone ${slotIndex + 1} ready for launch in bay!`,
              'system',
              0,
              carrier.isPlayer ? 'player' : 'enemy'
            );
          }
        }
      });

      // 2. Process Active Drones
      hs.drones.forEach((drone, slotIndex) => {
        if (drone.state !== 'active' || !drone.entityId) return;

        const droneEntity = this.enemies.find((e) => e.id === drone.entityId);

        // Check destruction from damage or collisions
        if (!droneEntity || droneEntity.isDestroyed || droneEntity.hull <= 0) {
          if (droneEntity) {
            droneEntity.isDestroyed = true;
            this.createExplosionParticles(droneEntity.position, 20);
          }
          drone.state = 'rebuilding';
          drone.rebuildTimer = 8.0;
          const deadId = drone.entityId;
          delete drone.entityId;
          delete drone.isDetonating;
          delete drone.fuseTimer;
          if (deadId) {
            this.enemies = this.enemies.filter((e) => e.id !== deadId);
          }
          this.addLog(
            `DRONE DESTROYED: Interceptor Drone ${slotIndex + 1} destroyed! Queueing 8.0s rebuild.`,
            'damage_hull',
            0,
            carrier.isPlayer ? 'player' : 'enemy'
          );
          return;
        }

        // Sync HP
        drone.hp = droneEntity.hull;

        // Waypoint & Target Destination Selection
        if (hs.targetEntityId) {
          const lockedTarget = [this.player, ...this.enemies].find(
            (e) => !e.isDestroyed && e.hull > 0 && e.id === hs.targetEntityId
          );
          if (lockedTarget) {
            // Calculate a 28m standoff orbit point around enemy target so drones circle & strafe without ramming
            const orbitAngle = (performance.now() / 2500 + slotIndex * (Math.PI / 3)) % (2 * Math.PI);
            const standoffDist = 28;
            hs.swarmWaypoint = {
              x: lockedTarget.position.x + Math.sin(orbitAngle) * standoffDist,
              z: lockedTarget.position.z + Math.cos(orbitAngle) * standoffDist,
            };
          } else {
            hs.targetEntityId = null;
          }
        }

        let targetX = carrier.position.x;
        let targetZ = carrier.position.z;

        const distToCarrier = Math.hypot(
          droneEntity.position.x - carrier.position.x,
          droneEntity.position.z - carrier.position.z
        );

        if (hs.isRecalled) {
          // Tight defensive orbit around Carrier (15m radius)
          const angle = (performance.now() / 1200 + slotIndex * (Math.PI / 3)) % (2 * Math.PI);
          targetX = carrier.position.x + Math.cos(angle) * 15;
          targetZ = carrier.position.z + Math.sin(angle) * 15;

          // Landing & Repair (Recall_Repair): Rapid repair at 20 HP/s inside/at bay when recalled
          if (distToCarrier <= 20 && droneEntity.hull < droneEntity.maxHull) {
            droneEntity.hull = Math.min(droneEntity.maxHull, droneEntity.hull + 20 * delta);
            drone.hp = droneEntity.hull;
          }
        } else if (hs.swarmWaypoint) {
          // Navigate to global Swarm Waypoint with slight formation spread
          const offsetX = ((slotIndex % 3) - 1) * 7;
          const offsetZ = (Math.floor(slotIndex / 3) - 0.5) * 7;
          targetX = hs.swarmWaypoint.x + offsetX;
          targetZ = hs.swarmWaypoint.z + offsetZ;
        } else {
          // Default rally point 25m ahead of Carrier
          const forwardHeading = carrier.rotation.y;
          const offsetX = ((slotIndex % 3) - 1) * 8;
          targetX = carrier.position.x + Math.sin(forwardHeading) * 25 + offsetX;
          targetZ = carrier.position.z + Math.cos(forwardHeading) * 25;
        }

        // Clamp target destination within Carrier's DRONE_CONTROL_RANGE ring
        const targetDx = targetX - carrier.position.x;
        const targetDz = targetZ - carrier.position.z;
        const targetDistFromCarrier = Math.hypot(targetDx, targetDz);
        if (targetDistFromCarrier > DRONE_CONTROL_RANGE - 5) {
          const scale = (DRONE_CONTROL_RANGE - 5) / targetDistFromCarrier;
          targetX = carrier.position.x + targetDx * scale;
          targetZ = carrier.position.z + targetDz * scale;
        }

        // Smooth Steering & Combat Target Acquisition
        const dx = targetX - droneEntity.position.x;
        const dz = targetZ - droneEntity.position.z;
        const distToTarget = Math.hypot(dx, dz);

        // Find potential closest enemy target within weapon range (100m) and within drone control range of carrier
        const droneTeam = droneEntity.team || 'alpha';
        const potentialTargets = [this.player, ...this.enemies].filter(
          (e) => {
            if (e.isDestroyed || e.hull <= 0 || e.id === droneEntity.id || (e.team || 'alpha') === droneTeam) return false;
            const distFromCarrier = Math.hypot(e.position.x - carrier.position.x, e.position.z - carrier.position.z);
            return distFromCarrier <= DRONE_CONTROL_RANGE + 15;
          }
        );
        let closestCombatTarget: ShipEntity | null = null;
        let closestCombatDist = 100;
        potentialTargets.forEach((t) => {
          const d = Math.hypot(t.position.x - droneEntity.position.x, t.position.z - droneEntity.position.z);
          if (d < closestCombatDist) {
            closestCombatDist = d;
            closestCombatTarget = t;
          }
        });

        // Determine heading and navigation
        let desiredHeading = Math.atan2(dx, dz);

        if (closestCombatTarget && (distToTarget < 15.0 || hs.targetEntityId)) {
          // Turn and lock nose weapons onto hostile target when in combat engagement range
          desiredHeading = Math.atan2(
            closestCombatTarget.position.x - droneEntity.position.x,
            closestCombatTarget.position.z - droneEntity.position.z
          );
        } else if (distToTarget < 3.0) {
          // Maintain current orientation when holding formation at destination
          desiredHeading = droneEntity.rotation.y;
        }

        let headingDiff = desiredHeading - droneEntity.rotation.y;
        while (headingDiff > Math.PI) headingDiff -= 2 * Math.PI;
        while (headingDiff < -Math.PI) headingDiff += 2 * Math.PI;

        const turnDeg = droneEntity.shipClass.turnRate || 180.0;
        const maxTurnRad = ((turnDeg * Math.PI) / 180) * delta; // Responsive 180°/s fighter turn rate
        droneEntity.rotation.y += Math.sign(headingDiff) * Math.min(Math.abs(headingDiff), maxTurnRad);

        // Movement: fly forward at operational flight speed toward assigned waypoint/target; hold standoff distance when close to target
        const baseSpeed = droneEntity.shipClass.maxSpeed || 9.6;
        let targetSpeed = baseSpeed;
        if (closestCombatTarget && !drone.isDetonating) {
          if (closestCombatDist <= 25) {
            targetSpeed = 0; // Hold standoff distance and strafe/fire from safe range
          } else if (closestCombatDist <= 80) {
            targetSpeed = baseSpeed * 0.35; // Slow down to 35% cruise speed when closing in
          }
        }

        if (droneEntity.speed > targetSpeed) {
          droneEntity.speed = Math.max(targetSpeed, droneEntity.speed - delta * 15.0);
        } else {
          droneEntity.speed = Math.min(targetSpeed, droneEntity.speed + delta * 10.0);
        }

        const moveSpeed = drone.isDetonating ? baseSpeed * 1.6 : droneEntity.speed;
        const moveDist = (distToTarget < 3.0 && !drone.isDetonating && !hs.targetEntityId && !closestCombatTarget)
          ? Math.min(distToTarget, moveSpeed * delta * 0.4)
          : moveSpeed * delta;

        if (moveDist > 0.001) {
          droneEntity.position.x += Math.sin(droneEntity.rotation.y) * moveDist;
          droneEntity.position.z += Math.cos(droneEntity.rotation.y) * moveDist;
        }

        // ANTI-RAMMING HULL REPULSION: Prevent drones from clipping into or ramming enemy ships
        if (!drone.isDetonating && closestCombatTarget) {
          const targetRadius = ShipCollisionHandler.getShipRadius(closestCombatTarget);
          const safeStandoffRadius = targetRadius + 10.0; // Keep at least 10m clear of enemy ship bounding box
          const curDistToEnemy = Math.hypot(
            droneEntity.position.x - closestCombatTarget.position.x,
            droneEntity.position.z - closestCombatTarget.position.z
          );
          if (curDistToEnemy < safeStandoffRadius && curDistToEnemy > 0.001) {
            const pushAngle = Math.atan2(
              droneEntity.position.x - closestCombatTarget.position.x,
              droneEntity.position.z - closestCombatTarget.position.z
            );
            droneEntity.position.x = closestCombatTarget.position.x + Math.sin(pushAngle) * safeStandoffRadius;
            droneEntity.position.z = closestCombatTarget.position.z + Math.cos(pushAngle) * safeStandoffRadius;
          }
        }

        // HARD BOUNDARY ENFORCEMENT: Drones cannot fly past the Drone Control Range Ring!
        const currentDistFromCarrier = Math.hypot(
          droneEntity.position.x - carrier.position.x,
          droneEntity.position.z - carrier.position.z
        );
        if (currentDistFromCarrier > DRONE_CONTROL_RANGE) {
          const angleFromCarrier = Math.atan2(
            droneEntity.position.x - carrier.position.x,
            droneEntity.position.z - carrier.position.z
          );
          droneEntity.position.x = carrier.position.x + Math.sin(angleFromCarrier) * DRONE_CONTROL_RANGE;
          droneEntity.position.z = carrier.position.z + Math.cos(angleFromCarrier) * DRONE_CONTROL_RANGE;
        }

        // 3. Swarm Detonation Fuse & Explosion Check
        if (drone.isDetonating && drone.fuseTimer !== undefined) {
          drone.fuseTimer -= delta;

          const enemyTarget = [this.player, ...this.enemies].find(
            (e) =>
              !e.isDestroyed &&
              e.id !== droneEntity.id &&
              (e.team || 'alpha') !== droneTeam &&
              Math.hypot(e.position.x - droneEntity.position.x, e.position.z - droneEntity.position.z) <= 12
          );

          if (drone.fuseTimer <= 0 || enemyTarget || (hs.swarmWaypoint && distToTarget <= 5)) {
            // DETONATE! 250 AoE Heavy Kinetic Damage in 10m blast radius
            this.createExplosionParticles(droneEntity.position, 35);
            soundManager.playExplosion?.();

            const potentialVictims = [this.player, ...this.enemies].filter(
              (e) => !e.isDestroyed && e.id !== droneEntity.id && (e.team || 'alpha') !== droneTeam
            );

            potentialVictims.forEach((victim) => {
              const dToVictim = Math.hypot(
                victim.position.x - droneEntity.position.x,
                victim.position.z - droneEntity.position.z
              );
              if (dToVictim <= 10) {
                this.applyDamage(droneEntity, victim, 250, 'torpedo_photon', victim.position);
              }
            });

            // Destroy drone & send to rebuild queue
            droneEntity.isDestroyed = true;
            drone.state = 'rebuilding';
            drone.rebuildTimer = 8.0;
            const detonatedId = drone.entityId;
            delete drone.entityId;
            delete drone.isDetonating;
            delete drone.fuseTimer;
            if (detonatedId) {
              this.enemies = this.enemies.filter((e) => e.id !== detonatedId);
            }

            this.addLog(
              `SWARM DETONATION: Interceptor Drone fusion core overload dealt 250 AoE Kinetic Damage!`,
              'damage_hull',
              250,
              carrier.isPlayer ? 'player' : 'enemy'
            );
            return;
          }
        }

        // 4. Drone Firing Logic (Forward 40° Nose-Cone Arc, Range 90m)
        if (!drone.isDetonating) {
          let closestTarget: ShipEntity | null = null;
          let closestDist = 90; // 90m range limit

          potentialTargets.forEach((t) => {
            const d = Math.hypot(t.position.x - droneEntity.position.x, t.position.z - droneEntity.position.z);
            if (d < closestDist) {
              closestDist = d;
              closestTarget = t;
            }
          });

          if (closestTarget) {
            const targetAngle = Math.atan2(
              closestTarget.position.x - droneEntity.position.x,
              closestTarget.position.z - droneEntity.position.z
            );
            let angleDiff = targetAngle - droneEntity.rotation.y;
            while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
            while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

            // Strict 30° Forward Arc (±15° = 0.2618 rads)
            if (Math.abs(angleDiff) <= 0.2618) {
              const noseWeapon = droneEntity.weapons[0];
              if (noseWeapon && noseWeapon.currentCooldown <= 0) {
                const cooldown = noseWeapon.cooldown || 3.0;
                this.fireWeapon(droneEntity, 0, closestTarget);
              }
            }
          }
        }
      });
    });
  }
}
