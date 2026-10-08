/**
 * REST API Contracts, Paginated Responses, Match Submissions & MSW Scenario Types
 */

import type { MatchEndReason } from './game';
import type { BattleReplay } from '../core/simulation/Replay';

export interface MatchConfigSnapshot {
  sessionDurationSeconds: number;
  enemySpawnIntervalSeconds: number;
}

export interface SubmitMatchRequest {
  id: string; // UUID v4 (idempotency key)
  playerId: string;
  playerName?: string;
  score: number;
  durationSeconds: number;
  endReason: Exclude<MatchEndReason, 'abandoned'>;
  config: MatchConfigSnapshot;
  playedAt: string; // ISO 8601
  replay?: BattleReplay; // Required by the live API. Legacy mock fixtures may omit it.
}

export interface MatchTicket {
  id: string;
  playerId: string;
  seed: number;
  config: MatchConfigSnapshot;
}

export interface MatchRecord {
  id: string;
  playerId: string;
  playerName?: string;
  score: number;
  durationSeconds: number;
  endReason: Exclude<MatchEndReason, 'abandoned'>;
  sessionDurationSeconds: number;
  enemySpawnIntervalSeconds: number;
  playedAt: string;
  createdAt?: string;
}

export interface SubmitMatchResponse {
  match: MatchRecord;
  rankingPosition: number;
  isDuplicate: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  totalItems: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface RankingItem {
  rank: number;
  matchId: string;
  playerId: string;
  playerName?: string;
  score: number;
  durationSeconds: number;
  sessionDurationSeconds: number;
  enemySpawnIntervalSeconds: number;
  playedAt: string;
  isCurrentPlayer?: boolean;
}

export interface RankingQueryParams {
  page?: number;
  pageSize?: number;
  sessionDuration?: number;
  spawnInterval?: number;
}

export interface MatchHistoryQueryParams {
  playerId?: string;
  page?: number;
  pageSize?: number;
}

export interface PendingSubmission {
  id: string;
  request: SubmitMatchRequest;
  timestamp: number;
  retryCount: number;
  lastError?: string;
}

export type MswScenarioId =
  | 'success'
  | 'empty'
  | 'slow_network'
  | 'out_of_order'
  | 'error_400'
  | 'error_500'
  | 'timeout'
  | 'idempotency_recovery'
  | 'ranking_fails'
  | 'history_fails'
  | 'server_offline';

export interface MswScenarioOption {
  id: MswScenarioId;
  name: string;
  description: string;
}

export const MSW_SCENARIOS: readonly MswScenarioOption[] = [
  { id: 'success', name: 'Normal (Success)', description: 'Standard API behavior with fast responses' },
  { id: 'empty', name: 'Empty Data', description: 'Returns 0 items for ranking and match history' },
  { id: 'slow_network', name: 'High Latency', description: 'Simulates 2500ms network delay on all requests' },
  { id: 'out_of_order', name: 'Out of Order', description: 'Seeded delays alternate slow/fast responses for ranking and history' },
  { id: 'error_400', name: 'Client Error (400)', description: 'Simulates Bad Request schema validation failures' },
  { id: 'error_500', name: 'Server Error (500)', description: 'Simulates internal server error with retry capability' },
  { id: 'timeout', name: 'Timeout After Saving', description: 'Saves the match, loses the first response after 6000ms, then deduplicates retries' },
  { id: 'idempotency_recovery', name: 'Lost Acknowledgement', description: 'Saves the match but immediately loses its first acknowledgement; retry confirms a duplicate while reads stay available' },
  { id: 'ranking_fails', name: 'Ranking Fails', description: 'Ranking returns 500 while history and submission work' },
  { id: 'history_fails', name: 'History Fails', description: 'History returns 500 while ranking and submission work' },
  { id: 'server_offline', name: 'Offline Mode', description: 'Simulates complete lack of internet connectivity' },
] as const;

export interface ApiErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  timestamp: string;
}
