import type { MatchConfigSnapshot } from '../types/api';
import type { BattleReport } from '../core/simulation/BattleReport';

const KEY = 'pirate_battle_captain_log_v1';
export interface PersonalBest { score: number; grade: string; survived: boolean; }
export interface CaptainLog { ids: string[]; bests: Record<string, PersonalBest>; medals: string[]; }
const empty = (): CaptainLog => ({ ids: [], bests: {}, medals: [] });
export function voyageKey(config: MatchConfigSnapshot): string {
  return `${config.voyage?.difficulty ?? 'classic'}:${config.voyage?.map ?? 'classic'}:${config.sessionDurationSeconds}:${config.enemySpawnIntervalSeconds}`;
}
export function loadCaptainLog(): CaptainLog {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!value || !Array.isArray(value.ids) || !Array.isArray(value.medals) || !value.bests || typeof value.bests !== 'object') return empty();
    const bests: Record<string, PersonalBest> = {};
    for (const [key, raw] of Object.entries(value.bests)) {
      const best = raw as PersonalBest;
      if (best && Number.isSafeInteger(best.score) && best.score >= 0 && ['S','A','B','C','D'].includes(best.grade))
        bests[key] = { score: best.score, grade: best.grade, survived: best.survived === true };
    }
    return { ids: value.ids.filter((id: unknown) => typeof id === 'string').slice(-200), bests,
      medals: value.medals.filter((id: unknown) => ['survivor','hunter','marksman'].includes(String(id))) };
  } catch { return empty(); }
}
export function recordPersonalBattle(match: {id:string; score:number; endReason:string; config:MatchConfigSnapshot; report?:BattleReport}): CaptainLog {
  const log = loadCaptainLog();
  if (log.ids.includes(match.id)) return log;
  log.ids.push(match.id); log.ids = log.ids.slice(-200);
  const key = voyageKey(match.config), previous = log.bests[key];
  const report = match.report;
  const grade = report?.grade ?? 'D';
  log.bests[key] = {score:Math.max(previous?.score ?? 0,match.score),
    grade:previous && 'SABCD'.indexOf(previous.grade) < 'SABCD'.indexOf(grade) ? previous.grade : grade,
    survived: previous?.survived === true || match.endReason === 'time_expired'};
  if (match.endReason === 'time_expired') log.medals.push('survivor');
  if (match.score >= 5) log.medals.push('hunter');
  if (report && report.stats.shotsFired >= 20 && report.accuracy >= 40) log.medals.push('marksman');
  log.medals = [...new Set(log.medals)];
  try { localStorage.setItem(KEY,JSON.stringify(log)); } catch { /* Results still work when storage is unavailable. */ }
  return log;
}
export function captainTitle(log: CaptainLog): string {
  return ['Deckhand','Seafarer','Corsair','Admiral'][Math.min(3,log.medals.length)]!;
}
