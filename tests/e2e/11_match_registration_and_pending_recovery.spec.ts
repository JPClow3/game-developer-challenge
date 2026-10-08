import { test, expect } from './fixtures';

test.describe('Flow 11: Match Registration, Tab Updates & Pending Recovery', () => {
  test('should register match and update both ranking and history tabs', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /^Play$/i }).click();
    await expect(page.getByTestId('game-active-arena')).toBeVisible();
    await expect(page.getByTestId('combat-canvas')).toBeVisible();

    // Finish match
    await page.evaluate(() => {
      const sim = (window as any).__PIRATE_SIMULATION__;
      sim.score = 29;
      sim.endMatch('time_expired');
    });

    await expect(page.getByTestId('result-screen')).toBeVisible();
    await expect(page.locator('text=Confirmed in Leaderboard')).toBeVisible({ timeout: 10000 });

    // Go to Main Menu
    await page.getByRole('button', { name: /main menu/i }).click();
    await expect(page.getByTestId('main-menu')).toBeVisible();

    // Check Ranking tab reflects our score
    await page.getByRole('tab', { name: /ranking/i }).click();
    await expect(page.locator('text=29')).toBeVisible();

    // Check Match History tab reflects our score
    await page.getByRole('tab', { name: /match history/i }).click();
    await expect(page.locator('text=29 pts')).toBeVisible();
  });

  test('should recover and sync pending submissions across page refresh', async ({ page, expectNetworkFailure }) => {
    expectNetworkFailure('/api/match','Failed to load resource: net::ERR_FAILED',3);
    expectNetworkFailure('/api/history','Failed to load resource: net::ERR_FAILED',3);
    await page.goto('/');
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 15000 });

    // Keep the queued submission offline until the automatic restart recovery.
    await page.goto('/?scenario=server_offline');
    // Inject a pending submission directly into localStorage
    await page.evaluate(() => {
      if (!localStorage.getItem('pirate_battle_player_id_v1')) {
        localStorage.setItem('pirate_battle_player_id_v1', 'test_player');
      }
      const id = 'test_pending_uuid_' + Date.now();
      const pending = [
        {
          id,
          request: {
            id,
            playerId: localStorage.getItem('pirate_battle_player_id_v1') || 'test_player',
            playerName: 'Pending Captain',
            score: 33,
            durationSeconds: 100,
            endReason: 'time_expired',
            config: { sessionDurationSeconds: 120, enemySpawnIntervalSeconds: 3 },
            playedAt: new Date().toISOString(),
          },
          timestamp: Date.now(),
          retryCount: 1,
          lastError: 'Simulated connection failure',
        },
      ];
      localStorage.setItem('pirate_battle_pending_submissions_v1', JSON.stringify(pending));
    });

    // Reload page to simulate resuming application after offline period
    await page.reload();
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 15000 });

    // Open Match History tab
    await page.getByRole('tab', { name: /match history/i }).click();

    // Verify pending alert banner is visible
    await expect(page.locator('text=1 match record(s) pending online sync')).toBeVisible();
    await expect(page.getByRole('button', { name: /retry sync/i })).toBeVisible();

    // A healthy restart drains the queue without visiting History or pressing Retry.
    await page.goto('/?scenario=success');
    await expect(page.getByTestId('main-menu')).toBeVisible();
    await expect.poll(() => page.evaluate(() =>
      JSON.parse(localStorage.getItem('pirate_battle_pending_submissions_v1') || '[]').length
    )).toBe(0);
    await page.getByRole('tab', { name: /match history/i }).click();

    // Banner should disappear upon successful sync
    await expect(page.locator('text=pending online sync')).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByText('33 pts', { exact: true })).toBeVisible();
  });
});
