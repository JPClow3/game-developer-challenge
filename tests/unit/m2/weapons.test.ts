import { describe, it, expect, beforeEach } from 'vitest';
import {
  WeaponSystem,
  resetProjectileIdCounter,
} from '../../../src/core/weapons/WeaponSystem';
import { createKinematicState } from '../../../src/core/kinematics/ShipKinematics';
import {
  DEFAULT_WEAPON_FRONT,
  DEFAULT_WEAPON_BROADSIDE_LEFT,
  DEFAULT_ARENA_CONFIG,
} from '../../../src/types';

describe('WeaponSystem Subsystem', () => {
  let weapons: WeaponSystem;

  beforeEach(() => {
    resetProjectileIdCounter();
    weapons = new WeaponSystem();
  });

  it('initializes with all weapons ready (cooldown 0)', () => {
    expect(weapons.canFire('front')).toBe(true);
    expect(weapons.canFire('broadside_left')).toBe(true);
    expect(weapons.canFire('broadside_right')).toBe(true);
    expect(weapons.getCooldownFraction('front')).toBe(0);
    expect(weapons.getCooldownFraction('broadside_left')).toBe(0);
    expect(weapons.getCooldownFraction('broadside_right')).toBe(0);
  });

  it('fires single frontal projectile along heading from bow with 25 damage and 480 px/s', () => {
    // Ship facing North (0 rad) at (500, 500)
    const ship = createKinematicState(500, 500, 0);
    const projectiles = weapons.fireFront(ship, 'player');

    expect(projectiles.length).toBe(1);
    const p = projectiles[0]!;
    expect(p.damage).toBe(25);
    expect(p.owner).toBe('player');
    expect(p.weaponType).toBe('front');
    expect(p.radius).toBe(DEFAULT_WEAPON_FRONT.projectileRadius);
    // Bow is 24px ahead of center (North = -Y)
    expect(p.x).toBeCloseTo(500, 4);
    expect(p.y).toBeCloseTo(500 - 24, 4);
    // Heading North: vy is negative (~ -480)
    expect(p.vx).toBeCloseTo(0, 4);
    expect(p.vy).toBeCloseTo(-DEFAULT_WEAPON_FRONT.projectileSpeed, 1);

    // Front weapon should now be on 0.6s cooldown
    expect(weapons.canFire('front')).toBe(false);
    expect(weapons.cooldownFront).toBeCloseTo(0.6, 4);
    expect(weapons.getCooldownFraction('front')).toBeCloseTo(1.0, 4);
  });

  it('fires port (left) broadside with 3 parallel projectiles along hull normal', () => {
    // Ship facing North (0 rad), Left is West (-X)
    const ship = createKinematicState(500, 500, 0);
    const projectiles = weapons.fireBroadsideLeft(ship, 'player');

    expect(projectiles.length).toBe(3);
    expect(weapons.canFire('broadside_left')).toBe(false);
    expect(weapons.cooldownLeftBroadside).toBeCloseTo(1.8, 4);

    const wHalf = DEFAULT_WEAPON_BROADSIDE_LEFT.hullHalfWidth; // 16px
    const spacing = DEFAULT_WEAPON_BROADSIDE_LEFT.gunportSpacing; // 18px

    // All 3 projectiles must travel west along port normal
    for (const p of projectiles) {
      expect(p.damage).toBe(20);
      expect(p.owner).toBe('player');
      expect(p.weaponType).toBe('broadside_left');
      expect(p.vx).toBeCloseTo(-DEFAULT_WEAPON_BROADSIDE_LEFT.projectileSpeed, 1);
      expect(p.vy).toBeCloseTo(0, 4);
      // X coordinate is flank offset (500 - 16 = 484)
      expect(p.x).toBeCloseTo(500 - wHalf, 4);
    }

    // Parallel spacing along forward axis (Fore: y - 18, Mid: y, Aft: y + 18)
    const [fore, mid, aft] = projectiles;
    expect(fore!.y).toBeCloseTo(500 - spacing, 4);
    expect(mid!.y).toBeCloseTo(500, 4);
    expect(aft!.y).toBeCloseTo(500 + spacing, 4);

    // Trajectories must be strictly parallel: identical velocity vectors
    expect(fore!.vx).toBe(mid!.vx);
    expect(mid!.vx).toBe(aft!.vx);
    expect(fore!.vy).toBe(mid!.vy);
    expect(mid!.vy).toBe(aft!.vy);
  });

  it('fires starboard (right) broadside with 3 parallel projectiles along hull normal', () => {
    // Ship facing North (0 rad), Right is East (+X)
    const ship = createKinematicState(500, 500, 0);
    const projectiles = weapons.fireBroadsideRight(ship, 'player');

    expect(projectiles.length).toBe(3);
    expect(weapons.canFire('broadside_right')).toBe(false);
    expect(weapons.cooldownRightBroadside).toBeCloseTo(1.8, 4);

    const wHalf = DEFAULT_WEAPON_BROADSIDE_LEFT.hullHalfWidth; // 16px
    for (const p of projectiles) {
      expect(p.damage).toBe(20);
      expect(p.owner).toBe('player');
      expect(p.weaponType).toBe('broadside_right');
      expect(p.vx).toBeCloseTo(DEFAULT_WEAPON_BROADSIDE_LEFT.projectileSpeed, 1);
      expect(p.vy).toBeCloseTo(0, 4);
      expect(p.x).toBeCloseTo(500 + wHalf, 4);
    }
  });

  it('maintains separate, independent cooldown clocks for all three weapons', () => {
    const ship = createKinematicState(500, 500, 0);

    // Fire frontal cannon
    weapons.fireFront(ship, 'player');
    expect(weapons.canFire('front')).toBe(false);
    expect(weapons.canFire('broadside_left')).toBe(true);
    expect(weapons.canFire('broadside_right')).toBe(true);

    // Fire left broadside
    weapons.fireBroadsideLeft(ship, 'player');
    expect(weapons.canFire('front')).toBe(false);
    expect(weapons.canFire('broadside_left')).toBe(false);
    expect(weapons.canFire('broadside_right')).toBe(true);

    // Fire right broadside
    weapons.fireBroadsideRight(ship, 'player');
    expect(weapons.canFire('broadside_right')).toBe(false);

    // Step by 0.6s (front cooldown should expire, broadsides should still have 1.2s remaining)
    weapons.stepCooldowns(0.6);
    expect(weapons.canFire('front')).toBe(true);
    expect(weapons.canFire('broadside_left')).toBe(false);
    expect(weapons.canFire('broadside_right')).toBe(false);
    expect(weapons.cooldownLeftBroadside).toBeCloseTo(1.2, 4);
    expect(weapons.cooldownRightBroadside).toBeCloseTo(1.2, 4);

    // Step by another 1.2s
    weapons.stepCooldowns(1.2);
    expect(weapons.canFire('broadside_left')).toBe(true);
    expect(weapons.canFire('broadside_right')).toBe(true);
  });

  it('updates projectile position, life, and arena bounds in stepProjectiles', () => {
    const ship = createKinematicState(500, 500, 0);
    const projectiles = weapons.fireFront(ship, 'player');
    const p = projectiles[0]!;
    const initialY = p.y;
    const initialLife = p.remainingLife;

    // Advance 0.1s
    const alive = WeaponSystem.stepProjectiles(projectiles, 0.1, DEFAULT_ARENA_CONFIG);
    expect(alive.length).toBe(1);
    expect(p.y).toBeLessThan(initialY); // Moved North
    expect(p.remainingLife).toBeCloseTo(initialLife - 0.1, 4);
    expect(p.isDead).toBe(false);

    // Advance past remaining lifetime
    WeaponSystem.stepProjectiles(alive, p.remainingLife + 0.1, DEFAULT_ARENA_CONFIG);
    expect(p.isDead).toBe(true);
  });

  it('despawns projectiles that cross arena boundaries', () => {
    const ship = createKinematicState(10, 10, -Math.PI / 2); // Facing West near left edge
    const projectiles = weapons.fireFront(ship, 'player');

    // Step moves projectile beyond x = 0
    const alive = WeaponSystem.stepProjectiles(projectiles, 0.1, DEFAULT_ARENA_CONFIG);
    expect(alive.length).toBe(0);
    expect(projectiles[0]!.isDead).toBe(true);
  });
});
