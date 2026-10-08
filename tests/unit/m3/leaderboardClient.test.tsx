import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RankingTab } from '../../../src/ui/RankingTab';
import { MockDatabase } from '../../../src/mocks/db';
import { PendingSubmissionQueue } from '../../../src/api/pendingQueue';
import { ApiRequestError, apiClient } from '../../../src/api/client';
import type { SubmitMatchRequest } from '../../../src/types/api';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../src/api/useApiQueries', () => ({ useRankingQuery: query }));
const base: SubmitMatchRequest = { id: 'z', playerId: 'mine', score: 100, durationSeconds: 60,
  endReason: 'time_expired', config: { sessionDurationSeconds: 120, enemySpawnIntervalSeconds: 3 },
  playedAt: '2026-10-07T00:00:00Z' };
beforeEach(() => {
  const entries = new Map<string, string>();
  const storage: Storage = { get length() { return entries.size; }, clear: () => entries.clear(),
    getItem: key => entries.get(key) ?? null, setItem: (key, value) => { entries.set(key, value); },
    removeItem: key => { entries.delete(key); }, key: index => [...entries.keys()][index] ?? null };
  vi.stubGlobal('localStorage', storage);MockDatabase.getInstance().reset();
});
afterEach(() => { cleanup();vi.restoreAllMocks();const queue = PendingSubmissionQueue.getInstance();for (const item of [...queue.getPending()]) queue.remove(item.id);vi.unstubAllGlobals(); });

describe('Leaderboard client regressions', () => {
  it('keeps submission ranks equal to filtered board positions for ties and other configurations', () => {
    const db = MockDatabase.getInstance();
    db.insertMatch({ ...base, id: 'other', score: 200, config: { sessionDurationSeconds: 180, enemySpawnIntervalSeconds: 1 } });
    const first = db.insertMatch(base);
    const earlierId = db.insertMatch({ ...base, id: 'a' });
    expect(first.rankingPosition).toBe(1);expect(earlierId.rankingPosition).toBe(1);
    const board = db.getRanking({ sessionDuration: 120, spawnInterval: 3, pageSize: 1, page: 2 });
    expect(board.items[0]?.matchId).toBe('z');expect(board.items[0]?.rank).toBe(2);
    expect(db.insertMatch(base).rankingPosition).toBe(2);
    expect(() => db.insertMatch({ ...base, playerId: 'impostor' })).toThrow('different result');
  });

  it('highlights the actual browser player from live response IDs without a mock flag', () => {
    localStorage.setItem('pirate_battle_player_id_v1', 'mine');
    query.mockReturnValue({ isLoading: false, isError: false, isFetching: false, data: { page: 1, totalPages: 1, totalItems: 2,
      items: [{ ...base, matchId: 'mine-match', rank: 1, playerName: 'My captain' },
        { ...base, matchId: 'other-match', rank: 2, playerId: 'another', playerName: 'Other captain', isCurrentPlayer: true }] } });
    render(<RankingTab sessionDurationFilter={120} spawnIntervalFilter={3} />);
    expect(screen.getAllByText('You')).toHaveLength(1);
    expect(screen.getByText('My captain').closest('tr')).toHaveClass('font-bold');
    expect(screen.getByText('Other captain').closest('tr')).not.toHaveClass('font-bold');
  });

  it('discards permanently rejected scores but keeps transient errors for offline retry', async () => {
    const queue = PendingSubmissionQueue.getInstance();
    queue.enqueue(base);queue.enqueue({ ...base, id: 'retry' });
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(new ApiRequestError('Unverified score', 400))
      .mockRejectedValueOnce(new ApiRequestError('Database unavailable', 503));
    await queue.processQueue();
    expect(queue.getPending().map(item => item.id)).toEqual(['retry']);
  });
});
