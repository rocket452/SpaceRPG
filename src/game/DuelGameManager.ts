import { ShipEntity } from '../types';

export type DuelStatus = 'idle' | 'countdown' | 'in_progress' | 'ended';

export interface DuelStats {
  brawlerDamageDealt: number;
  dragoonDamageDealt: number;
  brawlerShieldRebalances: number;
  dragoonVectorBursts: number;
  brawlerQuadrantsDepleted: number;
  dragoonQuadrantsDepleted: number;
  matchDuration: number;
  winnerName: string | null;
}

export class DuelGameManager {
  public status: DuelStatus = 'idle';
  public brawlerShip: ShipEntity | null = null;
  public dragoonShip: ShipEntity | null = null;
  public countdownSeconds: number = 3;
  public stats: DuelStats = {
    brawlerDamageDealt: 0,
    dragoonDamageDealt: 0,
    brawlerShieldRebalances: 0,
    dragoonVectorBursts: 0,
    brawlerQuadrantsDepleted: 0,
    dragoonQuadrantsDepleted: 0,
    matchDuration: 0,
    winnerName: null,
  };

  /**
   * Initializes a 1v1 tactical duel between Vanguard Brawler and Vector Dragoon
   */
  public startDuel(brawler: ShipEntity, dragoon: ShipEntity) {
    this.brawlerShip = brawler;
    this.dragoonShip = dragoon;
    this.status = 'in_progress';
    this.countdownSeconds = 0;
    this.stats = {
      brawlerDamageDealt: 0,
      dragoonDamageDealt: 0,
      brawlerShieldRebalances: 0,
      dragoonVectorBursts: 0,
      brawlerQuadrantsDepleted: 0,
      dragoonQuadrantsDepleted: 0,
      matchDuration: 0,
      winnerName: null,
    };
  }

  /**
   * Updates 1v1 duel timer, health status, and checks victory conditions
   */
  public update(delta: number): { isMatchOver: boolean; winner: ShipEntity | null } {
    if (this.status !== 'in_progress' || !this.brawlerShip || !this.dragoonShip) {
      return { isMatchOver: false, winner: null };
    }

    this.stats.matchDuration += delta;

    // Check Win Condition: Primary Hull Destruction
    if (this.brawlerShip.isDestroyed || this.brawlerShip.hull <= 0) {
      this.status = 'ended';
      this.stats.winnerName = this.dragoonShip.name;
      return { isMatchOver: true, winner: this.dragoonShip };
    }

    if (this.dragoonShip.isDestroyed || this.dragoonShip.hull <= 0) {
      this.status = 'ended';
      this.stats.winnerName = this.brawlerShip.name;
      return { isMatchOver: true, winner: this.brawlerShip };
    }

    return { isMatchOver: false, winner: null };
  }

  /**
   * Records damage statistics for duel analytics
   */
  public recordDamage(attackerId: string, damageAmount: number) {
    if (!this.brawlerShip || !this.dragoonShip) return;

    if (attackerId === this.brawlerShip.id) {
      this.stats.brawlerDamageDealt += damageAmount;
    } else if (attackerId === this.dragoonShip.id) {
      this.stats.dragoonDamageDealt += damageAmount;
    }
  }

  /**
   * Records ability execution metrics
   */
  public recordAbility(shipId: string, abilityId: string) {
    if (!this.brawlerShip || !this.dragoonShip) return;

    if (shipId === this.brawlerShip.id && abilityId === 'shield_rebalance') {
      this.stats.brawlerShieldRebalances++;
    } else if (shipId === this.dragoonShip.id && abilityId === 'vector_burst') {
      this.stats.dragoonVectorBursts++;
    }
  }
}
