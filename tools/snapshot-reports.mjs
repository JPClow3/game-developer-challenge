import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

// Run only after the final local gates. Failing evidence is never relabeled green.
const destination = 'reports/submission';
const inputs = [
  ['unit', 'test-results/unit.json'],
  ['browser', 'test-results/browser.json'],
  ['leaderboard', 'test-results/leaderboard.json'],
  ['published', 'test-results/published.json'],
];
const summaries = [];
await mkdir(destination, { recursive: true });
for (const [name, path] of inputs) {
  const data = JSON.parse(await readFile(path, 'utf8'));
  const failed = name === 'unit' ? data.numFailedTests : data.stats.unexpected;
  if (failed || data.errors?.length || (name === 'unit' && data.success === false))
    throw new Error(`${name} report contains failures`);
  const summary = name === 'unit'
    ? { passed: data.numPassedTests, skipped: data.numPendingTests, failed, files: data.testResults.length }
    : { passed: data.stats.expected, skipped: data.stats.skipped, failed, flaky: data.stats.flaky,
      durationMs: data.stats.duration };
  summaries.push({ name, ...summary });
  if (!summary.passed) throw new Error(`${name} report contains no passing tests`);
  // Keep useful structured evidence without machine-specific root paths.
  const portable = JSON.stringify(data, null, 2).replaceAll(resolve('.').replaceAll('\\', '/'), '<checkout>')
    .replaceAll(JSON.stringify(resolve('.')).slice(1, -1), '<checkout>');
  await writeFile(`${destination}/${name}.json`, portable + '\n');
}
for (const [source, target] of [
  ['playwright-report', 'browser'],
  ['playwright-leaderboard-report', 'leaderboard'],
  ['playwright-published-report', 'published'],
]) await cp(source, `${destination}/${target}`, { recursive: true });

const profiles = process.argv.slice(2);
await mkdir(`${destination}/profiling`, { recursive: true });
for (const source of profiles) {
  const data = JSON.parse(await readFile(source, 'utf8'));
  if (data.errors?.length) throw new Error(`Profiling errors in ${source}`);
  await cp(source, `${destination}/profiling/${source.split(/[\\/]/).at(-1)}`);
}
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .trim().split('\n').filter(path => /^(src\/|functions\/|tests\/|tools\/|package(?:-lock)?\.json$|.*config\.ts$)/.test(path))
  .sort();
const sourceHash = createHash('sha256');
for (const path of files) {
  try { sourceHash.update(path + '\0').update(await readFile(path)); } catch { /* Removed files are not delivered. */ }
}
await writeFile(`${destination}/manifest.json`, JSON.stringify({ recordedAt: new Date().toISOString(),
  sourceDigest: sourceHash.digest('hex'), sourceDigestMethod: 'SHA256 of sorted delivered source/test/tool/config paths and contents, excluding reports',
  parentCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  scope: 'Local Windows evidence; CI and published URL verification are separate', summaries, profiles }, null, 2) + '\n');
console.log(JSON.stringify(summaries, null, 2));
