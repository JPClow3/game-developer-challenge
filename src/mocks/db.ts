import type {
  MatchRecord,
  RankingItem,
  PaginatedResponse,
  RankingQueryParams,
  MatchHistoryQueryParams,
  SubmitMatchRequest,
  SubmitMatchResponse,
} from '../types/api';
import { INITIAL_LEADERBOARD_FIXTURES } from './fixtures';
import { compareRankedMatches, sameVoyage } from '../core/ranking';

const STORAGE_KEY_MATCHES = 'pirate_battle_mock_matches_v1';
const STORAGE_KEY_LEADERBOARD = 'pirate_battle_mock_leaderboard_v1';

export class MockDatabase {
  private static instance: MockDatabase | null = null;
  private matches: MatchRecord[] = [];
  private rankingItems: Omit<RankingItem, 'rank'>[] = [];

  private constructor() {
    this.loadFromStorage();
  }

  public static getInstance(): MockDatabase {
    if (!MockDatabase.instance) {
      MockDatabase.instance = new MockDatabase();
    }
    return MockDatabase.instance;
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined') {
      this.initDefaults();
      return;
    }

    try {
      const storedMatches = localStorage.getItem(STORAGE_KEY_MATCHES);
      const storedRanking = localStorage.getItem(STORAGE_KEY_LEADERBOARD);

      // Corrupt arrays would make every fixture request fail. Fall back per table.
      const matches: unknown = storedMatches ? JSON.parse(storedMatches) : [];
      const ranking: unknown = storedRanking ? JSON.parse(storedRanking) : null;
      this.matches = Array.isArray(matches) ? matches : [];
      this.rankingItems = Array.isArray(ranking) ? ranking : [...INITIAL_LEADERBOARD_FIXTURES];
      if (Array.isArray(ranking)) {
        // Upgrade stored Classic boards while preserving completed player results.
        const known = new Set(this.rankingItems.map(item => item.matchId));
        this.rankingItems.push(...INITIAL_LEADERBOARD_FIXTURES.filter(item => item.voyage && !known.has(item.matchId)));
      }
    } catch {
      this.initDefaults();
    }
  }

  private initDefaults(): void {
    this.matches = [];
    this.rankingItems = [...INITIAL_LEADERBOARD_FIXTURES];
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY_MATCHES, JSON.stringify(this.matches));
      localStorage.setItem(STORAGE_KEY_LEADERBOARD, JSON.stringify(this.rankingItems));
    } catch (e) {
      console.warn('Failed to save mock database to localStorage', e);
    }
  }

  public reset(): void {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEY_MATCHES);
        localStorage.removeItem(STORAGE_KEY_LEADERBOARD);
      } catch {
        // In-memory fixtures still reset when storage is blocked.
      }
    }
    this.initDefaults();
  }

  public insertMatch(req: SubmitMatchRequest): SubmitMatchResponse {
    // 1. Idempotency Check: if match id already exists, return existing
    const existingMatch = this.matches.find((m) => m.id === req.id);
    if (existingMatch) {
      if (existingMatch.playerId !== req.playerId || existingMatch.score !== req.score ||
        existingMatch.durationSeconds !== Math.floor(req.durationSeconds) || existingMatch.endReason !== req.endReason ||
        existingMatch.sessionDurationSeconds !== req.config.sessionDurationSeconds ||
        existingMatch.enemySpawnIntervalSeconds !== req.config.enemySpawnIntervalSeconds || !sameVoyage(existingMatch.voyage,req.config.voyage))
        throw new Error('Match ID already has a different result');
      const rank = this.computeRank(existingMatch);
      return {
        match: existingMatch,
        rankingPosition: rank,
        isDuplicate: true,
      };
    }

    // 2. Create new record
    const newRecord: MatchRecord = {
      id: req.id,
      voyage: req.config.voyage,
      playerId: req.playerId,
      playerName: req.playerName,
      score: req.score,
      durationSeconds: Math.floor(req.durationSeconds),
      endReason: req.endReason,
      sessionDurationSeconds: req.config.sessionDurationSeconds,
      enemySpawnIntervalSeconds: req.config.enemySpawnIntervalSeconds,
      playedAt: req.playedAt,
      createdAt: new Date().toISOString(),
    };

    this.matches.unshift(newRecord);

    // 3. Add to ranking entries
    const rankingEntry: Omit<RankingItem, 'rank'> = {
      matchId: req.id,
      voyage: req.config.voyage,
      playerId: req.playerId,
      playerName: req.playerName || 'Captain Player',
      score: req.score,
      durationSeconds: Math.floor(req.durationSeconds),
      sessionDurationSeconds: req.config.sessionDurationSeconds,
      enemySpawnIntervalSeconds: req.config.enemySpawnIntervalSeconds,
      playedAt: req.playedAt,
      isCurrentPlayer: true,
    };

    this.rankingItems.push(rankingEntry);
    this.saveToStorage();

    const rank = this.computeRank(newRecord);
    return {
      match: newRecord,
      rankingPosition: rank,
      isDuplicate: false,
    };
  }

  private computeRank(match: MatchRecord): number {
    const entry = { ...match, matchId: match.id };
    return this.rankingItems.filter(item => item.sessionDurationSeconds === match.sessionDurationSeconds &&
      item.enemySpawnIntervalSeconds === match.enemySpawnIntervalSeconds && sameVoyage(item.voyage,match.voyage) && compareRankedMatches(item, entry) < 0).length + 1;
  }

  public getRanking(params: RankingQueryParams = {}): PaginatedResponse<RankingItem> {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.max(1, Math.min(50, params.pageSize || 10));

    let filtered = this.rankingItems.filter(item=>sameVoyage(item.voyage,params.voyage));

    if (params.sessionDuration !== undefined) {
      filtered = filtered.filter((i) => i.sessionDurationSeconds === params.sessionDuration);
    }
    if (params.spawnInterval !== undefined) {
      filtered = filtered.filter((i) => i.enemySpawnIntervalSeconds === params.spawnInterval);
    }

    filtered.sort(compareRankedMatches);

    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    const offset = (page - 1) * pageSize;
    const slice = filtered.slice(offset, offset + pageSize);

    const items: RankingItem[] = slice.map((item, idx) => ({
      ...item,
      rank: offset + idx + 1,
    }));

    return {
      items,
      totalItems,
      page,
      pageSize,
      totalPages,
    };
  }

  public getHistory(params: MatchHistoryQueryParams = {}): PaginatedResponse<MatchRecord> {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.max(1, Math.min(50, params.pageSize || 10));

    let filtered = [...this.matches];

    if (params.playerId) {
      filtered = filtered.filter((m) => m.playerId === params.playerId);
    }

    // Sort by playedAt DESC
    filtered.sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime());

    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    const offset = (page - 1) * pageSize;
    const items = filtered.slice(offset, offset + pageSize);

    return {
      items,
      totalItems,
      page,
      pageSize,
      totalPages,
    };
  }
}
