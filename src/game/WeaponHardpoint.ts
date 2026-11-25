import * as THREE from 'three';
import { FiringArc, Weapon, WeaponType } from '../types';

export interface WeaponHardpointConfig {
  id: string;
  name: string;
  weaponType: WeaponType;
  baseDamage: number;
  cooldown: number; // Seconds
  currentCooldown: number;
  energyCost: number;
  range: number;
  color: string;
  isTorpedo: boolean;
  isPulse?: boolean;
  pulseCount?: number;
  thickness?: number;
  soundName: string;

  // Tactical Hardpoint Arc & Transform Hierarchy Config
  arcAngleDegrees: number;    // Active firing arc cone width (e.g. 15°, 30°, 45°, 60°, 90°, 180°, 360°)
  localFacingAngle: number;   // Angle in radians relative to ship nose (0 = Fore, PI/2 = Starboard, PI = Aft, -PI/2 = Port)
  localPosition: { x: number; y: number; z: number }; // Relative position offset on 3D ship mesh transform hierarchy
  isHealShield?: boolean;
  isHealHull?: boolean;
}

export class WeaponHardpoint {
  public config: WeaponHardpointConfig;

  constructor(config: WeaponHardpointConfig) {
    this.config = { ...config };
  }

  /**
   * Calculates weapon damage multipliers based on hit target state (Active Shield vs Collapsed/Depleted Shield Hull)
   * 
   * INLINE TUNING PARAMETERS (DIAL IN MATCH FEEL):
   * 1. Heavy Plasma Torpedo:
   *    - Active Shield Quadrant: 0.25x (shields absorb kinetic payload)
   *    - Depleted/Collapsed Quadrant: 3.0x (massive damage to exposed bare hull once shield quadrant is depleted)
   * 2. Shield-Stripper Beam (Vanguard Brawler):
   *    - Active Shield Quadrant: 2.5x (rapidly drains active shield quadrant)
   *    - Bare Hull: 0.2x (minimal damage against unshielded hull)
   * 3. Pulse Batteries & Standard Beams:
   *    - 1.0x standard damage to both active shields and bare hull
   */
  public static calculateDamageMultiplier(
    weaponType: WeaponType,
    isTorpedo: boolean,
    isShieldActive: boolean
  ): number {
    if (isTorpedo) {
      // Tweak Torpedo Multiplier: 0.25x vs Active Shield, 3.0x vs Bare Hull
      return isShieldActive ? 0.25 : 3.0;
    }

    if (weaponType === 'disruptor_beam' || weaponType === 'plasma_beam') {
      // Tweak Fore Shield-Stripper Beam Multiplier: 2.5x vs Active Shield, 0.2x vs Bare Hull
      return isShieldActive ? 2.5 : 0.2;
    }

    return 1.0;
  }

  /**
   * Helper: Converts standard FiringArc string to hardpoint angle and facing angle
   */
  public static firingArcToHardpointAngle(firingArc: FiringArc): { arcAngleDegrees: number; localFacingAngle: number } {
    switch (firingArc) {
      case 'forward_15':
        return { arcAngleDegrees: 15, localFacingAngle: 0 };
      case 'forward_30':
        return { arcAngleDegrees: 30, localFacingAngle: 0 };
      case 'forward_45':
        return { arcAngleDegrees: 45, localFacingAngle: 0 };
      case 'forward_90':
        return { arcAngleDegrees: 90, localFacingAngle: 0 };
      case 'forward_180':
        return { arcAngleDegrees: 180, localFacingAngle: 0 };
      case 'port_45':
        return { arcAngleDegrees: 45, localFacingAngle: -Math.PI / 2 };
      case 'port_90':
        return { arcAngleDegrees: 90, localFacingAngle: -Math.PI / 2 };
      case 'port_180':
        return { arcAngleDegrees: 180, localFacingAngle: -Math.PI / 2 };
      case 'starboard_45':
        return { arcAngleDegrees: 45, localFacingAngle: Math.PI / 2 };
      case 'starboard_90':
        return { arcAngleDegrees: 90, localFacingAngle: Math.PI / 2 };
      case 'starboard_180':
        return { arcAngleDegrees: 180, localFacingAngle: Math.PI / 2 };
      case 'broadside_port':
        return { arcAngleDegrees: 90, localFacingAngle: -Math.PI / 2 };
      case 'broadside_starboard':
        return { arcAngleDegrees: 90, localFacingAngle: Math.PI / 2 };
      case 'aft_45':
        return { arcAngleDegrees: 45, localFacingAngle: Math.PI };
      case 'aft_90':
        return { arcAngleDegrees: 90, localFacingAngle: Math.PI };
      case 'aft_180':
        return { arcAngleDegrees: 180, localFacingAngle: Math.PI };
      case 'broadside':
        return { arcAngleDegrees: 90, localFacingAngle: Math.PI / 2 }; // Broadside coverage (90°)
      case 'broadside_360':
      default:
        return { arcAngleDegrees: 360, localFacingAngle: 0 };
    }
  }

  /**
   * Creates a WeaponHardpoint instance from a standard Weapon definition
   */
  public static fromWeapon(weapon: Weapon, slotIndex: number = 0): WeaponHardpoint {
    const { arcAngleDegrees, localFacingAngle } = this.firingArcToHardpointAngle(weapon.firingArc);
    const offsetX = (slotIndex % 2 === 0 ? 1 : -1) * (2 + slotIndex * 1.5);
    const offsetZ = 5 - slotIndex * 3;

    return new WeaponHardpoint({
      id: weapon.id,
      name: weapon.name,
      weaponType: weapon.type,
      baseDamage: weapon.baseDamage,
      cooldown: weapon.cooldown,
      currentCooldown: weapon.currentCooldown,
      energyCost: weapon.energyCost,
      range: weapon.range,
      color: weapon.color,
      isTorpedo: weapon.isTorpedo,
      soundName: weapon.soundName,
      arcAngleDegrees,
      localFacingAngle,
      localPosition: { x: offsetX, y: 0, z: offsetZ },
    });
  }

  /**
   * Validates if target is strictly within both maximum weapon range AND active firing arc cone
   */
  public isTargetInArcAndRange(
    attackerPos: { x: number; y: number; z: number },
    attackerRotY: number,
    targetPos: { x: number; y: number; z: number }
  ): boolean {
    // 1. Range Check
    const dx = targetPos.x - attackerPos.x;
    const dz = targetPos.z - attackerPos.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    if (distance > this.config.range) {
      return false;
    }

    // 2. 360° Omnidirectional Point Defense Exception
    if (this.config.arcAngleDegrees >= 360) {
      return true;
    }

    // 3. Firing Arc Angle Cone Calculation
    const absoluteBearing = Math.atan2(dx, dz);
    // Combined hardpoint heading = ship heading + hardpoint local facing angle
    const hardpointHeading = attackerRotY + this.config.localFacingAngle;
    
    let relativeAngle = absoluteBearing - hardpointHeading;
    relativeAngle = Math.atan2(Math.sin(relativeAngle), Math.cos(relativeAngle));

    const relativeDeg = Math.abs((relativeAngle * 180) / Math.PI);
    const halfArc = this.config.arcAngleDegrees / 2;

    return relativeDeg <= halfArc;
  }

  /**
   * Attaches hardpoint visual mesh indicator to 3D ship transform hierarchy
   * 
   * Inline Comment: Attach 3D weapon turret/barrel mesh instances at hardpoint local positions:
   * e.g., hardpointMesh.position.set(localPosition.x, localPosition.y, localPosition.z)
   */
  public attachToTransformHierarchy(parentShipGroup: THREE.Group): THREE.Object3D {
    const hardpointGroup = new THREE.Group();
    hardpointGroup.name = `hardpoint_${this.config.id}`;
    hardpointGroup.position.set(
      this.config.localPosition.x,
      this.config.localPosition.y,
      this.config.localPosition.z
    );
    hardpointGroup.rotation.y = this.config.localFacingAngle;

    parentShipGroup.add(hardpointGroup);
    return hardpointGroup;
  }

  /**
   * Converts WeaponHardpoint config to standard Weapon interface
   */
  public toWeapon(): Weapon {
    let arcString: FiringArc = 'forward_180';
    const angle = this.config.localFacingAngle;
    const arcDeg = this.config.arcAngleDegrees;

    if (arcDeg >= 360) {
      arcString = 'broadside_360';
    } else if (Math.abs(angle) < 0.2) {
      // Facing Fore
      if (arcDeg <= 15) arcString = 'forward_15';
      else if (arcDeg <= 30) arcString = 'forward_30';
      else if (arcDeg <= 45) arcString = 'forward_45';
      else if (arcDeg <= 90) arcString = 'forward_90';
      else arcString = 'forward_180';
    } else if (Math.abs(Math.abs(angle) - Math.PI) < 0.2) {
      // Facing Aft
      if (arcDeg <= 45) arcString = 'aft_45';
      else if (arcDeg <= 90) arcString = 'aft_90';
      else arcString = 'aft_180';
    } else if (angle < -0.2) {
      // Facing Port (-PI/2)
      if (arcDeg <= 45) arcString = 'port_45';
      else if (arcDeg <= 90) arcString = 'port_90';
      else arcString = 'port_180';
    } else if (angle > 0.2) {
      // Facing Starboard (+PI/2)
      if (arcDeg <= 45) arcString = 'starboard_45';
      else if (arcDeg <= 90) arcString = 'starboard_90';
      else arcString = 'starboard_180';
    }

    return {
      id: this.config.id,
      name: this.config.name,
      type: this.config.weaponType,
      firingArc: arcString,
      localFacingAngle: this.config.localFacingAngle,
      arcAngleDegrees: this.config.arcAngleDegrees,
      baseDamage: this.config.baseDamage,
      cooldown: this.config.cooldown,
      currentCooldown: this.config.currentCooldown,
      energyCost: this.config.energyCost,
      range: this.config.range,
      color: this.config.color,
      isTorpedo: this.config.isTorpedo,
      isPulse: this.config.isPulse,
      pulseCount: this.config.pulseCount,
      thickness: this.config.thickness,
      soundName: this.config.soundName,
      isHealShield: this.config.isHealShield,
      isHealHull: this.config.isHealHull,
    };
  }

  /**
   * Ticks down a weapon's active cooldown based on delta time and PowerManagementController weaponCooldownSpeedMult.
   * Playtesting Adjustment Hook: Tune weaponCooldownSpeedMult (e.g. 1.50 = +50% speed in MAX WEAPONS) to adjust firing rhythm.
   */
  public static tickWeaponCooldown(weapon: Weapon, delta: number, cooldownSpeedMult: number = 1.0) {
    if (weapon.currentCooldown > 0) {
      weapon.currentCooldown = Math.max(0, weapon.currentCooldown - delta * cooldownSpeedMult);
    }
  }
}

