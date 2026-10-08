import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
if (args.some(arg => arg !== '--update-snapshots')) {
  throw new Error('Only --update-snapshots is supported by the Docker visual runner.');
}
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const version = lock.packages['node_modules/@playwright/test'].version;
const image = `mcr.microsoft.com/playwright:v${version}-noble`;
const workspace = resolve(fileURLToPath(new URL('..', import.meta.url)));
// Dependencies live in a container volume so npm ci cannot replace the host's node_modules.
const command = `npm ci && npm run test:visual${args.length ? ' -- --update-snapshots' : ''}`;
const result = spawnSync('docker', [
  'run', '--rm', '--ipc=host',
  '--mount', `type=bind,source=${workspace},target=/work`,
  '--mount', `type=volume,source=pirate-battle-visual-node-${version},target=/work/node_modules`,
  '-e', 'CI=true', '-e', 'VITE_USE_MSW=true', '-e', 'PLAYWRIGHT_CHANNEL=',
  '-w', '/work', image, 'bash', '-lc', command,
], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
