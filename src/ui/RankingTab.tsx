import React, { useState } from 'react';
import { useRankingQuery } from '../api/useApiQueries';
import { AudioManager } from '../audio/AudioManager';

interface RankingTabProps {
  sessionDurationFilter?: number;
  spawnIntervalFilter?: number;
}

export const RankingTab: React.FC<RankingTabProps> = ({
  sessionDurationFilter,
  spawnIntervalFilter,
}) => {
  const [page, setPage] = useState<number>(1);
  const pageSize = 8;

  const { data, isLoading, isError, error, refetch, isFetching } = useRankingQuery({
    page,
    pageSize,
    sessionDuration: sessionDurationFilter,
    spawnInterval: spawnIntervalFilter,
  });

  const handlePageChange = (newPage: number) => {
    AudioManager.getInstance().play('ui_click');
    setPage(newPage);
  };

  return (
    <div className="w-full flex flex-col space-y-4" data-testid="ranking-container">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold pirate-gold-text">Global Leaderboard</h3>
        {isFetching && (
          <span className="text-xs text-amber-300 animate-pulse font-mono" role="status">
            Updating...
          </span>
        )}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="py-12 flex flex-col items-center justify-center space-y-2" role="status">
          <div className="w-8 h-8 border-4 border-amber-600 border-t-amber-300 rounded-full animate-spin" />
          <span className="text-sm text-amber-200">Loading ranking scores...</span>
        </div>
      )}

      {/* Error State */}
      {isError && (
        <div className="p-4 bg-red-950/80 border border-red-700 text-red-200 rounded text-sm flex flex-col items-center space-y-2" role="alert">
          <span>Failed to load ranking: {error instanceof Error ? error.message : 'Network error'}</span>
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
          No matches recorded for this configuration yet. Be the first captain to set sail!
        </div>
      )}

      {/* Table State */}
      {!isLoading && !isError && data && data.items.length > 0 && (
        <div className="overflow-x-auto rounded border border-amber-900/60 bg-stone-950/60 shadow-inner">
          <table className="w-full text-left text-xs sm:text-sm text-amber-100">
            <thead className="bg-amber-950/70 border-b border-amber-900/80 text-amber-300 uppercase tracking-wider text-xs">
              <tr>
                <th scope="col" className="px-3 py-2 text-center w-12">#</th>
                <th scope="col" className="px-3 py-2">Captain</th>
                <th scope="col" className="px-3 py-2 text-right">Score</th>
                <th scope="col" className="px-3 py-2 text-right">Time</th>
                <th scope="col" className="px-3 py-2 text-center">Config</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-950/40">
              {data.items.map((item) => (
                <tr
                  key={item.matchId}
                  className={`hover:bg-amber-900/20 transition-colors ${
                    item.isCurrentPlayer ? 'bg-amber-800/30 font-bold border-l-4 border-amber-400' : ''
                  }`}
                >
                  <td className="px-3 py-2 text-center font-mono font-bold text-amber-300">
                    {item.rank}
                  </td>
                  <td className="px-3 py-2 truncate max-w-[140px] sm:max-w-xs">
                    {item.playerName || 'Anonymous Pirate'}
                    {item.isCurrentPlayer && (
                      <span className="ml-1 text-[10px] text-yellow-300 uppercase px-1 rounded bg-yellow-900/60">
                        You
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-yellow-400 font-bold">
                    {item.score}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-amber-200/80">
                    {item.durationSeconds}s
                  </td>
                  <td className="px-3 py-2 text-center text-xs text-amber-300/70 font-mono">
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
        <div className="flex items-center justify-between text-xs text-amber-200/80 pt-2 border-t border-amber-900/40">
          <span>
            Page {data.page} of {data.totalPages} ({data.totalItems} total entries)
          </span>
          <div className="flex space-x-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => handlePageChange(page - 1)}
              className="px-3 py-1 rounded bg-stone-800 hover:bg-stone-700 disabled:opacity-40 font-semibold"
              aria-label="Previous ranking page"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= data.totalPages}
              onClick={() => handlePageChange(page + 1)}
              className="px-3 py-1 rounded bg-stone-800 hover:bg-stone-700 disabled:opacity-40 font-semibold"
              aria-label="Next ranking page"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
