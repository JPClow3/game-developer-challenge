import { test, expect } from '@playwright/test';

test.describe('Flow 09: Match Abandonment & Mobile Touch Controls', () => {
  test('abandoning a match must discard session and never record to history', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /set sail/i }).click();
    await expect(page.getByTestId('game-active-arena')).toBeVisible();

    // Accumulate some score before abandoning
    await page.evaluate(() => {
      const sim = (window as any).__PIRATE_SIMULATION__;
      sim.score = 8;
    });

    // Pause and click Abandon Match
    await page.getByRole('button', { name: /pause/i }).click();
    await expect(page.getByRole('dialog', { name: /game paused/i })).toBeVisible();

    await page.getByRole('button', { name: /abandon match/i }).click();

    // Verify returned to Main Menu
    await expect(page.getByTestId('main-menu')).toBeVisible();

    // Switch to Match History tab and verify 0 matches or no match with score 8 recorded
    await page.getByRole('tab', { name: /match history/i }).click();
    await expect(page.getByTestId('match-history-container')).toBeVisible();
    await expect(page.locator('text=8 pts')).not.toBeVisible();
  });

  test('mobile viewport should display on-screen touch helm and fire controls', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Touch controls test only applies to mobile viewports');

    await page.goto('/');
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /set sail/i }).click();
    await expect(page.getByTestId('game-active-arena')).toBeVisible();

    // Verify touch buttons are present
    await expect(page.getByRole('button', { name: /move forward/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /steer left/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /steer right/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /fire front cannon/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /fire port broadside/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /fire starboard broadside/i })).toBeVisible();
  });
});
