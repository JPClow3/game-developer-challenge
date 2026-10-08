# Submission evidence

This directory preserves test and profiling snapshots in Git. Evaluators do not need private services or expiring CI artifacts to inspect the evidence.

The final snapshot is in `submission/`. `manifest.json` records its collection time, source digest, test counts and profile inputs. JSON reports retain individual assertions/results; the HTML reports include screenshots and any retained diagnostics. Serve an HTML report with `npx playwright show-report reports/submission/browser` (or `leaderboard` / `published`).

| Evidence | Scope |
| --- | --- |
| `submission/unit.json` | Simulation, API contracts, audio, replay and client recovery unit tests. |
| `submission/browser/` | Desktop/mobile challenge flows, including rendered gameplay. |
| `submission/leaderboard/` | Optional production endpoints and actual migrations against isolated PGlite PostgreSQL, without Neon credentials. |
| `submission/published/` | Optimized MSW build served by Vite preview: fixture opponents, selectable scenarios and mock history persistence. |
| `submission/profiling/` | Fresh measured browser profiling, with machine/browser/configuration/method recorded in each JSON. |

These are local snapshots, not physical-device measurements or remote CI results. Profiling uses an optimized `--mode test` build to permit instrumentation; the actual production build omits debug globals. A protected hull/scripted input keeps the measurement running and does not establish natural gameplay performance on every device. See [PERFORMANCE.md](../PERFORMANCE.md) for conclusions and limitations.

Reproduce the snapshot after a stable checkout:

```powershell
npm.cmd ci
npm.cmd test -- --reporter=default --reporter=json --outputFile=test-results/unit.json
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e
npm.cmd run test:leaderboard
npm.cmd run test:published
# Add the fresh profiling JSON paths reported by tools/profile-combat.mjs:
node tools/snapshot-reports.mjs <desktop-profile.json> <mobile-profile.json>
```

Run profiling separately using the commands in PERFORMANCE.md. Snapshot generation refuses test reports with failures. For a published smoke check, set `PUBLISHED_URL=https://game-developer-challenge.pages.dev` and run `npm run test:published`; this uses real browser MSW interception, so it is more representative than curling the optional backend endpoint.
