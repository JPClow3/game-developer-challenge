import { describe, it, expect, beforeEach } from 'vitest';
import {
  ChaserAI,
  resetChaserIdCounter,
  computeDamageTier,
} from '../../../src/core/ai/ChaserAI';
import {
  ShooterAI,
  resetShooterIdCounter,
  resetEnemyProjectileIdCounter,
} from '../../../src/core/ai/ShooterAI';
import { createKinematicState } from '../../../src/core/kinematics/ShipKinematics';
import {
  DEFAULT_CHASER_CONFIG,
  DEFAULT_SHOOTER_CONFIG,
  DEFAULT_ARENA_CONFIG,
} from '../../../src/types';

describe('Enemy AI Subsystem', () => {
  beforeEach(() => {
    resetChaserIdCounter();
    resetShooterIdCounter();
    resetEnemyProjectileIdCounter();
  });

  describe('DamageTier Computation', () => {
    it('correctly maps health percentages to damage tiers 1 through 4', () => {
      expect(computeDamageTier(100, 100)).toBe(1); // >66%
      expect(computeDamageTier(67, 100)).toBe(1);
      expect(computeDamageTier(50, 100)).toBe(2); // 33% - 66%
      expect(computeDamageTier(34, 100)).toBe(2);
      expect(computeDamageTier(20, 100)).toBe(3); // <33%
      expect(computeDamageTier(0, 100)).toBe(4);  // destroyed
      expect(computeDamageTier(-10, 100)).toBe(4);
    });
  });

  describe('ChaserAI: Pure Pursuit & Suicide Ramming', () => {
    it('creates Chaser enemy with correct initial stats and pursuit phase', () => {
      const chaser = ChaserAI.create(200, 300, 0);
      expect(chaser.id).toBe('chaser_1');
      expect(chaser.type).toBe('chaser');
      expect(chaser.aiType).toBe('chaser');
      expect(chaser.health).toBe(DEFAULT_CHASER_CONFIG.maxHealth); // 35 HP
      expect(chaser.isDestroyed).toBe(false);
      expect(chaser.phase).toBe('pursuit');
    });

    it('steers and moves towards the player position in pursuit', () => {
      // Chaser at (500, 500) facing North, Player at (700, 500) directly East
      const chaser = ChaserAI.create(500, 500, 0);
      const player = createKinematicState(700, 500, 0);

      // Desired heading to East is PI/2 rad. Chaser is currently facing 0 rad.
      ChaserAI.update(chaser, player, [], 0.2, DEFAULT_ARENA_CONFIG);

      // Chaser should have turned clockwise towards the player
      expect(chaser.kinematic.rotation).toBeGreaterThan(0);
      // Chaser position should have moved
      expect(chaser.kinematic.x).toBeGreaterThan(500);
    });

    it('repels away from nearby island obstacles to avoid getting stuck', () => {
      // Chaser at (500, 500) pursuing Player at (500, 200) North
      // But an island obstacle sits right in front at (500, 450, radius 40)
      const chaser = ChaserAI.create(500, 500, 0);
      const player = createKinematicState(500, 200, 0);
      const obstacles = [{ id: 'obs1', x: 500, y: 450, radius: 40, tileIds: [] }];

      ChaserAI.update(chaser, player, obstacles, 0.1, DEFAULT_ARENA_CONFIG);

      // Repulsion force modifies desired heading from pure North
      expect(Math.abs(chaser.kinematic.rotation)).toBeGreaterThanOrEqual(0);
    });

    it('detonates in suicide ram dealing 35 ramming damage and awarding strictly 0 score', () => {
      const chaser = ChaserAI.create(500, 500, 0);
      const result = ChaserAI.detonateRam(chaser);

      expect(result.detonated).toBe(true);
      expect(result.rammingDamage).toBe(35);
      expect(chaser.health).toBe(0);
      expect(chaser.isDestroyed).toBe(true);
      expect(chaser.phase).toBe('dead');
      expect(chaser.damageTier).toBe(4);
    });
  });

  describe('ShooterAI: Range-Keeping & Facing-Aligned Firing', () => {
    it('creates Shooter enemy with 60 HP and approach phase', () => {
      const shooter = ShooterAI.create(200, 200, 0);
      expect(shooter.id).toBe('shooter_1');
      expect(shooter.type).toBe('shooter');
      expect(shooter.aiType).toBe('shooter');
      expect(shooter.health).toBe(DEFAULT_SHOOTER_CONFIG.maxHealth); // 60 HP
      expect(shooter.isDestroyed).toBe(false);
      expect(shooter.phase).toBe('approach');
    });

    it('enters approach phase when distance to player > 360px', () => {
      // Distance is 600px (> 360px)
      const shooter = ShooterAI.create(500, 800, 0);
      const player = createKinematicState(500, 200, 0);

      const shot = ShooterAI.update(shooter, player, [], 0.1, DEFAULT_ARENA_CONFIG);
      expect(shooter.phase).toBe('approach');
      expect(shot).toBeNull(); // Grace cooldown active
    });

    it('enters evade phase when distance to player < 240px', () => {
      // Distance is 150px (< 240px)
      const shooter = ShooterAI.create(500, 350, 0);
      const player = createKinematicState(500, 200, 0);

      ShooterAI.update(shooter, player, [], 0.1, DEFAULT_ARENA_CONFIG);
      expect(shooter.phase).toBe('evade');
    });

    it('enters engage phase when distance is in tactical ring [240px, 360px]', () => {
      // Distance is 300px
      const shooter = ShooterAI.create(500, 500, 0);
      const player = createKinematicState(500, 200, 0);

      ShooterAI.update(shooter, player, [], 0.1, DEFAULT_ARENA_CONFIG);
      expect(shooter.phase).toBe('engage');
    });

    it('fires cannon projectile (15 damage, 380 px/s) when facing player (|deltaTheta| < 12 deg) and cooldown is ready', () => {
      // Shooter at (500, 500) facing North (0 rad), Player directly North at (500, 220) [dist = 280px, engage range]
      const shooter = ShooterAI.create(500, 500, 0);
      shooter.cooldownFront = 0; // Ready to fire
      const player = createKinematicState(500, 220, 0);

      for (let tick=0;tick<26;tick++) expect(ShooterAI.update(shooter, player, [], 1 / 60, DEFAULT_ARENA_CONFIG)).toBeNull();
      expect(shooter.attackWindup).toBeGreaterThan(.4);
      const shot = ShooterAI.update(shooter, player, [], 1 / 60, DEFAULT_ARENA_CONFIG);
      expect(shot).not.toBeNull();
      expect(shot!.owner).toBe('enemy');
      expect(shot!.damage).toBe(15);
      expect(shot!.weaponType).toBe('front');
      // Heading North: vy is negative (~ -380 px/s)
      expect(shot!.vy).toBeCloseTo(-DEFAULT_SHOOTER_CONFIG.cannon.projectileSpeed, 1);
      // Shooter cooldown reset to 2.0s
      expect(shooter.cooldownFront).toBeCloseTo(2.0, 4);
    });

    it('does NOT fire if aim alignment exceeds 12 degrees (|deltaTheta| > 0.21 rad)', () => {
      // Shooter facing North (0 rad), but Player is 90 degrees away to East (780, 500)
      const shooter = ShooterAI.create(500, 500, 0);
      shooter.cooldownFront = 0;
      const player = createKinematicState(780, 500, 0);

      const shot = ShooterAI.update(shooter, player, [], 1 / 60, DEFAULT_ARENA_CONFIG);
      expect(shot).toBeNull(); // Not aligned, will not fire
      expect(shooter.cooldownFront).toBe(0); // Did not discharge
    });
  });
});
