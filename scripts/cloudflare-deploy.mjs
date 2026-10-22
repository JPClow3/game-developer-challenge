import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
if (process.env.WORKERS_CI_BRANCH !== 'main') throw new Error('Production releases require main.');
const revision = process.env.WORKERS_CI_COMMIT_SHA;
if (!/^[a-f0-9]{40}$/.test(revision || '')) throw new Error('Missing exact release commit.');
const cli = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
for (const args of [
  ['deploy', '--config', 'ci/wrangler.jsonc'],
  ['pages', 'deploy', 'dist', '--project-name', 'game-developer-challenge', '--branch', 'main', '--commit-hash', revision, '--commit-dirty=false'],
]) {
  const result = spawnSync(process.execPath, [cli, ...args], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
const { browserEnv } = await import('./cloudflare-browser-env.mjs');
const smoke = spawnSync(process.execPath, ['node_modules/playwright/cli.js', 'test', '--config=playwright.published.config.ts'], {
  stdio: 'inherit', env: { ...browserEnv, CI: 'true', PUBLISHED_URL: 'https://game-developer-challenge.pages.dev' },
});
if (smoke.error) throw smoke.error;
if (smoke.status !== 0) process.exit(smoke.status || 1);
