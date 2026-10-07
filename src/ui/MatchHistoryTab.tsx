import React, { useState, useEffect } from 'react';
import { useMatchHistoryQuery } from '../api/useApiQueries';
import { getOrCreatePlayerId } from '../api/player';
import { PendingSubmissionQueue } from '../api/pendingQueue';
import { AudioManager } from '../audio/AudioManager';

export const MatchHistoryTab: React.FC = () => {
  const [page, setPage] = useState<number>(1);
  const pageSize = 8;
  const playerId = getOrCreatePlayerId();

  const { data, isLoading, isError, error, refetch, isFetching } = useMatchHistoryQuery({
    playerId,
    page,
    pageSize,
  });

  const [pendingCount, setPendingCount] = useState<number>(
    PendingSubmissionQueue.getInstance().getPendingCount()
  );
  const [isRetryingPending, setIsRetryingPending] = useState(false);

  useEffect(() => {
    const queue = PendingSubmissionQueue.getInstance();
    const unsub = queue.subscribe(() => {
      setPendingCount(queue.getPendingCount());
    });
    return unsub;
  }, []);

  const handleRetryPending = async () => {
    AudioManager.getInstance().play('ui_click');
    setIsRetryingPending(true);
    try {
      await PendingSubmissionQueue.getInstance().processQueue();
      await refetch();
    } finally {
      setIsRetryingPending(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    AudioManager.getInstance().play('ui_click');
    setPage(newPage);
  };

  return (
    <div className="w-full flex flex-col space-y-4" data-testid="match-history-container">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold pirate-gold-text">My Battle Log</h3>
        {isFetching && (
          <span className="text-xs text-amber-300 animate-pulse font-mono" role="status">
            Updating...
          </span>
        )}
      </div>

      {/* Pending Submissions Alert */}
      {pendingCount > 0 && (
        <div
          className="p-3 bg-amber-950/80 border border-amber-600 text-amber-100 rounded text-xs flex justify-between items-center shadow-md"
          role="status"
        >
          <span>
            ⚠️ {pendingCount} match record(s) pending online sync.
          </span>
          <button
            type="button"
            disabled={isRetryingPending}
            onClick={handleRetryPending}
            className="pirate-button px-3 py-1 rounded text-xs uppercase font-bold text-amber-100 disabled:opacity-50"
          >
            {isRetryingPending ? 'Syncing...' : 'Retry Sync'}
          </button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="py-12 flex flex-col items-center justify-center space-y-2" role="status">
          <div className="w-8 h-8 border-4 border-amber-600 border-t-amber-300 rounded-full animate-spin" />
          <span className="text-sm text-amber-200">Retrieving battle archives...</span>
        </div>
      )}

      {/* Error State */}
      {isError && (
        <div className="p-4 bg-red-950/80 border border-red-700 text-red-200 rounded text-sm flex flex-col items-center space-y-2" role="alert">
          <span>Failed to retrieve history: {error instanceof Error ? error.message : 'Network error'}</span>
          <button
            type="button"
            onClick={() => refetch()}
            className="pirate-button px-4 py-1.5 rounded text-xs uppercase font-bold text-amber-100"
          >
            Retry Query
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !isError && (!data?.items || data.items.length === 0) && (
        <div className="py-8 text-center text-amber-200/70 italic text-sm border border-amber-900/40 rounded bg-stone-900/40">
          No battles completed yet. Click "Play" to start your first naval campaign!
        </div>
      )}

      {/* Table State */}
      {!isLoading && !isError && data && data.items.length > 0 && (
        <div className="overflow-x-auto rounded border border-amber-900/60 bg-stone-950/60 shadow-inner">
          <table className="w-full text-left text-xs sm:text-sm text-amber-100">
            <thead className="bg-amber-950/70 border-b border-amber-900/80 text-amber-300 uppercase tracking-wider text-xs">
              <tr>
                <th scope="col" className="px-3 py-2">Date</th>
                <th scope="col" className="px-3 py-2 text-right">Score</th>
                <th scope="col" className="px-3 py-2 text-right">Duration</th>
                <th scope="col" className="px-3 py-2 text-center">Outcome</th>
                <th scope="col" className="px-3 py-2 text-center">Config</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-950/40">
              {data.items.map((m) => {
                const dateStr = new Date(m.playedAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });
                return (
                  <tr key={m.id} className="hover:bg-amber-900/20 transition-colors">
                    <td className="px-3 py-2 font-mono text-amber-200/90 whitespace-nowrap">
                      {dateStr}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-yellow-400 font-bold">
                      {m.score} pts
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-amber-200/80">
                      {m.durationSeconds}s
                    </td>
                    <td className="px-3 py-2 text-center">
                      {m.endReason === 'time_expired' ? (
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950 border border-emerald-600 text-emerald-300">
                          Victory
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-red-950 border border-red-600 text-red-300">
                          Sunk
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center text-xs text-amber-300/70 font-mono">
                      {m.sessionDurationSeconds}s / {m.enemySpawnIntervalSeconds}s
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Controls */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-amber-200/80 pt-2 border-t border-amber-900/40">
          <span>
            Page {data.page} of {data.totalPages} ({data.totalItems} matches)
          </span>
          <div className="flex space-x-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => handlePageChange(page - 1)}
              className="px-3 py-1 rounded bg-stone-800 hover:bg-stone-700 disabled:opacity-40 font-semibold"
              aria-label="Previous history page"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= data.totalPages}
              onClick={() => handlePageChange(page + 1)}
              className="px-3 py-1 rounded bg-stone-800 hover:bg-stone-700 disabled:opacity-40 font-semibold"
              aria-label="Next history page"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
