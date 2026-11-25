import { DirectionalShieldSystem, ShieldQuadrant } from './DirectionalShieldSystem';
import { ShipFlightController } from './ShipFlightController';
import { AsteroidObject } from './Asteroid';
import { Asteroid, ShieldArcKey, ShipEntity } from '../types';

/**
 * TUNING PARAMETERS FOR COLLISION PHYSICS & DAMAGE
 * 
 * Adjust these coefficients to tune collision lethality, surface sliding friction,
 * and impulse restitution during gameplay testing:
 */
export const COLLISION_TUNING = {
  /**
   * COLLISION_DAMAGE_COEFFICIENT:
   * Scales kinetic impact damage calculated as: Damage = Relative_Speed * (Mass / 100.0)
   * Set to 0.0 to disable collision damage while retaining physical bouncing and sliding dynamics.
   * Default: 0.0
   */
  COLLISION_DAMAGE_COEFFICIENT: 0.0,

  /**
   * SURFACE_FRICTION_MULTIPLIER:
   * Surface friction loss percentage (0.0 = frictionless ice, 1.0 = instant stop) when sliding on rock face.
   * - 0.35 reduces linear tangential velocity by 35% (retaining 65% sliding speed along surface tangent).
   * Default: 0.35 (35% surface friction loss)
   */
  SURFACE_FRICTION_MULTIPLIER: 0.35,

  /**
   * COLLISION_RESTITUTION:
   * Coefficient of restitution for ship-to-ship elasticity (0.0 = plastic/inelastic, 1.0 = springy bounce).
   * Default: 0.40 (heavy metallic impact feel)
   */
  COLLISION_RESTITUTION: 0.40,

  /**
   * MIN_COLLISION_DAMAGE_SPEED:
   * Minimum relative speed threshold (units/s) required to inflict collision damage.
   * Prevents minor resting contact from dealing continuous damage.
   * Default: 2.0 units/sec
   */
  MIN_COLLISION_DAMAGE_SPEED: 2.0,
};

export interface CollisionImpactEvent {
  sourceName: string;
  targetName: string;
  impactQuadrant: ShieldQuadrant;
  arcKey: ShieldArcKey;
  relativeSpeed: number;
  rawDamage: number;
  shieldDamageTaken: number;
  hullBleedDamage: number;
  isShieldCollapsed: boolean;
  isHullCritical: boolean;
  impactPoint: { x: number; y: number; z: number };
}

export class ShipCollisionHandler {
  /**
   * Returns estimated physical collision bounding radius for a ship based on model archetype
   */
  public static getShipRadius(ship: ShipEntity): number {
    switch (ship.shipClass.modelType) {
      case 'dreadnought': return 12.0;
      case 'boss_leviathan': return 16.0;
      case 'station': return 11.0;
      case 'carrier': return 14.0;
      case 'cruiser': return 8.5;
      case 'shield_breaker': return 7.5;
      case 'support': return 6.5;
      case 'escort': return 6.0;
      case 'interceptor': return 4.5;
      case 'micro_recon':
      case 'infrared_furtive': return 3.5;
      default: return 6.0;
    }
  }

  /**
   * Calculates a steering heading adjustment to prevent ships (especially AI) from colliding with asteroids.
   * @param ship The ship seeking a clear path
   * @param asteroids List of active asteroid obstacles
   * @param desiredHeading The intended navigation heading angle (radians)
   * @param lookaheadDistance Maximum distance to scan for asteroid threats (default: 45 units)
   * @returns { adjustedHeading: number; threatWeight: number } Modified heading angle and active threat severity (0 to 1)
   */
  public static calculateAsteroidAvoidanceHeading(
    ship: ShipEntity,
    asteroids: Asteroid[],
    desiredHeading: number,
    lookaheadDistance: number = 45
  ): { adjustedHeading: number; threatWeight: number } {
    const shipRadius = this.getShipRadius(ship);

    let avoidanceVecX = 0;
    let avoidanceVecZ = 0;
    let maxThreat = 0;

    asteroids.forEach((ast) => {
      if (ast.health !== undefined && ast.health <= 0) return;

      const dx = ast.position.x - ship.position.x;
      const dz = ast.position.z - ship.position.z;
      const dist = Math.hypot(dx, dz);

      const threatRadius = shipRadius + ast.radius + lookaheadDistance;

      if (dist < threatRadius && dist > 0) {
        // Forward direction vector of current ship orientation
        const fwdX = Math.sin(ship.rotation.y);
        const fwdZ = Math.cos(ship.rotation.y);

        // Unit vector from ship to asteroid center
        const toAstX = dx / dist;
        const toAstZ = dz / dist;

        // Dot product: positive if asteroid is ahead of ship
        const dotFwd = fwdX * toAstX + fwdZ * toAstZ;

        // Check if asteroid is in front sector (dot > -0.2) or very close
        const closeBuffer = shipRadius + ast.radius + 15;
        if (dotFwd > -0.2 || dist < closeBuffer) {
          // Threat weight increases as distance decreases
          const threat = Math.pow((threatRadius - dist) / threatRadius, 1.5);
          maxThreat = Math.max(maxThreat, threat);

          // Repulsion vector pointing away from asteroid
          let repX = -toAstX;
          let repZ = -toAstZ;

          // If asteroid is almost dead-ahead, nudge repulsion laterally relative to ship heading
          const cross = fwdX * toAstZ - fwdZ * toAstX;
          if (Math.abs(cross) < 0.15) {
            const sideX = -fwdZ;
            const sideZ = fwdX;
            const sign = cross >= 0 ? -1 : 1;
            repX += sideX * sign * 0.9;
            repZ += sideZ * sign * 0.9;
          }

          avoidanceVecX += repX * threat * 3.0;
          avoidanceVecZ += repZ * threat * 3.0;
        }
      }
    });

    if (maxThreat > 0.05) {
      const desiredWeight = Math.max(0.1, 1.0 - maxThreat * 1.3);
      const desiredVecX = Math.sin(desiredHeading) * desiredWeight;
      const desiredVecZ = Math.cos(desiredHeading) * desiredWeight;

      const totalX = desiredVecX + avoidanceVecX;
      const totalZ = desiredVecZ + avoidanceVecZ;

      const adjustedHeading = Math.atan2(totalX, totalZ);
      return { adjustedHeading, threatWeight: maxThreat };
    }

    return { adjustedHeading: desiredHeading, threatWeight: 0 };
  }

  /**
   * Calculates a steering heading adjustment to discourage AI ships from ramming allied or nearby vessels.
   */
  public static calculateShipAvoidanceHeading(
    ship: ShipEntity,
    otherShips: ShipEntity[],
    desiredHeading: number,
    lookaheadDistance: number = 36
  ): { adjustedHeading: number; threatWeight: number } {
    const shipRadius = this.getShipRadius(ship);
    const shipTeam = ship.team || (ship.isPlayer ? 'alpha' : 'beta');

    let avoidanceVecX = 0;
    let avoidanceVecZ = 0;
    let maxThreat = 0;

    const fwdX = Math.sin(ship.rotation.y);
    const fwdZ = Math.cos(ship.rotation.y);
    const desX = Math.sin(desiredHeading);
    const desZ = Math.cos(desiredHeading);

    otherShips.forEach((other) => {
      if (!other || other.isDestroyed || other.id === ship.id || other.id.includes('_drone_') || other.isMinion) return;

      const otherTeam = other.team || (other.isPlayer ? 'alpha' : 'beta');
      const isAlly = otherTeam === shipTeam;
      if (!isAlly) return;

      const otherRadius = this.getShipRadius(other);
      const dx = other.position.x - ship.position.x;
      const dz = other.position.z - ship.position.z;
      const dist = Math.hypot(dx, dz);

      const threatRadius = shipRadius + otherRadius + lookaheadDistance;
      const closeBuffer = shipRadius + otherRadius + 16;

      if (dist < threatRadius && dist > 0.01) {
        const toOtherX = dx / dist;
        const toOtherZ = dz / dist;

        const dotFwd = fwdX * toOtherX + fwdZ * toOtherZ;
        const dotDesired = desX * toOtherX + desZ * toOtherZ;

        if (dotFwd > -0.2 || dotDesired > 0.2 || dist < closeBuffer) {
          const threat = Math.pow((threatRadius - dist) / threatRadius, 1.35);
          maxThreat = Math.max(maxThreat, threat);

          let repX = -toOtherX;
          let repZ = -toOtherZ;

          // Sidestep laterally when heading directly toward an ally so ships bank cleanly around each other
          const cross = desX * toOtherZ - desZ * toOtherX;
          if (Math.abs(cross) < 0.35) {
            const sideX = -desZ;
            const sideZ = desX;
            const sign = cross >= 0 ? -1 : 1;
            repX += sideX * sign * 1.15;
            repZ += sideZ * sign * 1.15;
            const repLen = Math.hypot(repX, repZ) || 1;
            repX /= repLen;
            repZ /= repLen;
          }

          avoidanceVecX += repX * threat * 4.2;
          avoidanceVecZ += repZ * threat * 4.2;
        }
      }
    });

    if (maxThreat > 0.04) {
      const desiredWeight = Math.max(0.08, 1.0 - maxThreat * 1.35);
      const totalX = desX * desiredWeight + avoidanceVecX;
      const totalZ = desZ * desiredWeight + avoidanceVecZ;
      return {
        adjustedHeading: Math.atan2(totalX, totalZ),
        threatWeight: maxThreat,
      };
    }

    return { adjustedHeading: desiredHeading, threatWeight: 0 };
  }

  /**
   * Calculates predictive target lead heading and position for unguided projectile interception (e.g. torpedoes).
   * Solves quadratic velocity interception vector to land direct torpedo hits on moving targets.
   * @param shooterPos Origin position of shooter
   * @param targetPos Current position of target
   * @param targetVel Linear velocity vector of target (units/s)
   * @param projectileSpeed Speed of launched projectile (e.g. 45 units/s)
   * @returns { leadHeading: number, leadPosition: { x: number, y: number, z: number }, timeToIntercept: number }
   */
  public static calculatePredictiveLeadHeading(
    shooterPos: { x: number; y: number; z: number },
    targetPos: { x: number; y: number; z: number },
    targetVel: { x: number; z: number },
    projectileSpeed: number = 45
  ): {
    leadHeading: number;
    leadPosition: { x: number; y: number; z: number };
    timeToIntercept: number;
  } {
    const dx = targetPos.x - shooterPos.x;
    const dz = targetPos.z - shooterPos.z;
    const dist = Math.hypot(dx, dz) || 1;

    const vx = targetVel.x || 0;
    const vz = targetVel.z || 0;

    // Quadratic equation coefficients for interception: A t^2 + B t + C = 0
    const A = vx * vx + vz * vz - projectileSpeed * projectileSpeed;
    const B = 2 * (dx * vx + dz * vz);
    const C = dx * dx + dz * dz;

    let t = 0;
    if (Math.abs(A) > 1e-4) {
      const disc = B * B - 4 * A * C;
      if (disc >= 0) {
        const t1 = (-B - Math.sqrt(disc)) / (2 * A);
        const t2 = (-B + Math.sqrt(disc)) / (2 * A);
        if (t1 > 0 && t2 > 0) {
          t = Math.min(t1, t2);
        } else if (t1 > 0) {
          t = t1;
        } else if (t2 > 0) {
          t = t2;
        }
      }
    }

    // Fallback if no valid positive root (e.g. target too fast or stationary)
    if (t <= 0) {
      t = dist / projectileSpeed;
    }

    // Clamp max lead time (e.g. max 4.0 seconds lead prediction)
    t = Math.min(t, 4.0);

    const leadX = targetPos.x + vx * t;
    const leadZ = targetPos.z + vz * t;
    const leadHeading = Math.atan2(leadX - shooterPos.x, leadZ - shooterPos.z);

    return {
      leadHeading,
      leadPosition: { x: leadX, y: targetPos.y, z: leadZ },
      timeToIntercept: t,
    };
  }

  /**
   * SECTION 1: IMPACT ANGLE & SHIELD QUADRANT ROUTING
   * 
   * Calculates relative impact vector angle relative to ship's local forward transformation
   * and routes impact damage to the appropriate Shield Quadrant or bare Hull.
   */
  public static calculateRelativeImpactAngle(
    ship: ShipEntity,
    impactSourcePos: { x: number; y: number; z: number }
  ): { relativeAngleRad: number; relativeAngleDeg: number } {
    const dx = impactSourcePos.x - ship.position.x;
    const dz = impactSourcePos.z - ship.position.z;

    // World bearing angle from ship center to collision impact point
    const bearingToImpact = Math.atan2(dx, dz);

    // Angle relative to ship local forward heading (0° = Nose/Fore)
    let relativeAngleRad = bearingToImpact - ship.rotation.y;
    // Normalize relative angle to [-PI, +PI]
    relativeAngleRad = Math.atan2(Math.sin(relativeAngleRad), Math.cos(relativeAngleRad));
    const relativeAngleDeg = (relativeAngleRad * 180) / Math.PI;

    return { relativeAngleRad, relativeAngleDeg };
  }

  /**
   * Maps relative impact angle (-180° to +180°) to one of four Shield Quadrants
   * - Fore:      -45° to +45°
   * - Starboard: +45° to +135°
   * - Aft:       +135° to +180° / -180° to -135°
   * - Port:      -135° to -45°
   */
  public static mapAngleToShieldQuadrant(relativeAngleDeg: number): {
    quadrant: ShieldQuadrant;
    arcKey: ShieldArcKey;
  } {
    let quadrant: ShieldQuadrant;
    let arcKey: ShieldArcKey;

    if (relativeAngleDeg >= -45 && relativeAngleDeg <= 45) {
      quadrant = ShieldQuadrant.FORE;
      arcKey = 'front';
    } else if (relativeAngleDeg > 45 && relativeAngleDeg < 135) {
      quadrant = ShieldQuadrant.PORT;
      arcKey = 'port';
    } else if (relativeAngleDeg >= 135 || relativeAngleDeg <= -135) {
      quadrant = ShieldQuadrant.AFT;
      arcKey = 'back';
    } else {
      quadrant = ShieldQuadrant.STARBOARD;
      arcKey = 'starboard';
    }

    return { quadrant, arcKey };
  }

  /**
   * Executes damage routing pipeline on a ship entity from collision impact
   * Formula: Damage = Relative_Speed * (Mass / 100.0) * COLLISION_DAMAGE_COEFFICIENT
   */
  public static applyCollisionDamage(
    ship: ShipEntity,
    colliderMass: number,
    relativeSpeed: number,
    impactPoint: { x: number; y: number; z: number },
    logCallback?: (msg: string, type?: 'system' | 'damage_shield' | 'damage_hull' | 'ability' | 'kill') => void
  ): CollisionImpactEvent | null {
    if (COLLISION_TUNING.COLLISION_DAMAGE_COEFFICIENT <= 0) {
      return null;
    }

    if (relativeSpeed < COLLISION_TUNING.MIN_COLLISION_DAMAGE_SPEED) {
      return null;
    }

    // Kinetic impact damage formula
    const rawDamage = Math.round(
      relativeSpeed * (colliderMass / 100.0) * COLLISION_TUNING.COLLISION_DAMAGE_COEFFICIENT
    );

    if (rawDamage <= 0) return null;

    // Determine impact quadrant relative to ship's orientation
    const { relativeAngleDeg } = this.calculateRelativeImpactAngle(ship, impactPoint);
    const { quadrant, arcKey } = this.mapAngleToShieldQuadrant(relativeAngleDeg);

    // Apply directional shield damage or hull bleed-through
    const shieldResult = DirectionalShieldSystem.applyDirectionalDamage(
      ship,
      rawDamage,
      arcKey,
      quadrant
    );

    const isHullCritical = shieldResult.hullBleedDamage > 0;

    // Trigger HULL_COLLISION_CRITICAL event if shield was collapsed and direct hull damage was inflicted
    if (isHullCritical) {
      const critMsg = `[HULL_COLLISION_CRITICAL] ${ship.name} suffered ${Math.round(
        shieldResult.hullBleedDamage
      )} direct hull damage on ${quadrant} sector! Hull remaining: ${Math.round(ship.hull)}/${ship.maxHull}`;
      logCallback?.(critMsg, 'damage_hull');
    } else {
      logCallback?.(
        `[COLLISION] ${ship.name} ${quadrant} shield absorbed ${Math.round(
          shieldResult.shieldDamageTaken
        )} impact damage (Speed: ${relativeSpeed.toFixed(1)} u/s)`,
        'damage_shield'
      );
    }

    return {
      sourceName: 'Environment/Collider',
      targetName: ship.name,
      impactQuadrant: quadrant,
      arcKey,
      relativeSpeed,
      rawDamage,
      shieldDamageTaken: shieldResult.shieldDamageTaken,
      hullBleedDamage: shieldResult.hullBleedDamage,
      isShieldCollapsed: shieldResult.isShieldCollapsed,
      isHullCritical,
      impactPoint,
    };
  }

  /**
   * SECTION 2: SHIP-TO-ASTEROID COLLISION (ENVIRONMENTAL SLIDING)
   * 
   * Prevents bouncy billiard-ball physics against static asteroid obstacles:
   * 1. Projects linear velocity onto surface tangent plane (`Velocity.Slide(Normal)`).
   * 2. Reduces velocity by 35% (SURFACE_FRICTION_MULTIPLIER) creating heavy scraping effect.
   * 3. Calculates normal velocity impact for directional shield damage.
   * 4. Repositions ship outside asteroid radius + collision margin.
   */
  public static handleShipAsteroidCollision(
    ship: ShipEntity,
    asteroid: Asteroid | AsteroidObject,
    delta: number,
    logCallback?: (msg: string, type?: 'system' | 'damage_shield' | 'damage_hull' | 'ability' | 'kill') => void
  ): boolean {
    const dx = ship.position.x - asteroid.position.x;
    const dz = ship.position.z - asteroid.position.z;
    const dist = Math.hypot(dx, dz);

    const shipRadius = this.getShipRadius(ship);
    const minDist = shipRadius + asteroid.radius;

    if (dist >= minDist || dist === 0) {
      return false; // No collision contact
    }

    // 1. Calculate collision plane normal vector (pointing outwards from asteroid center to ship center)
    const nx = dx / dist;
    const nz = dz / dist;

    // Reposition ship strictly outside asteroid sphere collider to prevent geometry overlap
    const clearanceMargin = 0.15;
    ship.position.x = asteroid.position.x + nx * (minDist + clearanceMargin);
    ship.position.z = asteroid.position.z + nz * (minDist + clearanceMargin);

    // 2. Retrieve flight physics state (linear velocity drift vector)
    const flight = ShipFlightController.getFlightState(ship);
    const V = flight.linearVelocity;

    // Normal velocity component (dot product V . N)
    const vNormal = V.x * nx + V.z * nz;

    // Impact speed along normal vector (speed at which ship hit asteroid wall)
    const impactSpeed = Math.abs(vNormal);

    // If moving into the asteroid, project onto tangent surface & apply surface friction
    if (vNormal < 0) {
      // Tangent sliding vector: V_tangent = V - Normal * (V . Normal)
      const tangentX = V.x - vNormal * nx;
      const tangentZ = V.z - vNormal * nz;

      // Surface friction reduction (e.g. 0.35 friction loss = 0.65 retention factor)
      const frictionRetention = Math.max(0, 1.0 - COLLISION_TUNING.SURFACE_FRICTION_MULTIPLIER);
      
      flight.linearVelocity.x = tangentX * frictionRetention;
      flight.linearVelocity.z = tangentZ * frictionRetention;

      // Update scalar ship speed from sliding linear velocity
      ship.speed = Math.hypot(flight.linearVelocity.x, flight.linearVelocity.z);
    }

    // 3. Apply kinetic impact damage using asteroid mass
    const asteroidMass = asteroid.mass || Math.round(Math.pow(asteroid.radius, 2.5) * 45);
    const impactPoint = {
      x: asteroid.position.x + nx * asteroid.radius,
      y: ship.position.y,
      z: asteroid.position.z + nz * asteroid.radius,
    };

    if (impactSpeed >= COLLISION_TUNING.MIN_COLLISION_DAMAGE_SPEED) {
      this.applyCollisionDamage(ship, asteroidMass, impactSpeed, impactPoint, logCallback);

      // Emit collision signal if Asteroid is an AsteroidObject instance for sound/spark FX
      if (asteroid instanceof AsteroidObject) {
        asteroid.emitCollisionSignal(ship.name, impactSpeed * (ship.shipClass.mass || 1000) / 100, impactPoint);
      }
    }

    return true;
  }

  /**
   * SECTION 3: SHIP-TO-SHIP COLLISION (MASS RATIO IMPULSE)
   * 
   * Mass-Proportional Momentum Transfer:
   * - Heavier ship (e.g., Dreadnought 3,800 kg) pushes lighter ship (e.g., Dragoon 750 kg) with minimal loss of speed.
   * - Lighter ship receives proportional velocity impulse pushing it away along contact normal vector.
   * - Executes dual-damage application on both ships' respective impacted shield quadrants.
   */
  public static handleShipShipCollision(
    shipA: ShipEntity,
    shipB: ShipEntity,
    delta: number,
    logCallback?: (msg: string, type?: 'system' | 'damage_shield' | 'damage_hull' | 'ability' | 'kill') => void
  ): boolean {
    if (shipA.isDestroyed || shipB.isDestroyed) return false;

    // Allied drones/minions do not collide with friendly fleet or each other
    if (shipA.team && shipB.team && shipA.team === shipB.team) {
      if (shipA.isMinion || shipB.isMinion) {
        return false;
      }
    }

    const dx = shipB.position.x - shipA.position.x;
    const dz = shipB.position.z - shipA.position.z;
    const dist = Math.hypot(dx, dz);

    const radiusA = this.getShipRadius(shipA);
    const radiusB = this.getShipRadius(shipB);
    const minDist = radiusA + radiusB;

    if (dist >= minDist || dist === 0) {
      return false; // No contact
    }

    // Contact normal vector from ship A to ship B
    const nx = dx / dist;
    const nz = dz / dist;

    // 1. Mass-proportional positional separation to eliminate physical overlap
    const flightA = ShipFlightController.getFlightState(shipA);
    const flightB = ShipFlightController.getFlightState(shipB);

    const massA = flightA.mass || shipA.shipClass.mass || 1500;
    const massB = flightB.mass || shipB.shipClass.mass || 1500;
    const totalMass = massA + massB;

    const stationaryA =
      shipA.raidRole === 'boss' ||
      shipA.shipClass.modelType === 'boss_leviathan' ||
      shipA.shipClass.modelType === 'station' ||
      shipA.shipClass.maxSpeed === 0;
    const stationaryB =
      shipB.raidRole === 'boss' ||
      shipB.shipClass.modelType === 'boss_leviathan' ||
      shipB.shipClass.modelType === 'station' ||
      shipB.shipClass.maxSpeed === 0;

    const overlap = minDist - dist;
    if (stationaryA && !stationaryB) {
      shipB.position.x += nx * overlap;
      shipB.position.z += nz * overlap;
    } else if (stationaryB && !stationaryA) {
      shipA.position.x -= nx * overlap;
      shipA.position.z -= nz * overlap;
    } else if (!stationaryA && !stationaryB) {
      // Pushes lighter ship away faster: Ship A shift = overlap * (massB / totalMass)
      shipA.position.x -= nx * overlap * (massB / totalMass);
      shipA.position.z -= nz * overlap * (massB / totalMass);
      shipB.position.x += nx * overlap * (massA / totalMass);
      shipB.position.z += nz * overlap * (massA / totalMass);
    }

    // 2. Mass Ratio Momentum & Impulse Transfer
    const vRelX = flightA.linearVelocity.x - flightB.linearVelocity.x;
    const vRelZ = flightA.linearVelocity.z - flightB.linearVelocity.z;

    // Normal velocity component (positive means approaching each other)
    const vNormal = vRelX * nx + vRelZ * nz;

    if (vNormal > 0) {
      // Impulse magnitude scalar J = (1 + e) * v_normal / (1/m_A + 1/m_B)
      const e = COLLISION_TUNING.COLLISION_RESTITUTION;
      const invMassA = stationaryA ? 0 : 1 / massA;
      const invMassB = stationaryB ? 0 : 1 / massB;
      const invMassSum = invMassA + invMassB;
      if (invMassSum > 0) {
        const impulseJ = ((1 + e) * vNormal) / invMassSum;

        // Apply mass-proportional impulse vector
        const impulseX = impulseJ * nx;
        const impulseZ = impulseJ * nz;

        if (!stationaryA) {
          flightA.linearVelocity.x -= impulseX * invMassA;
          flightA.linearVelocity.z -= impulseZ * invMassA;
          shipA.speed = Math.hypot(flightA.linearVelocity.x, flightA.linearVelocity.z);
        }
        if (!stationaryB) {
          flightB.linearVelocity.x += impulseX * invMassB;
          flightB.linearVelocity.z += impulseZ * invMassB;
          shipB.speed = Math.hypot(flightB.linearVelocity.x, flightB.linearVelocity.z);
        }
      }

      // 3. Dual-Damage Application
      const contactPoint = {
        x: shipA.position.x + nx * radiusA,
        y: shipA.position.y,
        z: shipA.position.z + nz * radiusA,
      };

      const relativeImpactSpeed = Math.abs(vNormal);

      // Ship A takes damage from colliding with Ship B's mass
      this.applyCollisionDamage(shipA, massB, relativeImpactSpeed, contactPoint, logCallback);
      // Ship B takes damage from colliding with Ship A's mass
      this.applyCollisionDamage(shipB, massA, relativeImpactSpeed, contactPoint, logCallback);
    }

    return true;
  }

  /**
   * Main collision pipeline pass: checks all active ship-to-asteroid and ship-to-ship collisions
   */
  public static processAllCollisions(
    ships: ShipEntity[],
    asteroids: Asteroid[],
    delta: number,
    logCallback?: (msg: string, type?: 'system' | 'damage_shield' | 'damage_hull' | 'ability' | 'kill') => void
  ) {
    const activeShips = ships.filter((s) => !s.isDestroyed);

    // 1. Ship-to-Asteroid collisions
    activeShips.forEach((ship) => {
      asteroids.forEach((ast) => {
        if (ast.health === undefined || ast.health > 0) {
          this.handleShipAsteroidCollision(ship, ast, delta, logCallback);
        }
      });
    });

    // 2. Ship-to-Ship collisions
    for (let i = 0; i < activeShips.length; i++) {
      for (let j = i + 1; j < activeShips.length; j++) {
        this.handleShipShipCollision(activeShips[i], activeShips[j], delta, logCallback);
      }
    }
  }
}
