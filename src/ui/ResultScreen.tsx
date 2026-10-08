import React, { useEffect, useState, useRef } from 'react';
import type { MatchEndReason } from '../types/game';
import type { MatchConfigSnapshot, SubmitMatchRequest, SubmitMatchResponse } from '../types/api';
import { useSubmitMatchMutation } from '../api/useApiQueries';
import { isRetryableApiError } from '../api/client';
import { getOrCreatePlayerId, getPlayerName } from '../api/player';
import { AudioManager } from '../audio/AudioManager';
import type { BattleReplay } from '../core/simulation/Replay';

export interface CompletedMatchData {
  id: string; // UUID v4
  score: number;
  durationSeconds: number;
  endReason: Exclude<MatchEndReason, 'abandoned'>;
  config: MatchConfigSnapshot;
  playedAt: string;
  playerId?: string;
  replay?: BattleReplay;
}

interface ResultScreenProps {
  matchData: CompletedMatchData;
  onPlayAgain: () => void;
  onMainMenu: () => void;
  onWatchReplay?: () => void;
  replayError?: string | null;
  suppressSubmission?: boolean;
  isStarting?: boolean;
}

const LAST_RESULT_STORAGE_KEY = 'pirate_battle_last_completed_match_v1';

export function saveLastMatchResult(data: CompletedMatchData): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LAST_RESULT_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save last match result', e);
  }
}

export function loadLastMatchResult(): CompletedMatchData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LAST_RESULT_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as CompletedMatchData | null;
    if (
      !data ||
      typeof data !== 'object' ||
      typeof data.id !== 'string' ||
      !data.id ||
      data.id.length > 128 ||
      !Number.isInteger(data.score) ||
      data.score < 0 ||
      data.score > 2147483647 ||
      !Number.isInteger(data.durationSeconds) ||
      data.durationSeconds < 0 ||
      data.durationSeconds > 180 ||
      !['time_expired', 'player_destroyed'].includes(data.endReason) ||
      !data.config ||
      !Number.isInteger(data.config.sessionDurationSeconds) ||
      data.config.sessionDurationSeconds < 60 ||
      data.config.sessionDurationSeconds > 180 ||
      !Number.isFinite(data.config.enemySpawnIntervalSeconds) ||
      data.config.enemySpawnIntervalSeconds < 1 ||
      data.config.enemySpawnIntervalSeconds > 15 ||
      typeof data.playedAt !== 'string' ||
      !Number.isFinite(Date.parse(data.playedAt)) ||
      'voyage' in data
    )
      return null;
    return data;
  } catch {
    return null;
  }
}

export const ResultScreen: React.FC<ResultScreenProps> = ({
  matchData,
  onPlayAgain,
  onMainMenu,
  onWatchReplay,
  replayError,
  suppressSubmission = false,
  isStarting = false,
}) => {
  const [submissionResponse, setSubmissionResponse] = useState<SubmitMatchResponse | null>(null);
  const submitMutation = useSubmitMatchMutation();
  const submittedRef = useRef(false);

  useEffect(() => {
    saveLastMatchResult(matchData);

    // Automatically submit once on mount
    if (!submittedRef.current && !suppressSubmission) {
      submittedRef.current = true;
      const playerId = matchData.playerId ?? getOrCreatePlayerId();
      const playerName = getPlayerName();

      const requestPayload: SubmitMatchRequest = {
        id: matchData.id,
        playerId,
        playerName,
        score: matchData.score,
        durationSeconds: matchData.durationSeconds,
        endReason: matchData.endReason,
        config: matchData.config,
        playedAt: matchData.playedAt,
        replay: matchData.replay,
      };

      submitMutation.mutate(requestPayload, {
        onSuccess: (data) => {
          setSubmissionResponse(data);
        },
      });
    }
  }, [matchData, submitMutation, suppressSubmission]);

  const handleManualRetry = () => {
    AudioManager.getInstance().play('ui_click');
    const playerId = matchData.playerId ?? getOrCreatePlayerId();
    const playerName = getPlayerName();

    const requestPayload: SubmitMatchRequest = {
      id: matchData.id,
      playerId,
      playerName,
      score: matchData.score,
      durationSeconds: matchData.durationSeconds,
      endReason: matchData.endReason,
      config: matchData.config,
      playedAt: matchData.playedAt,
      replay: matchData.replay,
    };

    submitMutation.mutate(requestPayload, {
      onSuccess: (data) => {
        setSubmissionResponse(data);
      },
    });
  };

  const isVictory = matchData.endReason === 'time_expired';

  return (
    <div
      className="result-screen relative w-screen h-dvh overflow-y-auto flex flex-col items-center bg-slate-950 p-4"
      data-testid="result-screen"
    >
      {/* Background graphic */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-30 pointer-events-none"
        style={{ backgroundImage: "url('/assets/ui_scene_background.png')" }}
      />

      <main className="relative z-10 w-full max-w-md pirate-wood-panel p-6 sm:p-8 my-auto shrink-0 flex flex-col items-center text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
        {/* Title / Outcome */}
        <h1
          className={`text-3xl sm:text-4xl font-black uppercase tracking-wider ${
            isVictory ? 'pirate-gold-text' : 'text-red-400'
          }`}
        >
          {isVictory ? 'Victory at Sea!' : 'Vessel Sunk!'}
        </h1>

        <p className="text-amber-200/80 text-xs sm:text-sm uppercase tracking-widest font-medium">
          {isVictory
            ? 'You held the waters until the final bell.'
            : 'Your hull cracked and slipped beneath the tide.'}
        </p>

        {/* Score & Time Cards */}
        <div className="w-full grid grid-cols-2 gap-3">
          <div className="bg-stone-950/80 border border-amber-900/60 rounded p-3 flex flex-col items-center">
            <span className="text-xs uppercase text-amber-300 font-bold">Total Score</span>
            <span className="text-3xl font-black font-mono text-yellow-400 mt-1">
              {matchData.score}
            </span>
          </div>

          <div className="bg-stone-950/80 border border-amber-900/60 rounded p-3 flex flex-col items-center">
            <span className="text-xs uppercase text-amber-300 font-bold">Time Survived</span>
            <span className="text-3xl font-black font-mono text-amber-100 mt-1">
              {matchData.durationSeconds}s
            </span>
          </div>
        </div>

        {/* Match Registration Status Banner */}
        <div className="w-full">
          {submitMutation.isPending && (
            <div className="p-3 bg-stone-900/80 border border-amber-700/60 rounded text-xs text-amber-200 flex items-center justify-center space-x-2">
              <div className="w-3.5 h-3.5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              <span>Recording battle results to online ranking...</span>
            </div>
          )}

          {submitMutation.isSuccess && (
            <div className="p-3 bg-emerald-950/80 border border-emerald-600 rounded text-xs text-emerald-200 flex flex-col items-center space-y-1">
              <span className="font-bold">
                ✓ Confirmed in Leaderboard{' '}
                {submissionResponse ? `(Rank #${submissionResponse.rankingPosition})` : ''}
              </span>
              {submissionResponse?.isDuplicate && (
                <span className="text-[10px] text-emerald-300/80">
                  (Existing registration safely verified without duplicate)
                </span>
              )}
            </div>
          )}

          {submitMutation.isError && (
            <div className="p-3 bg-red-950/80 border border-red-700 rounded text-xs text-red-200 flex flex-col items-center space-y-2">
              <span>
                {isRetryableApiError(submitMutation.error)
                  ? 'Saved locally. Network sync failed:'
                  : 'Saved locally. Ranking rejected this result:'}{' '}
                {submitMutation.error?.message}
              </span>
              {isRetryableApiError(submitMutation.error) && (
                <button
                  type="button"
                  onClick={handleManualRetry}
                  className="pirate-button px-4 py-1 rounded font-bold text-xs uppercase text-amber-100"
                >
                  Retry Registration
                </button>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="w-full flex flex-col space-y-3 pt-2">
          {onWatchReplay && (
            <button
              type="button"
              className="pirate-button px-6 py-2 rounded font-bold"
              onClick={onWatchReplay}
            >
              Watch Replay
            </button>
          )}
          {replayError && (
            <p role="alert" className="text-red-200 text-sm">
              {replayError}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              AudioManager.getInstance().play('game_start');
              onPlayAgain();
            }}
            className="pirate-button w-full py-3 rounded-lg font-bold text-amber-100 uppercase tracking-wider text-base shadow-lg"
            aria-label="Play Again"
            disabled={isStarting}
          >
            Play Again
          </button>

          <button
            type="button"
            onClick={() => {
              AudioManager.getInstance().play('ui_back');
              onMainMenu();
            }}
            className="w-full py-2.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-stone-300 border border-amber-900/40 font-semibold text-xs uppercase tracking-wider transition"
            aria-label="Main Menu"
          >
            Main Menu
          </button>
        </div>
      </main>
    </div>
  );
};
