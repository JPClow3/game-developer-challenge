import { test, expect } from './fixtures';

test.describe('Flow 06: Match Lifecycle Termination & Clean Restart', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /^Play$/i }).click();
    await expect(page.getByTestId('game-active-arena')).toBeVisible();
    await expect(page.getByTestId('combat-canvas')).toBeVisible();
    await page.waitForFunction(() => (window as any).__PIXI_GAME__?.isRunning);
  });

  test('should terminate on player destruction and restart cleanly with restored state', async ({ page }) => {
    // 1. Force player death
    await page.evaluate(() => {
      const sim = (window as any).__PIRATE_SIMULATION__;
      sim.player.health = 0;
      sim.endMatch('player_destroyed');
    });

    // 2. Should transition to ResultScreen with Vessel Sunk
    await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Vessel Sunk!')).toBeVisible();

    // 3. Click Play Again
    await page.getByRole('button', { name: /play again/i }).click();
    await expect(page.getByTestId('game-active-arena')).toBeVisible();

    // 4. Verify entities and stats restored cleanly
    const isClean = await page.evaluate(() => {
      const sim = (window as any).__PIRATE_SIMULATION__;
      return {
        health: sim.player.health,
        score: sim.score,
        isEnded: sim.isEnded,
      };
    });

    expect(isClean.health).toBe(100);
    expect(isClean.score).toBe(0);
    expect(isClean.isEnded).toBe(false);
  });

  test('should terminate on time expiration and show Victory outcome', async ({ page }) => {
    // Force timer expiration
    await page.evaluate(() => {
      const sim = (window as any).__PIRATE_SIMULATION__;
      sim.remainingSeconds = 0;
      sim.endMatch('time_expired');
    });

    await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Victory at Sea!')).toBeVisible();
  });
});
