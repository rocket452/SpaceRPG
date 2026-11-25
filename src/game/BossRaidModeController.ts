import { PowerPreset, ShipEntity } from '../types';
import { soundManager } from '../audio/soundManager';
import { DirectionalShieldSystem } from './DirectionalShieldSystem';
import { ShipCollisionHandler } from './ShipCollisionHandler';
import { SpaceCombatEngine } from './spaceCombatEngine';

export type RaidRole = 'tank' | 'dps' | 'support';

export interface BossTargetedAttackState {
  state: 'idle' | 'charging' | 'firing_flash';
  cooldownTimer: number;
  chargeTimer: number;
  maxChargeTime: number;
  impactFlashTimer: number;
  targetShipId: string;
  isIntercepted: boolean;
  interceptPoint: { x: number; y: number; z: number };
  coverSpot: { x: number; y: number; z: number };
  beamName: string;
}

export class BossRaidModeController {
  public isBossRaidActive: boolean = true;
  public tankShip: ShipEntity;
  public dpsShip: ShipEntity;
  public supportShip: ShipEntity;
  public bossShip: ShipEntity;
  public matchResult: 'in_progress' | 'victory' | 'defeat' = 'in_progress';
  public elapsedTime: number = 0;

  public readonly bossAnchor = { x: 0, y: 0, z: 110 };
  public readonly bossHeading = Math.PI;

  public targetedAttack: BossTargetedAttackState;

  constructor(
    tankShip: ShipEntity,
    dpsShip: ShipEntity,
    supportShip: ShipEntity,
    bossShip: ShipEntity
  ) {
    this.tankShip = tankShip;
    this.dpsShip = dpsShip;
    this.supportShip = supportShip;
    this.bossShip = bossShip;

    this.tankShip.raidRole = 'tank';
    this.dpsShip.raidRole = 'dps';
    this.supportShip.raidRole = 'support';
    this.bossShip.raidRole = 'boss';

    this.targetedAttack = {
      state: 'idle',
      cooldownTimer: 7.5,
      chargeTimer: 0,
      maxChargeTime: 4.5,
      impactFlashTimer: 0,
      targetShipId: supportShip.id,
      isIntercepted: false,
      interceptPoint: { ...supportShip.position },
      coverSpot: { x: tankShip.position.x, y: 0, z: tankShip.position.z - 28 },
      beamName: 'OBLITERATION BEAM',
    };

    this.evaluateInterception();
  }

  public getPartyShips(): ShipEntity[] {
    return [this.tankShip, this.dpsShip, this.supportShip];
  }

  public update(delta: number, engine: SpaceCombatEngine): void {
    if (!this.isBossRaidActive || this.matchResult !== 'in_progress') return;

    this.elapsedTime += delta;

    // 1. Check Victory / Defeat conditions
    if (this.bossShip.isDestroyed || this.bossShip.hull <= 0) {
      this.bossShip.isDestroyed = true;
      this.matchResult = 'victory';
      this.targetedAttack.state = 'idle';
      engine.addLog(
        `RAID VICTORY! Omega Leviathan Dreadnought neutralized in ${Math.round(this.elapsedTime)}s!`,
        'kill'
      );
      return;
    }

    const livingParty = this.getPartyShips().filter((s) => !s.isDestroyed && s.hull > 0);
    if (livingParty.length === 0 || engine.player.isDestroyed) {
      this.matchResult = 'defeat';
      this.targetedAttack.state = 'idle';
      return;
    }

    // 2. Keep Boss strictly stationary & execute Boss AI
    this.updateBossAI(delta, engine);

    // 3. Execute Allied Party AI for non-player ships
    if (!this.tankShip.isPlayer && !this.tankShip.isDestroyed) {
      this.updateTankAI(delta, engine);
    }
    if (!this.dpsShip.isPlayer && !this.dpsShip.isDestroyed) {
      this.updateDpsAI(delta, engine);
    }
    if (!this.supportShip.isPlayer && !this.supportShip.isDestroyed) {
      this.updateSupportAI(delta, engine);
    }
  }

  /**
   * Evaluates whether the Vanguard Tank ship sits cleanly along the line of sight
   * between the Boss and the Sanctuary Support ship to intercept the Obliteration Beam.
   */
  public evaluateInterception(): boolean {
    const bossPos = this.bossShip.position;
    const supportPos = this.supportShip.position;
    const tankPos = this.tankShip.position;

    const abX = supportPos.x - bossPos.x;
    const abZ = supportPos.z - bossPos.z;
    const abLenSq = abX * abX + abZ * abZ;
    const abLen = Math.sqrt(abLenSq) || 1;
    const ux = abX / abLen;
    const uz = abZ / abLen;

    // Compute recommended cover spot directly behind Tank away from Boss
    const btX = tankPos.x - bossPos.x;
    const btZ = tankPos.z - bossPos.z;
    const btLen = Math.hypot(btX, btZ) || 1;
    this.targetedAttack.coverSpot = {
      x: tankPos.x + (btX / btLen) * 26,
      y: 0,
      z: tankPos.z + (btZ / btLen) * 26,
    };

    this.targetedAttack.isIntercepted = false;
    this.targetedAttack.interceptPoint = {
      x: supportPos.x,
      y: supportPos.y + 0.4,
      z: supportPos.z,
    };

    if (this.tankShip.isDestroyed || this.tankShip.hull <= 0 || this.supportShip.isDestroyed) {
      return false;
    }

    const t = ((tankPos.x - bossPos.x) * abX + (tankPos.z - bossPos.z) * abZ) / Math.max(1, abLenSq);
    const closestX = bossPos.x + abX * t;
    const closestZ = bossPos.z + abZ * t;
    const perpDist = Math.hypot(tankPos.x - closestX, tankPos.z - closestZ);

    const distBossToTank = Math.hypot(tankPos.x - bossPos.x, tankPos.z - bossPos.z);

    // Tank must be strictly between Boss and Support and within generous shield intercept corridor (15m)
    if (t > 0.05 && t < 0.985 && distBossToTank < abLen - 2.0 && perpDist <= 15.0) {
      this.targetedAttack.isIntercepted = true;
      this.targetedAttack.interceptPoint = {
        x: closestX - ux * 7.5,
        y: tankPos.y + 0.4,
        z: closestZ - uz * 7.5,
      };
      return true;
    }

    return false;
  }

  private updateBossAI(delta: number, engine: SpaceCombatEngine): void {
    // Anchor stationary Boss
    this.bossShip.position.x = this.bossAnchor.x;
    this.bossShip.position.y = this.bossAnchor.y;
    this.bossShip.position.z = this.bossAnchor.z;
    this.bossShip.rotation.y = this.bossHeading;
    this.bossShip.speed = 0;
    this.bossShip.targetSpeed = 0;
    this.bossShip.targetAngularVelocity = 0;

    // Equalize shields occasionally when one quadrant is depleted while others remain full
    const arcs = [
      this.bossShip.shields.front,
      this.bossShip.shields.starboard,
      this.bossShip.shields.back,
      this.bossShip.shields.port,
    ];
    const hasCriticalArc = arcs.some((a) => a.current < a.max * 0.2);
    const hasHealthyArc = arcs.some((a) => a.current > a.max * 0.65);
    if (hasCriticalArc && hasHealthyArc) {
      DirectionalShieldSystem.equalizeShields(this.bossShip.shields, this.bossShip);
    }

    // Standard Boss Attacks ONLY shoot the Tank ship (unless Tank is destroyed)
    let regularTarget: ShipEntity | null =
      !this.tankShip.isDestroyed && this.tankShip.hull > 0 ? this.tankShip : null;

    if (!regularTarget) {
      const livingOthers = [this.dpsShip, this.supportShip]
        .filter((s) => !s.isDestroyed && s.hull > 0)
        .sort(
          (a, b) =>
            Math.hypot(a.position.x - this.bossShip.position.x, a.position.z - this.bossShip.position.z) -
            Math.hypot(b.position.x - this.bossShip.position.x, b.position.z - this.bossShip.position.z)
        );
      regularTarget = livingOthers[0] || null;
    }

    if (regularTarget) {
      this.bossShip.targetId = regularTarget.id;
      const distToTarget = Math.hypot(
        regularTarget.position.x - this.bossShip.position.x,
        regularTarget.position.z - this.bossShip.position.z
      );
      this.bossShip.weapons.forEach((w, idx) => {
        if (w.currentCooldown <= 0 && distToTarget <= w.range) {
          engine.fireWeapon(this.bossShip, idx, regularTarget!);
        }
      });
    }

    // Targeted Obliteration Beam mechanic against Support Ship
    if (this.supportShip.isDestroyed || this.supportShip.hull <= 0) {
      this.targetedAttack.state = 'idle';
      this.evaluateInterception();
      return;
    }

    if (this.targetedAttack.state === 'idle') {
      this.evaluateInterception();
      this.targetedAttack.cooldownTimer -= delta;
      if (this.targetedAttack.cooldownTimer <= 0) {
        this.targetedAttack.state = 'charging';
        this.targetedAttack.chargeTimer = this.targetedAttack.maxChargeTime;
        this.evaluateInterception();
        soundManager.playErrorAlert?.();
        engine.addLog(
          `BOSS LOCK-ON: ${this.bossShip.name} charging OBLITERATION BEAM on ${this.supportShip.name}! Hide behind ${this.tankShip.name}!`,
          'system'
        );
      }
    } else if (this.targetedAttack.state === 'charging') {
      this.evaluateInterception();
      this.targetedAttack.chargeTimer -= delta;
      if (this.targetedAttack.chargeTimer <= 0) {
        this.executeObliterationBeam(engine);
      }
    } else if (this.targetedAttack.state === 'firing_flash') {
      this.evaluateInterception();
      this.targetedAttack.impactFlashTimer -= delta;
      if (this.targetedAttack.impactFlashTimer <= 0) {
        this.targetedAttack.state = 'idle';
        this.targetedAttack.cooldownTimer = 13.5;
      }
    }
  }

  private executeObliterationBeam(engine: SpaceCombatEngine): void {
    const intercepted = this.evaluateInterception();
    const muzzlePos = {
      x: this.bossShip.position.x,
      y: this.bossShip.position.y + 0.5,
      z: this.bossShip.position.z - 14.0,
    };

    if (intercepted && !this.tankShip.isDestroyed) {
      const impactPos = { ...this.targetedAttack.interceptPoint };
      const beamId = `boss_obliteration_intercepted_${Date.now()}`;
      engine.beamEffects.push({
        id: beamId,
        shooterId: this.bossShip.id,
        targetId: this.tankShip.id,
        firingArc: 'broadside_360',
        sourcePos: muzzlePos,
        targetPos: impactPos,
        color: '#10b981',
        thickness: 3.4,
        duration: 1.5,
        maxDuration: 1.5,
      });

      engine.createImpactSparks(impactPos, '#10b981', 24);
      engine.applyDamage(this.bossShip, this.tankShip, 240, 'disruptor_beam', impactPos, 1.5, beamId);
      soundManager.playShieldHit();
      engine.addLog(
        `BEAM INTERCEPTED! ${this.tankShip.name} blocked the Obliteration Beam for ${this.supportShip.name}!`,
        'ability',
        240,
        'player'
      );
    } else {
      const impactPos = { ...this.supportShip.position };
      const beamId = `boss_obliteration_direct_${Date.now()}`;
      engine.beamEffects.push({
        id: beamId,
        shooterId: this.bossShip.id,
        targetId: this.supportShip.id,
        firingArc: 'broadside_360',
        sourcePos: muzzlePos,
        targetPos: impactPos,
        color: '#ef4444',
        thickness: 3.8,
        duration: 1.5,
        maxDuration: 1.5,
      });

      engine.createImpactSparks(impactPos, '#ef4444', 30);
      engine.applyDamage(this.bossShip, this.supportShip, 780, 'torpedo_photon', impactPos, 1.5, beamId);
      soundManager.playHullImpact();
      engine.addLog(
        `CRITICAL EXPOSURE! Obliteration Beam struck ${this.supportShip.name} directly (780 damage)! Stay behind ${this.tankShip.name}!`,
        'damage_hull',
        780,
        this.supportShip.isPlayer ? 'enemy' : 'system'
      );
    }

    this.targetedAttack.state = 'firing_flash';
    this.targetedAttack.impactFlashTimer = 1.5;
  }

  private steerShipToward(
    ship: ShipEntity,
    dest: { x: number; z: number },
    faceTarget: { x: number; z: number },
    engine: SpaceCombatEngine,
    desiredSpeedRatio: number,
    standoffStopRadius: number = 6.0
  ): void {
    const dx = dest.x - ship.position.x;
    const dz = dest.z - ship.position.z;
    const distToDest = Math.hypot(dx, dz);

    let desiredHeading = Math.atan2(faceTarget.x - ship.position.x, faceTarget.z - ship.position.z);
    if (distToDest > standoffStopRadius) {
      desiredHeading = Math.atan2(dx, dz);
    }

    const { adjustedHeading: shipAvoidHeading } = ShipCollisionHandler.calculateShipAvoidanceHeading(
      ship,
      [engine.player, ...engine.enemies],
      desiredHeading,
      24.0
    );
    desiredHeading = shipAvoidHeading;

    const { adjustedHeading } = ShipCollisionHandler.calculateAsteroidAvoidanceHeading(
      ship,
      engine.asteroids,
      desiredHeading,
      36.0
    );
    desiredHeading = adjustedHeading;

    const angleDiff = Math.atan2(
      Math.sin(desiredHeading - ship.rotation.y),
      Math.cos(desiredHeading - ship.rotation.y)
    );
    const maxTurnRad = (ship.shipClass.turnRate * Math.PI) / 180;
    if (Math.abs(angleDiff) > 0.04) {
      ship.targetAngularVelocity = Math.sign(angleDiff) * Math.min(maxTurnRad, Math.abs(angleDiff) * 2.5);
    } else {
      ship.targetAngularVelocity = 0;
    }

    if (distToDest <= standoffStopRadius) {
      ship.targetSpeed = 0;
    } else {
      const slowFactor = Math.min(1.0, distToDest / 25.0);
      ship.targetSpeed = ship.shipClass.maxSpeed * desiredSpeedRatio * Math.max(0.35, slowFactor);
    }
  }

  private updateTankAI(delta: number, engine: SpaceCombatEngine): void {
    const tank = this.tankShip;
    tank.targetId = this.bossShip.id;
    tank.waypoint = null;

    // Power management: use balanced (keeps weapons firing while regenerating shields) or full weapons when shields healthy
    const arcs = [tank.shields.front, tank.shields.starboard, tank.shields.back, tank.shields.port];
    const minArcRatio = Math.min(...arcs.map((a) => (a.max > 0 ? a.current / a.max : 1)));
    const desiredPower: PowerPreset = minArcRatio < 0.65 ? 'balanced' : 'weapons';
    if (tank.powerPreset !== desiredPower) {
      engine.setPowerPreset(tank, desiredPower);
    }

    // Defensive tank abilities
    if (minArcRatio < 0.45) {
      const rebal = tank.abilities.find((a) => a.id === 'shield_rebalance' && a.currentCooldown <= 0);
      if (rebal) {
        engine.useAbility(tank, 'shield_rebalance');
      } else {
        const distSh = tank.abilities.find((a) => a.id === 'distribute_shields' && a.currentCooldown <= 0);
        if (distSh) engine.useAbility(tank, 'distribute_shields');
      }
    }
    if (tank.hull < tank.maxHull * 0.78) {
      const haz = tank.abilities.find((a) => a.id === 'hazard_emitters' && a.currentCooldown <= 0);
      if (haz) engine.useAbility(tank, 'hazard_emitters');
    }

    const faw = tank.abilities.find((a) => a.id === 'fire_at_will' && a.currentCooldown <= 0);
    if (faw) engine.useAbility(tank, 'fire_at_will');

    // Position Vanguard Tank between Boss and Support (~48m south of Boss along Boss -> Support ray)
    let holdX = 0;
    let holdZ = 56;
    if (!this.supportShip.isDestroyed) {
      const bToSx = this.supportShip.position.x - this.bossShip.position.x;
      const bToSz = this.supportShip.position.z - this.bossShip.position.z;
      const len = Math.hypot(bToSx, bToSz) || 1;
      const tankStandOff = Math.min(54, Math.max(36, len * 0.55));
      holdX = this.bossShip.position.x + (bToSx / len) * tankStandOff;
      holdZ = this.bossShip.position.z + (bToSz / len) * tankStandOff;
    }

    this.steerShipToward(
      tank,
      { x: holdX, z: holdZ },
      this.bossShip.position,
      engine,
      this.targetedAttack.state === 'charging' ? 0.95 : 0.7,
      5.5
    );

    // Fire Tank weapons at Boss
    const distToBoss = Math.hypot(
      this.bossShip.position.x - tank.position.x,
      this.bossShip.position.z - tank.position.z
    );
    tank.weapons.forEach((w, idx) => {
      if (w.currentCooldown <= 0 && distToBoss <= w.range) {
        if (SpaceCombatEngine.isInFiringArc(tank.position, tank.rotation.y, this.bossShip.position, w.firingArc, w)) {
          engine.fireWeapon(tank, idx, this.bossShip);
        }
      }
    });
  }

  private updateDpsAI(delta: number, engine: SpaceCombatEngine): void {
    this.dpsShip.waypoint = null;
    // Keep Dragoon flanking outward away from the central Boss <-> Tank/Support cover lane
    const dState = (this.dpsShip as any).dragoonAIState;
    if (dState && Math.abs(this.dpsShip.position.x - this.bossShip.position.x) < 28 && this.dpsShip.position.z < this.bossShip.position.z) {
      dState.strafeSign = this.dpsShip.position.x <= this.bossShip.position.x ? -1 : 1;
    }
    engine.updateDragoonAI(this.dpsShip, delta, this.bossShip, []);
  }

  private updateSupportAI(delta: number, engine: SpaceCombatEngine): void {
    const sup = this.supportShip;
    sup.waypoint = null;

    // Keep reactor on 'weapons' (2.0x heal beam reload speed) unless Support's own shields are below 40%, in which case use 'balanced' (1.0x reload + regen). Never use 'shields' (0% weapons freezes beam cooldowns!).
    const supShieldCur =
      sup.shields.front.current +
      sup.shields.starboard.current +
      sup.shields.back.current +
      sup.shields.port.current;
    const supShieldMax = Math.max(
      1,
      sup.shields.front.max + sup.shields.starboard.max + sup.shields.back.max + sup.shields.port.max
    );
    const desiredSupportPower: PowerPreset = supShieldCur / supShieldMax < 0.4 ? 'balanced' : 'weapons';
    if (sup.powerPreset !== desiredSupportPower) {
      engine.setPowerPreset(sup, desiredSupportPower);
    }

    // Position Support safely behind Tank (~26m behind Tank away from Boss)
    let safeSpot = { x: 0, z: 22 };
    if (!this.tankShip.isDestroyed && this.tankShip.hull > 0) {
      const bToTx = this.tankShip.position.x - this.bossShip.position.x;
      const bToTz = this.tankShip.position.z - this.bossShip.position.z;
      const len = Math.hypot(bToTx, bToTz) || 1;
      safeSpot = {
        x: this.tankShip.position.x + (bToTx / len) * 26,
        z: this.tankShip.position.z + (bToTz / len) * 26,
      };
    }

    this.steerShipToward(
      sup,
      safeSpot,
      this.tankShip.isDestroyed ? this.bossShip.position : this.tankShip.position,
      engine,
      this.targetedAttack.state === 'charging' ? 1.0 : 0.85,
      4.5
    );

    const livingAllies = this.getPartyShips().filter((s) => !s.isDestroyed && s.hull > 0);
    const getShieldMetrics = (s: ShipEntity) => {
      const arcs = [s.shields.front, s.shields.starboard, s.shields.back, s.shields.port];
      const cur = arcs.reduce((sum, a) => sum + a.current, 0);
      const max = Math.max(1, arcs.reduce((sum, a) => sum + a.max, 0));
      const minArc = Math.min(...arcs.map((a) => (a.max > 0 ? a.current / a.max : 1)));
      return { totalRatio: cur / max, minArcRatio: minArc };
    };

    // 1. Shield Transfer Beam (prioritize lowest in-range shield ratio or damaged arc, favoring player when equally hurt)
    const shieldBeamIdx = sup.weapons.findIndex((w) => w.isHealShield || w.type === 'shield_transfer_beam');
    if (shieldBeamIdx >= 0 && sup.weapons[shieldBeamIdx].currentCooldown <= 0) {
      const beamRange = sup.weapons[shieldBeamIdx].range || 220;
      const shieldCandidates = livingAllies
        .filter((a) => Math.hypot(a.position.x - sup.position.x, a.position.z - sup.position.z) <= beamRange)
        .filter((a) => {
          const m = getShieldMetrics(a);
          return m.totalRatio < 0.99 || m.minArcRatio < 0.95;
        })
        .sort((a, b) => {
          const mA = getShieldMetrics(a);
          const mB = getShieldMetrics(b);
          const scoreA = Math.min(mA.totalRatio, mA.minArcRatio + 0.12);
          const scoreB = Math.min(mB.totalRatio, mB.minArcRatio + 0.12);
          if (Math.abs(scoreA - scoreB) > 0.05) return scoreA - scoreB;
          if (a.isPlayer && !b.isPlayer) return -1;
          if (b.isPlayer && !a.isPlayer) return 1;
          return 0;
        });

      const shieldTarget = shieldCandidates[0];
      if (shieldTarget) {
        sup.targetId = shieldTarget.id;
        engine.fireWeapon(sup, shieldBeamIdx, shieldTarget);
      }
    }

    // 2. Nanite Hull Repair Beam (prioritize lowest in-range hull ratio, favoring player when close)
    const hullBeamIdx = sup.weapons.findIndex((w) => w.isHealHull || w.type === 'hull_repair_beam');
    if (hullBeamIdx >= 0 && sup.weapons[hullBeamIdx].currentCooldown <= 0) {
      const beamRange = sup.weapons[hullBeamIdx].range || 220;
      const hullCandidates = livingAllies
        .filter((a) => Math.hypot(a.position.x - sup.position.x, a.position.z - sup.position.z) <= beamRange)
        .filter((a) => a.hull < a.maxHull * 0.99)
        .sort((a, b) => {
          const ratioA = a.hull / Math.max(1, a.maxHull);
          const ratioB = b.hull / Math.max(1, b.maxHull);
          if (Math.abs(ratioA - ratioB) > 0.05) return ratioA - ratioB;
          if (a.isPlayer && !b.isPlayer) return -1;
          if (b.isPlayer && !a.isPlayer) return 1;
          return 0;
        });

      const hullTarget = hullCandidates[0];
      if (hullTarget) {
        sup.targetId = hullTarget.id;
        engine.fireWeapon(sup, hullBeamIdx, hullTarget);
      }
    }

    // 3. [Q] Aegis Restoration Wave when any ally drops below 88% hull or 82% shields
    const needsAoERestore = livingAllies.some((a) => {
      const m = getShieldMetrics(a);
      return a.hull < a.maxHull * 0.88 || m.totalRatio < 0.82 || m.minArcRatio < 0.45;
    });
    if (needsAoERestore) {
      const aegis = sup.abilities.find((a) => a.id === 'aegis_restoration_pulse' && a.currentCooldown <= 0);
      if (aegis) {
        engine.useAbility(sup, 'aegis_restoration_pulse');
      }
    }

    // 4. Defensive Light Phaser on Boss when in range
    const defenseIdx = sup.weapons.findIndex((w) => !w.isHealShield && !w.isHealHull);
    if (defenseIdx >= 0 && sup.weapons[defenseIdx].currentCooldown <= 0) {
      const dBoss = Math.hypot(this.bossShip.position.x - sup.position.x, this.bossShip.position.z - sup.position.z);
      if (dBoss <= sup.weapons[defenseIdx].range) {
        engine.fireWeapon(sup, defenseIdx, this.bossShip);
      }
    }
  }
}
