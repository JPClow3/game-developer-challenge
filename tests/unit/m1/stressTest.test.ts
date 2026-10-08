import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  AssetLoader,
  SOUND_MANIFEST,
  OPEN_WATER_TILE_ID,
} from '@/assets/AssetLoader';
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

describe('Milestone 1 Empirical Stress Tests', () => {
  beforeEach(() => {
    AssetLoader.getInstance().reset();
  });

  // =========================================================================
  // 1. AssetLoader Concurrency, Multiple Preload & React StrictMode
  // =========================================================================
  describe('1. AssetLoader Concurrency & Lifecycle Stress Tests', () => {
    it('handles 50 concurrent preload() calls returning the exact same Promise instance', async () => {
      const loader = AssetLoader.getInstance();
      const promises: Promise<void>[] = [];

      for (let i = 0; i < 50; i++) {
        promises.push(loader.preload());
      }

      // All returned promises must have identical reference
      for (let i = 1; i < promises.length; i++) {
        expect(promises[i]).toBe(promises[0]);
      }

      await Promise.all(promises);
      expect(loader.isReady()).toBe(true);
    });

    it('immediately resolves subsequent preload() calls once loaded and triggers onProgress(1.0)', async () => {
      const loader = AssetLoader.getInstance();
      await loader.preload();
      expect(loader.isReady()).toBe(true);

      const progressSpy = vi.fn();
      const subsequentPromise = loader.preload(progressSpy);

      // Should be immediately resolved
      await expect(subsequentPromise).resolves.toBeUndefined();
      expect(progressSpy).toHaveBeenCalledWith(1.0);
    });

    it('simulates React 18 StrictMode double-mount lifecycle without resource destruction or errors', async () => {
      const loader = AssetLoader.getInstance();
      const progressUpdatesMount1: number[] = [];
      const progressUpdatesMount2: number[] = [];

      // Mount 1
      let mount1Active = true;
      const mount1Promise = loader.preload((p) => {
        if (mount1Active) progressUpdatesMount1.push(p);
      });

      // StrictMode unmount: cleanup runs immediately while promise is in-flight
      mount1Active = false;

      // Mount 2: immediately calls preload
      const mount2Promise = loader.preload((p) => {
        progressUpdatesMount2.push(p);
      });

      // Both promises must resolve cleanly
      await Promise.all([mount1Promise, mount2Promise]);

      expect(loader.isReady()).toBe(true);
      // Tiles must be populated and intact
      expect(loader.getTileTexture(OPEN_WATER_TILE_ID)).toBeDefined();
      expect(progressUpdatesMount2).toContain(0.35);
      expect(progressUpdatesMount2.at(-1)).toBe(1);
    });

    it('recovers cleanly when loading fails, allowing subsequent retry', async () => {
      const loader = AssetLoader.getInstance();
      const { Assets } = await import('pixi.js');

      // Force Assets.load to throw once
      const originalLoad = Assets.load;
      vi.spyOn(Assets, 'load').mockRejectedValueOnce(new Error('Network offline or 404'));

      await expect(loader.preload()).rejects.toThrow('Network offline or 404');
      expect(loader.isReady()).toBe(false);

      // Now restore mock and verify retry succeeds
      vi.spyOn(Assets, 'load').mockImplementation(originalLoad);
      await expect(loader.preload()).resolves.toBeUndefined();
      expect(loader.isReady()).toBe(true);
    });

    describe('Kenney Damage Tier & Tile Coordinate Adversarial Inputs', () => {
      it('calculates damage tiers with boundary, negative, and extreme float values', () => {
        expect(AssetLoader.calculateDamageTier(100, 100)).toBe(1);
        expect(AssetLoader.calculateDamageTier(75.0001, 100)).toBe(1);
        expect(AssetLoader.calculateDamageTier(75.0, 100)).toBe(2);
        expect(AssetLoader.calculateDamageTier(50.0001, 100)).toBe(2);
        expect(AssetLoader.calculateDamageTier(50.0, 100)).toBe(3);
        expect(AssetLoader.calculateDamageTier(25.0001, 100)).toBe(3);
        expect(AssetLoader.calculateDamageTier(25.0, 100)).toBe(4);
        expect(AssetLoader.calculateDamageTier(0, 100)).toBe(4);
        expect(AssetLoader.calculateDamageTier(-999, 100)).toBe(4);
        expect(AssetLoader.calculateDamageTier(100, 0)).toBe(4);
        expect(AssetLoader.calculateDamageTier(100, -50)).toBe(4);
        expect(AssetLoader.calculateDamageTier(NaN, 100)).toBe(4);
        expect(AssetLoader.calculateDamageTier(100, NaN)).toBe(4);
        expect(AssetLoader.calculateDamageTier(Infinity, 100)).toBe(1);
        expect(AssetLoader.calculateDamageTier(-Infinity, 100)).toBe(4);
      });

      it('clamps tile coordinates safely for out-of-range indices', () => {
        // Minimum clamp (index < 1)
        const tZero = AssetLoader.getTileCoordinate(0);
        expect(tZero).toEqual({ col: 0, row: 0, x: 0, y: 0 });

        const tNegative = AssetLoader.getTileCoordinate(-500);
        expect(tNegative).toEqual({ col: 0, row: 0, x: 0, y: 0 });

        // Maximum clamp (index > 96)
        const tOver = AssetLoader.getTileCoordinate(97);
        expect(tOver).toEqual({ col: 15, row: 5, x: 960, y: 320 });

        const tHuge = AssetLoader.getTileCoordinate(999999);
        expect(tHuge).toEqual({ col: 15, row: 5, x: 960, y: 320 });

        // Float index should floor
        const tFloat = AssetLoader.getTileCoordinate(16.99);
        expect(tFloat).toEqual({ col: 15, row: 0, x: 960, y: 0 });
      });

      it('gracefully handles fallback for unknown ship series or tiers', () => {
        // @ts-expect-error Adversarial invalid ship series
        expect(AssetLoader.getShipFrameName(99, 1)).toBe('ship_1.png');
        // @ts-expect-error Adversarial invalid tier
        expect(AssetLoader.getShipFrameName(1, 99)).toBe('ship_1.png');
      });
    });
  });

  // =========================================================================
  // 2. Config & Validation Adversarial Stress Tests
  // =========================================================================
  describe('2. Config & Clamping Adversarial Stress Tests', () => {
    describe('clampSessionDuration', () => {
      it('clamps boundary values and extreme numbers', () => {
        expect(clampSessionDuration(MIN_SESSION_DURATION)).toBe(60);
        expect(clampSessionDuration(MAX_SESSION_DURATION)).toBe(180);

        // Below minimum
        expect(clampSessionDuration(59)).toBe(60);
        expect(clampSessionDuration(0)).toBe(60);
        expect(clampSessionDuration(-1)).toBe(60);
        expect(clampSessionDuration(-999999)).toBe(60);

        // Above maximum
        expect(clampSessionDuration(181)).toBe(180);
        expect(clampSessionDuration(999999)).toBe(180);

        // Floats and rounding
        expect(clampSessionDuration(59.4)).toBe(60);
        expect(clampSessionDuration(59.6)).toBe(60);
        expect(clampSessionDuration(60.4)).toBe(60);
        expect(clampSessionDuration(60.6)).toBe(61);
        expect(clampSessionDuration(179.4)).toBe(179);
        expect(clampSessionDuration(179.6)).toBe(180);
        expect(clampSessionDuration(180.4)).toBe(180);

        // Non-finite and NaN values
        expect(clampSessionDuration(NaN)).toBe(120);
        expect(clampSessionDuration(Infinity)).toBe(120);
        expect(clampSessionDuration(-Infinity)).toBe(120);
        // @ts-expect-error testing undefined
        expect(clampSessionDuration(undefined)).toBe(120);
        // @ts-expect-error testing null: Math.round(null) = 0, clamped to 60
        expect(clampSessionDuration(null)).toBe(60);
      });
    });

    describe('clampSpawnInterval', () => {
      it('clamps boundary values and extreme floats with 1 decimal precision', () => {
        expect(clampSpawnInterval(MIN_SPAWN_INTERVAL)).toBe(1.0);
        expect(clampSpawnInterval(MAX_SPAWN_INTERVAL)).toBe(15.0);

        // Below minimum
        expect(clampSpawnInterval(0.9)).toBe(1.0);
        expect(clampSpawnInterval(0)).toBe(1.0);
        expect(clampSpawnInterval(-10)).toBe(1.0);
        expect(clampSpawnInterval(-999999)).toBe(1.0);

        // Above maximum
        expect(clampSpawnInterval(15.1)).toBe(15.0);
        expect(clampSpawnInterval(999999)).toBe(15.0);

        // Floats and rounding to 1 decimal place
        expect(clampSpawnInterval(3.14159)).toBe(3.1);
        expect(clampSpawnInterval(3.16)).toBe(3.2);
        expect(clampSpawnInterval(1.04)).toBe(1.0);
        expect(clampSpawnInterval(1.06)).toBe(1.1);

        // Non-finite and NaN values
        expect(clampSpawnInterval(NaN)).toBe(3.0);
        expect(clampSpawnInterval(Infinity)).toBe(3.0);
        expect(clampSpawnInterval(-Infinity)).toBe(3.0);
        // @ts-expect-error testing undefined
        expect(clampSpawnInterval(undefined)).toBe(3.0);
        // @ts-expect-error testing null
        expect(clampSpawnInterval(null)).toBe(1.0);
      });
    });

    describe('validateGameplayConfig Adversarial Testing', () => {
      it('accepts valid boundary configurations', () => {
        const minConfig = validateGameplayConfig({
          sessionDurationSeconds: 60,
          spawner: {
            ...DEFAULT_GAMEPLAY_CONFIG.spawner,
            spawnIntervalSeconds: 1.0,
          },
        });
        expect(minConfig.isValid).toBe(true);
        expect(minConfig.errors).toHaveLength(0);
        expect(minConfig.validatedConfig.sessionDurationSeconds).toBe(60);
        expect(minConfig.validatedConfig.spawner.spawnIntervalSeconds).toBe(1.0);

        const maxConfig = validateGameplayConfig({
          sessionDurationSeconds: 180,
          spawner: {
            ...DEFAULT_GAMEPLAY_CONFIG.spawner,
            spawnIntervalSeconds: 15.0,
          },
        });
        expect(maxConfig.isValid).toBe(true);
        expect(maxConfig.errors).toHaveLength(0);
        expect(maxConfig.validatedConfig.sessionDurationSeconds).toBe(180);
        expect(maxConfig.validatedConfig.spawner.spawnIntervalSeconds).toBe(15.0);
      });

      it('detects out-of-range negative numbers and extreme values', () => {
        const negativeSession = validateGameplayConfig({ sessionDurationSeconds: -10 });
        expect(negativeSession.isValid).toBe(false);
        expect(negativeSession.errors.length).toBeGreaterThan(0);
        expect(negativeSession.errors[0]).toContain('sessionDurationSeconds');

        const hugeSession = validateGameplayConfig({ sessionDurationSeconds: 999 });
        expect(hugeSession.isValid).toBe(false);
        expect(hugeSession.errors.length).toBeGreaterThan(0);

        const negativeSpawn = validateGameplayConfig({
          spawner: {
            ...DEFAULT_GAMEPLAY_CONFIG.spawner,
            spawnIntervalSeconds: -5,
          },
        });
        expect(negativeSpawn.isValid).toBe(false);
        expect(negativeSpawn.errors.length).toBeGreaterThan(0);
        expect(negativeSpawn.errors[0]).toContain('spawnIntervalSeconds');

        const hugeSpawn = validateGameplayConfig({
          spawner: {
            ...DEFAULT_GAMEPLAY_CONFIG.spawner,
            spawnIntervalSeconds: 99,
          },
        });
        expect(hugeSpawn.isValid).toBe(false);
        expect(hugeSpawn.errors.length).toBeGreaterThan(0);
      });

      it('detects Infinity and -Infinity as invalid configuration values', () => {
        const infSession = validateGameplayConfig({ sessionDurationSeconds: Infinity });
        expect(infSession.isValid).toBe(false);
        expect(infSession.errors.length).toBeGreaterThan(0);

        const negInfSession = validateGameplayConfig({ sessionDurationSeconds: -Infinity });
        expect(negInfSession.isValid).toBe(false);
        expect(negInfSession.errors.length).toBeGreaterThan(0);

        const infSpawn = validateGameplayConfig({
          spawner: {
            ...DEFAULT_GAMEPLAY_CONFIG.spawner,
            spawnIntervalSeconds: Infinity,
          },
        });
        expect(infSpawn.isValid).toBe(false);
        expect(infSpawn.errors.length).toBeGreaterThan(0);
      });

      /**
       * CRITICAL CHALLENGE / ADVERSARIAL DISCOVERY:
       * When sessionDurationSeconds is NaN, JS evaluates (NaN < 60) as false and (NaN > 180) as false.
       * validateGameplayConfig must flag NaN as invalid and record an error message.
       */
      it('adversarially rejects NaN sessionDurationSeconds with isValid: false and an error message', () => {
        const nanSession = validateGameplayConfig({ sessionDurationSeconds: NaN });
        expect(nanSession.isValid).toBe(false);
        expect(nanSession.errors.length).toBeGreaterThan(0);
        expect(nanSession.errors[0]).toMatch(/sessionDurationSeconds/);
      });

      it('adversarially rejects NaN spawner.spawnIntervalSeconds with isValid: false and an error message', () => {
        const nanSpawn = validateGameplayConfig({
          spawner: {
            ...DEFAULT_GAMEPLAY_CONFIG.spawner,
            spawnIntervalSeconds: NaN,
          },
        });
        expect(nanSpawn.isValid).toBe(false);
        expect(nanSpawn.errors.length).toBeGreaterThan(0);
        expect(nanSpawn.errors[0]).toMatch(/spawnIntervalSeconds/);
      });
    });
  });

  // =========================================================================
  // 3. Audio Manifest & File System Verification (27 Files)
  // =========================================================================
  describe('3. Sound Manifest & Physical Asset Verification', () => {
    const projectRoot = path.resolve(__dirname, '../../..');
    const assetsSoundsDir = path.join(projectRoot, 'assets', 'sounds');
    const publicSoundsDir = path.join(projectRoot, 'public', 'assets', 'sounds');

    it('verifies SOUND_MANIFEST has exactly 27 entries', () => {
      const manifestKeys = Object.keys(SOUND_MANIFEST);
      expect(manifestKeys).toHaveLength(27);
    });

    it('verifies all 27 sound files exist on disk in assets/sounds/ and are valid non-empty WAV files', () => {
      expect(fs.existsSync(assetsSoundsDir)).toBe(true);
      const diskFiles = fs.readdirSync(assetsSoundsDir).filter((f) => f.endsWith('.wav'));
      expect(diskFiles).toHaveLength(27);

      for (const [soundId, entry] of Object.entries(SOUND_MANIFEST)) {
        const filePath = path.join(assetsSoundsDir, entry.filename);
        expect(fs.existsSync(filePath), `File ${entry.filename} for soundId ${soundId} must exist`).toBe(true);

        const stats = fs.statSync(filePath);
        expect(stats.size, `File ${entry.filename} must not be empty`).toBeGreaterThan(100);

        // Verify RIFF WAVE header bytes
        const fd = fs.openSync(filePath, 'r');
        const buffer = Buffer.alloc(12);
        fs.readSync(fd, buffer, 0, 12, 0);
        fs.closeSync(fd);

        const riffHeader = buffer.toString('ascii', 0, 4);
        const waveHeader = buffer.toString('ascii', 8, 12);
        expect(riffHeader, `${entry.filename} header must be RIFF`).toBe('RIFF');
        expect(waveHeader, `${entry.filename} format must be WAVE`).toBe('WAVE');
      }
    });

    it('verifies all 27 sound files are mirrored into public/assets/sounds/ for Vite web serving', () => {
      expect(fs.existsSync(publicSoundsDir)).toBe(true);
      const publicFiles = fs.readdirSync(publicSoundsDir).filter((f) => f.endsWith('.wav'));
      expect(publicFiles).toHaveLength(27);

      for (const [, entry] of Object.entries(SOUND_MANIFEST)) {
        const publicPath = path.join(publicSoundsDir, entry.filename);
        expect(fs.existsSync(publicPath), `Public file ${entry.filename} must exist`).toBe(true);
      }
    });

    it('confirms there are zero orphaned sound files on disk not registered in the manifest', () => {
      const diskFiles = fs.readdirSync(assetsSoundsDir).filter((f) => f.endsWith('.wav'));
      const manifestFilenames = new Set(Object.values(SOUND_MANIFEST).map((e) => e.filename));

      for (const file of diskFiles) {
        expect(manifestFilenames.has(file), `Disk file ${file} should be in SOUND_MANIFEST`).toBe(true);
      }
    });
  });
});
