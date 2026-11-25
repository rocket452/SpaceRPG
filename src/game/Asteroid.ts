import { Asteroid } from '../types';

export type AsteroidCollisionCallback = (
  asteroid: Asteroid,
  shipName: string,
  impactDamage: number,
  impactPoint: { x: number; y: number; z: number }
) => void;

/**
 * Class representing static environment asteroids with mass properties,
 * destructibility, and collision signal emission.
 */
export class AsteroidObject implements Asteroid {
  public id: string;
  public position: { x: number; y: number; z: number };
  public radius: number;
  public health: number;
  public maxHealth: number;
  public mass: number;
  public isDestroyed: boolean = false;

  private collisionListeners: AsteroidCollisionCallback[] = [];

  constructor(
    id: string,
    position: { x: number; y: number; z: number },
    radius: number,
    health?: number
  ) {
    this.id = id;
    this.position = position;
    this.radius = radius;
    
    // Mass scales cubically with volume (radius^3) representing dense nickel-iron space rock
    this.mass = Math.round(Math.pow(radius, 2.5) * 45);
    this.maxHealth = health || Math.round(radius * 120);
    this.health = this.maxHealth;
  }

  /**
   * Registers a listener callback for collision signals
   */
  public onCollision(callback: AsteroidCollisionCallback) {
    this.collisionListeners.push(callback);
  }

  /**
   * Emits collision signal to registered event listeners upon impact
   */
  public emitCollisionSignal(
    shipName: string,
    impactDamage: number,
    impactPoint: { x: number; y: number; z: number }
  ) {
    this.collisionListeners.forEach((listener) => {
      listener(this, shipName, impactDamage, impactPoint);
    });
  }

  /**
   * Inflicts damage on the asteroid structure
   */
  public takeDamage(damage: number, sourceName?: string): boolean {
    if (this.isDestroyed) return false;
    this.health = Math.max(0, this.health - damage);
    if (this.health <= 0) {
      this.isDestroyed = true;
    }
    return this.isDestroyed;
  }
}
