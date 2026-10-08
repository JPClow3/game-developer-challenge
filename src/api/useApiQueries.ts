import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchRanking, fetchMatchHistory } from './rankingApi';
import { PendingSubmissionQueue } from './pendingQueue';
import { isRetryableApiError } from './client';
import type {
  RankingQueryParams,
  MatchHistoryQueryParams,
  SubmitMatchRequest,
  SubmitMatchResponse,
} from '../types/api';

export const QUERY_KEYS = {
  ranking: (params: RankingQueryParams) => ['ranking', params] as const,
  history: (params: MatchHistoryQueryParams) => ['history', params] as const,
};

export function useRankingQuery(params: RankingQueryParams) {
  return useQuery({
    queryKey: QUERY_KEYS.ranking(params),
    queryFn: ({ signal }) => fetchRanking(params, signal),
    staleTime: 5000,
    retry: (count, error) => count < 2 && isRetryableApiError(error),
    placeholderData: (prev) => prev,
  });
}

export function useMatchHistoryQuery(params: MatchHistoryQueryParams) {
  return useQuery({
    queryKey: QUERY_KEYS.history(params),
    queryFn: ({ signal }) => fetchMatchHistory(params, signal),
    staleTime: 5000,
    retry: (count, error) => count < 2 && isRetryableApiError(error),
    placeholderData: (prev) => prev,
  });
}

export function useSubmitMatchMutation() {
  const queryClient = useQueryClient();
  const queue = PendingSubmissionQueue.getInstance();

  return useMutation({
    mutationFn: async (req: SubmitMatchRequest): Promise<SubmitMatchResponse> => {
      return queue.submit(req);
    },
    onSuccess: () => {
      // Invalidate both ranking and history queries to refetch fresh data
      queryClient.invalidateQueries({ queryKey: ['ranking'] });
      queryClient.invalidateQueries({ queryKey: ['history'] });
    },
  });
}
