import * as THREE from 'three';
import { ShipEntity } from '../types';

export enum SpeedStep {
  SLOW_REVERSE = -1, // Reverse (-25% Throttle)
  FULL_STOP = 0,     // 0% Throttle
  QUARTER_SPEED = 1, // 25% Throttle
  HALF_SPEED = 2,    // 50% Throttle
  FULL_SPEED = 3,    // 100% Throttle
}

export interface FlightState {
  mass: number;                // Heavy inertia scalar (kg / mass units)
  speedStep: SpeedStep;        // Discrete 4-step throttle
  linearVelocity: { x: number; y: number; z: number }; // World drift momentum vector
  angularVelocity: number;     // Current rotational velocity (rad/s)
  targetAngularVelocity: number;
  engineInhibitorTimer: number; // Stasis webifier / turn-rate slow debuff timer
  mineDropperCooldown: number;  // Rear EMP mine deployer timer
}

export class ShipFlightController {
  /**
   * Initializes flight physics parameters on a ship entity based on ship archetype mass
   */
  public static initFlightState(ship: ShipEntity): FlightState {
    const archetypeMass = ship.shipClass.mass || (
      ship.shipClass.modelType === 'dreadnought' ? 3500 :
      ship.shipClass.modelType === 'carrier' ? 2800 :
      ship.shipClass.modelType === 'shield_breaker' ? 1600 :
      ship.shipClass.modelType === 'interceptor' ? 800 :
      (ship.shipClass.modelType === 'micro_recon' || ship.shipClass.modelType === 'infrared_furtive') ? 400 : 1800
    );

    const state: FlightState = {
      mass: archetypeMass,
      speedStep: SpeedStep.FULL_STOP,
      linearVelocity: { x: 0, y: 0, z: 0 },
      angularVelocity: 0,
      targetAngularVelocity: 0,
      engineInhibitorTimer: 0,
      mineDropperCooldown: 0,
    };
    (ship as any).flightState = state;
    return state;
  }

  /**
   * Retrieves or initializes flight state for a ship entity
   */
  public static getFlightState(ship: ShipEntity): FlightState {
    if (!(ship as any).flightState) {
      return this.initFlightState(ship);
    }
    return (ship as any).flightState;
  }

  /**
   * Sets discrete speed step throttle (Reverse -25%, 0%, 25%, 50%, 100%)
   */
  public static setSpeedStep(ship: ShipEntity, step: SpeedStep) {
    const flight = this.getFlightState(ship);
    flight.speedStep = step;

    const maxSpeed = ship.shipClass.maxSpeed;
    switch (step) {
      case SpeedStep.SLOW_REVERSE:
        ship.targetSpeed = -maxSpeed * 0.25;
        break;
      case SpeedStep.FULL_STOP:
        ship.targetSpeed = 0;
        break;
      case SpeedStep.QUARTER_SPEED:
        ship.targetSpeed = maxSpeed * 0.25;
        break;
      case SpeedStep.HALF_SPEED:
        ship.targetSpeed = maxSpeed * 0.5;
        break;
      case SpeedStep.FULL_SPEED:
        ship.targetSpeed = maxSpeed;
        break;
    }
  }

  /**
   * Applies Stasis Webifier / Engine Inhibitor utility debuff
   * Reduces speed and turn rate by 60% for the specified duration (default 4s)
   */
  public static applyEngineInhibitor(ship: ShipEntity, durationSeconds: number = 4) {
    const flight = this.getFlightState(ship);
    flight.engineInhibitorTimer = Math.max(flight.engineInhibitorTimer, durationSeconds);
  }

  /**
   * Vector Dragoon Active Utility: Vector_Burst()
   * 1. Instantly sets current linear velocity vector to ZERO (clears active drift momentum).
   * 2. Applies an immediate high-impulse thrust boost (25 m/s) in active directional keyboard input direction ([A], [D], [S], or [W]).
   * 3. Gives a 0.2-second invulnerability frame (I-Frame) to dodge incoming heavy projectiles.
   * 4. Triggers engine flare visual effects and a dynamic camera field-of-view (FOV) kickback.
   */
  public static executeVectorBurst(
    ship: ShipEntity,
    directionKey?: { x: number; z: number }
  ): { previousSpeed: number; boostDirectionDeg: number } {
    const flight = this.getFlightState(ship);
    const previousSpeed = ship.speed;

    // 1. Instantly halt active linear velocity & drift momentum
    flight.linearVelocity = { x: 0, y: 0, z: 0 };

    // 2. Compute impulse direction vector (25 m/s boost)
    let moveDirX = Math.sin(ship.rotation.y);
    let moveDirZ = Math.cos(ship.rotation.y);

    if (directionKey && (directionKey.x !== 0 || directionKey.z !== 0)) {
      const len = Math.hypot(directionKey.x, directionKey.z);
      if (len > 0.01) {
        const normX = directionKey.x / len;
        const normZ = directionKey.z / len;
        // Rotate relative direction by ship's orientation (rotation.y)
        const cosY = Math.cos(ship.rotation.y);
        const sinY = Math.sin(ship.rotation.y);
        moveDirX = normX * cosY + normZ * sinY;
        moveDirZ = -normX * sinY + normZ * cosY;
      }
    }

    const boostSpeed = 25.0; // 25 m/s impulse boost
    flight.linearVelocity = {
      x: moveDirX * boostSpeed,
      y: 0,
      z: moveDirZ * boostSpeed,
    };
    ship.speed = boostSpeed;
    ship.targetSpeed = boostSpeed;

    // 3. 0.2-second Invulnerability Frame (I-Frame)
    ship.iFrameTimer = 0.2;

    // 4. Trigger engine flare & FOV kickback flag on ship
    (ship as any).fovKickbackTimer = 0.45;
    (ship as any).engineFlareBurstTimer = 0.5;

    const boostAngleRad = Math.atan2(moveDirX, moveDirZ);
    const boostDirectionDeg = Math.round((boostAngleRad * 180) / Math.PI);

    return { previousSpeed, boostDirectionDeg };
  }

  /**
   * Core EVE-Style Momentum & Heavy Inertia Physics Tick
   * 
   * Physics Features:
   * 1. Linear Mass & Acceleration: Ships accelerate slowly based on mass-to-thrust ratio and drift on deceleration.
   * 2. Yaw Lerp & Rotational Inertia: Rotational speed smoothly ramps up/down.
   * 3. Overshoot Dynamics: High speed widens turn radius; 10-35% throttle gives maximum RCS turn rate.
   * 4. Speed Steps & Inhibitor Debuffs.
   */
  public static updateFlightPhysics(ship: ShipEntity, delta: number) {
    const flight = this.getFlightState(ship);

    if (
      ship.raidRole === 'boss' ||
      ship.shipClass.modelType === 'boss_leviathan' ||
      (ship.shipClass.maxSpeed === 0 && ship.shipClass.turnRate === 0)
    ) {
      ship.speed = 0;
      ship.targetSpeed = 0;
      ship.targetAngularVelocity = 0;
      ship.waypoint = null;
      flight.linearVelocity.x = 0;
      flight.linearVelocity.z = 0;
      flight.angularVelocity = 0;
      return;
    }

    // 1. Tick Utility Timers
    if (flight.engineInhibitorTimer > 0) {
      flight.engineInhibitorTimer = Math.max(0, flight.engineInhibitorTimer - delta);
    }
    if (flight.mineDropperCooldown > 0) {
      flight.mineDropperCooldown = Math.max(0, flight.mineDropperCooldown - delta);
    }

    const isInhibited = flight.engineInhibitorTimer > 0;
    const inhibitorMultiplier = isInhibited ? 0.4 : 1.0; // 60% penalty when engine inhibited

    // 2. Subsystem & Power Factors
    const pMods = ship.powerController ? ship.powerController.getModifiers() : null;
    const topSpeedPowerMult = pMods ? pMods.engineTopSpeedMult : (0.5 + (ship.power.engines / 100) * 0.8);
    const accelPowerMult = pMods ? pMods.engineAccelMult : 1.0;
    const turnRatePowerMult = pMods ? pMods.engineTurnRateMult : (0.6 + (ship.power.engines / 100) * 0.5);

    const enginePowerFactor = topSpeedPowerMult * (ship.subsystems.engines / 100);
    const evasiveSpeedMult = (ship.evasiveActiveTimer && ship.evasiveActiveTimer > 0) ? 1.75 : 1.0;
    
    const effectiveMaxSpeed = Math.max(
      1,
      ship.shipClass.maxSpeed * enginePowerFactor * evasiveSpeedMult * inhibitorMultiplier
    );

    const minReverseSpeed = -effectiveMaxSpeed * 0.25;

    const targetSpeed = Math.max(
      minReverseSpeed,
      Math.min(ship.targetSpeed, effectiveMaxSpeed)
    );

    // 3. Acceleration & Mass Mechanics (Mass-dependent thrust lerp)
    const baseAccel = ship.shipClass.acceleration * inhibitorMultiplier * accelPowerMult;
    const accelRate = (baseAccel * 1000) / flight.mass; // Heavy ships take longer to reach top speed

    if (ship.speed < targetSpeed) {
      ship.speed = Math.min(targetSpeed, ship.speed + accelRate * 10 * delta);
    } else if (ship.speed > targetSpeed) {
      // Drags to stop or accelerates into reverse
      ship.speed = Math.max(targetSpeed, ship.speed - accelRate * 7 * delta);
    }

    // 4. Yaw / Rotational Speed Interpolation & Overshoot Dynamics
    const maxTurnRateRad = (ship.shipClass.turnRate * Math.PI) / 180;
    const speedRatio = Math.min(1.0, Math.max(0, Math.abs(ship.speed) / Math.max(1, effectiveMaxSpeed)));

    // Overshoot Dynamics: At 10%-35% speed, RCS maneuvering thrusters give highest turn rate.
    // At high linear speed (>50%), linear momentum widens turn radius (overshoot drift).
    let speedTurnFactor = 1.0;
    if (speedRatio <= 0.35) {
      speedTurnFactor = 1.0 + (speedRatio / 0.35) * 0.45; // Optimal RCS maneuvering band
    } else {
      speedTurnFactor = 1.45 - ((speedRatio - 0.35) / 0.65) * 0.65; // High speed momentum overshoot
    }

    // Waypoint Navigation Autopilot (MOBA / Point-and-Click movement)
    if (ship.waypoint) {
      const dx = ship.waypoint.x - ship.position.x;
      const dz = ship.waypoint.z - ship.position.z;
      const distToWaypoint = Math.hypot(dx, dz);

      if (distToWaypoint < 5.5) {
        ship.waypoint = null;
        ship.targetAngularVelocity = 0;
      } else {
        const targetYaw = Math.atan2(dx, dz);
        let angleDiff = targetYaw - ship.rotation.y;
        angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));

        ship.targetAngularVelocity = Math.sign(angleDiff) * Math.min(maxTurnRateRad, Math.abs(angleDiff) * 3.2);

        // Engage full speed toward waypoint
        if (ship.targetSpeed <= 0 || flight.speedStep <= SpeedStep.FULL_STOP) {
          ship.targetSpeed = ship.shipClass.maxSpeed;
          this.setSpeedStep(ship, SpeedStep.FULL_SPEED);
        }
      }
    }

    const evasiveTurnMult = (ship.evasiveActiveTimer && ship.evasiveActiveTimer > 0) ? 0.58 : 1.0;
    const turnRateMult = evasiveTurnMult * turnRatePowerMult * (ship.subsystems.engines / 100) * speedTurnFactor * inhibitorMultiplier;

    const clampedTargetAngular = Math.max(
      -maxTurnRateRad * turnRateMult,
      Math.min(maxTurnRateRad * turnRateMult, ship.targetAngularVelocity || 0)
    );

    // Rotational inertia smooth lerp (heavy ships turn deliberately)
    const angularAccel = 1.2 * (1500 / flight.mass);
    if (flight.angularVelocity < clampedTargetAngular) {
      flight.angularVelocity = Math.min(clampedTargetAngular, flight.angularVelocity + angularAccel * delta);
    } else if (flight.angularVelocity > clampedTargetAngular) {
      flight.angularVelocity = Math.max(clampedTargetAngular, flight.angularVelocity - angularAccel * delta);
    }

    // Apply Y-axis yaw rotation
    ship.rotation.y += flight.angularVelocity * delta;
    ship.rotation.y = Math.atan2(Math.sin(ship.rotation.y), Math.cos(ship.rotation.y));

    // 5. Drift Momentum Vector Integration
    const headingX = Math.sin(ship.rotation.y);
    const headingZ = Math.cos(ship.rotation.y);

    const targetVelX = headingX * ship.speed;
    const targetVelZ = headingZ * ship.speed;

    // Heavy inertia lateral slip lerp
    // When Flight Assist / Drift Decoupling is active ([SHIFT]), linear thruster compensation is dampened
    // allowing the ship to maintain its linear momentum drift vector while rotating nose 360° independently.
    const isDecoupled = (ship as any).driftDecoupled;
    const baseDriftRate = Math.min(1.0, (12 / (flight.mass / 100)) * delta);
    const driftLerpRate = isDecoupled ? baseDriftRate * 0.05 : baseDriftRate;
    if ((ship as any).isMinion && ship.targetSpeed === 0) {
      ship.speed = 0;
      flight.linearVelocity.x = 0;
      flight.linearVelocity.z = 0;
    } else {
      flight.linearVelocity.x += (targetVelX - flight.linearVelocity.x) * driftLerpRate;
      flight.linearVelocity.z += (targetVelZ - flight.linearVelocity.z) * driftLerpRate;
    }

    // Update 3D world position
    ship.position.x += flight.linearVelocity.x * delta;
    ship.position.z += flight.linearVelocity.z * delta;

    // World boundary containment ring
    const arenaLimit = 1500;
    const dist = Math.sqrt(ship.position.x * ship.position.x + ship.position.z * ship.position.z);
    if (dist > arenaLimit) {
      const angle = Math.atan2(ship.position.x, ship.position.z);
      ship.position.x = Math.sin(angle) * arenaLimit;
      ship.position.z = Math.cos(angle) * arenaLimit;
      flight.linearVelocity.x *= -0.2;
      flight.linearVelocity.z *= -0.2;
    }
  }

  /**
   * Model Mesh Loading & Transform Hierarchy Integration
   * 
   * Attaches 3D mesh instances (from assets/models/spaceships/ or procedural voxel geometry)
   * to the parent Three.js ship transform hierarchy.
   */
  public static attachShipMesh(
    parentGroup: THREE.Group,
    assetPath: string,
    modelType: string,
    meshInstance?: THREE.Object3D
  ) {
    if (meshInstance) {
      // Inline comment: Attach loaded OBJ model mesh instance directly to ship transform hierarchy
      // e.g. OBJLoader loads `assets/models/spaceships/${assetPath}`
      // Configure local transform offsets and scale
      meshInstance.name = `model_mesh_${modelType}`;
      meshInstance.position.set(0, 0, 0);
      meshInstance.rotation.set(0, 0, 0);
      parentGroup.add(meshInstance);
    }
  }
}

