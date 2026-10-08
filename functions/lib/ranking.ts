import { and, asc, desc, eq, gt, lt, or, sql } from 'drizzle-orm';
import { matches, type MatchEntity } from '../../src/db/schema';
import { isVoyageRules, type VoyageRules } from '../../src/core/simulation/VoyageRules';

export const rankingOrder = () => [desc(matches.score), asc(matches.durationSeconds), asc(matches.playedAt),
  asc(sql`${matches.id} COLLATE "C"`)];

export function rankingScope(sessionDuration?: number, spawnInterval?: number, voyage?: VoyageRules) {
  return and(eq(matches.verified, true),
    eq(matches.difficulty,voyage?.difficulty ?? 'classic'),eq(matches.map,voyage?.map ?? 'classic'),
    sessionDuration === undefined ? undefined : eq(matches.sessionDurationSeconds, sessionDuration),
    spawnInterval === undefined ? undefined : eq(matches.enemySpawnIntervalSeconds, spawnInterval));
}

export function aheadOf(record: MatchEntity) {
  return and(rankingScope(record.sessionDurationSeconds, record.enemySpawnIntervalSeconds,recordVoyage(record)), or(
    gt(matches.score, record.score),
    and(eq(matches.score, record.score), lt(matches.durationSeconds, record.durationSeconds)),
    and(eq(matches.score, record.score), eq(matches.durationSeconds, record.durationSeconds), lt(matches.playedAt, record.playedAt)),
    and(eq(matches.score, record.score), eq(matches.durationSeconds, record.durationSeconds), eq(matches.playedAt, record.playedAt),
      sql`${matches.id} COLLATE "C" < ${record.id}`),
  ));
}

export function recordVoyage(record: {difficulty:string;map:string}): VoyageRules | undefined {
  const value={difficulty:record.difficulty,map:record.map};
  return isVoyageRules(value)?value:undefined;
}
