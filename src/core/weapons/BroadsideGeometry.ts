import type { BroadsideWeaponConfig, KinematicState } from '../../types';
import { getForwardVector, getLeftVector, getRightVector } from '../kinematics/ShipKinematics';

export interface BroadsideLane {
  x: number;
  y: number;
  vx: number;
  vy: number;
  endX: number;
  endY: number;
  radius: number;
}

/** Shared by fired shells and their preview. No IDs, cooldowns or state mutations. */
export function broadsideLanes(
  ship: Pick<KinematicState, 'x' | 'y' | 'rotation' | 'velocityX' | 'velocityY'>,
  config: BroadsideWeaponConfig,
  side: 'port' | 'starboard',
): BroadsideLane[] {
  const forward = getForwardVector(ship.rotation);
  const normal = side === 'port' ? getLeftVector(ship.rotation) : getRightVector(ship.rotation);
  const baseX = ship.x + normal.x * config.hullHalfWidth;
  const baseY = ship.y + normal.y * config.hullHalfWidth;
  const vx = normal.x * config.projectileSpeed + ship.velocityX * 0.15;
  const vy = normal.y * config.projectileSpeed + ship.velocityY * 0.15;
  return [config.gunportSpacing, 0, -config.gunportSpacing].map((offset) => {
    const x = baseX + forward.x * offset,
      y = baseY + forward.y * offset;
    return {
      x,
      y,
      vx,
      vy,
      endX: x + vx * config.projectileLifetime,
      endY: y + vy * config.projectileLifetime,
      radius: config.projectileRadius,
    };
  });
}
