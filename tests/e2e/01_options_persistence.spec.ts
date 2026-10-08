import { test, expect } from './fixtures';

test.describe('Flow 01: Options Navigation, Validation & Persistence', () => {
  test.beforeEach(async ({ page }) => {
    // Clear storage to ensure pristine start
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    // Wait for asset loading to finish and main menu to display
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 15000 });
  });

  test('should open options modal, change settings, save, and persist across page reloads', async ({ page }) => {
    // 1. Click Options button
    await page.getByRole('button', { name: /options/i }).click();
    await expect(page.getByRole('dialog', { name: /game options/i })).toBeVisible();

    // 2. Adjust Session Duration slider to 80
    const durationSlider = page.locator('#session-duration');
    await durationSlider.fill('80');
    await expect(page.locator('text=80s')).toBeVisible();

    // 3. Adjust Enemy Spawn Interval slider to 5
    const spawnSlider = page.locator('#spawn-interval');
    await spawnSlider.fill('5');
    await expect(page.locator('text=5s')).toBeVisible();

    // 4. Click Save Options
    await page.getByRole('button', { name: /save options/i }).click();
    await expect(page.getByRole('status').filter({hasText:'Options saved. Your next voyage is ready.'})).toBeVisible();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // 5. Verify text on Main Menu indicates updated configuration
    await expect(page.locator('.voyage-settings')).toContainText('80s at sea');
    await expect(page.locator('.voyage-settings')).toContainText('5s between enemies');

    // 6. Reload page and verify persistence
    await page.reload();
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.voyage-settings')).toContainText('80s at sea');
    await expect(page.locator('.voyage-settings')).toContainText('5s between enemies');

    // 7. Verify options dialog reflects persisted values
    await page.getByRole('button', { name: /options/i }).click();
    await expect(page.locator('#session-duration')).toHaveValue('80');
    await expect(page.locator('#spawn-interval')).toHaveValue('5');
  });
});
