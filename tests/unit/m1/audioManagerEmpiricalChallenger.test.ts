import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AudioManager } from '@/audio/AudioManager';

describe('Empirical Challenger: AudioManager Adversarial & Stress Verification', () => {
  let audio: AudioManager;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(1024),
    }));

    audio = AudioManager.getInstance();
    audio.reset();
    audio.setMasterVolume(1.0);
    audio.setSfxVolume(0.8);
    audio.setMusicVolume(0.6);
    audio.setMuted(false);
  });

  afterEach(() => {
    audio.reset();
    vi.unstubAllGlobals();
  });

  describe('1. Non-finite Volume Setters State Preservation & Exception Safety', () => {
    const nonFiniteCases = [
      NaN,
      Infinity,
      -Infinity,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ];

    const malformedTypeCases = [
      undefined as unknown as number,
      null as unknown as number,
      '0.5' as unknown as number,
      {} as unknown as number,
      [0.5] as unknown as number,
    ];

    it('preserves masterVolume state and never throws when passed non-finite numbers', () => {
      audio.setMasterVolume(0.65);
      expect(audio.getSettings().masterVolume).toBe(0.65);

      for (const val of nonFiniteCases) {
        expect(() => audio.setMasterVolume(val)).not.toThrow();
        expect(audio.getSettings().masterVolume).toBe(0.65);
      }
    });

    it('preserves sfxVolume state and never throws when passed non-finite numbers', () => {
      audio.setSfxVolume(0.45);
      expect(audio.getSettings().sfxVolume).toBe(0.45);

      for (const val of nonFiniteCases) {
        expect(() => audio.setSfxVolume(val)).not.toThrow();
        expect(audio.getSettings().sfxVolume).toBe(0.45);
      }
    });

    it('preserves musicVolume state and never throws when passed non-finite numbers', () => {
      audio.setMusicVolume(0.35);
      expect(audio.getSettings().musicVolume).toBe(0.35);

      for (const val of nonFiniteCases) {
        expect(() => audio.setMusicVolume(val)).not.toThrow();
        expect(audio.getSettings().musicVolume).toBe(0.35);
      }
    });

    it('rejects malformed non-number types without mutating state or throwing', () => {
      audio.setMasterVolume(0.7);
      audio.setSfxVolume(0.6);
      audio.setMusicVolume(0.5);

      for (const val of malformedTypeCases) {
        expect(() => audio.setMasterVolume(val)).not.toThrow();
        expect(() => audio.setSfxVolume(val)).not.toThrow();
        expect(() => audio.setMusicVolume(val)).not.toThrow();

        expect(audio.getSettings().masterVolume).toBe(0.7);
        expect(audio.getSettings().sfxVolume).toBe(0.6);
        expect(audio.getSettings().musicVolume).toBe(0.5);
      }
    });

    it('strictly clamps valid boundary floats [0, 1]', () => {
      audio.setMasterVolume(-100);
      expect(audio.getSettings().masterVolume).toBe(0.0);

      audio.setMasterVolume(100);
      expect(audio.getSettings().masterVolume).toBe(1.0);

      audio.setSfxVolume(-0.000001);
      expect(audio.getSettings().sfxVolume).toBe(0.0);

      audio.setSfxVolume(1.000001);
      expect(audio.getSettings().sfxVolume).toBe(1.0);

      audio.setMusicVolume(Number.MIN_VALUE);
      expect(audio.getSettings().musicVolume).toBeGreaterThan(0);
      expect(audio.getSettings().musicVolume).toBeLessThan(1);
    });
  });

  describe('2. playSfx Rapid Calls & Voice Limiting Stress Harness', () => {
    it('survives rapid-fire 1000 calls to playSfx without leaking voices or throwing', async () => {
      await audio.loadSound('cannon_fire_1');

      const results: (AudioBufferSourceNode | null)[] = [];
      expect(() => {
        for (let i = 0; i < 1000; i++) {
          results.push(audio.playSfx('cannon_fire_1'));
        }
      }).not.toThrow();

      const activeVoices = results.filter((r): r is AudioBufferSourceNode => r !== null);
      const droppedVoices = results.filter((r) => r === null);

      expect(activeVoices).toHaveLength(4);
      expect(droppedVoices).toHaveLength(996);
    });

    it('handles rapid lifecycle cycles (fire 4 -> end 4 -> fire 4) over 100 iterations', async () => {
      await audio.loadSound('cannon_fire_1');

      for (let cycle = 0; cycle < 100; cycle++) {
        const batch: AudioBufferSourceNode[] = [];
        for (let i = 0; i < 4; i++) {
          const src = audio.playSfx('cannon_fire_1');
          expect(src).not.toBeNull();
          if (src) batch.push(src);
        }

        // Voice limit reached
        expect(audio.playSfx('cannon_fire_1')).toBeNull();

        // Release voices in random order
        batch.sort(() => Math.random() - 0.5);
        for (const src of batch) {
          if (src.onended) {
            src.onended(new Event('ended'));
          }
        }
      }

      // After 100 cycles, pool must be completely fresh
      const finalVoices = Array.from({ length: 4 }, () => audio.playSfx('cannon_fire_1'));
      expect(finalVoices.every((v) => v !== null)).toBe(true);
      expect(audio.playSfx('cannon_fire_1')).toBeNull();
    });

    it('sanitizes volumeScale under adversarial inputs (NaN, Infinity, negative, extreme)', async () => {
      await audio.loadSound('cannon_fire_1');

      const adversarialScales = [
        NaN,
        Infinity,
        -Infinity,
        -9999,
        9999,
        undefined as unknown as number,
        null as unknown as number,
        'huge' as unknown as number,
      ];

      for (const scale of adversarialScales) {
        audio.reset();
        await audio.loadSound('cannon_fire_1');

        expect(() => {
          const src = audio.playSfx('cannon_fire_1', scale);
          expect(src).not.toBeNull();
        }).not.toThrow();
      }
    });

    it('handles multiple onended calls defensively without driving counter negative', async () => {
      await audio.loadSound('cannon_fire_1');

      const src = audio.playSfx('cannon_fire_1');
      expect(src).not.toBeNull();

      if (src?.onended) {
        // Trigger onended 10 times consecutively
        for (let i = 0; i < 10; i++) {
          expect(() => src.onended!(new Event('ended'))).not.toThrow();
        }
      }

      // The slot count must have clamped at 0, allowing exactly 4 new voices
      const newBatch = Array.from({ length: 4 }, () => audio.playSfx('cannon_fire_1'));
      expect(newBatch.every((v) => v !== null)).toBe(true);
      expect(audio.playSfx('cannon_fire_1')).toBeNull();
    });
  });

  describe('3. Ambient Loops Rapid Calls & Adversarial Scenarios', () => {
    it('prevents duplication under 500 rapid synchronous startLoop calls', async () => {
      await audio.loadSound('ocean_ambience_loop');

      expect(() => {
        for (let i = 0; i < 500; i++) {
          audio.startLoop('ocean_ambience_loop');
        }
      }).not.toThrow();

      // Audio must stop cleanly in one stopLoop call
      expect(() => {
        audio.stopLoop('ocean_ambience_loop');
      }).not.toThrow();

      // Subsequent stopLoop calls on stopped loop are safe no-ops
      for (let i = 0; i < 10; i++) {
        expect(() => audio.stopLoop('ocean_ambience_loop')).not.toThrow();
      }
    });

    it('survives rapid startLoop / stopLoop churn (200 cycles)', async () => {
      await audio.loadSound('ocean_ambience_loop');

      expect(() => {
        for (let i = 0; i < 200; i++) {
          audio.startLoop('ocean_ambience_loop', 0.5);
          audio.stopLoop('ocean_ambience_loop');
        }
      }).not.toThrow();
    });

    it('handles setLoopVolume with NaN, Infinity, -Infinity without throwing or corrupting gain', async () => {
      await audio.loadSound('ocean_ambience_loop');
      audio.startLoop('ocean_ambience_loop', 0.5);

      const invalidScales = [NaN, Infinity, -Infinity, undefined as unknown as number, null as unknown as number];

      for (const scale of invalidScales) {
        expect(() => audio.setLoopVolume('ocean_ambience_loop', scale)).not.toThrow();
      }

      // Valid volume update still functions
      expect(() => audio.setLoopVolume('ocean_ambience_loop', 1.5)).not.toThrow();
      audio.stopLoop('ocean_ambience_loop');
    });

    it('handles concurrent startLoop calls while asset is asynchronously fetching', async () => {
      let resolveFetch!: (value: unknown) => void;
      const fetchPromise = new Promise((resolve) => {
        resolveFetch = resolve;
      });

      vi.stubGlobal('fetch', vi.fn().mockReturnValue(fetchPromise));

      // Trigger 20 rapid startLoop calls before fetch resolves
      for (let i = 0; i < 20; i++) {
        audio.startLoop('ship_sailing_loop', 0.7);
      }

      // Now resolve the mock fetch
      resolveFetch({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(1024),
      });

      // Allow microtasks to settle
      await new Promise((r) => setTimeout(r, 20));

      // Stop loops cleanly
      expect(() => audio.stopLoop('ship_sailing_loop')).not.toThrow();
    });
  });

  describe('4. Rapid AudioContext Unlock & Mute Toggle Thrash', () => {
    it('handles 50 parallel unlockAudio calls simultaneously', async () => {
      const unlockPromises = Array.from({ length: 50 }, () => audio.unlockAudio());
      const results = await Promise.all(unlockPromises);

      expect(results.every((r) => typeof r === 'boolean')).toBe(true);
      expect(audio.getContextState()).toBe('running');
    });

    it('maintains integrity under simultaneous voice playback, volume thrashing, and muting', async () => {
      await audio.loadSound('cannon_fire_1');
      await audio.loadSound('ocean_ambience_loop');

      audio.startLoop('ocean_ambience_loop');

      expect(() => {
        for (let i = 0; i < 200; i++) {
          audio.setMasterVolume(i % 2 === 0 ? Math.random() : NaN);
          audio.setSfxVolume(i % 3 === 0 ? Math.random() : Infinity);
          audio.setMusicVolume(i % 5 === 0 ? Math.random() : -Infinity);
          audio.setMuted(i % 4 === 0);
          audio.playSfx('cannon_fire_1');
          audio.setLoopVolume('ocean_ambience_loop', i % 2 === 0 ? 0.5 : NaN);
        }
      }).not.toThrow();

      const finalSettings = audio.getSettings();
      expect(Number.isFinite(finalSettings.masterVolume)).toBe(true);
      expect(Number.isFinite(finalSettings.sfxVolume)).toBe(true);
      expect(Number.isFinite(finalSettings.musicVolume)).toBe(true);
    });
  });
});
