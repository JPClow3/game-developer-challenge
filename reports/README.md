# Submission evidence

This directory preserves test and profiling snapshots in Git. Evaluators do not need private services or expiring CI artifacts to inspect the evidence.

The final snapshot is in `submission/`. `manifest.json` records its collection time, source digest, test counts and profile inputs. JSON reports retain individual assertions/results; the HTML reports include screenshots and any retained diagnostics. Serve an HTML report with `npx playwright show-report reports/submission/browser` (or `leaderboard` / `published`).

| Evidence | Scope |
| --- | --- |
| `submission/unit.json` | Simulation, API contracts, audio, replay and client recovery unit tests. |
| `submission/browser/` | Desktop/mobile challenge flows, including rendered gameplay. |
| `submission/leaderboard/` | Optional production endpoints and actual migrations against isolated PGlite PostgreSQL, without Neon credentials. |
| `submission/published/` | Optimized MSW build served by Vite preview: fixture opponents, selectable scenarios and mock history persistence. |
| `submission/engineering/` | Six targeted rechecks of the evidence cases, including explicit debug-overlay and Network Lab captures, preserved separately from the complete browser suite. |
| `submission/linux-visual/` | Two visual capture cases in the pinned Playwright Linux image, with six baseline screenshots. This is candidate capture evidence; full CI compares the committed baselines afterward. |
| `submission/profiling/` | Fresh measured browser profiling, with machine/browser/configuration/method recorded in each JSON. |

These snapshots do not establish physical-device performance or final deployment acceptance. Profiling uses an optimized `--mode test` build to permit instrumentation; the actual production build omits debug globals. A protected hull/scripted input keeps the measurement running and does not establish natural gameplay performance on every device. See [PERFORMANCE.md](../PERFORMANCE.md) for conclusions and limitations.

The Linux visual snapshot comes from [candidate run 37714399051](https://github.com/JPClow3/game-developer-challenge/actions/runs/37714399051), source commit `4432f90`, using `mcr.microsoft.com/playwright:v1.63.0-noble`. The Windows unit/browser/backend/published snapshots are local. Full final CI and public URL verification remain separate gates.

Reproduce the snapshot after a stable checkout:

```powershell
npm.cmd ci
npm.cmd test -- --reporter=default --reporter=json --outputFile=test-results/unit.json
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e
npm.cmd run test:leaderboard
npm.cmd run test:published
npm.cmd run test:evidence
# After reproducing the profiling runs in PERFORMANCE.md:
node tools/snapshot-reports.mjs artifacts/performance-desktop-chrome.json artifacts/performance-mobile-4x.json artifacts/performance-desktop.json
```

Run profiling separately using the commands in PERFORMANCE.md. Snapshot generation refuses test reports with failures. For a published smoke check, set `PUBLISHED_URL=https://game-developer-challenge.pages.dev` and run `npm run test:published`; this uses real browser MSW interception, so it is more representative than curling the optional backend endpoint.
