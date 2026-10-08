import type {
  ChaserEnemyState,
  KinematicState,
  IslandObstacle,
  ArenaBounds,
  DamageTier,
} from '../../types';
import { DEFAULT_CHASER_CONFIG } from '../../types';
import { wrapAngle, ShipKinematics } from '../kinematics/ShipKinematics';

export function computeDamageTier(currentHp: number, maxHp: number): DamageTier {
  if (currentHp <= 0) return 4;
  const pct = currentHp / maxHp;
  if (pct > 0.66) return 1;
  if (pct > 0.33) return 2;
  return 3;
}

let nextChaserId = 1;
export function resetChaserIdCounter(): void {
  nextChaserId = 1;
}

export interface ChaserAIUpdateResult {
  detonated: boolean;
  rammingDamage: number;
}

/**
 * ChaserAI: Pure pursuit navigation with obstacle repulsion.
 * On contact with player, performs suicide ramming dealing 35 damage and awarding strictly 0 score.
 */
export class ChaserAI {
  public static create(x: number, y: number, rotation: number = 0): ChaserEnemyState {
    const config = DEFAULT_CHASER_CONFIG;
    return {
      id: `chaser_${nextChaserId++}`,
      type: 'chaser',
      aiType: 'chaser',
      series: 2,
      phase: 'pursuit',
      health: config.maxHealth,
      maxHealth: config.maxHealth,
      isDestroyed: false,
      damageTier: 1,
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
   * Updates a Chaser enemy for dt seconds:
   * Steers towards player while repelling away from island obstacles, advances kinematics.
   */
  public static update(
    chaser: ChaserEnemyState,
    playerKinematic: KinematicState,
    obstacles: IslandObstacle[],
    dt: number,
    arena?: ArenaBounds,
  ): void {
    if (chaser.isDestroyed || dt <= 0) return;

    // 1. Target vector towards player
    const toPlayerX = playerKinematic.x - chaser.kinematic.x;
    const toPlayerY = playerKinematic.y - chaser.kinematic.y;
    const distToPlayer = Math.hypot(toPlayerX, toPlayerY);

    let desiredDirX = distToPlayer > 0.001 ? toPlayerX / distToPlayer : 0;
    let desiredDirY = distToPlayer > 0.001 ? toPlayerY / distToPlayer : -1;

    // 2. Obstacle Repulsion: blend repulsive vector away from nearby island obstacles
    const repulsionRadius = 160;
    const repulsionWeight = 250;

    for (const obs of obstacles) {
      const toObsX = chaser.kinematic.x - obs.x;
      const toObsY = chaser.kinematic.y - obs.y;
      const dist = Math.hypot(toObsX, toObsY);
      const effectiveThreshold = obs.radius + repulsionRadius;

      if (dist < effectiveThreshold && dist > 0.001) {
        const factor = ((effectiveThreshold - dist) / effectiveThreshold) * repulsionWeight;
        const normX = toObsX / dist;
        const normY = toObsY / dist;
        desiredDirX += normX * factor;
        desiredDirY += normY * factor;
      }
    }

    // 3. Desired heading theta (0 = North (0, -1), clockwise positive)
    // fx = sin(theta), fy = -cos(theta) => theta = atan2(dirX, -dirY)
    const desiredHeading = Math.atan2(desiredDirX, -desiredDirY);
    const headingError = wrapAngle(desiredHeading - chaser.kinematic.rotation);

    // 4. Steering input: proportional steering clamped to [-1, 1]
    let steer = Math.max(-1, Math.min(1, headingError * 2.5));
    // Relentless forward throttle
    let throttle = 1.0;
    if (!chaser.chargeStage && distToPlayer < 300) {
      chaser.chargeStage = 'loading';
      chaser.chargeSeconds = 0;
    }
    if (chaser.chargeStage) {
      chaser.chargeSeconds = (chaser.chargeSeconds ?? 0) + dt;
      if (chaser.chargeStage === 'loading') {
        throttle = 0.08;
        if (chaser.chargeSeconds >= 0.55) {
          chaser.chargeStage = 'charging';
          chaser.chargeSeconds = 0;
          chaser.chargeHeading = chaser.kinematic.rotation;
        }
      } else {
        // Commit to a bearing so the player can dodge the advertised charge.
        steer = Math.max(
          -1,
          Math.min(
            1,
            wrapAngle((chaser.chargeHeading ?? desiredHeading) - chaser.kinematic.rotation) * 2.5,
          ),
        );
        if (chaser.chargeSeconds >= 1.1) {
          chaser.chargeStage = undefined;
          chaser.chargeSeconds = 0;
        }
      }
    }

    // 5. Kinematic integration
    ShipKinematics.step(
      chaser.kinematic,
      { throttle, steer },
      DEFAULT_CHASER_CONFIG.movement,
      dt,
      arena,
    );

    // 6. Update damage tier
    chaser.damageTier = computeDamageTier(chaser.health, chaser.maxHealth);
  }

  /**
   * Executes suicide detonation when Chaser ship contacts Player ship.
   * Awards STRICTLY 0 score to player.
   */
  public static detonateRam(chaser: ChaserEnemyState): ChaserAIUpdateResult {
    chaser.health = 0;
    chaser.isDestroyed = true;
    chaser.phase = 'dead';
    chaser.damageTier = 4;

    return {
      detonated: true,
      rammingDamage: DEFAULT_CHASER_CONFIG.rammingDamage, // 35 HP
    };
  }
}
