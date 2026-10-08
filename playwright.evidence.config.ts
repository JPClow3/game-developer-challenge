import { defineConfig } from '@playwright/test';
import base from './playwright.config';
import { resolve } from 'node:path';

const root = process.cwd();
const server = base.webServer;
if (!server || Array.isArray(server)) throw new Error('Evidence capture expects one local Vite server');

export default defineConfig({ ...base,
  testDir: resolve(root, 'tests/e2e'), testMatch: '28_engineering_evidence.spec.ts',
  outputDir: resolve(root, 'test-results/engineering'),
  reporter: [['list'], ['html', { outputFolder: resolve(root, 'artifacts/engineering-report'), open: 'never' }],
    ['json', { outputFile: resolve(root, 'test-results/engineering.json') }]],
  webServer: { ...server, cwd: root },
});
