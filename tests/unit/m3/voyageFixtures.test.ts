import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DIFFICULTIES, MAPS } from '../../../src/core/simulation/VoyageRules';
import { INITIAL_LEADERBOARD_FIXTURES } from '../../../src/mocks/fixtures';

beforeEach(() => { vi.resetModules(); localStorage.clear(); });

describe('published voyage fixtures', () => {
  it('provides opponents for Classic and all nine default voyage boards', async () => {
    const { MockDatabase } = await import('../../../src/mocks/db');
    const db = MockDatabase.getInstance();
    for (const voyage of [undefined, ...DIFFICULTIES.flatMap(difficulty => MAPS.map(map => ({ difficulty, map })))]) {
      const board = db.getRanking({ sessionDuration: 120, spawnInterval: 3, voyage });
      expect(board.totalItems).toBe(6);
      expect(board.items[0]?.playerName).toBe('Edward Teach (Blackbeard)');
      expect(board.items[0]?.voyage).toEqual(voyage);
    }
  });

  it('upgrades previously stored Classic fixtures without duplicating new opponents', async () => {
    const key = 'pirate_battle_mock_leaderboard_v1';
    const classic = INITIAL_LEADERBOARD_FIXTURES.filter(item => !item.voyage);
    localStorage.setItem(key, JSON.stringify(classic));
    const { MockDatabase } = await import('../../../src/mocks/db');
    const db = MockDatabase.getInstance();
    const params = { sessionDuration: 120, spawnInterval: 3, voyage: { difficulty: 'open', map: 'archipelago' } } as const;
    expect(db.getRanking(params).totalItems).toBe(6);
    expect(db.getRanking({ sessionDuration: 120, spawnInterval: 3 }).totalItems).toBe(6);
    vi.resetModules();
    const restored = (await import('../../../src/mocks/db')).MockDatabase.getInstance();
    expect(restored.getRanking(params).totalItems).toBe(6);
  });
});
