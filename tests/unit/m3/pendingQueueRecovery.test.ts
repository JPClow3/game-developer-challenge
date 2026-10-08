import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { PendingSubmissionQueue } from '../../../src/api/pendingQueue';
import { apiClient, ApiRequestError } from '../../../src/api/client';
import type { SubmitMatchRequest } from '../../../src/types/api';

const key = 'pirate_battle_pending_submissions_v1';
const request: SubmitMatchRequest = {
  id: 'durable-match', playerId: 'captain', score: 4, durationSeconds: 120,
  endReason: 'time_expired', config: { sessionDurationSeconds: 120, enemySpawnIntervalSeconds: 3 },
  playedAt: '2026-10-07T00:00:00Z',
};
const queue = PendingSubmissionQueue.getInstance();

beforeEach(() => {
  const entries = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => entries.get(name) ?? null,
    setItem: (name: string, value: string) => entries.set(name, value),
  });
  for (const item of [...queue.getPending()]) queue.remove(item.id);
});
afterEach(() => {
  for (const item of [...queue.getPending()]) queue.remove(item.id);
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('durable submission recovery', () => {
  it('persists before dispatch and shares in-flight work with concurrent sync', async () => {
    let acknowledge!: (value: { status: number; data: { isDuplicate: boolean } }) => void;
    const post = vi.spyOn(apiClient, 'post').mockImplementation(() => {
      expect(JSON.parse(localStorage.getItem(key)!)[0].request).toEqual(request);
      return new Promise(resolve => { acknowledge = resolve; });
    });
    const first = queue.submit(request);
    const duplicate = queue.submit(request);
    const sync = queue.processQueue();
    expect(duplicate).toBe(first);
    expect(post).toHaveBeenCalledTimes(1);
    expect(queue.getPendingCount()).toBe(1);
    acknowledge({ status: 201, data: { isDuplicate: false } });
    await Promise.all([first, duplicate, sync]);
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual([]);
  });

  it('retains a timeout and clears it only after a duplicate acknowledgement', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(new ApiRequestError('response lost'))
      .mockResolvedValueOnce({ status: 200, data: { isDuplicate: true } });
    await expect(queue.submit(request)).rejects.toThrow('response lost');
    expect(queue.getPending()[0]?.lastError).toBe('response lost');
    await queue.processQueue();
    expect(queue.getPendingCount()).toBe(0);
  });

  it('refreshes every ranking/history key after automatic background sync', async () => {
    const client = new QueryClient();
    const ranking = ['ranking', { page: 1 }];
    const history = ['history', { playerId: 'captain', page: 2 }];
    client.setQueryData(ranking, []); client.setQueryData(history, []);
    queue.enqueue(request);
    vi.spyOn(apiClient, 'post').mockResolvedValue({ status: 200, data: { isDuplicate: true } });
    queue.startAutoSync(() => Promise.all([
      client.invalidateQueries({ queryKey: ['ranking'] }),
      client.invalidateQueries({ queryKey: ['history'] }),
    ]));
    await vi.waitFor(() => expect(queue.getPendingCount()).toBe(0));
    expect(client.getQueryState(ranking)?.isInvalidated).toBe(true);
    expect(client.getQueryState(history)?.isInvalidated).toBe(true);
    client.clear();
  });

  it('publishes a background rejection before draining and never resubmits the rejected ID', async () => {
    const rejected = { ...request, id: 'background-rejected-match' };
    queue.enqueue(rejected);
    const observed: unknown[] = [];
    const unsubscribe = queue.subscribe(() => observed.push(queue.getRejection(rejected.id)));
    const post = vi.spyOn(apiClient, 'post').mockRejectedValue(new ApiRequestError('Invalid replay', 422));
    await queue.processQueue();
    unsubscribe();
    expect(queue.getPendingCount()).toBe(0);
    expect(queue.getRejection(rejected.id)).toEqual({ id: rejected.id, message: 'Invalid replay', status: 422 });
    expect(observed).toContainEqual(queue.getRejection(rejected.id));
    expect(JSON.parse(localStorage.getItem('pirate_battle_submission_rejections_v1')!))
      .toContainEqual(queue.getRejection(rejected.id));
    await expect(queue.submit(rejected)).rejects.toThrow('Invalid replay');
    await queue.processQueue();
    expect(post).toHaveBeenCalledTimes(1);
  });
});
