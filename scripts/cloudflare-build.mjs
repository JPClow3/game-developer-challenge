import { spawnSync } from 'node:child_process';
const env = { ...process.env, CI: 'true', VITE_USE_MSW: 'true' };
function run(command, args, childEnv = env) {
  const result = spawnSync(command, args, { env: childEnv, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
run('npm', ['test']);
run('npm', ['run', 'lint']);
run('npm', ['run', 'build']);
const { browserEnv } = await import('./cloudflare-browser-env.mjs');
for (const config of ['playwright.leaderboard.config.ts', 'playwright.published.config.ts']) {
  run(process.execPath, ['node_modules/playwright/cli.js', 'test', `--config=${config}`], { ...browserEnv, ...env });
}
