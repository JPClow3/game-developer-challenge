import { apiClient } from './client';
import type {
  RankingQueryParams,
  MatchHistoryQueryParams,
  PaginatedResponse,
  RankingItem,
  MatchRecord,
  SubmitMatchRequest,
  SubmitMatchResponse,
} from '../types/api';

export async function fetchRanking(params: RankingQueryParams = {}): Promise<PaginatedResponse<RankingItem>> {
  const response = await apiClient.get<PaginatedResponse<RankingItem>>('/ranking', {
    params: {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 10,
      sessionDuration: params.sessionDuration,
      spawnInterval: params.spawnInterval,
    },
  });
  return response.data;
}

export async function fetchMatchHistory(
  params: MatchHistoryQueryParams = {}
): Promise<PaginatedResponse<MatchRecord>> {
  const response = await apiClient.get<PaginatedResponse<MatchRecord>>('/history', {
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
