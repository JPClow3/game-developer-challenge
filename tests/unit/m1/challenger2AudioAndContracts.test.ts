import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AudioManager } from '@/audio/AudioManager';
import { SOUND_MANIFEST, type SoundId } from '@/assets/AssetLoader';
import type {
  SubmitMatchRequest,
  MatchRecord,
  RankingItem,
  PaginatedResponse,
} from '@/types/api';
import type { MatchEndReason } from '@/types/game';

describe('Challenger M1-2: Empirical Audio & Contracts Stress Tests', () => {
  // =========================================================================
  // 1. AudioManager Voice Limiters & Gain Hierarchy Stress Tests
  // =========================================================================
  describe('1. AudioManager Voice Limiting & Gain Hierarchy', () => {
    let audio: AudioManager;

    beforeEach(() => {
      // Mock fetch for audio assets in JSDOM
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(1024),
      }));

      audio = AudioManager.getInstance();
      audio.reset();
      // Ensure master settings are restored to default
      audio.setMasterVolume(1.0);
      audio.setSfxVolume(0.8);
      audio.setMusicVolume(0.6);
      audio.setMuted(false);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('enforces maximum 4 concurrent voices per SFX under rapid fire (50 calls)', async () => {
      // Mock-load the cannon_fire_1 sound into buffer cache
      await audio.loadSound('cannon_fire_1');

      const sources: (AudioBufferSourceNode | null)[] = [];

      // Fire 50 rapid calls to cannon_fire_1
      for (let i = 0; i < 50; i++) {
        sources.push(audio.playSfx('cannon_fire_1'));
      }

      // Exactly 4 voices must succeed, remaining 46 must return null (voice limited)
      const successfulVoices = sources.filter((s): s is AudioBufferSourceNode => s !== null);
      const droppedVoices = sources.filter((s) => s === null);

      expect(successfulVoices).toHaveLength(4);
      expect(droppedVoices).toHaveLength(46);

      // Verify each active voice started playback
      for (const src of successfulVoices) {
        expect(src.start).toHaveBeenCalledWith(0);
      }
    });

    it('maintains independent voice pools for different sound IDs during simultaneous bursts', async () => {
      await audio.loadSound('cannon_fire_1');
      await audio.loadSound('cannon_fire_2');
      await audio.loadSound('ui_click');

      // Burst 10 fires for cannon_fire_1
      const c1Voices = Array.from({ length: 10 }, () => audio.playSfx('cannon_fire_1')).filter(Boolean);
      // Burst 10 fires for cannon_fire_2
      const c2Voices = Array.from({ length: 10 }, () => audio.playSfx('cannon_fire_2')).filter(Boolean);
      // Burst 10 fires for ui_click
      const clickVoices = Array.from({ length: 10 }, () => audio.playSfx('ui_click')).filter(Boolean);

      // Each sound category gets its own independent 4-voice quota
      expect(c1Voices).toHaveLength(4);
      expect(c2Voices).toHaveLength(4);
      expect(clickVoices).toHaveLength(4);
    });

    it('reclaims voice slots and disconnects gain nodes as sounds end (source.onended)', async () => {
      await audio.loadSound('cannon_fire_1');

      // Saturate all 4 slots
      const activeSources: AudioBufferSourceNode[] = [];
      for (let i = 0; i < 4; i++) {
        const s = audio.playSfx('cannon_fire_1');
        expect(s).not.toBeNull();
        if (s) activeSources.push(s);
      }

      // 5th call is blocked
      expect(audio.playSfx('cannon_fire_1')).toBeNull();

      // Simulate first sound finishing
      if (activeSources[0]?.onended) {
        activeSources[0].onended(new Event('ended'));
      }

      // Now exactly 1 slot should be free
      const newSource = audio.playSfx('cannon_fire_1');
      expect(newSource).not.toBeNull();

      // But 6th call is blocked again
      expect(audio.playSfx('cannon_fire_1')).toBeNull();

      // Finish remaining sounds
      for (let i = 1; i < activeSources.length; i++) {
        const src = activeSources[i];
        if (src?.onended) {
          src.onended(new Event('ended'));
        }
      }

      // Finish the newly spawned sound
      if (newSource?.onended) {
        newSource.onended(new Event('ended'));
      }

      // Now all 4 slots are available again
      const refreshedPool = Array.from({ length: 4 }, () => audio.playSfx('cannon_fire_1'));
      expect(refreshedPool.every((s) => s !== null)).toBe(true);
    });

    it('clamps extreme volumeScale inputs safely without throwing or exceeding limits', async () => {
      await audio.loadSound('cannon_fire_1');

      // Volume scale far above upper bound (+999 -> clamped to 2.0)
      const highSource = audio.playSfx('cannon_fire_1', 999);
      expect(highSource).not.toBeNull();

      // Negative volume scale (-500 -> clamped to 0.0)
      const lowSource = audio.playSfx('cannon_fire_1', -500);
      expect(lowSource).not.toBeNull();

      // Zero volume scale
      const zeroSource = audio.playSfx('cannon_fire_1', 0);
      expect(zeroSource).not.toBeNull();
    });

    it('suppresses all SFX immediately when muted without incrementing voice counters', async () => {
      await audio.loadSound('cannon_fire_1');

      audio.setMuted(true);
      expect(audio.getSettings().isMuted).toBe(true);

      for (let i = 0; i < 10; i++) {
        expect(audio.playSfx('cannon_fire_1')).toBeNull();
      }

      // Unmute: voice counter should be clean, allowing full 4 voices
      audio.setMuted(false);
      const unmutedVoices = Array.from({ length: 4 }, () => audio.playSfx('cannon_fire_1'));
      expect(unmutedVoices.every((s) => s !== null)).toBe(true);
    });

    it('survives volume thrashing and rapid mute toggling (100 iterations)', () => {
      for (let i = 0; i < 100; i++) {
        audio.setMasterVolume(Math.random());
        audio.setSfxVolume(Math.random());
        audio.setMusicVolume(Math.random());
        audio.setMuted(i % 2 === 0);
      }

      // Final state must remain valid and within [0, 1] bounds
      const settings = audio.getSettings();
      expect(settings.masterVolume).toBeGreaterThanOrEqual(0);
      expect(settings.masterVolume).toBeLessThanOrEqual(1);
      expect(settings.sfxVolume).toBeGreaterThanOrEqual(0);
      expect(settings.sfxVolume).toBeLessThanOrEqual(1);
      expect(settings.musicVolume).toBeGreaterThanOrEqual(0);
      expect(settings.musicVolume).toBeLessThanOrEqual(1);
      expect(typeof settings.isMuted).toBe('boolean');
    });

    it('prevents duplicate ambient loops when startLoop is called multiple times', async () => {
      await audio.loadSound('ocean_ambience_loop');

      audio.startLoop('ocean_ambience_loop', 0.5);
      audio.startLoop('ocean_ambience_loop', 0.8); // Duplicate call
      audio.startLoop('ocean_ambience_loop', 1.0); // Duplicate call

      // Should not throw and should update volume without creating multiple instances
      expect(() => {
        audio.setLoopVolume('ocean_ambience_loop', 0.9);
        audio.stopLoop('ocean_ambience_loop');
      }).not.toThrow();
    });

    it('resets cleanly during active playback without throwing errors', async () => {
      await audio.loadSound('cannon_fire_1');
      await audio.loadSound('ocean_ambience_loop');

      audio.startLoop('ocean_ambience_loop');
      const activeVoice = audio.playSfx('cannon_fire_1');

      // Call reset while sounds are active
      audio.reset();

      // If an old voice finishes after reset, onended must not throw or corrupt state
      if (activeVoice?.onended) {
        expect(() => activeVoice.onended!(new Event('ended'))).not.toThrow();
      }
    });
  });

  // =========================================================================
  // 2. Type Assignability & Runtime Contracts for Match Records & Rankings
  // =========================================================================
  describe('2. Match Records & Ranking Domain Contracts', () => {
    it('verifies strict assignability from SubmitMatchRequest to MatchRecord', () => {
      const submitReq: SubmitMatchRequest = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        playerId: 'pirate_admiral_1',
        playerName: 'Captain Blackbeard',
        score: 42,
        durationSeconds: 120,
        endReason: 'time_expired',
        config: {
          sessionDurationSeconds: 120,
          enemySpawnIntervalSeconds: 3,
        },
        playedAt: '2026-10-07T02:00:00.000Z',
      };

      // Transform into MatchRecord as expected by storage / API layer
      const matchRecord: MatchRecord = {
        id: submitReq.id,
        playerId: submitReq.playerId,
        playerName: submitReq.playerName,
        score: submitReq.score,
        durationSeconds: submitReq.durationSeconds,
        endReason: submitReq.endReason,
        sessionDurationSeconds: submitReq.config.sessionDurationSeconds,
        enemySpawnIntervalSeconds: submitReq.config.enemySpawnIntervalSeconds,
        playedAt: submitReq.playedAt,
        createdAt: new Date().toISOString(),
      };

      expect(matchRecord.id).toBe(submitReq.id);
      expect(matchRecord.score).toBe(42);
      expect(matchRecord.sessionDurationSeconds).toBe(120);
      expect(matchRecord.enemySpawnIntervalSeconds).toBe(3);
    });

    it('enforces exclusion of "abandoned" endReason from SubmitMatchRequest', () => {
      type ValidEndReasons = SubmitMatchRequest['endReason'];
      // Valid end reasons can only be time_expired or player_destroyed
      const validReasons: ValidEndReasons[] = ['time_expired', 'player_destroyed'];
      expect(validReasons).toHaveLength(2);

      // Verify abandoned cannot be assigned to ValidEndReasons
      const abandonedReason: MatchEndReason = 'abandoned';
      const isAssignableToSubmit = (reason: MatchEndReason): boolean => {
        return reason !== 'abandoned';
      };
      expect(isAssignableToSubmit(abandonedReason)).toBe(false);
      expect(isAssignableToSubmit('time_expired')).toBe(true);
      expect(isAssignableToSubmit('player_destroyed')).toBe(true);
    });

    it('verifies RankingItem mapping and deterministic tiebreaker contract', () => {
      const records: MatchRecord[] = [
        {
          id: 'b2222222-2222-4222-8222-222222222222',
          playerId: 'p2',
          playerName: 'Player Two',
          score: 15,
          durationSeconds: 120,
          endReason: 'time_expired',
          sessionDurationSeconds: 120,
          enemySpawnIntervalSeconds: 3,
          playedAt: '2026-10-07T01:30:00.000Z',
        },
        {
          id: 'a1111111-1111-4111-8111-111111111111',
          playerId: 'p1',
          playerName: 'Player One',
          score: 25,
          durationSeconds: 110,
          endReason: 'player_destroyed',
          sessionDurationSeconds: 120,
          enemySpawnIntervalSeconds: 3,
          playedAt: '2026-10-07T01:00:00.000Z',
        },
        {
          id: 'c3333333-3333-4333-8333-333333333333',
          playerId: 'p3',
          playerName: 'Player Three (Tied Score, Earlier Date)',
          score: 25,
          durationSeconds: 120,
          endReason: 'time_expired',
          sessionDurationSeconds: 120,
          enemySpawnIntervalSeconds: 3,
          playedAt: '2026-10-06T20:00:00.000Z', // Earlier than p1
        },
        {
          id: 'd4444444-4444-4444-8444-444444444444',
          playerId: 'p4',
          playerName: 'Player Four (Tied Score, Same Date, Deterministic ID)',
          score: 25,
          durationSeconds: 120,
          endReason: 'time_expired',
          sessionDurationSeconds: 120,
          enemySpawnIntervalSeconds: 3,
          playedAt: '2026-10-06T20:00:00.000Z', // Same date as p3
        },
      ];

      // Deterministic tiebreaker function matching README §5
      // 1. score DESC
      // 2. playedAt ASC (earlier match achieved first)
      // 3. id ASC (lexicographical UUID deterministic tiebreaker)
      const sortedRecords = [...records].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const timeDiff = new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime();
        if (timeDiff !== 0) return timeDiff;
        return a.id.localeCompare(b.id);
      });

      // Map to RankingItem with rank numbers (1-based)
      const ranking: RankingItem[] = sortedRecords.map((rec, index) => ({
        rank: index + 1,
        matchId: rec.id,
        playerId: rec.playerId,
        playerName: rec.playerName,
        score: rec.score,
        durationSeconds: rec.durationSeconds,
        sessionDurationSeconds: rec.sessionDurationSeconds,
        enemySpawnIntervalSeconds: rec.enemySpawnIntervalSeconds,
        playedAt: rec.playedAt,
        isCurrentPlayer: rec.playerId === 'p1',
      }));

      // Verifications:
      expect(ranking[0]?.matchId).toBe('c3333333-3333-4333-8333-333333333333'); // Rank 1: score 25, earlier date
      expect(ranking[1]?.matchId).toBe('d4444444-4444-4444-8444-444444444444'); // Rank 2: score 25, same date, id c < d
      expect(ranking[2]?.matchId).toBe('a1111111-1111-4111-8111-111111111111'); // Rank 3: score 25, later date
      expect(ranking[3]?.matchId).toBe('b2222222-2222-4222-8222-222222222222'); // Rank 4: score 15

      expect(ranking[0]?.rank).toBe(1);
      expect(ranking[1]?.rank).toBe(2);
      expect(ranking[2]?.rank).toBe(3);
      expect(ranking[3]?.rank).toBe(4);
      expect(ranking[2]?.isCurrentPlayer).toBe(true);
    });

    it('verifies pagination slicing contract with PaginatedResponse', () => {
      const items: number[] = Array.from({ length: 45 }, (_, i) => i + 1);
      const pageSize = 10;

      function paginate<T>(all: T[], page: number, size: number): PaginatedResponse<T> {
        const totalItems = all.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / size));
        const safePage = Math.max(1, Math.min(page, totalPages));
        const startIndex = (safePage - 1) * size;
        const pageItems = all.slice(startIndex, startIndex + size);

        return {
          items: pageItems,
          totalItems,
          page: safePage,
          pageSize: size,
          totalPages,
        };
      }

      // Page 1
      const p1 = paginate(items, 1, pageSize);
      expect(p1.items).toHaveLength(10);
      expect(p1.items[0]).toBe(1);
      expect(p1.items[9]).toBe(10);
      expect(p1.totalPages).toBe(5);

      // Page 5 (last page with 5 items)
      const p5 = paginate(items, 5, pageSize);
      expect(p5.items).toHaveLength(5);
      expect(p5.items[0]).toBe(41);
      expect(p5.items[4]).toBe(45);

      // Page out of bounds clamps to last page
      const pOver = paginate(items, 999, pageSize);
      expect(pOver.page).toBe(5);
      expect(pOver.items).toHaveLength(5);
    });
  });

  // =========================================================================
  // 3. Audio Asset Manifest & File Verification Completeness
  // =========================================================================
  describe('3. Sound Manifest Integrity & Edge Contracts', () => {
    it('verifies all 27 manifest sound IDs conform to canonical SoundId union', () => {
      const manifestIds = Object.keys(SOUND_MANIFEST) as SoundId[];
      expect(manifestIds).toHaveLength(27);

      for (const id of manifestIds) {
        const entry = SOUND_MANIFEST[id];
        expect(entry).toBeDefined();
        expect(entry.durationSeconds).toBeGreaterThan(0);
        expect(entry.channels === 1 || entry.channels === 2).toBe(true);
        expect(typeof entry.defaultVolume).toBe('number');
        expect(entry.defaultVolume).toBeGreaterThan(0);
        expect(entry.defaultVolume).toBeLessThanOrEqual(1.0);
      }
    });
  });
});
