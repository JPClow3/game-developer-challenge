import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const playwright = join(root, 'node_modules/playwright/cli.js');
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}).`);
  return result;
}

run(process.execPath, [playwright, 'install', 'chromium']);
const env = { ...process.env };
if (process.platform === 'linux' && process.env.WORKERS_CI) {
  // Workers Builds has no sudo/root access. Ask the pinned Playwright CLI which
  // distro packages are missing, download official .debs, and extract locally.
  // No system packages or installation scripts are changed or executed.
  const cache = await mkdtemp(join(tmpdir(), 'cloudflare-browser-deps-'));
  await mkdir(join(cache, 'lists/partial'), { recursive: true });
  await mkdir(join(cache, 'archives/partial'), { recursive: true });
  const aptConfig = join(cache, 'apt.conf');
  await writeFile(aptConfig, `Dir::State::Lists "${cache}/lists";\nDir::Cache::Archives "${cache}/archives";\nDebug::NoLocking "true";\n`);
  const aptEnv = { ...env, APT_CONFIG: aptConfig };
  // The build image omits its package index as well as the browser libraries.
  run('apt-get', ['update'], { env: aptEnv });
  const dry = spawnSync(process.execPath, [playwright, 'install-deps', '--dry-run', 'chromium'], {
    cwd: root, encoding: 'utf8', env: aptEnv,
  });
  if (dry.error) throw dry.error;
  const output = `${dry.stdout ?? ''}\n${dry.stderr ?? ''}`;
  let missing = [...output.matchAll(/^ {2}([a-z0-9][a-z0-9+.:~-]*)\s*$/gm)].map(match => match[1]);
  // Playwright 1.59 prints an installation command rather than a missing-package
  // report. Simulate that command with apt to include transitive dependencies.
  const install = output.match(/apt-get install -y --no-install-recommends ([a-z0-9+.:~\- ]+)/);
  if (install) {
    const packages = install[1].trim().split(/\s+/);
    const simulation = spawnSync('apt-get', ['install', '-s', '--no-install-recommends', ...packages], {
      encoding: 'utf8', env: aptEnv,
    });
    if (simulation.error) throw simulation.error;
    if (simulation.status !== 0) throw new Error(`Cannot resolve browser packages:\n${simulation.stderr}`);
    missing = [...simulation.stdout.matchAll(/^Inst (\S+) /gm)].map(match => match[1]);
  }
  if (missing.length) {
    console.log(`Preparing ${missing.length} browser dependency packages without root access.`);
    run('apt-get', ['download', ...new Set(missing)], { cwd: cache, env: aptEnv });
    const extracted = join(cache, 'root');
    for (const file of (await readdir(cache)).filter(name => name.endsWith('.deb'))) {
      run('dpkg-deb', ['--extract', join(cache, file), extracted]);
    }
    const libraryDirs = new Set();
    for (const entry of await readdir(extracted, { recursive: true, withFileTypes: true })) {
      if (entry.name.includes('.so')) libraryDirs.add(entry.parentPath);
    }
    env.LD_LIBRARY_PATH = [...libraryDirs, env.LD_LIBRARY_PATH].filter(Boolean).join(':');
  } else if (dry.status !== 0 || (!install && !output.includes('All system dependencies are installed.'))) {
    throw new Error(`Cannot determine browser dependencies:\n${output}`);
  }
}

export const browserEnv = env;
