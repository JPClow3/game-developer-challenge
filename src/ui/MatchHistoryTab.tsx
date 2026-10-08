import React, { useState, useEffect } from 'react';
import { DIFFICULTY_DETAILS, MAP_DETAILS } from '../core/simulation/VoyageRules';
import { Icon } from './Icon';
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

  // A reset or new filter can shrink the result set. Never strand the table past its end.
  const lastPage = data?.totalPages;
  useEffect(() => {
    if (lastPage !== undefined && page > lastPage) setPage(Math.max(1, lastPage));
  }, [page, lastPage]);

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
      <div className="records-header">
        <div><h3>My Battle Log</h3><p>Your completed voyages, scores, and outcomes.</p></div>
        {isFetching && (
          <span className="records-updating" role="status">
            <span className="ui-spinner" aria-hidden="true" />Updating…
          </span>
        )}
      </div>

      {/* Pending Submissions Alert */}
      {pendingCount > 0 && (
        <div
          className="ui-message pending-sync"
          role="status"
        >
          <span>
            {pendingCount} {pendingCount === 1 ? 'voyage' : 'voyages'} saved locally, waiting to sync.
          </span>
          <button
            type="button"
            disabled={isRetryingPending}
            onClick={handleRetryPending}
            className="ui-button ui-button-secondary"
          >
            {isRetryingPending ? <span className="ui-spinner" aria-hidden="true" /> : <Icon name="refresh" />}
            {isRetryingPending ? 'Syncing...' : 'Retry Sync'}
          </button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="records-loading" role="status">
          <span className="ui-spinner" aria-hidden="true" />
          <span>Retrieving battle archives...</span>
        </div>
      )}

      {/* Error State */}
      {isError && (
        <div className="ui-message" data-tone="error" role="alert">
          <Icon name="alert" /><div className="ui-message-copy"><span>Failed to retrieve history: {error instanceof Error ? error.message : 'Network error'}</span>
          <button
            type="button"
            onClick={() => refetch()}
            className="ui-button ui-button-secondary mt-3"
          >
            <Icon name="refresh" />Retry Query
          </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !isError && (!data?.items || data.items.length === 0) && (
        <div className="records-empty">
          <Icon name="history" /><p>No battles completed yet. Click "Play" to start your first naval campaign!</p>
        </div>
      )}

      {/* Table State */}
      {!isLoading && !isError && data && data.items.length > 0 && (
        // Keyboard users need to focus this horizontally scrollable table region.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        <div className="records-table-wrap" role="region" aria-label="Battle history table" tabIndex={0}>
          <table className="records-table">
            <thead>
              <tr>
                <th scope="col" className="px-3 py-2">Date</th>
                <th scope="col" className="px-3 py-2 text-right">Score</th>
                <th scope="col" className="px-3 py-2 text-right">Duration</th>
                <th scope="col" className="px-3 py-2 text-center">Outcome</th>
                <th scope="col" className="px-3 py-2 text-center">Config</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((m) => {
                const dateStr = new Date(m.playedAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });
                return (
                  <tr key={m.id}>
                    <td className="record-muted">
                      {dateStr}
                    </td>
                    <td className="text-right record-number font-bold">
                      {m.score} pts
                    </td>
                    <td className="text-right record-muted">
                      {m.durationSeconds}s
                    </td>
                    <td className="text-center">
                      {m.endReason === 'time_expired' ? (
                        <span className="outcome">
                          Victory
                        </span>
                      ) : (
                        <span className="outcome outcome-sunk">
                          Sunk
                        </span>
                      )}
                    </td>
                    <td className="text-center record-muted">
                      {m.voyage ? `${DIFFICULTY_DETAILS[m.voyage.difficulty].name} / ${MAP_DETAILS[m.voyage.map].name}` : 'Classic'}<br />{m.sessionDurationSeconds}s / {m.enemySpawnIntervalSeconds}s
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
        <div className="records-pagination">
          <span>
            Page {data.page} of {data.totalPages} ({data.totalItems} matches)
          </span>
          <div>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => handlePageChange(page - 1)}
              className="ui-button ui-button-secondary"
              aria-label="Previous history page"
            >
              <Icon name="left" />Previous
            </button>
            <button
              type="button"
              disabled={page >= data.totalPages}
              onClick={() => handlePageChange(page + 1)}
              className="ui-button ui-button-secondary"
              aria-label="Next history page"
            >
              Next<Icon name="arrow" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
