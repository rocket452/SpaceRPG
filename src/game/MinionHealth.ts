export type DamageType =
  | 'EM_SHIELD_SPECIAL'
  | 'KINETIC'
  | 'CORROSIVE'
  | 'NORMAL'
  | string;

export interface MinionHealthConfig {
  max_hull: number;
  current_hull?: number;
  max_shield: number;
  current_shield?: number;
  shield_recharge_rate?: number; // Shield HP recharged per second (default: 15.0)
  shield_recharge_delay?: number; // Delay in seconds after damage before shield recharge starts (default: 3.5)
  last_hit_threshold?: number; // HP threshold for execution / last-hit indicator (default: 120.0)
}

export type ShieldDamagedCallback = (amount: number, remaining_shield: number) => void;
export type ShieldBrokenCallback = (attacker?: any) => void;
export type HullDamagedCallback = (amount: number, remaining_hull: number) => void;
export type MinionDestroyedCallback = (attacker?: any) => void;

export interface MinionHealthEvents {
  on_shield_damaged?: ShieldDamagedCallback;
  on_shield_broken?: ShieldBrokenCallback;
  on_hull_damaged?: HullDamagedCallback;
  on_minion_destroyed?: MinionDestroyedCallback;
}

export interface DamageResult {
  shield_damage_applied: number;
  hull_damage_applied: number;
  remaining_shield: number;
  remaining_hull: number;
  shield_broken: boolean;
  minion_destroyed: boolean;
  siphoned_amount: number;
}

/**
 * MinionHealth Component
 * Manages single-pool omnidirectional shields and hull health for MOBA minion units,
 * handling damage types, shield siphoning, visual pulse state, and hit-state signals/callbacks.
 */
export class MinionHealth {
  public max_hull: number;
  public current_hull: number;
  public max_shield: number;
  public current_shield: number;

  public shield_recharge_rate: number;
  public shield_recharge_delay: number;
  public last_hit_threshold: number;

  public time_since_last_damage: number = 999;
  public shield_pulse_timer: number = 0; // Brief visual flash/pulse timer on shield absorption
  public is_shield_bubble_enabled: boolean = true;

  // Signal / Callback Handlers
  public events: MinionHealthEvents = {};

  constructor(config: MinionHealthConfig, events?: MinionHealthEvents) {
    this.max_hull = Math.max(1, config.max_hull);
    this.current_hull = config.current_hull !== undefined ? config.current_hull : this.max_hull;
    this.max_shield = Math.max(0, config.max_shield);
    this.current_shield = config.current_shield !== undefined ? config.current_shield : this.max_shield;

    this.shield_recharge_rate = config.shield_recharge_rate ?? 15.0;
    this.shield_recharge_delay = config.shield_recharge_delay ?? 3.5;
    this.last_hit_threshold = config.last_hit_threshold ?? 120.0;

    this.is_shield_bubble_enabled = this.current_shield > 0;

    if (events) {
      this.events = { ...events };
    }
  }

  // --- Callback Registration API ---
  public onShieldDamaged(cb: ShieldDamagedCallback): void {
    this.events.on_shield_damaged = cb;
  }

  public onShieldBroken(cb: ShieldBrokenCallback): void {
    this.events.on_shield_broken = cb;
  }

  public onHullDamaged(cb: HullDamagedCallback): void {
    this.events.on_hull_damaged = cb;
  }

  public onMinionDestroyed(cb: MinionDestroyedCallback): void {
    this.events.on_minion_destroyed = cb;
  }

  /**
   * Returns whether the omnidirectional shield is currently active (> 0).
   */
  public is_shield_active(): boolean {
    return this.current_shield > 0 && this.is_shield_bubble_enabled;
  }

  /**
   * Triggers a brief visual pulse/flash on the minion mesh/sprite shader when shield absorbs damage.
   */
  public pulse_shield_visual(durationSeconds: number = 0.25): void {
    this.shield_pulse_timer = Math.max(this.shield_pulse_timer, durationSeconds);
  }

  /**
   * Last-Hit & Execution Helper:
   * Checks if an incoming shot from a primary weapon will trigger a fatal blow on the minion's
   * combined shield + hull HP, or if total HP is within the last_hit_threshold.
   */
  public is_in_execution_range(damage_amount: number, damage_type: DamageType = 'NORMAL'): boolean {
    if (this.current_hull <= 0) return true;

    // Check if combined health is within execution threshold
    const totalCurrentHp = this.current_shield + this.current_hull;
    if (totalCurrentHp <= this.last_hit_threshold) {
      return true;
    }

    // Calculate effective damage based on type multipliers
    let shield_mult = 1.0;
    let hull_mult = 1.0;

    if (damage_type === 'EM_SHIELD_SPECIAL' || damage_type === 'disruptor_beam') {
      shield_mult = 2.5;
      hull_mult = 0.5;
    } else if (damage_type === 'KINETIC' || damage_type.includes('torpedo') || damage_type === 'heavy_cannon') {
      shield_mult = 0.5;
      hull_mult = 2.0;
    } else if (damage_type === 'CORROSIVE') {
      shield_mult = 0.8;
      hull_mult = 2.2;
    }

    const effective_shield_dmg = damage_amount * shield_mult;

    if (this.current_shield > 0) {
      if (effective_shield_dmg < this.current_shield) {
        // Shield absorbs shot completely; checks if shield reduction drops total HP below threshold
        const remainingShield = this.current_shield - effective_shield_dmg;
        return (remainingShield + this.current_hull) <= this.last_hit_threshold;
      } else {
        // Shield breaks, carry over excess to hull
        const excess_shield_dmg = effective_shield_dmg - this.current_shield;
        const raw_excess = excess_shield_dmg / shield_mult;
        const expected_hull_dmg = raw_excess * hull_mult;
        return (this.current_hull - expected_hull_dmg) <= 0;
      }
    } else {
      const expected_hull_dmg = damage_amount * hull_mult;
      return (this.current_hull - expected_hull_dmg) <= 0;
    }
  }

  /**
   * Main Damage Resolution Logic:
   * 1. Applies incoming damage to single-pool current_shield first (factoring damage multipliers).
   * 2. Excess damage carries over directly into current_hull.
   * 3. Siphons shield energy back to attacker_ref if using EM_SHIELD_SPECIAL.
   * 4. Fires explicit signals/events: on_shield_damaged, on_shield_broken, on_hull_damaged, on_minion_destroyed.
   */
  public take_damage(
    amount: number,
    damage_type: DamageType = 'NORMAL',
    attacker_ref?: any
  ): DamageResult {
    this.time_since_last_damage = 0;

    let shield_mult = 1.0;
    let hull_mult = 1.0;

    if (damage_type === 'EM_SHIELD_SPECIAL' || damage_type === 'disruptor_beam') {
      shield_mult = 2.5;
      hull_mult = 0.5;
    } else if (damage_type === 'KINETIC' || damage_type.includes('torpedo') || damage_type === 'heavy_cannon') {
      shield_mult = 0.5;
      hull_mult = 2.0;
    } else if (damage_type === 'CORROSIVE') {
      shield_mult = 0.8;
      hull_mult = 2.2;
    }

    let shield_damage_applied = 0;
    let hull_damage_applied = 0;
    let shield_broken = false;
    let minion_destroyed = false;
    let siphoned_amount = 0;

    // Check single-pool shield absorption
    if (this.current_shield > 0) {
      const effective_shield_dmg = amount * shield_mult;
      this.pulse_shield_visual(0.3);

      if (effective_shield_dmg <= this.current_shield) {
        // Shield absorbs entire hit
        shield_damage_applied = effective_shield_dmg;
        this.current_shield -= shield_damage_applied;
        siphoned_amount = shield_damage_applied;

        // Signal: on_shield_damaged
        if (this.events.on_shield_damaged) {
          this.events.on_shield_damaged(shield_damage_applied, this.current_shield);
        }
      } else {
        // Shield breaks!
        shield_damage_applied = this.current_shield;
        siphoned_amount = shield_damage_applied;
        const excess_shield_dmg = effective_shield_dmg - this.current_shield;
        this.current_shield = 0;
        this.is_shield_bubble_enabled = false;
        shield_broken = true;

        // Signal: on_shield_damaged
        if (this.events.on_shield_damaged) {
          this.events.on_shield_damaged(shield_damage_applied, 0);
        }

        // Signal: on_shield_broken
        if (this.events.on_shield_broken) {
          this.events.on_shield_broken(attacker_ref);
        }

        // Carry over excess damage directly into current_hull
        const raw_excess = excess_shield_dmg / shield_mult;
        hull_damage_applied = raw_excess * hull_mult;
        this.current_hull = Math.max(0, this.current_hull - hull_damage_applied);

        // Signal: on_hull_damaged
        if (hull_damage_applied > 0 && this.events.on_hull_damaged) {
          this.events.on_hull_damaged(hull_damage_applied, this.current_hull);
        }
      }
    } else {
      // No shield remaining -> full hull damage
      hull_damage_applied = amount * hull_mult;
      this.current_hull = Math.max(0, this.current_hull - hull_damage_applied);

      // Signal: on_hull_damaged
      if (hull_damage_applied > 0 && this.events.on_hull_damaged) {
        this.events.on_hull_damaged(hull_damage_applied, this.current_hull);
      }
    }

    // Energy Siphon Logic for EM_SHIELD_SPECIAL weapons
    if (damage_type === 'EM_SHIELD_SPECIAL' && siphoned_amount > 0 && attacker_ref) {
      this.siphonShieldEnergyToAttacker(attacker_ref, siphoned_amount);
    }

    // Check minion destruction
    if (this.current_hull <= 0) {
      minion_destroyed = true;
      if (this.events.on_minion_destroyed) {
        this.events.on_minion_destroyed(attacker_ref);
      }
    }

    return {
      shield_damage_applied,
      hull_damage_applied,
      remaining_shield: this.current_shield,
      remaining_hull: this.current_hull,
      shield_broken,
      minion_destroyed,
      siphoned_amount,
    };
  }

  /**
   * Siphons shield energy back to attacker_ref (restoring attacker shields or energy pool).
   */
  private siphonShieldEnergyToAttacker(attacker_ref: any, amount: number): void {
    if (!attacker_ref) return;

    const restoredAmount = amount * 0.5;

    if (attacker_ref.minionHealth && attacker_ref.minionHealth.max_shield > 0) {
      attacker_ref.minionHealth.current_shield = Math.min(
        attacker_ref.minionHealth.max_shield,
        attacker_ref.minionHealth.current_shield + restoredAmount
      );
    } else if (attacker_ref.shields) {
      const arcs: ('front' | 'starboard' | 'back' | 'port')[] = ['front', 'starboard', 'back', 'port'];
      const perArc = restoredAmount / 4;
      for (const arc of arcs) {
        if (attacker_ref.shields[arc]) {
          attacker_ref.shields[arc].current = Math.min(
            attacker_ref.shields[arc].max,
            attacker_ref.shields[arc].current + perArc
          );
        }
      }
    }
  }

  /**
   * Periodic update tick:
   * Handles shield recharge delays & rates, and decay of visual pulse timers.
   */
  public update(delta: number): void {
    this.time_since_last_damage += delta;

    if (this.shield_pulse_timer > 0) {
      this.shield_pulse_timer = Math.max(0, this.shield_pulse_timer - delta);
    }

    // Shield Recharge logic after recharge delay
    if (
      this.shield_recharge_rate > 0 &&
      this.max_shield > 0 &&
      this.time_since_last_damage >= this.shield_recharge_delay &&
      this.current_shield < this.max_shield
    ) {
      const wasZero = this.current_shield <= 0;
      this.current_shield = Math.min(this.max_shield, this.current_shield + this.shield_recharge_rate * delta);
      if (wasZero && this.current_shield > 0) {
        this.is_shield_bubble_enabled = true;
      }
    }
  }
}
