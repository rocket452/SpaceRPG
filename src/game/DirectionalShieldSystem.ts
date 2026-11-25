import { ShieldArcKey, ShieldArcs, ShipEntity } from '../types';

export enum ShieldQuadrant {
  FORE = 'FORE',           // Fore Arc (-45° to +45°)
  STARBOARD = 'STARBOARD', // Starboard Flank (+45° to +135°)
  AFT = 'AFT',             // Aft Arc (+135° to +180° / -180° to -135°)
  PORT = 'PORT'            // Port Flank (-135° to -45°)
}

export interface ShieldImpactResult {
  quadrant: ShieldQuadrant;
  arcKey: ShieldArcKey;
  shieldDamageTaken: number;
  hullBleedDamage: number;
  isShieldCollapsed: boolean;
  remainingShield: number;
}

export class DirectionalShieldSystem {
  /**
   * Star Trek Online Style Directional Shield Quadrant Calculation
   * 
   * Calculates which of the 4 directional shield quadrants was impacted
   * relative to the target's nose heading (0°).
   * 
   * Angle Mapping relative to target's heading (targetRotY):
   * - Fore:      -45° to +45°
   * - Starboard: +45° to +135°
   * - Aft:       +135° to +180° / -180° to -135°
   * - Port:      -135° to -45°
   */
  public static calculateImpactQuadrant(
    targetPos: { x: number; y: number; z: number },
    targetRotY: number,
    shooterPos: { x: number; y: number; z: number }
  ): { quadrant: ShieldQuadrant; arcKey: ShieldArcKey } {
    const dx = shooterPos.x - targetPos.x;
    const dz = shooterPos.z - targetPos.z;

    // World bearing angle from target to shooter
    const bearingToShooter = Math.atan2(dx, dz);
    
    // Relative angle in radians relative to target's nose heading
    let relativeAngle = bearingToShooter - targetRotY;
    // Normalize angle to [-PI, +PI]
    relativeAngle = Math.atan2(Math.sin(relativeAngle), Math.cos(relativeAngle));
    const deg = (relativeAngle * 180) / Math.PI;

    let quadrant: ShieldQuadrant;
    let arcKey: ShieldArcKey;

    if (deg >= -45 && deg <= 45) {
      quadrant = ShieldQuadrant.FORE;
      arcKey = 'front';
    } else if (deg > 45 && deg < 135) {
      quadrant = ShieldQuadrant.STARBOARD;
      arcKey = 'starboard';
    } else if (deg >= 135 || deg <= -135) {
      quadrant = ShieldQuadrant.AFT;
      arcKey = 'back';
    } else {
      quadrant = ShieldQuadrant.PORT;
      arcKey = 'port';
    }

    return { quadrant, arcKey };
  }

  /**
   * Processes damage against a ship's directional shield quadrant.
   * 
   * Shield Bleed-Through Rules:
   * 1. Active Shield Quadrants absorb incoming weapon damage.
   * 2. When a shield quadrant reaches 0% (Shield Collapse), all subsequent or
   *    overflow damage from that vector inflicts 100% direct damage to primary Hull Health.
   */
  public static applyDirectionalDamage(
    ship: ShipEntity,
    damage: number,
    arcKey: ShieldArcKey,
    quadrant: ShieldQuadrant
  ): ShieldImpactResult {
    const shieldArc = ship.shields[arcKey];
    let shieldDamageTaken = 0;
    let hullBleedDamage = 0;
    let isShieldCollapsed = false;

    // Adjust active transfer target if damaged
    if (ship.shieldTargets && ship.shieldTargets[arcKey] > 0) {
      ship.shieldTargets[arcKey] = Math.max(0, ship.shieldTargets[arcKey] - damage);
    }

    if (shieldArc.current > 0) {
      if (shieldArc.current >= damage) {
        // Shield quadrant absorbs full hit
        shieldArc.current -= damage;
        shieldDamageTaken = damage;
      } else {
        // Shield collapsed mid-impact -> remainder bleeds through to Hull
        shieldDamageTaken = shieldArc.current;
        hullBleedDamage = damage - shieldArc.current;
        shieldArc.current = 0;
        isShieldCollapsed = true;
      }
    } else {
      // Shield Quadrant 0% collapsed -> 100% direct Hull Bleed-Through!
      isShieldCollapsed = true;
      hullBleedDamage = damage;
    }

    // Apply unmitigated hull bleed damage
    if (hullBleedDamage > 0) {
      ship.hull = Math.max(0, ship.hull - hullBleedDamage);
      if (ship.hull <= 0) {
        ship.isDestroyed = true;
      }
    }

    return {
      quadrant,
      arcKey,
      shieldDamageTaken,
      hullBleedDamage,
      isShieldCollapsed,
      remainingShield: shieldArc.current,
    };
  }

  /**
   * Vanguard Brawler Utility: Shield_Rebalance()
   * Redirects 25% shield capacity from healthy quadrants to replenish a collapsing/lowest quadrant.
   */
  public static executeShieldRebalance(shields: ShieldArcs, ship?: ShipEntity): { totalRestored: number; targetArc: ShieldArcKey } {
    const keys: ShieldArcKey[] = ['front', 'starboard', 'back', 'port'];

    // Find the quadrant with the lowest shield current value
    let lowestArcKey: ShieldArcKey = 'front';
    let lowestVal = Infinity;

    keys.forEach((key) => {
      if (shields[key].current < lowestVal) {
        lowestVal = shields[key].current;
        lowestArcKey = key;
      }
    });

    let totalHarvested = 0;
    const targets: Record<ShieldArcKey, number> = {
      front: shields.front.current,
      starboard: shields.starboard.current,
      back: shields.back.current,
      port: shields.port.current,
    };

    // Drain 25% current shield from all other healthy quadrants (>0)
    keys.forEach((key) => {
      if (key !== lowestArcKey && shields[key].current > 0) {
        const drainAmount = Math.round(shields[key].current * 0.25 * 10) / 10;
        targets[key] = Math.max(0, Math.round((shields[key].current - drainAmount) * 10) / 10);
        totalHarvested += drainAmount;
      }
    });

    // Replenish the lowest quadrant
    const targetArc = shields[lowestArcKey];
    const initialVal = targetArc.current;
    targets[lowestArcKey] = Math.min(targetArc.max, Math.round((targetArc.current + totalHarvested) * 10) / 10);
    const actualRestored = targets[lowestArcKey] - initialVal;

    if (ship) {
      ship.shieldTargets = targets;
    } else {
      keys.forEach((k) => (shields[k].current = targets[k]));
    }

    return { totalRestored: actualRestored, targetArc: lowestArcKey };
  }

  /**
   * Equalizes shield power evenly across all 4 directional shield quadrants,
   * draining from stronger arcs to replenish weaker ones without creating or losing shield HP.
   */
  public static equalizeShields(shields: ShieldArcs, ship?: ShipEntity) {
    const keys: ShieldArcKey[] = ['front', 'starboard', 'back', 'port'];
    const totalCurrent = keys.reduce((sum, key) => sum + shields[key].current, 0);
    if (totalCurrent <= 0) return;

    let averageShare = totalCurrent / keys.length;

    let overflow = 0;
    let uncappedKeys: ShieldArcKey[] = [];
    const targets: Record<ShieldArcKey, number> = {
      front: 0,
      starboard: 0,
      back: 0,
      port: 0,
    };

    keys.forEach((key) => {
      if (averageShare > shields[key].max) {
        targets[key] = shields[key].max;
        overflow += averageShare - shields[key].max;
      } else {
        targets[key] = averageShare;
        uncappedKeys.push(key);
      }
    });

    if (overflow > 0 && uncappedKeys.length > 0) {
      const extraPerUncapped = overflow / uncappedKeys.length;
      uncappedKeys.forEach((key) => {
        targets[key] = Math.min(shields[key].max, targets[key] + extraPerUncapped);
      });
    }

    keys.forEach((key) => {
      targets[key] = Math.round(targets[key] * 10) / 10;
    });

    if (ship) {
      ship.shieldTargets = targets;
    } else {
      keys.forEach((key) => {
        shields[key].current = targets[key];
      });
    }
  }

  /**
   * Siphons shield HP from one quadrant arc to bolster another
   */
  public static siphonShield(
    shields: ShieldArcs,
    fromArc: ShieldArcKey,
    toArc: ShieldArcKey,
    amount: number
  ) {
    const actualSiphon = Math.min(shields[fromArc].current, amount);
    shields[fromArc].current -= actualSiphon;
    shields[toArc].current = Math.min(
      shields[toArc].max,
      shields[toArc].current + actualSiphon
    );
  }

  /**
   * Reroutes current shield HP from all other shield arcs to bolster the target arc.
   * Drains proportionally from other healthy shield arcs.
   */
  public static rerouteShieldsToArc(
    shields: ShieldArcs,
    targetArcKey: ShieldArcKey,
    ship?: ShipEntity
  ): number {
    const targetArc = shields[targetArcKey];
    const needed = targetArc.max - targetArc.current;
    if (needed <= 0) return 0;

    const otherKeys: ShieldArcKey[] = (['front', 'starboard', 'back', 'port'] as ShieldArcKey[])
      .filter((k) => k !== targetArcKey);

    const totalAvailable = otherKeys.reduce((sum, k) => sum + shields[k].current, 0);
    if (totalAvailable <= 0) return 0;

    const amountToTransfer = Math.min(needed, totalAvailable);

    const targets: Record<ShieldArcKey, number> = {
      front: shields.front.current,
      starboard: shields.starboard.current,
      back: shields.back.current,
      port: shields.port.current,
    };

    // Drain from each other arc proportional to its current shield amount
    otherKeys.forEach((key) => {
      if (shields[key].current > 0) {
        const share = shields[key].current / totalAvailable;
        const drain = amountToTransfer * share;
        targets[key] = Math.max(0, Math.round((shields[key].current - drain) * 10) / 10);
      }
    });

    targets[targetArcKey] = Math.min(targetArc.max, Math.round((targetArc.current + amountToTransfer) * 10) / 10);

    if (ship) {
      ship.shieldTargets = targets;
    } else {
      otherKeys.forEach((key) => {
        shields[key].current = targets[key];
      });
      targetArc.current = targets[targetArcKey];
    }

    return Math.round(amountToTransfer * 10) / 10;
  }

  /**
   * Smoothly interpolates active shield levels toward shieldTargets over time.
   * Transfer rate: ~120 HP/s so a typical transfer takes ~1.5s.
   */
  public static processShieldTransfer(ship: ShipEntity, delta: number) {
    if (!ship.shieldTargets) return;

    const keys: ShieldArcKey[] = ['front', 'starboard', 'back', 'port'];
    const transferSpeed = 120; // HP per second
    let allReached = true;

    keys.forEach((key) => {
      const cur = ship.shields[key].current;
      const target = ship.shieldTargets![key];
      const diff = target - cur;

      if (Math.abs(diff) > 0.1) {
        allReached = false;
        const step = Math.sign(diff) * Math.min(Math.abs(diff), transferSpeed * delta);
        ship.shields[key].current = Math.max(0, Math.min(ship.shields[key].max, cur + step));
      } else {
        ship.shields[key].current = Math.max(0, Math.min(ship.shields[key].max, target));
      }
    });

    if (allReached) {
      delete ship.shieldTargets;
    }
  }

  /**
   * Regenerates directional shield arcs based on PowerManagementController multipliers.
   * Playtesting Adjustment Hook: Change baseRegenPerSec (e.g. 2.0 HP/s per arc) to balance shield recovery speed.
   */
  public static regenerateShields(
    ship: ShipEntity,
    delta: number,
    baseRegenPerSec: number = 2.0
  ) {
    // Tick progressive shield transfer if active
    DirectionalShieldSystem.processShieldTransfer(ship, delta);

    const pMods = ship.powerController ? ship.powerController.getModifiers() : null;
    const shieldPowerFactor = pMods 
      ? pMods.shieldRegenRateMult * (ship.subsystems.shields / 100)
      : (0.5 + (ship.power.shields / 100) * 1.2) * (ship.subsystems.shields / 100);

    // If shield power factor is 0 (MAX WEAPONS or MAX ENGINES), no shield regeneration occurs
    if (shieldPowerFactor <= 0) return;

    const regenPerArc = baseRegenPerSec * shieldPowerFactor * delta;
    const arcKeys: ShieldArcKey[] = ['front', 'starboard', 'back', 'port'];

    arcKeys.forEach((key) => {
      const arc = ship.shields[key];
      if (!arc || arc.max <= 0) return;
      if (arc.current > 0 && arc.current < arc.max) {
        arc.current = Math.min(arc.max, arc.current + regenPerArc);
      } else if (arc.current === 0) {
        // Recovery from 0 (35% base rate, accelerated up to 2x when shields power is 100% due to 50% delay reduction)
        const collapsedBoost = pMods && pMods.shieldCollapsedDelayMult ? (1.0 / pMods.shieldCollapsedDelayMult) : 1.0;
        arc.current = Math.min(arc.max, arc.current + regenPerArc * 0.35 * collapsedBoost);
      }
    });
  }

  /**
   * Restores directional shield HP across the target ship's most depleted arcs first.
   * Returns total shield HP actually restored.
   */
  public static restoreShields(ship: ShipEntity, totalAmount: number): number {
    if (ship.isDestroyed || totalAmount <= 0) return 0;

    const keys: ShieldArcKey[] = ['front', 'starboard', 'back', 'port'];
    let remainingBudget = totalAmount;
    let totalRestored = 0;

    // Iteratively top up arcs prioritizing lowest percentage arcs first
    for (let pass = 0; pass < 4 && remainingBudget > 0.05; pass++) {
      const damagedKeys = keys
        .filter((k) => {
          const arc = ship.shields[k];
          const cur = ship.shieldTargets ? ship.shieldTargets[k] : arc.current;
          return arc && arc.max > 0 && cur < arc.max - 0.01;
        })
        .sort((a, b) => {
          const curA = ship.shieldTargets ? ship.shieldTargets[a] : ship.shields[a].current;
          const curB = ship.shieldTargets ? ship.shieldTargets[b] : ship.shields[b].current;
          return curA / ship.shields[a].max - curB / ship.shields[b].max;
        });

      if (damagedKeys.length === 0) break;

      const share = remainingBudget / damagedKeys.length;
      let spentThisPass = 0;

      damagedKeys.forEach((k) => {
        const arc = ship.shields[k];
        const cur = ship.shieldTargets ? ship.shieldTargets[k] : arc.current;
        const missing = Math.max(0, arc.max - cur);
        const add = Math.min(missing, share);

        if (add > 0) {
          if (ship.shieldTargets) {
            ship.shieldTargets[k] = Math.min(arc.max, cur + add);
          } else {
            arc.current = Math.min(arc.max, arc.current + add);
          }
          totalRestored += add;
          spentThisPass += add;
        }
      });

      if (spentThisPass <= 0.01) break;
      remainingBudget -= spentThisPass;
    }

    return Math.round(totalRestored);
  }
}

