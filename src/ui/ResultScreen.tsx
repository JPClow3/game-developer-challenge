import React, { useEffect, useState, useRef, useSyncExternalStore } from 'react';
import { Icon } from './Icon';
import type { MatchEndReason } from '../types/game';
import type { MatchConfigSnapshot, SubmitMatchRequest, SubmitMatchResponse } from '../types/api';
import { useSubmitMatchMutation } from '../api/useApiQueries';
import { isRetryableApiError } from '../api/client';
import { PendingSubmissionQueue } from '../api/pendingQueue';
import { getOrCreatePlayerId, getPlayerName } from '../api/player';
import { AudioManager } from '../audio/AudioManager';
import { isBattleReport, type BattleReport } from '../core/simulation/BattleReport';
import { loadCaptainLog, voyageKey, captainTitle } from '../game/CaptainLog';
import { DIFFICULTY_DETAILS, MAP_DETAILS, isVoyageRules } from '../core/simulation/VoyageRules';
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
  report?: BattleReport;
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
      (data.config.voyage !== undefined && !isVoyageRules(data.config.voyage)) ||
      (data.report !== undefined && !isBattleReport(data.report)) ||
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
  const queue = PendingSubmissionQueue.getInstance();
  const rejection = useSyncExternalStore(
    callback => queue.subscribe(callback),
    () => queue.getRejection(matchData.id),
  );

  useEffect(() => {
    saveLastMatchResult(matchData);

    // Automatically submit once on mount
    if (!submittedRef.current && !suppressSubmission && !queue.getRejection(matchData.id)) {
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
  }, [matchData, submitMutation, suppressSubmission, queue]);

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

  const log = loadCaptainLog();
  const best = log.bests[voyageKey(matchData.config)];
  const report = matchData.report;
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

      <main className="relative z-10 w-full max-w-md pirate-wood-panel result-card my-auto shrink-0">
        {/* Title / Outcome */}
        <h1
          className={`result-title ${
            isVictory ? 'pirate-gold-text' : 'text-red-400'
          }`}
        >
          {isVictory ? 'Victory at Sea!' : 'Vessel Sunk!'}
        </h1>

        <p className="result-subtitle">
          {isVictory
            ? 'You held the waters until the final bell.'
            : 'Your hull cracked and slipped beneath the tide.'}
        </p>

        {/* Score & Time Cards */}
        <div className="result-stats">
          <div className="result-stat">
            <span>Total Score</span>
            <span>
              {matchData.score}
            </span>
          </div>

          <div className="result-stat">
            <span>Time Survived</span>
            <span>
              {matchData.durationSeconds}s
            </span>
          </div>
        </div>

        {report && <section className="combat-report" aria-label="Combat report">
          <div className="report-grade"><strong>{report.grade}</strong><span>Captain's grade<small>{matchData.config.voyage ? `${DIFFICULTY_DETAILS[matchData.config.voyage.difficulty].name} · ${MAP_DETAILS[matchData.config.voyage.map].name}` : 'Classic rules'}</small></span></div>
          <dl><div><dt>Accuracy</dt><dd>{report.accuracy}%</dd></div><div><dt>Shots / hits</dt><dd>{report.stats.shotsFired} / {report.stats.hits}</dd></div>
            <div><dt>Chasers / shooters</dt><dd>{report.stats.chasersSunk} / {report.stats.shootersSunk}</dd></div><div><dt>Hull restored</dt><dd>{report.stats.healthRestored} · {report.stats.repairsCollected} crates</dd></div><div><dt>Damage taken</dt><dd>{report.stats.damageTaken}</dd></div><div><dt>Hull remaining</dt><dd>{report.health}</dd></div></dl>
          <p>{best && matchData.score === best.score ? 'Personal best for these rules!' : `Personal best: ${best?.score ?? matchData.score} ships.`} Your title: {captainTitle(log)}.</p>
          <ul className="captain-goals"><li>{log.medals.includes('survivor') ? '✓' : '○'} Survive a voyage</li><li>{log.medals.includes('hunter') ? '✓' : '○'} Sink 5 ships in one battle</li><li>{log.medals.includes('marksman') ? '✓' : '○'} Land 40% of 20+ shots</li></ul>
          <small>Grades reward ships sunk, accuracy, remaining hull and survival. Personal progress is saved on this device.</small>
        </section>}
        {/* Match Registration Status Banner */}
        <div className="result-registration">
          {submitMutation.isPending && (
            <div className="ui-message" role="status">
              <span className="ui-spinner" aria-hidden="true" />
              <span>Recording battle results to online ranking...</span>
            </div>
          )}

          {submitMutation.isSuccess && (
            <div className="ui-message" data-tone="success" role="status">
              <Icon name="check" />
              <div className="ui-message-copy"><strong>
                Confirmed in Leaderboard{' '}
                {submissionResponse ? `(Rank #${submissionResponse.rankingPosition})` : ''}
              </strong>
              {submissionResponse?.isDuplicate && (
                <p>Already recorded. Your score was counted once.</p>
              )}
              </div>
            </div>
          )}

          {rejection && (
            <div className="ui-message" data-tone="error" role="alert" data-testid="submission-rejected">
              <Icon name="alert" />
              <div className="ui-message-copy">
                <strong>Result rejected. This battle was not recorded in the leaderboard.</strong>
                <p>{rejection.message} (HTTP {rejection.status})</p>
                <p>Your battle remains saved on this device. You can watch its replay or start a new voyage.</p>
              </div>
            </div>
          )}

          {submitMutation.isError && !rejection && (
            <div className="ui-message" data-tone="error" role="alert">
              <Icon name="alert" /><div className="ui-message-copy"><span>
                {isRetryableApiError(submitMutation.error)
                  ? 'Saved locally. Network sync failed:'
                  : 'Saved locally. Ranking rejected this result:'}{' '}
                {submitMutation.error?.message}
              </span>
              {isRetryableApiError(submitMutation.error) && (
                <button
                  type="button"
                  onClick={handleManualRetry}
                  className="ui-button ui-button-secondary"
                >
                  <Icon name="refresh" />Retry Registration
                </button>
              )}
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="result-actions">
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
            className="ui-button pirate-button"
            aria-label="Play Again"
            disabled={isStarting}
            aria-busy={isStarting}
          >
            {isStarting ? <span className="ui-spinner" aria-hidden="true" /> : <Icon name="play" />}
            {isStarting ? 'Preparing your voyage…' : 'Play Again'}
          </button>

          {onWatchReplay && <button type="button" className="ui-button ui-button-secondary" onClick={onWatchReplay}>
            <Icon name="history" />Watch Replay
          </button>}

          <button
            type="button"
            onClick={() => {
              AudioManager.getInstance().play('ui_back');
              onMainMenu();
            }}
            className="ui-button ui-button-quiet"
            aria-label="Main Menu"
          >
            <Icon name="left" />Main Menu
          </button>
        </div>
      </main>
    </div>
  );
};
