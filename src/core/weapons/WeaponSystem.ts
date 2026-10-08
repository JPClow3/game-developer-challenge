import type {
  Projectile,
  WeaponType,
  KinematicState,
  ArenaBounds,
  WeaponConfig,
  BroadsideWeaponConfig,
} from '../../types';
import {
  DEFAULT_WEAPON_FRONT,
  DEFAULT_WEAPON_BROADSIDE_LEFT,
  DEFAULT_WEAPON_BROADSIDE_RIGHT,
} from '../../types';
import { getForwardVector } from '../kinematics/ShipKinematics';
import { broadsideLanes } from './BroadsideGeometry';

export interface WeaponSystemConfig {
  front: WeaponConfig;
  broadsideLeft: BroadsideWeaponConfig;
  broadsideRight: BroadsideWeaponConfig;
}

export const DEFAULT_WEAPON_SYSTEM_CONFIG: WeaponSystemConfig = {
  front: DEFAULT_WEAPON_FRONT,
  broadsideLeft: DEFAULT_WEAPON_BROADSIDE_LEFT,
  broadsideRight: DEFAULT_WEAPON_BROADSIDE_RIGHT,
};

let nextProjectileId = 1;

/**
 * Resets the projectile ID counter (useful for deterministic tests).
 */
export function resetProjectileIdCounter(): void {
  nextProjectileId = 1;
}

/**
 * WeaponSystem manages weapon cooldowns, salvo projectile spawning,
 * and projectile kinematics.
 */
export class WeaponSystem {
  public cooldownFront = 0;
  public cooldownLeftBroadside = 0;
  public cooldownRightBroadside = 0;

  constructor(public readonly config: WeaponSystemConfig = DEFAULT_WEAPON_SYSTEM_CONFIG) {}

  /**
   * Decrements independent weapon cooldown timers by dt seconds.
   */
  public stepCooldowns(dt: number): void {
    if (dt <= 0) return;
    if (this.cooldownFront > 0) {
      this.cooldownFront -= dt;
      if (this.cooldownFront <= 1e-5) this.cooldownFront = 0;
    }
    if (this.cooldownLeftBroadside > 0) {
      this.cooldownLeftBroadside -= dt;
      if (this.cooldownLeftBroadside <= 1e-5) this.cooldownLeftBroadside = 0;
    }
    if (this.cooldownRightBroadside > 0) {
      this.cooldownRightBroadside -= dt;
      if (this.cooldownRightBroadside <= 1e-5) this.cooldownRightBroadside = 0;
    }
  }

  /**
   * Checks if a weapon is ready to discharge.
   */
  public canFire(weapon: WeaponType): boolean {
    switch (weapon) {
      case 'front':
        return this.cooldownFront <= 1e-5;
      case 'broadside_left':
        return this.cooldownLeftBroadside <= 1e-5;
      case 'broadside_right':
        return this.cooldownRightBroadside <= 1e-5;
    }
  }

  /**
   * Normalized cooldown fraction: 0.0 (ready to fire) to 1.0 (just fired / full cooldown).
   */
  public getCooldownFraction(weapon: WeaponType): number {
    switch (weapon) {
      case 'front':
        return this.config.front.cooldownSeconds > 0
          ? Math.min(1, Math.max(0, this.cooldownFront / this.config.front.cooldownSeconds))
          : 0;
      case 'broadside_left':
        return this.config.broadsideLeft.cooldownSeconds > 0
          ? Math.min(1, Math.max(0, this.cooldownLeftBroadside / this.config.broadsideLeft.cooldownSeconds))
          : 0;
      case 'broadside_right':
        return this.config.broadsideRight.cooldownSeconds > 0
          ? Math.min(1, Math.max(0, this.cooldownRightBroadside / this.config.broadsideRight.cooldownSeconds))
          : 0;
    }
  }

  /**
   * Fires the frontal cannon: 1 projectile, 0.6s cooldown, 25 damage, 480 px/s.
   * Launched from bow along ship heading.
   */
  public fireFront(
    ship: KinematicState,
    owner: 'player' | 'enemy' = 'player',
    customConfig?: WeaponConfig
  ): Projectile[] {
    const cfg = customConfig || this.config.front;
    if (owner === 'player') {
      if (!this.canFire('front')) return [];
      this.cooldownFront = cfg.cooldownSeconds;
    }

    const f = getForwardVector(ship.rotation);
    const bowOffset = 24; // px from center to bow gunport
    const spawnX = ship.x + f.x * bowOffset;
    const spawnY = ship.y + f.y * bowOffset;

    // Projectile speed + small inheritance from ship velocity
    const vx = f.x * cfg.projectileSpeed + ship.velocityX * 0.15;
    const vy = f.y * cfg.projectileSpeed + ship.velocityY * 0.15;

    const projectile: Projectile = {
      id: nextProjectileId++,
      owner,
      weaponType: 'front',
      x: spawnX,
      y: spawnY,
      prevX: spawnX,
      prevY: spawnY,
      vx,
      vy,
      radius: cfg.projectileRadius,
      damage: cfg.projectileDamage,
      remainingLife: cfg.projectileLifetime,
      isDead: false,
    };

    return [projectile];
  }

  /**
   * Fires the port (left) broadside: 3 parallel projectiles launched from distinct flank gunports
   * along port normal (-r). 1.8s cooldown, 3x20 damage, 420 px/s.
   */
  public fireBroadsideLeft(
    ship: KinematicState,
    owner: 'player' | 'enemy' = 'player',
    customConfig?: BroadsideWeaponConfig
  ): Projectile[] {
    const cfg = customConfig || this.config.broadsideLeft;
    if (owner === 'player') {
      if (!this.canFire('broadside_left')) return [];
      this.cooldownLeftBroadside = cfg.cooldownSeconds;
    }

    const projectiles: Projectile[] = broadsideLanes(ship,cfg,'port').map(({x:spawnX,y:spawnY,vx,vy}) => {
      return {
        id: nextProjectileId++,
        owner,
        weaponType: 'broadside_left',
        x: spawnX,
        y: spawnY,
        prevX: spawnX,
        prevY: spawnY,
        vx,
        vy,
        radius: cfg.projectileRadius,
        damage: cfg.projectileDamage,
        remainingLife: cfg.projectileLifetime,
        isDead: false,
      };
    });

    return projectiles;
  }

  /**
   * Fires the starboard (right) broadside: 3 parallel projectiles launched from distinct flank gunports
   * along starboard normal (+r). 1.8s cooldown, 3x20 damage, 420 px/s.
   */
  public fireBroadsideRight(
    ship: KinematicState,
    owner: 'player' | 'enemy' = 'player',
    customConfig?: BroadsideWeaponConfig
  ): Projectile[] {
    const cfg = customConfig || this.config.broadsideRight;
    if (owner === 'player') {
      if (!this.canFire('broadside_right')) return [];
      this.cooldownRightBroadside = cfg.cooldownSeconds;
    }

    const projectiles: Projectile[] = broadsideLanes(ship,cfg,'starboard').map(({x:spawnX,y:spawnY,vx,vy}) => {
      return {
        id: nextProjectileId++,
        owner,
        weaponType: 'broadside_right',
        x: spawnX,
        y: spawnY,
        prevX: spawnX,
        prevY: spawnY,
        vx,
        vy,
        radius: cfg.projectileRadius,
        damage: cfg.projectileDamage,
        remainingLife: cfg.projectileLifetime,
        isDead: false,
      };
    });

    return projectiles;
  }

  /**
   * Advances active projectiles by dt: integrates position, decrements remainingLife,
   * and marks dead if expired or out of arena bounds.
   */
  public static stepProjectiles(
    projectiles: Projectile[],
    dt: number,
    arena?: ArenaBounds
  ): Projectile[] {
    if (dt <= 0) return projectiles;

    const alive: Projectile[] = [];

    for (const p of projectiles) {
      if (!p || p.isDead) continue;

      p.prevX = p.x;
      p.prevY = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.remainingLife -= dt;

      if (p.remainingLife <= 0) {
        p.isDead = true;
        continue;
      }

      if (arena) {
        if (p.x < 0 || p.x > arena.width || p.y < 0 || p.y > arena.height) {
          p.isDead = true;
          continue;
        }
      }

      alive.push(p);
    }

    return alive;
  }

  /**
   * Resets all weapon cooldown timers to 0.
   */
  public reset(): void {
    this.cooldownFront = 0;
    this.cooldownLeftBroadside = 0;
    this.cooldownRightBroadside = 0;
  }
}
