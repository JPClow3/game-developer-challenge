import type {
  ShooterEnemyState,
  KinematicState,
  IslandObstacle,
  ArenaBounds,
  Projectile,
} from '../../types';
import { DEFAULT_SHOOTER_CONFIG } from '../../types';
import { wrapAngle, getForwardVector, ShipKinematics } from '../kinematics/ShipKinematics';
import { computeDamageTier } from './ChaserAI';

let nextShooterId = 1;
export function resetShooterIdCounter(): void {
  nextShooterId = 1;
}

let nextEnemyProjectileId = 100000;
export function resetEnemyProjectileIdCounter(): void {
  nextEnemyProjectileId = 100000;
}

/**
 * ShooterAI: Standoff range-keeping (240 - 360 px) and facing-aligned cannon attacks.
 * Awards 1 score when destroyed by player projectile.
 */
export class ShooterAI {
  public static create(x: number, y: number, rotation: number = 0): ShooterEnemyState {
    const config = DEFAULT_SHOOTER_CONFIG;
    return {
      id: `shooter_${nextShooterId++}`,
      type: 'shooter',
      aiType: 'shooter',
      series: 5,
      phase: 'approach',
      health: config.maxHealth,
      maxHealth: config.maxHealth,
      isDestroyed: false,
      damageTier: 1,
      cooldownFront: 1.0, // initial 1s grace cooldown before first salvo
      kinematic: {
        x,
        y,
        prevX: x,
        prevY: y,
        rotation: wrapAngle(rotation),
        prevRotation: wrapAngle(rotation),
        velocityX: 0,
        velocityY: 0,
        angularVelocity: 0,
      },
    };
  }

  /**
   * Updates Shooter enemy kinematics, phase, and weapon cooldown.
   * If aligned (|deltaTheta| < 12 deg) and cooldown ready, fires a projectile.
   */
  public static update(
    shooter: ShooterEnemyState,
    playerKinematic: KinematicState,
    obstacles: IslandObstacle[],
    dt: number,
    arena?: ArenaBounds
  ): Projectile | null {
    if (shooter.isDestroyed || dt <= 0) return null;

    // 1. Decrement weapon cooldown
    if (shooter.cooldownFront > 0) {
      shooter.cooldownFront = Math.max(0, shooter.cooldownFront - dt);
    }

    // 2. Relative positioning to player
    const toPlayerX = playerKinematic.x - shooter.kinematic.x;
    const toPlayerY = playerKinematic.y - shooter.kinematic.y;
    const distToPlayer = Math.hypot(toPlayerX, toPlayerY);

    const config = DEFAULT_SHOOTER_CONFIG;
    const minEngage = config.engageMinDistance; // 240 px
    const maxEngage = config.engageMaxDistance; // 360 px

    let throttle = 0;
    let targetDirX = toPlayerX;
    let targetDirY = toPlayerY;

    // 3. Standoff Range-Keeping State Machine
    if (distToPlayer > maxEngage) {
      // Phase: APPROACH
      shooter.phase = 'approach';
      throttle = 1.0;
      targetDirX = toPlayerX;
      targetDirY = toPlayerY;
    } else if (distToPlayer < minEngage) {
      // Phase: EVADE / BACK AWAY
      shooter.phase = 'evade';
      throttle = 0.8;
      // Turn and move away from player
      targetDirX = -toPlayerX;
      targetDirY = -toPlayerY;
    } else {
      // Phase: ENGAGE / STANDOFF
      shooter.phase = 'engage';
      throttle = 0.15; // Slow station-keeping
      targetDirX = toPlayerX;
      targetDirY = toPlayerY;
    }

    // 4. Blend Obstacle Repulsion
    const repulsionRadius = 140;
    const repulsionWeight = 200;
    for (const obs of obstacles) {
      const toObsX = shooter.kinematic.x - obs.x;
      const toObsY = shooter.kinematic.y - obs.y;
      const dist = Math.hypot(toObsX, toObsY);
      const threshold = obs.radius + repulsionRadius;

      if (dist < threshold && dist > 0.001) {
        const factor = ((threshold - dist) / threshold) * repulsionWeight;
        targetDirX += (toObsX / dist) * factor;
        targetDirY += (toObsY / dist) * factor;
      }
    }

    // 5. Angular Steering towards target heading
    const desiredHeading = Math.atan2(targetDirX, -targetDirY);
    const headingError = wrapAngle(desiredHeading - shooter.kinematic.rotation);
    const steer = Math.max(-1, Math.min(1, headingError * 2.0));

    // 6. Kinematic integration
    ShipKinematics.step(
      shooter.kinematic,
      { throttle, steer },
      config.movement,
      dt,
      arena
    );

    // 7. Update damage tier
    shooter.damageTier = computeDamageTier(shooter.health, shooter.maxHealth);

    // 8. Facing alignment check for cannon fire
    // Direct heading towards player (regardless of evasive movement vector)
    const directHeadingToPlayer = Math.atan2(toPlayerX, -toPlayerY);
    const aimDeltaTheta = Math.abs(wrapAngle(directHeadingToPlayer - shooter.kinematic.rotation));

    let projectile: Projectile | null = null;

    // Check if facing player within 12 degrees (|deltaTheta| < config.aimToleranceRadians)
    // and within reasonable firing range
    if (
      aimDeltaTheta <= config.aimToleranceRadians &&
      distToPlayer <= maxEngage + 80 &&
      shooter.cooldownFront <= 0
    ) {
      shooter.cooldownFront = config.cannon.cooldownSeconds; // 2.0s

      const f = getForwardVector(shooter.kinematic.rotation);
      const bowOffset = 22;
      const spawnX = shooter.kinematic.x + f.x * bowOffset;
      const spawnY = shooter.kinematic.y + f.y * bowOffset;

      projectile = {
        id: nextEnemyProjectileId++,
        owner: 'enemy',
        weaponType: 'front',
        x: spawnX,
        y: spawnY,
        prevX: spawnX,
        prevY: spawnY,
        vx: f.x * config.cannon.projectileSpeed,
        vy: f.y * config.cannon.projectileSpeed,
        radius: config.cannon.projectileRadius,
        damage: config.cannon.projectileDamage, // 15 HP
        remainingLife: config.cannon.projectileLifetime,
        isDead: false,
      };
    }

    return projectile;
  }
}
