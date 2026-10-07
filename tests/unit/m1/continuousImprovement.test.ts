import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateUUIDv4 } from '@/api/player';
import { AudioManager } from '@/audio/AudioManager';
import { PendingSubmissionQueue } from '@/api/pendingQueue';
import { GameSimulation } from '@/core/simulation/GameSimulation';
import { PixiGame } from '@/pixi/PixiGame';
import { DEFAULT_GAMEPLAY_CONFIG } from '@/types/config';

describe('Continuous Improvement Hardening Tests', () => {
  beforeEach(() => {
    AudioManager.getInstance().reset();
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. RFC 4122 UUID v4 Idempotency Key Compliance', () => {
    it('generates a valid RFC 4122 UUID v4 string', () => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const id1 = generateUUIDv4();
      const id2 = generateUUIDv4();

      expect(id1).toMatch(uuidRegex);
      expect(id2).toMatch(uuidRegex);
      expect(id1).not.toBe(id2);
    });

    it('generates 100 unique UUIDs without collisions', () => {
      const set = new Set<string>();
      for (let i = 0; i < 100; i++) {
        set.add(generateUUIDv4());
      }
      expect(set.size).toBe(100);
    });
  });

  describe('2. AudioManager Lifecycle & Mobile Audio Interruption Safeguards', () => {
    it('supports resumption from interrupted or suspended states in unlockAudio', async () => {
      const audio = AudioManager.getInstance();
      const ctx = (audio as any).ctx;
      if (ctx) {
        ctx.state = 'suspended';
        ctx.resume = vi.fn().mockImplementation(async () => {
          ctx.state = 'running';
        });
        const unlocked = await audio.unlockAudio();
        expect(unlocked).toBe(true);
        expect(ctx.state).toBe('running');
      }
    });

    it('auto-resumes AudioContext when visibilitychange fires and document becomes visible', async () => {
      const audio = AudioManager.getInstance();
      const ctx = (audio as any).ctx;
      if (ctx) {
        ctx.resume = vi.fn().mockImplementation(async () => {
          ctx.state = 'running';
        });
        // Unlock first
        await audio.unlockAudio();
        expect((audio as any).isUnlocked).toBe(true);

        // Simulate mobile background tab suspension
        ctx.state = 'suspended';
        ctx.resume.mockClear();

        // Dispatch visibilitychange with visible document
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => 'visible',
        });
        document.dispatchEvent(new Event('visibilitychange'));

        expect(ctx.resume).toHaveBeenCalled();
      }
    });
  });

  describe('3. PixiGame Sound Resource Reclamation & Audio Loop Ducking', () => {
    it('stops all audio loops when PixiGame.destroy() is invoked', () => {
      const audio = AudioManager.getInstance();
      const stopAllLoopsSpy = vi.spyOn(audio, 'stopAllLoops');

      const sim = new GameSimulation(DEFAULT_GAMEPLAY_CONFIG, 12345);
      const game = new PixiGame(sim);

      game.destroy();

      expect(stopAllLoopsSpy).toHaveBeenCalled();
      sim.destroy();
    });

    it('ducks ocean ambience loop volume to 0 on match_paused and restores on match_resumed', () => {
      const audio = AudioManager.getInstance();
      const setLoopVolumeSpy = vi.spyOn(audio, 'setLoopVolume');

      const sim = new GameSimulation(DEFAULT_GAMEPLAY_CONFIG, 12345);
      const game = new PixiGame(sim);
      // Attach event listeners as done in PixiGame.init()
      (game as any).setupEventAudio();

      sim.pause();
      expect(setLoopVolumeSpy).toHaveBeenCalledWith('ocean_ambience_loop', 0);

      sim.resume();
      expect(setLoopVolumeSpy).toHaveBeenCalledWith('ocean_ambience_loop', 1.0);

      game.destroy();
      sim.destroy();
    });
  });

  describe('4. PendingSubmissionQueue Online Event Auto-Drain', () => {
    it('listens to window online event and calls processQueue', async () => {
      const queue = PendingSubmissionQueue.getInstance();
      const processQueueSpy = vi.spyOn(queue, 'processQueue').mockResolvedValue();

      window.dispatchEvent(new Event('online'));

      expect(processQueueSpy).toHaveBeenCalled();
    });
  });
});
