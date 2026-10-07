import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchRanking, fetchMatchHistory, submitMatch } from './rankingApi';
import { PendingSubmissionQueue } from './pendingQueue';
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
    queryFn: () => fetchRanking(params),
    staleTime: 5000,
    retry: 2,
    placeholderData: (prev) => prev,
  });
}

export function useMatchHistoryQuery(params: MatchHistoryQueryParams) {
  return useQuery({
    queryKey: QUERY_KEYS.history(params),
    queryFn: () => fetchMatchHistory(params),
    staleTime: 5000,
    retry: 2,
    placeholderData: (prev) => prev,
  });
}

export function useSubmitMatchMutation() {
  const queryClient = useQueryClient();
  const queue = PendingSubmissionQueue.getInstance();

  return useMutation({
    mutationFn: async (req: SubmitMatchRequest): Promise<SubmitMatchResponse> => {
      try {
        const res = await submitMatch(req);
        // If it succeeded, ensure it's removed from pending
        queue.remove(req.id);
        return res;
      } catch (error) {
        // Enqueue to persistent storage for retry
        queue.enqueue(req, error instanceof Error ? error.message : String(error));
        throw error;
      }
    },
    onSuccess: () => {
      // Invalidate both ranking and history queries to refetch fresh data
      queryClient.invalidateQueries({ queryKey: ['ranking'] });
      queryClient.invalidateQueries({ queryKey: ['history'] });
    },
  });
}
