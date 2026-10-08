import { defineConfig, devices } from '@playwright/test';

// Isolate local runs in a shared checkout without borrowing another run's server.
const port = Number(process.env.PLAYWRIGHT_PORT || 5173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PLAYWRIGHT_PORT');
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results/browser',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 60000,
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }], ['list'],
    ['json', { outputFile: 'test-results/browser.json' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'on',
    video: 'retain-on-failure',
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 5'],
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: `"${process.execPath}" node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
