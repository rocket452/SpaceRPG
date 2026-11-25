import { Faction, ShipEntity } from '../types';
import { Starbase, StarbaseSystem, Team, WaveSpawner, MinionShipAI } from './StarbaseAndWaveSpawner';
import { SpaceCombatEngine } from './spaceCombatEngine';

/**
 * STARBASE SIEGE MOBA MATCH CONTROLLER
 * 
 * Manages the automated wave-based push loop:
 * - Team Alpha (Starfleet / Player Alliance) Starbase at Z = -1000
 * - Team Beta (Opposing Empire / Borg Alliance) Starbase at Z = +1000
 * - Periodically spawns opposing waves of light minion frigates down the central lane.
 * - Handles win/loss conditions when a Starbase is destroyed.
 */
export class StarbaseSiegeModeController {
  public isSiegeActive: boolean = false;
  
  public alphaStarbase: Starbase;
  public betaStarbase: Starbase;

  public waveSpawnerAlpha: WaveSpawner;
  public waveSpawnerBeta: WaveSpawner;

  public waveTimer: number = 30; // Seconds until next wave
  public currentWaveCount: number = 0;

  public matchResult: 'in_progress' | 'victory' | 'defeat' = 'in_progress';

  constructor(playerFaction: Faction = 'federation') {
    // 1. Initialize Team Alpha Starbase (Player's Team) at Z = -237.5 (50% compact play area)
    this.alphaStarbase = StarbaseSystem.createStarbase(
      'starbase_alpha',
      'Starfleet Starbase Alpha',
      'alpha',
      playerFaction,
      { x: 0, y: 0, z: -237.5 }
    );

    // 2. Initialize Team Beta Enemy Starbase at Z = +237.5
    const enemyFaction: Faction = playerFaction === 'klingon' ? 'federation' : 'klingon';
    this.betaStarbase = StarbaseSystem.createStarbase(
      'starbase_beta',
      'Empire Forward Dreadnought Station',
      'beta',
      enemyFaction,
      { x: 0, y: 0, z: 237.5 }
    );

    // 3. Initialize Wave Spawners (Timer default: 30 seconds)
    // Compact lane length: Spawners at Z = -212.5 and Z = +212.5
    this.waveSpawnerAlpha = new WaveSpawner('alpha', { x: 0, y: 0, z: -212.5 }, { x: 0, y: 0, z: 237.5 }, 30);
    this.waveSpawnerBeta = new WaveSpawner('beta', { x: 0, y: 0, z: 212.5 }, { x: 0, y: 0, z: -237.5 }, 30);

    this.isSiegeActive = true;
  }

  /**
   * Resets or switches mode state
   */
  public startSiegeMode(playerFaction: Faction) {
    this.matchResult = 'in_progress';
    this.waveTimer = 30;
    this.currentWaveCount = 0;

    this.alphaStarbase = StarbaseSystem.createStarbase(
      'starbase_alpha',
      'Starfleet Starbase Alpha',
      'alpha',
      playerFaction,
      { x: 0, y: 0, z: -237.5 }
    );

    const enemyFaction: Faction = playerFaction === 'klingon' ? 'federation' : 'klingon';
    this.betaStarbase = StarbaseSystem.createStarbase(
      'starbase_beta',
      'Empire Dreadnought Station',
      'beta',
      enemyFaction,
      { x: 0, y: 0, z: 237.5 }
    );

    this.waveSpawnerAlpha = new WaveSpawner('alpha', { x: 0, y: 0, z: -212.5 }, { x: 0, y: 0, z: 237.5 }, 30);
    this.waveSpawnerBeta = new WaveSpawner('beta', { x: 0, y: 0, z: 212.5 }, { x: 0, y: 0, z: -237.5 }, 30);
    this.isSiegeActive = true;
  }

  /**
   * Main MOBA Wave & Tower Loop Tick
   */
  public update(delta: number, engine: SpaceCombatEngine) {
    if (!this.isSiegeActive || this.matchResult !== 'in_progress') return;

    // A. Wave Spawn Countdown Timer
    this.waveTimer -= delta;
    if (this.waveTimer <= 0) {
      this.waveTimer = 30; // Reset 30s countdown
      this.currentWaveCount++;

      // Spawn minion waves for both teams
      const alphaMinions = this.waveSpawnerAlpha.spawnWave();
      const betaMinions = this.waveSpawnerBeta.spawnWave();

      engine.enemies.push(...alphaMinions, ...betaMinions);
      engine.addLog(`[WAVE ${this.currentWaveCount}] Reinforcements launched down central lane!`, 'system');
    }

    // B. Minion AI Execution
    engine.enemies.forEach((ship) => {
      if ((ship as any).isMinion && !ship.isDestroyed) {
        const team: Team = (ship as any).team || 'beta';
        const targetBase = team === 'alpha' ? this.betaStarbase : this.alphaStarbase;
        const enemyShips = team === 'alpha'
          ? engine.enemies.filter((e) => ((e as any).team || 'beta') === 'beta')
          : [engine.player, ...engine.enemies.filter((e) => ((e as any).team || 'beta') === 'alpha')];

        MinionShipAI.updateMinion(
          ship,
          targetBase.position,
          enemyShips,
          targetBase.isDestroyed ? null : targetBase,
          delta,
          engine
        );
      }
    });

    // C. Starbase Turret Weapon Defense Loop
    [this.alphaStarbase, this.betaStarbase].forEach((starbase) => {
      if (starbase.isDestroyed) return;

      // Cooldown timer update
      starbase.weapons.forEach((w) => {
        if (w.currentCooldown > 0) {
          w.currentCooldown = Math.max(0, w.currentCooldown - delta);
        }
      });

      const enemyTeam = starbase.team === 'alpha' ? 'beta' : 'alpha';
      const potentialTargets = engine.enemies.filter(
        (e) => !e.isDestroyed && e.id !== starbase.id && (e.team || 'beta') === enemyTeam
      );
      if (starbase.team === 'beta' && !engine.player.isDestroyed && (engine.player.team || 'alpha') === 'alpha') {
        potentialTargets.push(engine.player);
      }

      let closestTarget: ShipEntity | null = null;
      let closestDist = Infinity;

      potentialTargets.forEach((target) => {
        const dx = target.position.x - starbase.position.x;
        const dz = target.position.z - starbase.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < closestDist) {
          closestDist = dist;
          closestTarget = target;
        }
      });

      if (closestTarget && closestDist <= 250) {
        starbase.weapons.forEach((w, idx) => {
          if (w.currentCooldown <= 0 && closestDist <= w.range) {
            engine.fireWeapon(starbase, idx, closestTarget!);
          }
        });
      }
    });

    // D. Starbase Siege Win / Loss Evaluation
    if (this.betaStarbase.isDestroyed && this.matchResult === 'in_progress') {
      this.matchResult = 'victory';
      engine.addLog('=== VICTORY! Enemy Starbase Destroyed! Sector Secured! ===', 'kill');
    } else if ((this.alphaStarbase.isDestroyed || engine.player.isDestroyed) && this.matchResult === 'in_progress') {
      this.matchResult = 'defeat';
      engine.addLog('=== DEFEAT! Starbase Alpha has fallen! ===', 'kill');
    }
  }
}
