import { test, expect } from './fixtures';

test.describe('Flow 12: Idempotent Resubmission & Network Out-of-Order Handling', () => {
  test('submitting same match payload twice must return existing record and never duplicate ranking entry', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 15000 });

    const duplicateCheck = await page.evaluate(async () => {
      const matchId = 'idempotent_test_' + Date.now();
      const payload = {
        id: matchId,
        playerId: 'idempotent_pirate',
        playerName: 'Captain Idempotent',
        score: 47,
        durationSeconds: 120,
        endReason: 'time_expired' as const,
        config: { sessionDurationSeconds: 120, enemySpawnIntervalSeconds: 3 },
        playedAt: new Date().toISOString(),
      };

      // First submission
      const res1 = await fetch('/api/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data1 = await res1.json();

      // Second submission (replay / retry)
      const res2 = await fetch('/api/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data2 = await res2.json();

      // Check ranking items count for this matchId
      const rankingRes = await fetch('/api/ranking?pageSize=50');
      const rankingData = await rankingRes.json();
      const matchesWithId = rankingData.items.filter((item: any) => item.matchId === matchId);

      return {
        firstIsDup: data1.isDuplicate,
        secondIsDup: data2.isDuplicate,
        matchCount: matchesWithId.length,
      };
    });

    expect(duplicateCheck.firstIsDup).toBe(false);
    expect(duplicateCheck.secondIsDup).toBe(true);
    expect(duplicateCheck.matchCount).toBe(1); // Exactly 1 entry!
  });
});
