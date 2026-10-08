import { test, expect } from './fixtures';

test.describe('Flow 02: Asset Loading, Error Handling & Retry', () => {
  test('should display progress bar, handle failure with retry button, and succeed on retry', async ({ page }) => {
    // Intercept spritesheet asset via client-side fetch injection to safely bypass Service Worker
    await page.addInitScript(() => {
      (window as any).__FAIL_ASSETS__ = true;
      const originalFetch = window.fetch;
      window.fetch = async (...args: any[]) => {
        const url = String(args[0]?.url || args[0]);
        if ((window as any).__FAIL_ASSETS__ && url.includes('/assets/spritesheet/ui_sheet')) {
          throw new TypeError('Failed to fetch spritesheet asset');
        }
        return originalFetch.apply(window, args as any);
      };
    });

    await page.goto('/');

    // 1. Should display error alert and Retry Loading button
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /retry loading/i })).toBeVisible();

    // 2. Allow requests and click Retry Loading
    await page.evaluate(() => {
      (window as any).__FAIL_ASSETS__ = false;
    });
    await page.getByRole('button', { name: /retry loading/i }).click();

    // 3. Should succeed and display the Main Menu
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 15000 });
  });
});
