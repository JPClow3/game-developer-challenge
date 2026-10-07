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

describe('Adversarial Stress Verification for validateGameplayConfig and Clamping', () => {
  describe('1. NaN, Infinity, -Infinity Adversarial Inputs', () => {
    it('rejects NaN sessionDurationSeconds', () => {
      const res = validateGameplayConfig({ sessionDurationSeconds: NaN });
      expect(res.isValid).toBe(false);
      expect(res.errors).toHaveLength(1);
      expect(res.errors[0]).toContain('sessionDurationSeconds');
      expect(res.validatedConfig.sessionDurationSeconds).toBe(120);
    });

    it('rejects +Infinity sessionDurationSeconds', () => {
      const res = validateGameplayConfig({ sessionDurationSeconds: Infinity });
      expect(res.isValid).toBe(false);
      expect(res.errors).toHaveLength(1);
      expect(res.errors[0]).toContain('sessionDurationSeconds');
      expect(res.validatedConfig.sessionDurationSeconds).toBe(120);
    });

    it('rejects -Infinity sessionDurationSeconds', () => {
      const res = validateGameplayConfig({ sessionDurationSeconds: -Infinity });
      expect(res.isValid).toBe(false);
      expect(res.errors).toHaveLength(1);
      expect(res.errors[0]).toContain('sessionDurationSeconds');
      expect(res.validatedConfig.sessionDurationSeconds).toBe(120);
    });

    it('rejects NaN spawner.spawnIntervalSeconds', () => {
      const res = validateGameplayConfig({
        spawner: {
          ...DEFAULT_GAMEPLAY_CONFIG.spawner,
          spawnIntervalSeconds: NaN,
        },
      });
      expect(res.isValid).toBe(false);
      expect(res.errors).toHaveLength(1);
      expect(res.errors[0]).toContain('spawner.spawnIntervalSeconds');
      expect(res.validatedConfig.spawner.spawnIntervalSeconds).toBe(3.0);
    });

    it('rejects +Infinity spawner.spawnIntervalSeconds', () => {
      const res = validateGameplayConfig({
        spawner: {
          ...DEFAULT_GAMEPLAY_CONFIG.spawner,
          spawnIntervalSeconds: Infinity,
        },
      });
      expect(res.isValid).toBe(false);
      expect(res.errors).toHaveLength(1);
      expect(res.errors[0]).toContain('spawner.spawnIntervalSeconds');
      expect(res.validatedConfig.spawner.spawnIntervalSeconds).toBe(3.0);
    });

    it('rejects -Infinity spawner.spawnIntervalSeconds', () => {
      const res = validateGameplayConfig({
        spawner: {
          ...DEFAULT_GAMEPLAY_CONFIG.spawner,
          spawnIntervalSeconds: -Infinity,
        },
      });
      expect(res.isValid).toBe(false);
      expect(res.errors).toHaveLength(1);
      expect(res.errors[0]).toContain('spawner.spawnIntervalSeconds');
      expect(res.validatedConfig.spawner.spawnIntervalSeconds).toBe(3.0);
    });

    it('rejects simultaneously NaN sessionDurationSeconds and NaN spawnIntervalSeconds', () => {
      const res = validateGameplayConfig({
        sessionDurationSeconds: NaN,
        spawner: {
          ...DEFAULT_GAMEPLAY_CONFIG.spawner,
          spawnIntervalSeconds: NaN,
        },
      });
      expect(res.isValid).toBe(false);
      expect(res.errors).toHaveLength(2);
      expect(res.validatedConfig.sessionDurationSeconds).toBe(120);
      expect(res.validatedConfig.spawner.spawnIntervalSeconds).toBe(3.0);
    });
  });

  describe('2. Negative Numbers and Zero Boundaries', () => {
    it('rejects negative session duration floats', () => {
      const cases = [-0.0001, -1, -60, -180.5, -999999];
      for (const val of cases) {
        const res = validateGameplayConfig({ sessionDurationSeconds: val });
        expect(res.isValid).toBe(false);
        expect(res.errors[0]).toContain('sessionDurationSeconds');
        expect(res.validatedConfig.sessionDurationSeconds).toBe(MIN_SESSION_DURATION);
      }
    });

    it('rejects 0 and -0 session duration', () => {
      for (const zero of [0, -0]) {
        const res = validateGameplayConfig({ sessionDurationSeconds: zero });
        expect(res.isValid).toBe(false);
        expect(res.errors[0]).toContain('sessionDurationSeconds');
        expect(res.validatedConfig.sessionDurationSeconds).toBe(MIN_SESSION_DURATION);
      }
    });

    it('rejects negative spawn interval floats and zero', () => {
      const cases = [0, -0, -0.0001, -0.99, -5.5, -100];
      for (const val of cases) {
        const res = validateGameplayConfig({
          spawner: {
            ...DEFAULT_GAMEPLAY_CONFIG.spawner,
            spawnIntervalSeconds: val,
          },
        });
        expect(res.isValid).toBe(false);
        expect(res.errors[0]).toContain('spawner.spawnIntervalSeconds');
        expect(res.validatedConfig.spawner.spawnIntervalSeconds).toBe(MIN_SPAWN_INTERVAL);
      }
    });
  });

  describe('3. Strict Boundary Limits', () => {
    it('validates exact boundaries of session duration', () => {
      expect(validateGameplayConfig({ sessionDurationSeconds: 59.9999 }).isValid).toBe(false);
      expect(validateGameplayConfig({ sessionDurationSeconds: 60 }).isValid).toBe(true);
      expect(validateGameplayConfig({ sessionDurationSeconds: 180 }).isValid).toBe(true);
      expect(validateGameplayConfig({ sessionDurationSeconds: 180.0001 }).isValid).toBe(false);
    });

    it('validates exact boundaries of spawn interval', () => {
      const testSpawn = (val: number) =>
        validateGameplayConfig({
          spawner: { ...DEFAULT_GAMEPLAY_CONFIG.spawner, spawnIntervalSeconds: val },
        });

      expect(testSpawn(0.9999).isValid).toBe(false);
      expect(testSpawn(1.0).isValid).toBe(true);
      expect(testSpawn(15.0).isValid).toBe(true);
      expect(testSpawn(15.0001).isValid).toBe(false);
    });
  });

  describe('4. Null, Undefined, and Missing Properties', () => {
    it('handles undefined root input cleanly', () => {
      const res = validateGameplayConfig(undefined);
      expect(res.isValid).toBe(true);
      expect(res.errors).toHaveLength(0);
      expect(res.validatedConfig.sessionDurationSeconds).toBe(120);
      expect(res.validatedConfig.spawner.spawnIntervalSeconds).toBe(3.0);
    });

    it('handles null root input gracefully without throwing', () => {
      const res = validateGameplayConfig(null as any);
      expect(res.isValid).toBe(true);
      expect(res.errors).toHaveLength(0);
      expect(res.validatedConfig.sessionDurationSeconds).toBe(120);
    });

    it('handles empty partial object {}', () => {
      const res = validateGameplayConfig({});
      expect(res.isValid).toBe(true);
      expect(res.errors).toHaveLength(0);
      expect(res.validatedConfig.sessionDurationSeconds).toBe(120);
    });

    it('handles undefined properties as omission (fallback to default)', () => {
      const res = validateGameplayConfig({
        sessionDurationSeconds: undefined,
        spawner: {
          ...DEFAULT_GAMEPLAY_CONFIG.spawner,
          spawnIntervalSeconds: undefined as any,
        },
      });
      expect(res.isValid).toBe(true);
      expect(res.errors).toHaveLength(0);
      expect(res.validatedConfig.sessionDurationSeconds).toBe(120);
      expect(res.validatedConfig.spawner.spawnIntervalSeconds).toBe(3.0);
    });

    it('flags null property values as invalid (typeof !== number)', () => {
      const res = validateGameplayConfig({
        sessionDurationSeconds: null as any,
        spawner: {
          ...DEFAULT_GAMEPLAY_CONFIG.spawner,
          spawnIntervalSeconds: null as any,
        },
      });
      expect(res.isValid).toBe(false);
      expect(res.errors).toHaveLength(2);
      expect(res.errors[0]).toContain('sessionDurationSeconds');
      expect(res.errors[1]).toContain('spawner.spawnIntervalSeconds');
    });

    it('handles null spawner object gracefully without crashing', () => {
      const res = validateGameplayConfig({
        spawner: null as any,
      });
      expect(res.isValid).toBe(true);
      expect(res.errors).toHaveLength(0);
      expect(res.validatedConfig.spawner.spawnIntervalSeconds).toBe(3.0);
    });
  });

  describe('5. Direct Clamping Functions Adversarial Inputs', () => {
    it('clamps adversarial session duration values safely', () => {
      expect(clampSessionDuration(NaN)).toBe(120);
      expect(clampSessionDuration(Infinity)).toBe(120);
      expect(clampSessionDuration(-Infinity)).toBe(120);
      expect(clampSessionDuration(-100)).toBe(MIN_SESSION_DURATION);
      expect(clampSessionDuration(59.4)).toBe(MIN_SESSION_DURATION);
      expect(clampSessionDuration(180.6)).toBe(MAX_SESSION_DURATION);
      expect(clampSessionDuration(9999)).toBe(MAX_SESSION_DURATION);
    });

    it('clamps adversarial spawn interval values safely', () => {
      expect(clampSpawnInterval(NaN)).toBe(3.0);
      expect(clampSpawnInterval(Infinity)).toBe(3.0);
      expect(clampSpawnInterval(-Infinity)).toBe(3.0);
      expect(clampSpawnInterval(-50)).toBe(MIN_SPAWN_INTERVAL);
      expect(clampSpawnInterval(0.2)).toBe(MIN_SPAWN_INTERVAL);
      expect(clampSpawnInterval(15.8)).toBe(MAX_SPAWN_INTERVAL);
      expect(clampSpawnInterval(1000)).toBe(MAX_SPAWN_INTERVAL);
    });
  });

  describe('6. Non-Numeric Types (Adversarial Runtime Mismatches)', () => {
    const invalidValues = [
      '120',
      'invalid',
      '',
      true,
      false,
      {},
      [],
    ];

    it('flags non-number sessionDurationSeconds as invalid', () => {
      for (const val of invalidValues) {
        const res = validateGameplayConfig({ sessionDurationSeconds: val as any });
        expect(res.isValid).toBe(false);
        expect(res.errors.length).toBeGreaterThan(0);
        expect(res.errors[0]).toContain('sessionDurationSeconds');
      }
    });

    it('flags non-number spawnIntervalSeconds as invalid', () => {
      for (const val of invalidValues) {
        const res = validateGameplayConfig({
          spawner: {
            ...DEFAULT_GAMEPLAY_CONFIG.spawner,
            spawnIntervalSeconds: val as any,
          },
        });
        expect(res.isValid).toBe(false);
        expect(res.errors.length).toBeGreaterThan(0);
        expect(res.errors[0]).toContain('spawner.spawnIntervalSeconds');
      }
    });
  });

  describe('7. Extreme Number Boundaries and Fuzzing', () => {
    it('handles extreme float boundaries', () => {
      const extremeValues = [
        Number.MAX_VALUE,
        -Number.MAX_VALUE,
        Number.MIN_VALUE,
        -Number.MIN_VALUE,
        Number.MAX_SAFE_INTEGER,
        Number.MIN_SAFE_INTEGER,
        Number.EPSILON,
      ];

      for (const val of extremeValues) {
        const res = validateGameplayConfig({ sessionDurationSeconds: val });
        // Since session duration must be in [60, 180], extreme values outside [60, 180] must be false
        expect(res.isValid).toBe(false);
        expect(res.errors).toHaveLength(1);
        expect(Number.isFinite(res.validatedConfig.sessionDurationSeconds)).toBe(true);
        expect(res.validatedConfig.sessionDurationSeconds).toBeGreaterThanOrEqual(MIN_SESSION_DURATION);
        expect(res.validatedConfig.sessionDurationSeconds).toBeLessThanOrEqual(MAX_SESSION_DURATION);
      }
    });

    it('fuzzes 100 randomized floats and guarantees sanitized output invariants', () => {
      for (let i = 0; i < 100; i++) {
        // Generate random float between -1000 and 1000, occasionally NaN or Infinity
        let randVal: number;
        if (i % 10 === 0) randVal = NaN;
        else if (i % 10 === 1) randVal = Infinity;
        else if (i % 10 === 2) randVal = -Infinity;
        else randVal = (Math.random() - 0.5) * 1000;

        const res = validateGameplayConfig({
          sessionDurationSeconds: randVal,
          spawner: {
            ...DEFAULT_GAMEPLAY_CONFIG.spawner,
            spawnIntervalSeconds: randVal,
          },
        });

        // Invariant 1: Validated config values are always finite and strictly within contract
        expect(Number.isFinite(res.validatedConfig.sessionDurationSeconds)).toBe(true);
        expect(res.validatedConfig.sessionDurationSeconds).toBeGreaterThanOrEqual(MIN_SESSION_DURATION);
        expect(res.validatedConfig.sessionDurationSeconds).toBeLessThanOrEqual(MAX_SESSION_DURATION);

        expect(Number.isFinite(res.validatedConfig.spawner.spawnIntervalSeconds)).toBe(true);
        expect(res.validatedConfig.spawner.spawnIntervalSeconds).toBeGreaterThanOrEqual(MIN_SPAWN_INTERVAL);
        expect(res.validatedConfig.spawner.spawnIntervalSeconds).toBeLessThanOrEqual(MAX_SPAWN_INTERVAL);

        // Invariant 2: isValid is true IF AND ONLY IF both inputs are finite and within range
        const expectedSessionValid =
          Number.isFinite(randVal) && randVal >= MIN_SESSION_DURATION && randVal <= MAX_SESSION_DURATION;
        const expectedSpawnValid =
          Number.isFinite(randVal) && randVal >= MIN_SPAWN_INTERVAL && randVal <= MAX_SPAWN_INTERVAL;
        const expectedOverallValid = expectedSessionValid && expectedSpawnValid;

        expect(res.isValid).toBe(expectedOverallValid);
      }
    });
  });
});
