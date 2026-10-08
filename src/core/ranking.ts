import type { MatchConfigSnapshot } from '../types/api';

export interface RankedMatch {
  score: number;
  durationSeconds: number;
  playedAt: string;
  matchId: string;
}

// One position per match, within the selected voyage configuration.
export function compareRankedMatches(a: RankedMatch, b: RankedMatch): number {
  return b.score - a.score || a.durationSeconds - b.durationSeconds ||
    Date.parse(a.playedAt) - Date.parse(b.playedAt) ||
    (a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0);
}

export function isMatchConfig(value: unknown): value is MatchConfigSnapshot {
  if (!value || typeof value !== 'object') return false;
  const config = value as MatchConfigSnapshot;
  return Number.isInteger(config.sessionDurationSeconds) && config.sessionDurationSeconds >= 60 &&
    config.sessionDurationSeconds <= 180 && Number.isInteger(config.enemySpawnIntervalSeconds) &&
    config.enemySpawnIntervalSeconds >= 1 && config.enemySpawnIntervalSeconds <= 15;
}
