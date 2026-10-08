import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT || 5291);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PLAYWRIGHT_PORT');
const remoteURL = process.env.PUBLISHED_URL;
const baseURL = remoteURL || `http://127.0.0.1:${port}`;
const node = `"${process.execPath}"`;
const build = `${node} node_modules/typescript/bin/tsc --noEmit && ${node} node_modules/typescript/bin/tsc --noEmit -p tsconfig.functions.json && ${node} node_modules/vite/bin/vite.js build --outDir artifacts/published-build`;

export default defineConfig({
  testDir: './tests/published', outputDir: 'test-results/published',
  workers: 1, timeout: 60_000, forbidOnly: !!process.env.CI,
  reporter: [['html', { outputFolder: 'playwright-published-report', open: 'never' }], ['list'],
    ['json', { outputFile: 'test-results/published.json' }]],
  use: { baseURL, screenshot: 'on', trace: 'retain-on-failure',
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'], isMobile: true, hasTouch: true } },
  ],
  webServer: remoteURL ? undefined : {
    command: `${build} && ${node} node_modules/vite/bin/vite.js preview --outDir artifacts/published-build --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL, reuseExistingServer: false, timeout: 300_000, stdout: 'pipe', env: { VITE_USE_MSW: 'true' },
  },
});
