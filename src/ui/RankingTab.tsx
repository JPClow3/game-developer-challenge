import React, { useState } from 'react';
import { Icon } from './Icon';
import { useRankingQuery } from '../api/useApiQueries';
import { AudioManager } from '../audio/AudioManager';
import { getOrCreatePlayerId } from '../api/player';

import { DIFFICULTY_DETAILS, MAP_DETAILS, type VoyageRules } from '../core/simulation/VoyageRules';

interface RankingTabProps {
  voyage?: VoyageRules;
  sessionDurationFilter?: number;
  spawnIntervalFilter?: number;
}

export const RankingTab: React.FC<RankingTabProps> = ({
  voyage,
  sessionDurationFilter,
  spawnIntervalFilter,
}) => {
  const [page, setPage] = useState<number>(1);
  const pageSize = 8;
  const playerId = getOrCreatePlayerId();

  const { data, isLoading, isError, error, refetch, isFetching } = useRankingQuery({
    page,
    pageSize,
    voyage,
    sessionDuration: sessionDurationFilter,
    spawnInterval: spawnIntervalFilter,
  });

  const handlePageChange = (newPage: number) => {
    AudioManager.getInstance().play('ui_click');
    setPage(newPage);
  };

  return (
    <div className="w-full flex flex-col space-y-4" data-testid="ranking-container">
      <div className="records-header">
        <div><h3>{voyage ? `${DIFFICULTY_DETAILS[voyage.difficulty].name} · ${MAP_DETAILS[voyage.map].name}` : 'Classic Leaderboard'}</h3>
          <p>{sessionDurationFilter === undefined ? 'All voyage lengths' : `${sessionDurationFilter}s voyages`} · {spawnIntervalFilter === undefined ? 'All enemy intervals' : `${spawnIntervalFilter}s between enemies`}.<br />Ranked by score, fastest time, then first recorded.</p></div>
        {isFetching && (
          <span className="records-updating" role="status">
            <span className="ui-spinner" aria-hidden="true" />Updating…
          </span>
        )}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="records-loading" role="status">
          <span className="ui-spinner" aria-hidden="true" />
          <span>Loading ranking scores...</span>
        </div>
      )}

      {/* Error State */}
      {isError && (
        <div className="ui-message" data-tone="error" role="alert">
          <Icon name="alert" /><div className="ui-message-copy"><span>Failed to load ranking: {error instanceof Error ? error.message : 'Network error'}</span>
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
          <Icon name="trophy" /><p>No matches recorded for this configuration yet. Be the first captain to set sail!</p>
        </div>
      )}

      {/* Table State */}
      {!isLoading && !isError && data && data.items.length > 0 && (
        // Keyboard users need to focus this horizontally scrollable table region.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        <div className="records-table-wrap" role="region" aria-label="Leaderboard table" tabIndex={0}>
          <table className="records-table ranking-table">
            <colgroup><col /><col /><col /><col /><col /></colgroup>
            <thead>
              <tr>
                <th scope="col" className="px-3 py-2 text-center w-12">#</th>
                <th scope="col" className="px-3 py-2">Captain</th>
                <th scope="col" className="px-3 py-2 text-right">Score</th>
                <th scope="col" className="px-3 py-2 text-right">Time</th>
                <th scope="col" className="px-3 py-2 text-center">Config</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr
                  key={item.matchId}
                  className={item.playerId === playerId ? 'player-row' : ''}
                >
                  <td className="text-center record-number font-bold">
                    {item.rank}
                  </td>
                  <td className="captain-name">
                    {item.playerName || 'Anonymous Pirate'}
                    {item.playerId === playerId && (
                      <span className="you-badge">
                        You
                      </span>
                    )}
                  </td>
                  <td className="text-right record-number font-bold">
                    {item.score}
                  </td>
                  <td className="text-right record-muted">
                    {item.durationSeconds}s
                  </td>
                  <td className="text-center record-muted">
                    {item.sessionDurationSeconds}s / {item.enemySpawnIntervalSeconds}s
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Controls */}
      {data && data.totalPages > 1 && (
        <div className="records-pagination">
          <span>
            Page {data.page} of {data.totalPages} ({data.totalItems} total entries)
          </span>
          <div>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => handlePageChange(page - 1)}
              className="ui-button ui-button-secondary"
              aria-label="Previous ranking page"
            >
              <Icon name="left" />Previous
            </button>
            <button
              type="button"
              disabled={page >= data.totalPages}
              onClick={() => handlePageChange(page + 1)}
              className="ui-button ui-button-secondary"
              aria-label="Next ranking page"
            >
              Next<Icon name="arrow" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
