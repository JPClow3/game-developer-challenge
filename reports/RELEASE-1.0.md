# Release 1.0

Consolidated on 8 October 2026. All development branch histories are included in main. The annotated tag [1.0](https://github.com/JPClow3/game-developer-challenge/tree/1.0) identifies the delivered checkout. [GitHub Actions](https://github.com/JPClow3/game-developer-challenge/actions/workflows/deploy.yml) records the exact release commit's validation and deployment. [Play the game](https://game-developer-challenge.pages.dev).

## Final local checks

| Gate | Passed | Expected skips | Failures |
| --- | --- | --- | --- |
| unit | 349 | 0 | 0 |
| browser | 116 | 6 | 0 |
| leaderboard | 4 | 0 | 0 |
| published | 12 | 0 | 0 |

Lint, browser/Functions type checking and the production build passed. Skips cover desktop-only omissions of touch/portrait/joystick cases. Browser retries are disabled. Native HTML reports: [gameplay](release-1-0/browser/index.html), [optional backend](release-1-0/leaderboard/index.html), [optimized fixtures](release-1-0/published/index.html). The [manifest](release-1-0/manifest.json) records source and runtime-asset hashes.

The merged audit fixes preserve blocked-storage play, audio load deduplication, bounded physics backlog, canonical saved settings, pagination recovery and Escape cancellation. Integration checks caught lost voyage choices, unpopulated default rankings and compound-island re-entry. Choices now persist, every difficulty/map board has fixture opponents, and collision resolves the whole compound shape. Twelve heading/map cases check every island center; archived Classic replay checks remain green. The [pre-fix browser report](release-1-0/browser-before-union-fix.json) retains both collision failures as historical evidence.

## CI readiness follow-up

The first consolidated Linux run passed 115 gameplay cases and failed one immediate audio-volume assertion after Resume. The test observed the prior paused value before the UI transition finished. Start/resume assertions now poll the actual loop state. All 12 focused cases passed across desktop/mobile with three repetitions and no retries. Production code and media are unchanged. [Focused report](release-1-0/audio-readiness/index.html), [structured results](release-1-0/audio-readiness.json), and [follow-up provenance including the original CI failure](release-1-0/audio-readiness-provenance.json) supplement the original full local snapshot. The final tag still requires both complete CI browser gates and public deployment verification.

## Current media

[Harbor](../docs/media/release-1.0/desktop-menu.png), [portrait combat](../docs/media/release-1.0/portrait-archipelago.png), [landscape combat](../docs/media/release-1.0/landscape-archipelago.png), [three maps at three viewport sizes](../docs/media/release-1.0/evidence.json), and the refreshed [walkthrough video](../docs/media/gameplay.mp4). The video demonstrates real practice inputs, a battle, then a verified replay; its ending advances fixed ticks. The nine controlled map scenes inject injured hull, salvage and sinking feedback for review. Historical recovery and Android AVD images are labelled in [media provenance](../docs/media/README.md). Neither touch emulation nor the AVD is physical-phone acceptance.

## Release performance

Sequential installed-Chrome profiles started after other local browser validation/capture jobs ended. The optimized test-mode build uses the Open sea/Smuggler islands rules, a 180-second session, one-second base spawning, seed 1337, scripted inputs and diagnostic hull protection. Each run includes five exit cycles, forced-GC heap samples and ten seconds idle. This is an instrumented workload.

| Workload | Browser | CPU rate | Wall seconds | Mean FPS | p95 frame interval | Target |
| --- | --- | --- | --- | --- | --- | --- |
| desktop | 154.0.8037.98 | 1x | 179.83 | 143.98 | 7.00 ms | Pass in this environment |
| mobile-4x | 154.0.8037.98 | 4x | 179.67 | 115.67 | 13.90 ms | Pass in this environment |

Raw data: [desktop](release-1-0/profiling/desktop.json), [throttled mobile viewport](release-1-0/profiling/mobile-4x.json). The mobile profile uses the desktop GPU. No controlled physical-hardware guarantee or performance improvement over different historical workloads is claimed. [PERFORMANCE](../PERFORMANCE.md) retains historical measurements and reproduction commands.

## Providers and published acceptance

Neon project game-developer-challenge, hosted main: all three checked-in Drizzle migrations are applied, with matches, browser_sessions, match_tickets, verified ranking and four difficulty/map columns present. Both pending migrations were first applied and inspected on an isolated Neon branch; it was removed after validation. Existing match data was preserved. The [provider snapshot](release-1-0/neon-provider.json) records the checks without credentials.

Cloudflare project game-developer-challenge uses main and a server-only DATABASE_URL binding. CI explicitly enables MSW, waits for Linux/Windows gates, deploys with commit-dirty=false, and runs 12 browser cases against the public URL. The default frontend needs no Neon access, account or private credentials. Direct Functions ranking/history requests exercise the optional backend, whose empty dataset does not determine the fixture ranking seen in the browser. Final provider revision and public-browser results are verified before tagging.
