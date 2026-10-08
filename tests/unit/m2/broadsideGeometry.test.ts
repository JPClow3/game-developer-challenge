import { expect, it } from 'vitest';
import { broadsideLanes } from '../../../src/core/weapons/BroadsideGeometry';
import { WeaponSystem, resetProjectileIdCounter } from '../../../src/core/weapons/WeaponSystem';
import { createKinematicState } from '../../../src/core/kinematics/ShipKinematics';
import type { BroadsideWeaponConfig } from '../../../src/types';

const TEST_CANNON: BroadsideWeaponConfig = {
  projectileDamage: 14,
  cooldownSeconds: 2.8,
  projectileSpeed: 270,
  projectileRadius: 4,
  projectileLifetime: 2.4,
  projectileCount: 3,
  gunportSpacing: 18,
  hullHalfWidth: 16,
};

it.each([0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.73])(
  'predicts the six actual shell trajectories at heading %s without altering inputs or IDs',
  (rotation) => {
    const ship = createKinematicState(800, 500, rotation);
    ship.velocityX = 35;
    ship.velocityY = -18;
    const original = structuredClone(ship),
      config = structuredClone(TEST_CANNON);
    resetProjectileIdCounter();
    const weapons = new WeaponSystem({
      front: config,
      broadsideLeft: config,
      broadsideRight: config,
    });
    const lanes = [
      ...broadsideLanes(ship, config, 'port'),
      ...broadsideLanes(ship, config, 'starboard'),
    ];
    const shells = [
      ...weapons.fireBroadsideLeft(ship, 'enemy'),
      ...weapons.fireBroadsideRight(ship, 'enemy'),
    ];
    expect(shells.map((shell) => shell.id)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const [index, shell] of shells.entries()) {
      const lane = lanes[index]!;
      expect(lane).toMatchObject({
        x: shell.x,
        y: shell.y,
        vx: shell.vx,
        vy: shell.vy,
        radius: shell.radius,
      });
      const dt = 0.01;
      for (let tick = 0; tick < 200; tick++) WeaponSystem.stepProjectiles([shell], dt);
      expect(shell.x).toBeCloseTo(lane.x + lane.vx * 2, 6);
      expect(shell.y).toBeCloseTo(lane.y + lane.vy * 2, 6);
      expect(lane.endX).toBeCloseTo(lane.x + lane.vx * config.projectileLifetime, 8);
      expect(lane.endY).toBeCloseTo(lane.y + lane.vy * config.projectileLifetime, 8);
    }
    expect(ship).toEqual(original);
    expect(TEST_CANNON).toEqual(config);
    expect(weapons.cooldownLeftBroadside).toBe(0);
    expect(weapons.cooldownRightBroadside).toBe(0);
  },
);

it('shows three parallel lanes on each side and reaches beyond the previous short cone', () => {
  const lanes = broadsideLanes(createKinematicState(800, 500, 0), TEST_CANNON, 'starboard');
  expect(lanes.map((lane) => lane.y)).toEqual([482, 500, 518]);
  expect(lanes.map((lane) => lane.x)).toEqual([816, 816, 816]);
  expect(lanes.map((lane) => lane.endX)).toEqual([1464, 1464, 1464]);
  expect(lanes.map((lane) => lane.endY)).toEqual([482, 500, 518]);
});
