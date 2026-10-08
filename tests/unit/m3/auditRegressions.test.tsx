import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GameSimulation } from '../../../src/core/simulation/GameSimulation';
import { SimulationBridge } from '../../../src/core/bridge/SimulationBridge';
import {
  DEFAULT_GAMEPLAY_CONFIG,
  loadUserConfigFromStorage,
  saveUserConfigToStorage,
} from '../../../src/types/config';
import { getOrCreatePlayerId, getPlayerName } from '../../../src/api/player';
import { PendingSubmissionQueue } from '../../../src/api/pendingQueue';
import { AudioManager } from '../../../src/audio/AudioManager';
import { RankingTab } from '../../../src/ui/RankingTab';
import { voyageGameplayConfig } from '../../../src/core/simulation/VoyageRules';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../src/api/useApiQueries', () => ({ useRankingQuery: query }));

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const entries = new Map(Object.entries(initial));
  return { get length() { return entries.size; }, clear: () => entries.clear(),
    getItem: key => entries.get(key) ?? null, setItem: (key, value) => { entries.set(key, value); },
    removeItem: key => { entries.delete(key); }, key: index => [...entries.keys()][index] ?? null };
}
const blockedStorage = () => {
  const deny = () => { throw new DOMException('Storage is disabled', 'SecurityError'); };
  return { getItem: deny, setItem: deny, removeItem: deny } as unknown as Storage;
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Audit regressions', () => {
  it('restores voyage choices from canonical balance instead of stored combat constants', () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    const config = voyageGameplayConfig(90, 5, { difficulty: 'storm', map: 'fortress' });
    saveUserConfigToStorage(config);
    const stored = JSON.parse(storage.getItem('pirate_battle_user_config_v1')!);
    expect(stored.voyage).toEqual(config.voyage);
    stored.weaponFront = { projectileDamage: 999 };
    storage.setItem('pirate_battle_user_config_v1', JSON.stringify(stored));
    expect(loadUserConfigFromStorage()).toEqual(config);
  });
  it('bounds the physics backlog on slow devices so recovery does not fast-forward', () => {
    const sim = new GameSimulation();
    try {
      // 8 fps for ten seconds: each frame needs more steps than the sub-step budget.
      for (let frame = 0; frame < 80; frame++) sim.update(0.125);
      expect(sim.accumulator).toBeLessThanOrEqual(sim.maxAccumulator);
      const before = sim.tickCount;
      for (let frame = 0; frame < 60; frame++) sim.update(1 / 60);
      // One second at 60 Hz may only drain the bounded 0.25 s backlog.
      expect(sim.tickCount - before).toBeLessThanOrEqual(60 + 15 + 1);
    } finally {
      sim.destroy();
    }
  });

  it('persists only menu options, never balance constants', () => {
    const storage = memoryStorage({ pirate_battle_user_config_v1: JSON.stringify({
      ...DEFAULT_GAMEPLAY_CONFIG, sessionDurationSeconds: 90,
      weaponFront: { ...DEFAULT_GAMEPLAY_CONFIG.weaponFront, projectileDamage: 999 },
      spawner: { ...DEFAULT_GAMEPLAY_CONFIG.spawner, spawnIntervalSeconds: 5, maxActiveEnemies: 1 },
    }) });
    vi.stubGlobal('localStorage', storage);
    const loaded = loadUserConfigFromStorage()!;
    expect(loaded.sessionDurationSeconds).toBe(90);
    expect(loaded.spawner.spawnIntervalSeconds).toBe(5);
    expect(loaded.weaponFront).toEqual(DEFAULT_GAMEPLAY_CONFIG.weaponFront);
    expect(loaded.spawner.maxActiveEnemies).toBe(DEFAULT_GAMEPLAY_CONFIG.spawner.maxActiveEnemies);
    saveUserConfigToStorage(loaded);
    expect(JSON.parse(storage.getItem('pirate_battle_user_config_v1')!)).toEqual({
      sessionDurationSeconds: 90, spawner: { spawnIntervalSeconds: 5 } });
  });

  it('keeps a stable player identity when storage is blocked', () => {
    vi.stubGlobal('localStorage', blockedStorage());
    const id = getOrCreatePlayerId();
    expect(id).toMatch(/^player_/);
    expect(getOrCreatePlayerId()).toBe(id);
    expect(getPlayerName()).toBe('Captain Corsair');
  });

  it('renders the leaderboard when storage is blocked', () => {
    vi.stubGlobal('localStorage', blockedStorage());
    query.mockReturnValue({ isLoading: false, isError: false, isFetching: false, refetch: vi.fn(),
      data: { page: 1, totalPages: 1, totalItems: 0, pageSize: 8, items: [] } });
    render(<RankingTab sessionDurationFilter={120} spawnIntervalFilter={3} />);
    expect(screen.getByText(/No matches recorded/)).toBeInTheDocument();
  });

  it('returns to the last page when the result set shrinks', async () => {
    vi.stubGlobal('localStorage', memoryStorage());
    const pages: number[] = [];
    query.mockImplementation(({ page }: { page: number }) => {
      pages.push(page);
      return { isLoading: false, isError: false, isFetching: false, refetch: vi.fn(),
        data: { page, totalPages: 3, totalItems: 20, pageSize: 8, items: [] } };
    });
    const view = render(<RankingTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Next ranking page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next ranking page' }));
    await waitFor(() => expect(pages.at(-1)).toBe(3));
    query.mockImplementation(({ page }: { page: number }) => {
      pages.push(page);
      return { isLoading: false, isError: false, isFetching: false, refetch: vi.fn(),
        data: { page, totalPages: 1, totalItems: 2, pageSize: 8, items: [] } };
    });
    view.rerender(<RankingTab />);
    await waitFor(() => expect(pages.at(-1)).toBe(1));
  });

  it('ignores a corrupt durable submission queue', () => {
    vi.stubGlobal('localStorage', memoryStorage({
      pirate_battle_pending_submissions_v1: JSON.stringify({ not: 'a queue' }) }));
    const queue = PendingSubmissionQueue.getInstance();
    (queue as unknown as { loadFromStorage(): void }).loadFromStorage();
    expect(queue.getPendingCount()).toBe(0);
    expect(() => queue.enqueue({ id: 'after-corruption', playerId: 'captain', score: 1, durationSeconds: 60,
      endReason: 'time_expired', config: { sessionDurationSeconds: 60, enemySpawnIntervalSeconds: 3 },
      playedAt: '2026-10-07T00:00:00Z' })).not.toThrow();
    queue.remove('after-corruption');
  });

  it('fetches a sound once while repeated plays wait for it to load', async () => {
    const audio = AudioManager.getInstance();
    audio.reset();
    let respond!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { respond = resolve; })));
    for (let i = 0; i < 12; i++) audio.playSfx('cannon_fire_1');
    expect(fetch).toHaveBeenCalledTimes(1);
    respond({ ok: true, arrayBuffer: async () => new ArrayBuffer(16) } as Response);
    await audio.loadSound('cannon_fire_1');
    expect(fetch).toHaveBeenCalledTimes(1);
    audio.reset();
  });

  it('a retired bridge leaves the newer bridge test harness attached', () => {
    const first = new SimulationBridge();
    const second = new SimulationBridge();
    const harness = (window as unknown as { __GAME_SIMULATION__?: unknown }).__GAME_SIMULATION__;
    first.destroy();
    expect((window as unknown as { __GAME_SIMULATION__?: unknown }).__GAME_SIMULATION__).toBe(harness);
    second.destroy();
    expect((window as unknown as { __GAME_SIMULATION__?: unknown }).__GAME_SIMULATION__).toBeUndefined();
  });
});
