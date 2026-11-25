import { soundManager } from '../audio/soundManager';

export type PowerProfile = 'balanced' | 'weapons' | 'engines' | 'shields';

export interface PowerDistribution {
  weapons: number; // Percentage (0 - 100)
  engines: number; // Percentage (0 - 100)
  shields: number; // Percentage (0 - 100)
}

export interface SystemPowerModifiers {
  // Weapon Modifiers
  weaponCooldownSpeedMult: number; // Multiplier on weapon reload & charge rate (0.0x at 0% W, 2.0x at 100% W)

  // Engine Modifiers
  engineTopSpeedMult: number;     // Multiplier on top speed (1.0x at 0% E, 1.4x at 100% E)
  engineAccelMult: number;        // Multiplier on linear acceleration (1.0x at 0% E, 1.5x at 100% E)
  engineTurnRateMult: number;     // Multiplier on yaw turn rate (1.0x at 0% E, 1.4x at 100% E)

  // Shield Modifiers
  shieldRegenRateMult: number;    // Multiplier on shield quadrant recharge rate (0.0x at 0% S, 3.0x at 100% S)
  shieldCollapsedDelayMult: number; // Reduces collapsed shield delay (1.0x at 0% S, 0.5x at 100% S)
}

export interface ProfileDefinition {
  id: PowerProfile;
  label: string;
  keybind: string;
  badge: string;
  distribution: PowerDistribution;
  description: string;
}

export const POWER_PROFILES: Record<PowerProfile, ProfileDefinition> = {
  weapons: {
    id: 'weapons',
    label: 'FULL WEAPONS',
    keybind: '1',
    badge: '[1] WPN',
    distribution: { weapons: 100, engines: 0, shields: 0 },
    description: '100% Weapons Power: 2.0x weapon reload speed & beam tick rate | Engines & Shields 0%',
  },
  engines: {
    id: 'engines',
    label: 'FULL ENGINES',
    keybind: '2',
    badge: '[2] ENG',
    distribution: { weapons: 0, engines: 100, shields: 0 },
    description: '100% Engines Power: +40% top speed, +50% thruster accel, +40% turn rate',
  },
  shields: {
    id: 'shields',
    label: 'FULL SHIELDS',
    keybind: '3',
    badge: '[3] SHD',
    distribution: { weapons: 0, engines: 0, shields: 100 },
    description: '100% Shields Power: 3.0x shield recharge rate, 50% collapsed delay reduction',
  },
  balanced: {
    id: 'balanced',
    label: 'NEUTRAL BALANCED',
    keybind: '4',
    badge: '[4] BAL',
    distribution: { weapons: 33.3, engines: 33.3, shields: 33.3 },
    description: 'Equalized reactor allocation (33.3% / 33.3% / 33.3%) across all subsystems',
  },
};

export type PowerShuntListener = (
  profile: PowerProfile,
  distribution: PowerDistribution,
  modifiers: SystemPowerModifiers
) => void;

export type OnPowerChangedSignal = (
  weapons: number,
  engines: number,
  shields: number
) => void;

/**
 * PowerAllocationManager
 * Manages zero-cooldown instant Tri-Power Shunting (Weapons, Engines, Shields).
 * Interpolates (LERP) over 0.15s duration and computes dynamic subsystem stat multipliers.
 * Exposes event signals for weapon hardpoints, flight physics, shield managers, and HUD widgets.
 */
export class PowerAllocationManager {
  private activeProfile: PowerProfile = 'balanced';

  // Interpolated Power Levels (0-100%)
  private currentDistribution: PowerDistribution = { ...POWER_PROFILES.balanced.distribution };
  private targetDistribution: PowerDistribution = { ...POWER_PROFILES.balanced.distribution };

  // Interpolated System Modifiers
  private currentModifiers: SystemPowerModifiers = this.calculateModifiers(this.currentDistribution);

  // Smooth Transition Config (0.15s duration)
  private readonly transitionTime: number = 0.15; // Seconds
  private transitionTimer: number = 0;
  private isTransitioning: boolean = false;

  // Visual HUD Flash State
  public isShunting: boolean = false;
  private shuntFlashTimer: number = 0;

  // Signal Emission Listeners
  private listeners: Set<PowerShuntListener> = new Set();
  private powerChangedSignals: Set<OnPowerChangedSignal> = new Set();

  constructor(initialProfile: PowerProfile = 'balanced') {
    this.setProfile(initialProfile, false);
  }

  /**
   * Calculate exact subsystem stat multipliers based on current power distribution
   */
  private calculateModifiers(dist: PowerDistribution): SystemPowerModifiers {
    const W = Math.max(0, Math.min(100, dist.weapons));
    const E = Math.max(0, Math.min(100, dist.engines));
    const S = Math.max(0, Math.min(100, dist.shields));

    // 1. WEAPONS: 0% W -> 0.0x (FREEZE reloads), 33.3% -> 1.0x, 100% W -> 2.0x
    const weaponCooldownSpeedMult = W <= 33.3333
      ? (W / 33.3333) * 1.0
      : 1.0 + ((W - 33.3333) / 66.6667) * 1.0;

    // 2. ENGINES: 0% E -> 1.0x baseline, 100% E -> +40% top speed, +50% accel, +40% turn rate
    const engineTopSpeedMult = 1.0 + (E / 100) * 0.4;
    const engineAccelMult = 1.0 + (E / 100) * 0.5;
    const engineTurnRateMult = 1.0 + (E / 100) * 0.4;

    // 3. SHIELDS: 0% S -> 0.0x regen (HALTS), 33.3% -> 1.0x, 100% S -> 3.0x regen & 50% collapsed delay reduction
    const shieldRegenRateMult = S <= 33.3333
      ? (S / 33.3333) * 1.0
      : 1.0 + ((S - 33.3333) / 66.6667) * 2.0;
    const shieldCollapsedDelayMult = 1.0 - (S / 100) * 0.5;

    return {
      weaponCooldownSpeedMult,
      engineTopSpeedMult,
      engineAccelMult,
      engineTurnRateMult,
      shieldRegenRateMult,
      shieldCollapsedDelayMult,
    };
  }

  /**
   * Set active power distribution profile with optional audio & tactile shunt signal.
   * NO GLOBAL COOLDOWN: Can be called instantly at any frame.
   */
  public setProfile(profile: PowerProfile, playSound: boolean = true): boolean {
    if (this.activeProfile === profile && !this.isTransitioning) {
      return false; // Already active & settled
    }

    const prevProfile = this.activeProfile;
    this.activeProfile = profile;
    const def = POWER_PROFILES[profile];

    // Update target vectors for smooth 0.15s LERP
    this.targetDistribution = { ...def.distribution };

    this.isTransitioning = true;
    this.transitionTimer = 0;

    // Trigger visual shunt flash on HUD (lasts 0.20 seconds)
    this.isShunting = true;
    this.shuntFlashTimer = 0.20;

    if (playSound && prevProfile !== profile) {
      soundManager.playPowerPreset();
    }

    // Emit signal immediately upon input
    this.notifyListeners();
    return true;
  }

  /**
   * Public convenience alias method: shunt power to a profile instantly
   */
  public shunt(profile: PowerProfile, playSound: boolean = true): boolean {
    return this.setProfile(profile, playSound);
  }

  /**
   * Primary frame update ticker.
   * Smoothly interpolates power allocation percentages and system modifiers over 0.15s.
   */
  public update(delta: number) {
    // Tick shunt visual flash effect
    if (this.shuntFlashTimer > 0) {
      this.shuntFlashTimer = Math.max(0, this.shuntFlashTimer - delta);
      if (this.shuntFlashTimer === 0) {
        this.isShunting = false;
      }
    }

    // Interpolate power states over 0.15 seconds
    if (this.isTransitioning) {
      this.transitionTimer += delta;
      const progress = Math.min(1.0, this.transitionTimer / this.transitionTime);

      // Fast, responsive 0.15s LERP factor
      const lerpFactor = Math.min(1.0, delta * 20.0);

      // Interpolate distributions
      this.currentDistribution.weapons += (this.targetDistribution.weapons - this.currentDistribution.weapons) * lerpFactor;
      this.currentDistribution.engines += (this.targetDistribution.engines - this.currentDistribution.engines) * lerpFactor;
      this.currentDistribution.shields += (this.targetDistribution.shields - this.currentDistribution.shields) * lerpFactor;

      // Re-evaluate modifiers continuously from current LERP distribution
      this.currentModifiers = this.calculateModifiers(this.currentDistribution);

      if (progress >= 1.0) {
        // Snap exact target values at transition end
        this.currentDistribution = { ...this.targetDistribution };
        this.currentModifiers = this.calculateModifiers(this.currentDistribution);
        this.isTransitioning = false;
      }

      this.notifyPowerChangedSignals();
    }
  }

  /**
   * Get active profile key.
   */
  public getActiveProfile(): PowerProfile {
    return this.activeProfile;
  }

  /**
   * Get currently interpolated power percentages ({ weapons, engines, shields }).
   */
  public getPowerDistribution(): PowerDistribution {
    return { ...this.currentDistribution };
  }

  /**
   * Get target power percentages.
   */
  public getTargetDistribution(): PowerDistribution {
    return { ...this.targetDistribution };
  }

  /**
   * Get currently interpolated system modifiers.
   */
  public getModifiers(): SystemPowerModifiers {
    return { ...this.currentModifiers };
  }

  /**
   * Signal subscription for UI binding & audio effects.
   */
  public subscribe(listener: PowerShuntListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Public signal event binding: on_power_changed(weapons, engines, shields)
   */
  public on_power_changed(signal: OnPowerChangedSignal): () => void {
    this.powerChangedSignals.add(signal);
    // Fire initial state
    signal(this.currentDistribution.weapons, this.currentDistribution.engines, this.currentDistribution.shields);
    return () => {
      this.powerChangedSignals.delete(signal);
    };
  }

  public onPowerChanged(signal: OnPowerChangedSignal): () => void {
    return this.on_power_changed(signal);
  }

  private notifyListeners() {
    const dist = this.getPowerDistribution();
    const mods = this.getModifiers();
    this.listeners.forEach((listener) => {
      listener(this.activeProfile, dist, mods);
    });
    this.notifyPowerChangedSignals();
  }

  private notifyPowerChangedSignals() {
    this.powerChangedSignals.forEach((signal) => {
      signal(this.currentDistribution.weapons, this.currentDistribution.engines, this.currentDistribution.shields);
    });
  }
}

// Export backward-compatible alias
export { PowerAllocationManager as PowerManagementController };
