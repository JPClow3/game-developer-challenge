# Pirate Battle

Single-player naval combat built with React 18, TypeScript and PixiJS 8. Sail around islands, use front and side cannons, and survive a timed battle. Local and published challenge builds use MSW fixtures and browser persistence by default. The optional Cloudflare Pages / Neon backend requires explicit opt-in.

[Play](https://game-developer-challenge.pages.dev) · [Source](https://github.com/JPClow3/game-developer-challenge) · [Architecture](ARCHITECTURE.md) · [Deployment](DEPLOYMENT.md) · [Test and performance reports](reports/README.md)

[Requirements matrix and testing story](docs/REVIEW-GUIDE.md) · [Three-minute performance measurements](PERFORMANCE.md)

## Run locally

Use Node 22 or 24 and npm:

```sh
npm ci
npm run dev
```

Open http://localhost:5173. Choose a difficulty and map, then **Play**. **Options** changes duration, the base enemy interval, sound and touch controls. **Practice voyage** teaches movement and cannon directions without registering a score. Completed battles offer **Watch Replay**, with saved inputs and divergence checks.

```sh
npm run lint       # ESLint, TypeScript rules, React hooks, JSX accessibility
npm run typecheck  # Browser and Functions types
npm test           # Unit/integration tests
npm run build      # Production bundle
npm run preview    # Serve dist
npm run test:e2e   # Desktop and mobile Chromium flows
npm run test:leaderboard # Optional backend against isolated PostgreSQL
```

Install native Chromium with `npx playwright install chromium`. PowerShell can use `npm.cmd` and `npx.cmd`.

## Environment variables

Vite variables are read at build time. Put local settings in `.env.local`. Never prefix database secrets with `VITE_`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_USE_MSW` | Enabled unless exactly `false` | Fixtures and Network Lab locally and in published builds. Set `false` for the live API. |
| `DATABASE_URL` | Unset | Server-only Neon connection for Pages Functions. Required for the optional backend. |
| `DATABASE_URL_UNPOOLED` | Falls back to `DATABASE_URL` | Server-only direct connection for Drizzle tooling. |
| `PLAYWRIGHT_PORT` | `5173` | Isolated local browser-test server port. |
| `PLAYWRIGHT_CHANNEL` | Bundled Chromium | Optional installed browser channel; leave unset for visual comparisons. |
| `CI` | Unset locally | Forbids focused tests and disables server reuse. |

Production omits simulation/renderer debug globals. Profiling or automation requiring them can use `npm run build -- --mode test`. That optimized test build must not be used for the public production release.

## Controls and rules

| Action | Keyboard | Touch |
| --- | --- | --- |
| Sail ahead | W / Up | Forward |
| Turn | A, D / Left, Right | Left, Right |
| Front cannon | Space / J | Front |
| Port broadside | Q / K | Port |
| Starboard broadside | E / L | Starboard |
| Pause / resume | P / Escape | Pause / Resume |

Hold cannon controls to repeat when loaded. Steering and firing work simultaneously. Blur/pause clears held input; press again after resuming. Options also includes sound and control preferences.

Default voyage: Open sea difficulty, Smuggler islands, 120 seconds and 100 hull points. The 3-second base enemy interval scales from 4.05 seconds at the opening to 2.25 seconds at the finish, with the enemy cap rising from 3 to 10. Calm waters and Storm fleet change crew strength, speed, damage and repair chances. Broken straits and Fortress bay provide different sailing routes. Choose Classic rules for the original three-island arena and fixed spawning. Every enemy sunk by your cannons earns one point; chaser suicide rams earn none. Front reload: 0.6 seconds. Each three-shot broadside reload: 1.8 seconds. Duration options: 60–180 seconds; spawn interval: 1–15 seconds. Options apply to the next battle. [Architecture](ARCHITECTURE.md) explains balance choices.

New voyages add repair crates: enemy cannon kills can leave salvage for 12 active seconds. Sail within 45 world pixels while injured to restore up to 20 hull. Routes around islands and shooter line of sight use the same physical shoreline. Shooters retain a visible windup before discharging.

Completed battles report accuracy, hull, damage, repairs and enemy types sunk. Personal bests are separate for every rules/difficulty/map/duration/interval combination. Three persistent goals unlock captain titles on this device; they do not alter combat balance. Optional joystick controls steer toward a heading while a second thumb fires. Landscape touch viewports use a closer camera with bearings for enemies outside the visible area.

Classic recordings retain simulation version 2; new voyages use version 3. The optional server verifies the replay against the issued difficulty and map. Apply Drizzle migrations before deploying these API changes. [Implementation and validation](docs/FORK-IMPROVEMENTS.md).

## Reproduce every network failure

Open a query below on localhost or the published fixture build. `scenario` overrides previous session selection at startup. **Network Lab** changes scenarios and updates the URL; Reset restores fixture data and success. These controls are absent with `VITE_USE_MSW=false`.

| URL query | Steps and expected result |
| --- | --- |
| `?scenario=success` | Open Ranking/Match History. Normal pagination; finish a battle to register it. |
| `?scenario=empty` | Open either data tab. Empty-state instructions replace its table. |
| `?scenario=slow_network` | Data loads after 2.5 seconds. Finish a battle and reload immediately: the in-flight submission survives and syncs automatically. |
| `?scenario=timeout` | Finish a battle. The mock saves it before withholding the first response for 6 seconds; Axios times out at 5 seconds and retains it. Reload: startup retries the same ID, receives `200 / isDuplicate: true`, and drains the queue. Reads also time out; choose success to inspect the one saved row. |
| `?scenario=idempotency_recovery` | Same saved-match/lost-response flow, with healthy reads so the accepted row is visible before retry. |
| `?scenario=ranking_fails` | Ranking returns 500 with retry; History and registration work. |
| `?scenario=history_fails` | History returns 500 with retry; Ranking and registration work. |
| `?scenario=error_500` | Reads/writes return 500. Finish a battle, then choose success and Retry Sync in History, or reload with success. |
| `?scenario=error_400` | Reads/writes return 400. A rejected submission is removed because retry cannot repair it. |
| `?scenario=server_offline` | Transport errors. Finish a battle, then restart with success to recover automatically without a manual button. |
| `?scenario=out_of_order&scenarioSeed=42` | Request consecutive pages quickly. Each endpoint independently alternates slow (1000–1099 ms) and fast (100–199 ms) responses; seed reproduces jitter after reload. Applies to Ranking and History. |

On a fresh out-of-order sequence, run this in the browser console (replace ranking with history for the other endpoint):

```js
const finished = [];
await Promise.all([1, 2].map(async page => {
  await fetch(`/api/ranking?page=${page}`).then(r => r.json());
  finished.push(page);
}));
console.log(finished); // [2, 1]
```

The queue saves the exact submission before sending. Startup, browser `online`, and History's **Retry Sync** retry it. Acknowledgements invalidate all ranking/history queries. Permanent 4xx rejections are discarded; transport errors, 408, 429 and 5xx remain pending. Persistence is browser-local and requires available localStorage.

## Reproduce texture and renderer failures

Block `**/ships_miscellaneous_sheet*.png` in DevTools and reload: required-texture loading shows an error and Retry. Remove the block and retry. On a high-DPR viewport, block `**/ui_sheet_retina.json` to exercise the 1x UI fallback. Blocking `**/assets/harbor/**` removes decoration without blocking Play.

Browser tests `02_asset_loading_and_retry`, `22_renderer_recovery` and `26_startup_recovery` cover asset rejection, WebGL recovery and slow initialization. Network fixtures do not simulate texture failures.

## Visual regressions

Windows uses native desktop/mobile baselines for harbor, battle and result. Canonical Linux captures use the Docker image matching locked Playwright, currently `mcr.microsoft.com/playwright:v1.63.0-noble`. Use that image on Linux/macOS to avoid host font/rasterization differences:

```sh
npm run test:visual:docker
# For an intentional UI change, generate candidates and inspect them:
npm run test:visual:docker -- --update-snapshots
```

Docker dependencies are isolated from host `node_modules`. Native Windows: `npm run test:visual`; regenerate candidates with `npm run test:visual -- --update-snapshots`. Screenshot assertions run on every OS; missing baselines fail. CI generates Linux candidates in the pinned image for review before acceptance. Never substitute Windows PNGs or skip missing comparisons. [Reports](reports/README.md) records evidence and limitations.

## Credits

Kenney Pirate Pack and selected Pirate Kit harbor artwork are CC0. [Harbor source/rebuild instructions](assets/pirate-kit/README.md). Gameplay source is MIT licensed. [Deployment](DEPLOYMENT.md) documents the optional Cloudflare/Neon backend separately from the default fixture challenge.
