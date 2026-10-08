import { spawnSync } from 'node:child_process';

const status = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' });
if (status.status !== 0 || status.stdout.trim()) {
  throw new Error('Commit the delivery before deploying. Prefer pushing main so CI validates and deploys that commit.');
}
for (const [command, args] of [
  ['npm', ['run', 'build']],
  ['npx', ['wrangler', 'pages', 'deploy', 'dist', '--project-name', 'game-developer-challenge', '--branch', 'main', '--commit-dirty=false']],
]) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32',
    env: { ...process.env, VITE_USE_MSW: 'true' } });
  if (result.status !== 0) process.exit(result.status || 1);
}
