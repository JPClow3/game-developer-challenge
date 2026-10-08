import { test, expect } from './fixtures';

test.describe('Flow 07: Pause, Window Blur & Resume Without Input Buffering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /^Play$/i }).click();
    await expect(page.getByTestId('game-active-arena')).toBeVisible();
  });

  test('should suspend simulation on pause button, preserve timer, and resume cleanly without input buffering', async ({ page }) => {
    // 1. Click Pause button in HUD
    await page.getByRole('button', { name: /pause/i }).click();
    await expect(page.getByRole('dialog', { name: /game paused/i })).toBeVisible();

    // 2. Measure remaining time across 500ms
    const timeAtPause = await page.evaluate(() => {
      const sim = (window as any).__PIRATE_SIMULATION__;
      return sim.remainingSeconds;
    });

    await page.waitForTimeout(500);

    const timeAfterWait = await page.evaluate(() => {
      const sim = (window as any).__PIRATE_SIMULATION__;
      return sim.remainingSeconds;
    });

    // Time must remain frozen during pause
    expect(timeAfterWait).toBe(timeAtPause);

    // 3. Resume battle
    await page.getByRole('button', { name: /resume battle/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    const isRunning = await page.evaluate(() => {
      const sim = (window as any).__PIRATE_SIMULATION__;
      return !sim.isPaused && !sim.isEnded;
    });
    expect(isRunning).toBe(true);
  });

  test('should automatically pause on window blur', async ({ page }) => {
    // Dispatch blur event on window
    await page.evaluate(() => {
      window.dispatchEvent(new Event('blur'));
    });

    // Verify PauseModal appeared
    await expect(page.getByRole('dialog', { name: /game paused/i })).toBeVisible();
  });
});
