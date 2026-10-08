export interface BattleStats {
  shotsFired: number; hits: number; chasersSunk: number; shootersSunk: number;
  damageTaken: number; repairsCollected: number; healthRestored: number;
}
export function emptyBattleStats(): BattleStats {
  return {shotsFired:0,hits:0,chasersSunk:0,shootersSunk:0,damageTaken:0,repairsCollected:0,healthRestored:0};
}
export type BattleGrade = 'S' | 'A' | 'B' | 'C' | 'D';
export type BattleReport = ReturnType<typeof battleReport>;
export function isBattleReport(value: unknown): value is BattleReport {
  if (!value || typeof value !== 'object') return false;
  const report=value as BattleReport;
  return ['S','A','B','C','D'].includes(report.grade) && Number.isFinite(report.accuracy) &&
    report.accuracy>=0 && report.accuracy<=100 && Number.isFinite(report.health) && report.health>=0 &&
    !!report.stats && Object.keys(emptyBattleStats()).every(key=> {
      const number=report.stats[key as keyof BattleStats];return Number.isFinite(number) && number>=0;
    });
}
export function battleReport(stats: BattleStats, score: number, health: number, maxHealth: number, survived: boolean) {
  const accuracy = stats.shotsFired ? Math.min(1,stats.hits/stats.shotsFired) : 0;
  const points = Math.min(40,score*4) + accuracy*25 + Math.max(0,health/maxHealth)*20 + (survived?15:0);
  const grade:BattleGrade=points>=90?'S':points>=75?'A':points>=60?'B':points>=40?'C':'D';
  return {grade,accuracy:Math.round(accuracy*100),health:Math.round(health),stats:{...stats}};
}
