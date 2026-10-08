# Pirate Battle architecture

## Boundaries and ownership

`src/core` is a pure TypeScript simulation: kinematics, collision, spawning, weapons, AI, scoring and replay run without React or PixiJS. The same rules support browser tests and optional server replay verification. `src/pixi` owns textures, sprites, interpolation, camera, rendering and recovery. `src/ui` owns semantic DOM menus, HUD, dialogs, tables and touch controls. `src/api` owns HTTP, query caching and durable submissions; `src/mocks` supplies the default fixture API.

React owns simulation lifetime and screen transitions. Pixi's ticker advances physics and draws snapshots; component state does not drive the physics loop. Discrete events carry health, score, pause and completion changes. The bridge emits whole-second timer transitions; the HUD samples at 100 ms for visual updates. `SimulationBridge` is also exercised independently by unit tests.

## Simulation and input

The world is a 1600 × 1000 logical arena. Physics advances in fixed 1/60-second steps with an accumulator and bounded catch-up work. Rendering interpolates previous/current positions and shortest-arc rotation. Movement and weapon clocks remain independent of refresh rate; catch-up stays bounded after stalls.

Movement separates forward and sideways drag for momentum and keel resistance. Collision resolves arena/island overlap and removes inward velocity while allowing sliding. Front and side batteries have independent cooldowns. Seeded spawning checks player distance, island clearance and density.

Keyboard and touch are independent input sources merged into commands. Pointer capture preserves release outside a button. Pause, blur, visibility loss, abandonment and completion clear held input. Practice/replay are unscored. Replay stores seed, full config, engine version, tick-indexed input transitions and periodic state checks. Incompatible or divergent recordings fail visibly.

## Camera, resize and DPR

Logical arena size is not a fixed canvas viewport. `Camera.ts` fits the arena on desktop/landscape with centered margins. Narrow portrait uses a closer player-following camera, clamped at world edges with vertical space for HUD/touch controls. Typed bearings show offscreen enemies.

Pixi initializes with auto-density and resolution capped at `min(devicePixelRatio, 2)` to bound GPU memory. Assets choose retina variants above DPR 1.25. Resize reads parent CSS dimensions, resizes the renderer, recomputes the camera and repaints immediately, including between ticks. DOM menus use viewport height and scrolling on short screens. Resolution and asset density are selected at initialization; moving between screens with different DPR does not reload every texture automatically.

## Texture failures and renderer recovery

`AssetLoader` shares a cached preload promise and progress listeners. Required ship/tile failures reject preload and show Retry. A rejection clears the promise so retry can succeed. A failed retina UI atlas retries the 1x atlas. Optional background/harbor decoration may fail without blocking combat. Shared textures are reused across matches.

Renderer states expose loading, ready and failure. Slow assets show recovery controls. Pixi initialization has a 20-second watchdog. WebGL context loss pauses the battle/stops the ticker; restoration redraws before enabling resume. Failed renderers can be recreated while preserving the simulation. Browser recovery tests exercise the visible failure/retry flow.

## Strict Mode and disposal

The root uses React Strict Mode. Repeated preload effects share one promise; an attempt counter prevents stale callbacks changing the screen after cleanup. PixiCanvas creates one canvas/application per effect, tracks cancellation, and destroys late initialization results belonging to retired effects.

Cleanup removes resize/context/visibility/input listeners, animation callbacks, subscriptions, canvases and Pixi applications. Audio loops stop or duck on exit/pause. Shared textures remain cached. React owns simulation teardown; PixiCanvas owns renderer teardown. Idempotent disposal tests cover restart, completion and abandonment; they do not prove the absence of every GPU/browser-driver leak.

## API, cache and invalidation

| Endpoint | Behavior |
| --- | --- |
| `GET /api/ranking` | Paginated scores filtered by duration/spawn interval. Sort: score DESC, duration ASC, playedAt ASC, ID as final tie-breaker. |
| `GET /api/history` | Paginated player battle history. |
| `POST /api/match` | One insert per ID. Identical retry returns the stored match with `isDuplicate: true`; conflicting reuse is rejected. |
| `POST /api/session` | Optional live backend only: issue a bounded ranked-session ticket before play. |

TanStack Query keys contain all request parameters, separating players, pages and filters. Data stays fresh five seconds and previous data remains visible during page transitions. Queries retry twice and do not refetch on focus. Separate keys prevent delayed earlier pages replacing the newer page cache. Network Lab cancels/resets relevant queries when scenarios change.

All acknowledged submissions, including duplicates recovered in background, invalidate `ranking` and `history` key prefixes. Mounted queries refetch; inactive queries become stale for their next visit. Cache refresh failure cannot undo an accepted write or requeue it.

## Durable submission queue

The queue saves the complete request under `pirate_battle_pending_submissions_v1` before dispatch. HTTP 200/201 acknowledgement removes it. Requests share an in-flight promise by ID so foreground submission and background drain avoid concurrent duplicate work in one tab. Server idempotency remains authoritative across tabs/restarts.

Startup begins sync after fixture-worker/live-API preparation, when the browser reports online. Reconnect and History's Retry Sync also drain restored records. Each drain processes a bounded snapshot; new results use their own foreground submission. Transport errors, 408, 429 and 5xx retain requests with error metadata. Permanent rejections are removed because retry cannot repair them. Notifications refresh History's pending count.

Storage is best effort when localStorage is blocked/full. There is no background sync after the page closes and no continuously scheduled retry loop: persistent outages need a healthy restart, reconnect or manual retry. Separate tabs do not transactionally coordinate localStorage writes. Replay payloads also consume browser storage. These are limitations of browser-local challenge persistence.

## Fixtures and controlled failures

Published/local builds default to MSW. `VITE_USE_MSW=false` selects the optional live backend. Missing database secrets never silently activate fixtures in Functions.

`ScenarioManager` validates `?scenario=...`, gives it startup priority over session state, and writes panel selections to the URL. `?scenarioSeed=42` controls jitter. Ranking/history have independent request counters. Alternating slow/fast ranges guarantee reversed completion for overlapping pairs, with repeatable jitter.

Timeout inserts the match before delaying the first response beyond the client's five-second timeout. Retrying its persisted ID immediately acknowledges the duplicate. `idempotency_recovery` instead loses the first acknowledgement immediately, while reads stay healthy. Both preserve exactly one accepted match. `ranking_fails`/`history_fails` isolate each tab's 500 failure. Success, empty, slow network, global 400/500 and offline complete the inventory. [README](README.md) explains each failure's URL, steps and recovery.

Permanent submission rejections are retained separately from retry items in `submissionRejections.ts`, with at most 50 recent outcomes. The result screen subscribes to queue changes, including background sync, and restores the rejected state after reload. A rejected ID cannot be submitted again automatically. Storage failures preserve feedback for the current session.

PixiGame owns renderer startup, layers, events and cleanup. `ArenaScenery.ts` draws static arena art; `CombatOverlays.ts` draws stateless water, weapon guides, projectiles, health bars and attack cues from a simulation snapshot. These modules do not advance or mutate gameplay.

## Balancing decisions

| Choice | Rationale |
| --- | --- |
| Default 120 seconds; options 60–180 | Short repeatable battles with time to learn steering and bounded longer sessions. |
| Spawn every 3 seconds; maximum 10 enemies | Sustained pressure and predictable simulation/render work. |
| Spawn at least 380 px from player, 40 px clear of islands | Avoid unavoidable spawn contact and trapped placements. |
| Front 25 damage / 0.6 seconds; broadside three × 20 / 1.8 seconds | Front fire supports pursuit; slower side volleys reward heading and positioning. |
| Chaser 35 HP / 35 ram damage; shooter 60 HP / 240–360 px standoff | Distinct close/ranged threats, shapes and attack cues. |
| One point per cannon kill; no ram-suicide points | Reward aim without encouraging absorbing contact damage. |

Constants live in `src/types/config.ts`. Menu options are validated/persisted for the next match, never applied to an active battle. Ranking filters separate duration/spawn configurations. These are intentional defaults, not statistically proven competitive balance.

## Tooling, safety and limitations

ESLint runs separately from TypeScript with recommended TypeScript, React Hooks and JSX accessibility rules. Explicit `any` is allowed for legacy Pixi internals/browser harnesses; unused variables, hook correctness and accessibility still fail lint. Generated reports/bundles are ignored. Vitest tests rules/queue behavior; Playwright covers desktop/mobile input, lifecycle, faults, recovery and screenshots.

Windows uses native visual baselines. Linux images are generated/compared in the locked Playwright Docker image; macOS can use the same Docker runner. Screenshot assertions never skip an OS or silently accept missing images. Candidate baseline updates need review.

All debug globals, including SimulationBridge's health mutator, attach only in development or explicit `--mode test` builds. Optional server verification uses issued sessions/replays rather than trusting browser scores. Fixture scores/storage remain user-editable evaluation data. Practice/replay never submit scores. There is no multiplayer authority. Desktop/emulated-mobile evidence does not establish performance on every physical device, and local tests do not establish deployed/provider acceptance.
