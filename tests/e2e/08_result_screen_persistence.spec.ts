import { test, expect } from './fixtures';

test.describe('Flow 08: Result Screen Display & Refresh Persistence', () => {
  test('should display completed match metrics and persist result in storage across page refresh', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /^Play$/i }).click();
    await expect(page.getByTestId('game-active-arena')).toBeVisible();

    // End match with custom score
    await page.evaluate(() => {
      const sim = (window as any).__PIRATE_SIMULATION__;
      sim.score = 15;
      sim.remainingSeconds = sim.durationSeconds - 55;
      sim.endMatch('time_expired');
    });

    // Verify ResultScreen rendered with 15 points
    await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Total Score').locator('..').locator('text=15')).toBeVisible();
    await expect(page.locator('text=Time Survived').locator('..').locator('text=55s')).toBeVisible();

    // Verify localStorage has persisted the result
    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem('pirate_battle_last_completed_match_v1');
      return raw ? JSON.parse(raw) : null;
    });

    expect(stored).not.toBeNull();
    expect(stored.score).toBe(15);
    expect(stored.durationSeconds).toBe(55);

    // Refresh page with hash to review last result
    await page.goto('/#last-result');
    await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Total Score').locator('..').locator('text=15')).toBeVisible();
  });
});
