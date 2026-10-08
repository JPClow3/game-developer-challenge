import { and, asc, desc, eq, gt, lt, or, sql } from 'drizzle-orm';
import { matches, type MatchEntity } from '../../src/db/schema';

export const rankingOrder = () => [desc(matches.score), asc(matches.durationSeconds), asc(matches.playedAt),
  asc(sql`${matches.id} COLLATE "C"`)];

export function rankingScope(sessionDuration?: number, spawnInterval?: number) {
  return and(eq(matches.verified, true),
    sessionDuration === undefined ? undefined : eq(matches.sessionDurationSeconds, sessionDuration),
    spawnInterval === undefined ? undefined : eq(matches.enemySpawnIntervalSeconds, spawnInterval));
}

export function aheadOf(record: MatchEntity) {
  return and(rankingScope(record.sessionDurationSeconds, record.enemySpawnIntervalSeconds), or(
    gt(matches.score, record.score),
    and(eq(matches.score, record.score), lt(matches.durationSeconds, record.durationSeconds)),
    and(eq(matches.score, record.score), eq(matches.durationSeconds, record.durationSeconds), lt(matches.playedAt, record.playedAt)),
    and(eq(matches.score, record.score), eq(matches.durationSeconds, record.durationSeconds), eq(matches.playedAt, record.playedAt),
      sql`${matches.id} COLLATE "C" < ${record.id}`),
  ));
}
