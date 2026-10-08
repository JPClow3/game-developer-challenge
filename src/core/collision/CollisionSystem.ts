import type {
  KinematicState,
  DualDiskCapsuleCollider,
  CircleCollider,
  IslandObstacle,
  ArenaBounds,
  Projectile,
  ShipState,
  EnemyShipState,
  ChaserEnemyState,
} from '../../types';
import { getForwardVector } from '../kinematics/ShipKinematics';
import { ChaserAI } from '../ai/ChaserAI';

export const DEFAULT_SHIP_DISK_OFFSET = 15;
export const DEFAULT_SHIP_DISK_RADIUS = 16;

export const DEFAULT_ISLAND_OBSTACLES: IslandObstacle[] = [
  { id: 'island_1', x: 600, y: 350, radius: 85, tileIds: [1, 2, 3] },
  { id: 'island_2', x: 1050, y: 650, radius: 95, tileIds: [4, 5, 6] },
  { id: 'island_3', x: 350, y: 700, radius: 60, tileIds: [7, 8] },
];

export interface CollisionEventResults {
  scoreAwarded: number;
  playerDamaged: boolean;
  enemiesDestroyed: string[];
  chaserSuicideRams: string[];
  despawnedProjectileIds: number[];
  splashes?: {x:number;y:number}[];
}

/**
 * Circle-to-circle intersection test.
 */
export function checkCircleOverlap(c1: CircleCollider, c2: CircleCollider): boolean {
  const dx = c1.x - c2.x;
  const dy = c1.y - c2.y;
  const radSum = c1.radius + c2.radius;
  return dx * dx + dy * dy <= radSum * radSum;
}

/**
 * Distance between point and circle center.
 */
export function distanceToCircle(x: number, y: number, c: CircleCollider): number {
  return Math.hypot(x - c.x, y - c.y);
}

/**
 * Computes dual-disk capsule collider for a 36x64 ship:
 * Bow disk: center = p + f * 15, radius = 16
 * Stern disk: center = p - f * 15, radius = 16
 */
export function getShipDualDiskCollider(
  kinematic: KinematicState,
  offset: number = DEFAULT_SHIP_DISK_OFFSET,
  radius: number = DEFAULT_SHIP_DISK_RADIUS
): DualDiskCapsuleCollider {
  const f = getForwardVector(kinematic.rotation);
  return {
    disk1: {
      x: kinematic.x + f.x * offset,
      y: kinematic.y + f.y * offset,
      radius,
    },
    disk2: {
      x: kinematic.x - f.x * offset,
      y: kinematic.y - f.y * offset,
      radius,
    },
  };
}

/**
 * Checks overlap between two dual-disk capsule ship colliders.
 */
export function checkCapsuleCapsuleOverlap(
  c1: DualDiskCapsuleCollider,
  c2: DualDiskCapsuleCollider
): boolean {
  return (
    checkCircleOverlap(c1.disk1, c2.disk1) ||
    checkCircleOverlap(c1.disk1, c2.disk2) ||
    checkCircleOverlap(c1.disk2, c2.disk1) ||
    checkCircleOverlap(c1.disk2, c2.disk2)
  );
}

/**
 * Checks overlap between a point/circle projectile and a dual-disk capsule ship collider.
 */
export function checkProjectileCapsuleOverlap(
  projectile: Projectile,
  capsule: DualDiskCapsuleCollider
): boolean {
  const projCircle: CircleCollider = {
    x: projectile.x,
    y: projectile.y,
    radius: projectile.radius,
  };
  return (
    checkCircleOverlap(projCircle, capsule.disk1) ||
    checkCircleOverlap(projCircle, capsule.disk2)
  );
}

/**
 * CollisionSystem:
 * Handles dual-disk capsule colliders, composite island obstacles,
 * tangent sliding collision resolution, and single-hit projectile consumption.
 */
export class CollisionSystem {
  /**
   * Resolves collision between a ship capsule and all island obstacles using tangent sliding resolution.
   * Treats the ship as a capsule segment from stern disk to bow disk with radius 16px.
   */
  public static resolveShipObstacleCollisions(
    shipKinematic: KinematicState,
    obstacles: IslandObstacle[]
  ): void {
    const f = getForwardVector(shipKinematic.rotation);
    const radius = DEFAULT_SHIP_DISK_RADIUS; // 16px
    const offset = DEFAULT_SHIP_DISK_OFFSET; // 15px

    // Capsule segment endpoints: A = stern center, B = bow center
    const ax = shipKinematic.x - f.x * offset;
    const ay = shipKinematic.y - f.y * offset;
    const bx = shipKinematic.x + f.x * offset;
    const by = shipKinematic.y + f.y * offset;

    const segDx = bx - ax;
    const segDy = by - ay;
    const segLenSq = segDx * segDx + segDy * segDy || 0.0001;

    for (const obs of obstacles) {
      // Find closest point Q on capsule segment [A, B] to obstacle center
      const toObsX = obs.x - ax;
      const toObsY = obs.y - ay;
      const t = Math.max(0, Math.min(1, (toObsX * segDx + toObsY * segDy) / segLenSq));

      const qx = ax + segDx * t;
      const qy = ay + segDy * t;

      const dx = qx - obs.x;
      const dy = qy - obs.y;
      const dist = Math.hypot(dx, dy);
      const minDist = radius + obs.radius;

      if (dist < minDist && dist > 0.0001) {
        // Normal pointing from obstacle center towards closest contact point on ship
        const nx = dx / dist;
        const ny = dy / dist;
        const penetration = minDist - dist;

        // 1. Inelastic position push-out along normal
        shipKinematic.x += nx * penetration;
        shipKinematic.y += ny * penetration;

        // 2. Tangent sliding velocity resolution: remove normal component directed into obstacle
        const vDotN = shipKinematic.velocityX * nx + shipKinematic.velocityY * ny;
        if (vDotN < 0) {
          shipKinematic.velocityX -= vDotN * nx;
          shipKinematic.velocityY -= vDotN * ny;
        }
      }
    }
  }

  /**
   * Resolves collision between a ship and the arena boundaries with tangent sliding.
   */
  public static resolveShipArenaCollisions(
    shipKinematic: KinematicState,
    arena: ArenaBounds
  ): void {
    const margin = arena.margin;
    const minX = margin;
    const maxX = arena.width - margin;
    const minY = margin;
    const maxY = arena.height - margin;

    if (shipKinematic.x < minX) {
      shipKinematic.x = minX;
      shipKinematic.velocityX = Math.max(0, shipKinematic.velocityX);
    } else if (shipKinematic.x > maxX) {
      shipKinematic.x = maxX;
      shipKinematic.velocityX = Math.min(0, shipKinematic.velocityX);
    }

    if (shipKinematic.y < minY) {
      shipKinematic.y = minY;
      shipKinematic.velocityY = Math.max(0, shipKinematic.velocityY);
    } else if (shipKinematic.y > maxY) {
      shipKinematic.y = maxY;
      shipKinematic.velocityY = Math.min(0, shipKinematic.velocityY);
    }
  }

  /**
   * Resolves ship-to-ship collisions:
   * - Chaser ramming player triggers suicide detonation (35 damage, STRICTLY 0 score).
   * - Other ship overlaps are separated with normal impulses.
   */
  public static resolveShipShipCollisions(
    playerShip: ShipState,
    enemies: EnemyShipState[]
  ): { chaserSuicideRams: string[]; playerDamaged: boolean } {
    const results = {
      chaserSuicideRams: [] as string[],
      playerDamaged: false,
    };

    if (playerShip.isDestroyed) return results;
    const playerCapsule = getShipDualDiskCollider(playerShip.kinematic);

    for (const enemy of enemies) {
      if (enemy.isDestroyed) continue;

      const enemyCapsule = getShipDualDiskCollider(enemy.kinematic);
      if (checkCapsuleCapsuleOverlap(playerCapsule, enemyCapsule)) {
        if (enemy.type === 'chaser') {
          // Suicide ramming: damages player 35 HP, destroys chaser, awards STRICTLY 0 score
          const ram = ChaserAI.detonateRam(enemy as ChaserEnemyState);
          playerShip.health = Math.max(0, playerShip.health - ram.rammingDamage);
          if (playerShip.health <= 0) {
            playerShip.isDestroyed = true;
          }
          results.playerDamaged = true;
          results.chaserSuicideRams.push(enemy.id);
        } else {
          // Shooter separation push-out
          const dx = playerShip.kinematic.x - enemy.kinematic.x;
          const dy = playerShip.kinematic.y - enemy.kinematic.y;
          const dist = Math.hypot(dx, dy) || 0.001;
          const minSeparation = 48; // px

          if (dist < minSeparation) {
            const push = (minSeparation - dist) * 0.5;
            const nx = dx / dist;
            const ny = dy / dist;

            playerShip.kinematic.x += nx * push;
            playerShip.kinematic.y += ny * push;
            enemy.kinematic.x -= nx * push;
            enemy.kinematic.y -= ny * push;
          }
        }
      }
    }

    return results;
  }

  /**
   * Resolves projectile collisions against island obstacles and ships.
   * Enforces Single-Hit consumption rule: each projectile inflicts damage once and despawns immediately.
   */
  public static resolveProjectileCollisions(
    projectiles: Projectile[],
    playerShip: ShipState,
    enemies: EnemyShipState[],
    obstacles: IslandObstacle[]
  ): CollisionEventResults {
    const results: CollisionEventResults = {
      scoreAwarded: 0,
      playerDamaged: false,
      enemiesDestroyed: [],
      chaserSuicideRams: [],
      despawnedProjectileIds: [],
    };

    const playerCapsule = !playerShip.isDestroyed
      ? getShipDualDiskCollider(playerShip.kinematic)
      : null;

    for (const proj of projectiles) {
      if (proj.isDead) continue;

      // 1. Projectile vs Island Obstacles
      let hitObstacle = false;
      for (const obs of obstacles) {
        const dist = Math.hypot(proj.x - obs.x, proj.y - obs.y);
        if (dist <= proj.radius + obs.radius) {
          proj.isDead = true;
          results.despawnedProjectileIds.push(proj.id);
          hitObstacle = true;
          (results.splashes ??= []).push({x:proj.x,y:proj.y});
          break;
        }
      }
      if (hitObstacle) continue;

      // 2. Player Projectile vs Enemy Ships
      if (proj.owner === 'player') {
        for (const enemy of enemies) {
          if (enemy.isDestroyed) continue;

          const enemyCapsule = getShipDualDiskCollider(enemy.kinematic);
          if (checkProjectileCapsuleOverlap(proj, enemyCapsule)) {
            // SINGLE-HIT GUARANTEE: Inflict damage once and immediately despawn
            proj.isDead = true;
            results.despawnedProjectileIds.push(proj.id);

            enemy.health = Math.max(0, enemy.health - proj.damage);
            if (enemy.health <= 0) {
              enemy.isDestroyed = true;
              results.enemiesDestroyed.push(enemy.id);
              // Player projectile kill awards +1 score!
              results.scoreAwarded += 1;
            }
            break; // Projectile is dead, stop checking other targets
          }
        }
      }

      // 3. Enemy Projectile vs Player Ship
      if (proj.owner === 'enemy' && playerCapsule && !playerShip.isDestroyed) {
        if (checkProjectileCapsuleOverlap(proj, playerCapsule)) {
          // SINGLE-HIT GUARANTEE: Inflict damage once and immediately despawn
          proj.isDead = true;
          results.despawnedProjectileIds.push(proj.id);

          playerShip.health = Math.max(0, playerShip.health - proj.damage);
          results.playerDamaged = true;
          if (playerShip.health <= 0) {
            playerShip.isDestroyed = true;
          }
        }
      }
    }

    return results;
  }
}
