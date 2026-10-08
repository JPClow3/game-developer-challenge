import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT || 5289);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PLAYWRIGHT_PORT');
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/leaderboard', outputDir: 'test-results/leaderboard', workers: 1, timeout: 60_000,
  reporter: [['list'], ['html', { outputFolder: 'playwright-leaderboard-report', open: 'never' }],
    ['json', { outputFile: 'test-results/leaderboard.json' }]],
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'], isMobile: true, hasTouch: true } }],
  webServer: { command: `npm run build -- --mode test --outDir artifacts/leaderboard-build && npm run preview -- --outDir artifacts/leaderboard-build --host 127.0.0.1 --port ${port} --strictPort`, url: baseURL,
    reuseExistingServer: false, env: { VITE_USE_MSW: 'false' }, timeout: 120_000 },
});
