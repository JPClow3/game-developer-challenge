import { describe, it, expect } from 'vitest';
import {
  DEFAULT_GAMEPLAY_CONFIG,
  MIN_SESSION_DURATION,
  MAX_SESSION_DURATION,
  MIN_SPAWN_INTERVAL,
  MAX_SPAWN_INTERVAL,
  clampSessionDuration,
  clampSpawnInterval,
  validateGameplayConfig,
} from '@/types/config';

describe('GameplayConfig Domain Contracts & Validation', () => {
  it('should provide complete default configuration matching design specification', () => {
    expect(DEFAULT_GAMEPLAY_CONFIG.sessionDurationSeconds).toBe(120);
    expect(DEFAULT_GAMEPLAY_CONFIG.playerMaxHealth).toBe(100);
    expect(DEFAULT_GAMEPLAY_CONFIG.playerMovement.maxForwardSpeed).toBe(220);
    expect(DEFAULT_GAMEPLAY_CONFIG.playerMovement.acceleration).toBe(180);
    expect(DEFAULT_GAMEPLAY_CONFIG.playerMovement.turnRate).toBe(2.6);

    // Front cannon contract
    expect(DEFAULT_GAMEPLAY_CONFIG.weaponFront.cooldownSeconds).toBe(0.60);
    expect(DEFAULT_GAMEPLAY_CONFIG.weaponFront.projectileDamage).toBe(25);
    expect(DEFAULT_GAMEPLAY_CONFIG.weaponFront.projectileSpeed).toBe(480);

    // Broadsides contract: 3 parallel projectiles
    expect(DEFAULT_GAMEPLAY_CONFIG.weaponBroadsideLeft.projectileCount).toBe(3);
    expect(DEFAULT_GAMEPLAY_CONFIG.weaponBroadsideLeft.cooldownSeconds).toBe(1.80);
    expect(DEFAULT_GAMEPLAY_CONFIG.weaponBroadsideLeft.projectileDamage).toBe(20);
    expect(DEFAULT_GAMEPLAY_CONFIG.weaponBroadsideRight.projectileCount).toBe(3);

    // Enemy AI configurations
    expect(DEFAULT_GAMEPLAY_CONFIG.chaser.maxHealth).toBe(35);
    expect(DEFAULT_GAMEPLAY_CONFIG.chaser.rammingDamage).toBe(35);
    expect(DEFAULT_GAMEPLAY_CONFIG.chaser.scoreAwardedOnKill).toBe(1);

    expect(DEFAULT_GAMEPLAY_CONFIG.shooter.maxHealth).toBe(60);
    expect(DEFAULT_GAMEPLAY_CONFIG.shooter.engageMinDistance).toBe(240);
    expect(DEFAULT_GAMEPLAY_CONFIG.shooter.engageMaxDistance).toBe(360);
    expect(DEFAULT_GAMEPLAY_CONFIG.shooter.scoreAwardedOnKill).toBe(1);

    // Arena dimensions
    expect(DEFAULT_GAMEPLAY_CONFIG.arena.width).toBe(1600);
    expect(DEFAULT_GAMEPLAY_CONFIG.arena.height).toBe(1000);
  });

  describe('Clamping Functions', () => {
    it('clamps session duration strictly within [60, 180] seconds', () => {
      expect(clampSessionDuration(59)).toBe(MIN_SESSION_DURATION);
      expect(clampSessionDuration(60)).toBe(60);
      expect(clampSessionDuration(120)).toBe(120);
      expect(clampSessionDuration(180)).toBe(180);
      expect(clampSessionDuration(181)).toBe(MAX_SESSION_DURATION);
      expect(clampSessionDuration(NaN)).toBe(120);
      expect(clampSessionDuration(-10)).toBe(MIN_SESSION_DURATION);
      expect(clampSessionDuration(999)).toBe(MAX_SESSION_DURATION);
    });

    it('clamps enemy spawn interval strictly within [1, 15] seconds', () => {
      expect(clampSpawnInterval(0.5)).toBe(MIN_SPAWN_INTERVAL);
      expect(clampSpawnInterval(1)).toBe(1);
      expect(clampSpawnInterval(3.5)).toBe(3.5);
      expect(clampSpawnInterval(15)).toBe(15);
      expect(clampSpawnInterval(20)).toBe(MAX_SPAWN_INTERVAL);
      expect(clampSpawnInterval(NaN)).toBe(3.0);
    });
  });

  describe('validateGameplayConfig', () => {
    it('returns isValid true for default and valid configs', () => {
      const res = validateGameplayConfig();
      expect(res.isValid).toBe(true);
      expect(res.errors).toHaveLength(0);
      expect(res.validatedConfig.sessionDurationSeconds).toBe(120);
    });

    it('returns validation errors for out-of-range session duration', () => {
      const res = validateGameplayConfig({ sessionDurationSeconds: 45 });
      expect(res.isValid).toBe(false);
      expect(res.errors.length).toBeGreaterThan(0);
      expect(res.errors[0]).toContain('sessionDurationSeconds');
      expect(res.validatedConfig.sessionDurationSeconds).toBe(MIN_SESSION_DURATION);
    });

    it('returns validation errors for out-of-range spawn intervals', () => {
      const res = validateGameplayConfig({
        spawner: {
          ...DEFAULT_GAMEPLAY_CONFIG.spawner,
          spawnIntervalSeconds: 0.2,
        },
      });
      expect(res.isValid).toBe(false);
      expect(res.errors.length).toBeGreaterThan(0);
      expect(res.errors[0]).toContain('spawnIntervalSeconds');
      expect(res.validatedConfig.spawner.spawnIntervalSeconds).toBe(MIN_SPAWN_INTERVAL);
    });
  });
});
