import { test, expect } from '@playwright/test';

test.describe('Flow 10: Ranking & History Query, Pagination, Empty & Error States', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 15000 });
  });

  test('should query and paginate ranking entries', async ({ page }) => {
    await page.getByRole('tab', { name: /ranking/i }).click();
    await expect(page.getByTestId('ranking-container')).toBeVisible();

    // Verify fixture entries are listed
    await expect(page.locator('text=Edward Teach (Blackbeard)')).toBeVisible({ timeout: 5000 });

    // Test next page if pagination controls exist
    const nextBtn = page.getByRole('button', { name: /next ranking page/i });
    if ((await nextBtn.count()) > 0 && (await nextBtn.isEnabled())) {
      await nextBtn.click();
      await expect(page.locator('text=Page 2 of')).toBeVisible();
    }
  });

  test('should handle empty state and error state gracefully with retry', async ({ page }) => {
    // 1. Switch MSW scenario to 'empty'
    await page.evaluate(() => {
      sessionStorage.setItem('pirate_battle_msw_scenario', 'empty');
    });

    await page.getByRole('tab', { name: /ranking/i }).click();
    await expect(page.getByTestId('ranking-container')).toBeVisible();
    await expect(page.locator('text=No matches recorded for this configuration yet')).toBeVisible();

    // 2. Switch MSW scenario to 'error_500'
    await page.evaluate(() => {
      sessionStorage.setItem('pirate_battle_msw_scenario', 'error_500');
    });

    // Switch tabs to trigger refetch
    await page.getByRole('tab', { name: /match history/i }).click();
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Failed to retrieve history')).toBeVisible();
    await expect(page.getByRole('button', { name: /retry query/i })).toBeVisible();

    // Restore to 'success'
    await page.evaluate(() => {
      sessionStorage.setItem('pirate_battle_msw_scenario', 'success');
    });
  });
});
