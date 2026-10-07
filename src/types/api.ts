/**
 * REST API Contracts, Paginated Responses, Match Submissions & MSW Scenario Types
 */

import type { MatchEndReason } from './game';

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
  { id: 'out_of_order', name: 'Out of Order', description: 'Simulates pagination race conditions and delayed responses' },
  { id: 'error_400', name: 'Client Error (400)', description: 'Simulates Bad Request schema validation failures' },
  { id: 'error_500', name: 'Server Error (500)', description: 'Simulates internal server error with retry capability' },
  { id: 'timeout', name: 'Network Timeout', description: 'Simulates connection timeouts triggering retry/offline queue' },
  { id: 'idempotency_recovery', name: 'Idempotency Test', description: 'Tests deduplication and replay safety' },
  { id: 'server_offline', name: 'Offline Mode', description: 'Simulates complete lack of internet connectivity' },
] as const;

export interface ApiErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  timestamp: string;
}
