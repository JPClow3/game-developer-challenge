import { apiClient } from './client';
import type {
  RankingQueryParams,
  MatchHistoryQueryParams,
  PaginatedResponse,
  RankingItem,
  MatchRecord,
  SubmitMatchRequest,
  SubmitMatchResponse,
  MatchConfigSnapshot,
  MatchTicket,
} from '../types/api';

export async function startRankedMatch(config: MatchConfigSnapshot): Promise<MatchTicket> {
  const response = await apiClient.post<MatchTicket>('/session', config);
  return response.data;
}

export async function fetchRanking(params: RankingQueryParams = {}, signal?: AbortSignal): Promise<PaginatedResponse<RankingItem>> {
  const response = await apiClient.get<PaginatedResponse<RankingItem>>('/ranking', {
    signal,
    params: {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 10,
      sessionDuration: params.sessionDuration,
      spawnInterval: params.spawnInterval,
      difficulty: params.voyage?.difficulty,
      map: params.voyage?.map,
    },
  });
  return response.data;
}

export async function fetchMatchHistory(
  params: MatchHistoryQueryParams = {}, signal?: AbortSignal
): Promise<PaginatedResponse<MatchRecord>> {
  const response = await apiClient.get<PaginatedResponse<MatchRecord>>('/history', {
    signal,
    params: {
      playerId: params.playerId,
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 10,
    },
  });
  return response.data;
}

export async function submitMatch(request: SubmitMatchRequest): Promise<SubmitMatchResponse> {
  const response = await apiClient.post<SubmitMatchResponse>('/match', request);
  return response.data;
}
