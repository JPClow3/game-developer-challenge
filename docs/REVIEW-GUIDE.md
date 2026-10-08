# Gameplay and engineering review

For the current consolidated build, start with [release 1.0 evidence](../reports/RELEASE-1.0.md) and the [current desktop/mobile map captures](media/release-1.0/evidence.json). Dated runs below describe their recorded revisions; the release tag identifies the final CI-verified deployment.

## Review the running build

Open **Network Lab** at the lower right of the harbor. Open Ranking or Match History to create requests. Set additional latency, switch scenario while a request is pending, and observe `cancelled stale response`. The seed controls repeatable out-of-order request delays independently of the gameplay seed. Choose Server Error to see attempts 1, 2 and 3. Finish a battle, return to its persisted result through `/#last-result`, and inspect `isDuplicate=true`. Reset Mock DB cancels queries, resets fixtures, seed, latency and the bounded 80-entry log, then refetches. This panel is present whenever the build uses MSW; the optional live backend has no fault-injection controls.

Open `/?debug` and press Play. Green circles are the exact two hull disks used by the collision system. Gold circles show island colliders and the player's configured spawn exclusion distance. Pink pairs show each Shooter's minimum and maximum engagement range. White circles and labels show projectile radius and remaining lifetime in seconds. These use current physics coordinates, so interpolated sprites may differ by up to one tick. The overlay supports visual inspection; collision correctness is established by numerical tests as well. It is absent without `?debug`.

## Replay is the testing story

`GameSimulation` owns a fixed 60 Hz tick, the seeded spawner and entity IDs. `Replay.ts` records effective input changes by tick and hashes all future-affecting state, including cooldowns and RNG, every 120 ticks and at the final tick. A fresh simulation consumes that input log and checks the same hashes. Unit tests exercise multiple seeds, different render rates, pauses, short input pulses, tampering and version rejection. Browser tests play a battle, persist and reload its result, replay to a verified ending and assert that playback creates no new submission. Archived replay fixtures in `tests/fixtures/` cover compatibility with shipped simulation behavior.

The state hash detects divergence within a compatible runtime; it is not a cryptographic proof or cross-runtime score authority. The optional backend replays bounded inputs and validates the authoritative result separately. See [leaderboard verification](LEADERBOARD.md).

## Requirements traceability matrix

Each row maps a bullet from the original challenge (R1–R4) to implementation and executable evidence. Test paths are relative to the repository root. Local test definitions do not establish a successful CI or deployed-provider run. Durable delivery reports are collected by the publishing workflow; Playwright attaches screenshots, traces, console diagnostics and axe JSON to its reports.

| Spec bullet | Code | Test | Evidence to inspect |
| --- | --- | --- | --- |
| R1.1 Frame-independent naval simulation, arena/island collisions | `src/core/simulation/GameSimulation.ts`, `src/core/kinematics/ShipKinematics.ts`, `src/core/collision/CollisionSystem.ts` | `tests/e2e/03_combat_kinematics_collisions.spec.ts`; `tests/unit/m2/` kinematics/collision tests | Numerical contact checks; debug-geometry screenshot in `28_engineering_evidence` |
| R1.2 Acceleration, steering, front and three-shot broadsides, separate cooldowns | `src/core/weapons/WeaponSystem.ts`, `src/core/kinematics/ShipKinematics.ts` | `tests/e2e/04_weapons_firing_and_scoring.spec.ts`; `tests/unit/m2/broadsideGeometry.test.ts` | Projectile counts, simultaneous input and cooldown assertions |
| R1.3 Chaser/Shooter AI, safe timed spawning | `src/core/ai/ChaserAI.ts`, `ShooterAI.ts`, `src/core/spawner/EnemySpawner.ts` | `tests/e2e/05_enemy_ai_and_spawning.spec.ts`; `tests/unit/m2/ai.test.ts` | Ram awards zero, range behavior and safe-distance assertions; debug rings |
| R1.4 Session 60–180s, spawn interval, one point per player kill, natural endings | `src/types/config.ts`, `src/core/simulation/GameSimulation.ts`, `CollisionSystem.ts` | E2E `01`, `04`, `06` | Options bounds, score and time/health endings |
| R1.5 Manual/blur/visibility pause freezes physics, timer, cooldowns and inputs | `src/core/simulation/GameSimulation.ts`, `src/ui/PauseModal.tsx` | `tests/e2e/07_pause_blur_and_resume.spec.ts`, `13_combat_polish.spec.ts` | Frozen snapshots and clean resumed input |
| R1.6 Audio, fire/explosion feedback and health deterioration | `src/audio/AudioManager.ts`, `src/pixi/PixiGame.ts`, `ImpactFeedback.ts` | `tests/e2e/13_combat_polish.spec.ts`, `20_audio_loop_lifecycle.spec.ts`; `tests/unit/m1/audioLoopLifecycle.test.ts` | Combat snapshots and loop teardown; [audio lifecycle](AUDIO-LIFECYCLE.md) |
| R2.1 Main menu/options/HUD/pause/result, registration status and restart | `src/App.tsx`, `src/ui/MainMenu.tsx`, `OptionsModal.tsx`, `MatchHUD.tsx`, `PauseModal.tsx`, `ResultScreen.tsx` | E2E `01`, `06`, `08`, `28` | Visible screen transitions and four axe scans |
| R2.2 Ranking/history pagination and deterministic sorting | `src/ui/RankingTab.tsx`, `MatchHistoryTab.tsx`, `src/core/ranking.ts` | `tests/e2e/10_ranking_and_history_tabs.spec.ts`; `tests/unit/m3/` | Fixture pages, tie ordering and optional backend integration |
| R2.3 Options localStorage persistence and start-time snapshots | `src/types/config.ts`, `src/App.tsx` | `tests/e2e/01_options_persistence.spec.ts`, `08_result_screen_persistence.spec.ts` | Reload preserves values; result snapshot |
| R2.4 Keyboard, focus, screen-reader HUD and mobile touch | `src/ui/useDialogFocus.ts`, `MainMenu.tsx`, `MatchHUD.tsx`, `src/index.css` | E2E `09`, `13`, `14`, `28` | Mobile simultaneous touches; keyboard focus; axe JSON; [current browser media](media/release-1.0/evidence.json) |
| R2.5 React synchronization decoupled from Pixi frames | `src/core/bridge/SimulationBridge.ts`, `src/pixi/PixiGame.ts`, `src/ui/MatchHUD.tsx` | `tests/unit/m1/`; `tests/e2e/13_combat_polish.spec.ts` | Snapshot polling and lifecycle assertions; [architecture](../ARCHITECTURE.md) |
| R3.1 Axios/TanStack contracts, optimistic registration state, retry, invalidation, reload recovery | `src/api/client.ts`, `rankingApi.ts`, `useApiQueries.ts`, `pendingQueue.ts`, `src/ui/ResultScreen.tsx` | E2E `10`, `11`, `28`; `tests/unit/m3/` | Pending/confirmed UI, recovered queue, bounded retries in Network Lab |
| R3.2 MSW success/empty/pagination/latency/4xx/5xx/timeout/idempotency | `src/mocks/handlers.ts`, `scenarios.ts`, `db.ts`, `src/ui/MswScenarioWidget.tsx` | E2E `10`, `11`, `12`, `28`; `tests/published/` | Published-fixture scenario report; Network Lab screenshot and request log |
| R3.3 Cloudflare Functions, Neon persistence and Drizzle migrations | `functions/api/`, `functions/lib/`, `src/db/schema.ts`, `drizzle/` | `tests/leaderboard/`, `tests/unit/m3/`; Functions typecheck | [deployment](../DEPLOYMENT.md) and [leaderboard](LEADERBOARD.md). Provider state requires independent live acceptance |
| R3.4 Idempotent completed-match registration | `src/api/pendingQueue.ts`, `src/mocks/db.ts`, `functions/api/match.ts` | `tests/e2e/12_idempotency_and_out_of_order.spec.ts`, `28_engineering_evidence.spec.ts`; `tests/leaderboard/` | Repeated ID yields `isDuplicate=true`; conflicting payload rejected |
| R4.1 Twelve desktop/mobile E2E flows, controlled time and visual snapshots | `playwright.config.ts`, `tests/e2e/fixtures.ts` | E2E files `01` through `12`; `13` visual checks; `14` replay; `28` engineering evidence | HTML reports, Windows snapshots, failure traces/videos, browser-errors attachments |
| R4.2 60 FPS and memory reclamation across consecutive lifecycles | `tools/profile-combat.mjs`, `src/pixi/PixiGame.ts`, `src/App.tsx` | Three-minute profiling plus five exit cycles | [PERFORMANCE.md](../PERFORMANCE.md): raw timing, entity counts, heap and weak references; CPU-throttled mobile run |
| R4.3 README setup/environment/controls/deploy and architecture documentation | `README.md`, `ARCHITECTURE.md`, `DEPLOYMENT.md`, this matrix | `npm run typecheck`, `npm run build`; CI workflow | Build logs and published revision, reported separately |
| Acceptance: abandon never records a match | `src/App.tsx`, `src/ui/PauseModal.tsx` | `tests/e2e/09_abandonment_and_touch_controls.spec.ts` | Match request count remains zero |
| Acceptance: strict TS, successful build, error-free runtime console | `tsconfig.json`, `tests/e2e/fixtures.ts`, `.github/workflows/deploy.yml` | Typecheck/build plus automatic fixture in every E2E spec | Unexpected `pageerror` or `console.error` fails the test; error log attached |

## Console and accessibility gates

Every E2E spec imports `test` from `tests/e2e/fixtures.ts`. Its automatic fixture observes all context pages before navigation and fails on page errors and error-level console messages. Fault-injection tests may declare only the Chromium resource diagnostic they deliberately trigger, with an exact endpoint, exact message and bounded count. For example, three `/api/history` 500 messages for the initial request plus two retries. This does not suppress application `console.error` calls or unexpected network failures. Declared diagnostics are retained in `declared-network-failures` attachments. See [Playwright automatic fixtures](https://playwright.dev/docs/test-fixtures).

`28_engineering_evidence.spec.ts` runs `@axe-core/playwright` against menu, options, pause and result on desktop and mobile, using WCAG 2 A/AA and 2.1 A/AA rules. Full results are attached per screen and violations fail the test. No rules or nodes are excluded. Automated scans complement the keyboard and touch checks; they cannot establish complete accessibility conformance. See [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing).

Current release evidence is indexed in [RELEASE-1.0](../reports/RELEASE-1.0.md). Start with the [short gameplay video](media/gameplay.mp4). It shows the three practice actions, a real battle, and Watch Replay reaching a verified ending. The recording fast-forwards the battle ending and the remainder of the replay using the same fixed ticks. It uses the local mock API and does not publish a score. Reproduce it with `npm run dev`, then `node tools/record-gameplay.mjs` (ffmpeg is needed for MP4 export).

| Requested improvement | Implementation and review path | Evidence |
| --- | --- | --- |
| Smooth rendering | `src/pixi/Camera.ts`, `PixiGame.ts`: previous/current positions and shortest-arc rotation; health bars, wakes, aiming guides, projectiles, and camera use the same alpha. Paused/end frames show current transforms. | Unit interpolation checks; desktop/mobile browser capture. |
| Playable introduction | Main menu → Practice voyage → sail ahead → hit the front target → sink the port target. Skip training returns to harbor. Play after completion opens a fresh battle. | Unit progression plus browser keyboard completion and skip; no match POST. |
| Portrait readability | Player-following camera shows ships at a larger scale. Screen-edge bearings use circles for chasers, diamonds for shooters, and distance in world pixels. Rotate for the full arena in landscape. Dynamic viewport height keeps controls visible beneath the Android browser toolbar. | Desktop/mobile browser captures plus Android Studio AVD testing in both orientations; three simultaneous touch pointers exercise throttle, steering, firing, individual release, cancellation, and pause/resume. |
| Attack anticipation | Shooters need 450 ms of continuous alignment to load; losing aim cancels loading. Chasers prepare for 550 ms, then commit to a heading for 1.1 s. Rings, fill arcs and attack-bearing lines advertise the action. Large circle/diamond badges distinguish types without color. | AI timing/cancellation/committed-heading tests; rendered browser evidence. |
| Watch Replay | Result → Watch Replay. Stores seed, full validated config, simulation version, effective input changes indexed by tick, and state hashes every 120 ticks plus the final tick. Reload through `/#last-result`. Replays never submit a new result. | Three seeds replayed at 144 Hz, pauses and short input pulses, allocation isolation, tamper detection, incompatible-version rejection, browser reload and no-resubmission checks. |
| Reviewable quality | GitHub Actions runs unit/build plus browser jobs on Ubuntu and Windows. Both upload HTML reports, screenshots, failure traces and failure videos. Deployment waits for all gates. | Local checks are reported separately from remote CI and deployment. |

## Three engineering tradeoffs

1. **Fixed ticks and rendering latency.** The engine stays at 60 Hz. Interpolation shows previous-to-current transforms between ticks, adding up to one tick of presentation latency in exchange for smooth high-refresh movement. Rendering never changes physics. Catch-up alpha is clamped, and paused/completed frames settle to current state.
2. **Portrait detail and situational awareness.** A closer camera makes ships readable but hides portions of the arena. Edge bearings recover enemy direction, type and distance; landscape keeps the overview. Touch controls remain at the bottom, and indicators stay in the central playfield. Browser touch emulation cannot confirm physical screen visibility, ergonomics, thermal performance, or device touch behavior.
3. **Input replay and compatibility.** Input-change logs are compact and run through the same engine; all allocated entity IDs belong to the simulation. Hidden future state (random generator, cooldowns, ID counters) is included in hashes. Replays are tied to the simulation version and stored with only the latest local result. This is a debugging/review feature, not an authoritative score-verification service; edited state or different simulation versions can diverge. Checkpoints fail visibly instead of claiming a match.

## Browser evidence and baseline policy

Follow [Playwright's CI guidance](https://playwright.dev/docs/ci): install dependencies and browsers, run with one worker, retain traces, and upload the report even on failure. Windows compares its native desktop/mobile screenshot baselines. Linux compares separate committed baselines inside the locked Playwright Docker image, currently `mcr.microsoft.com/playwright:v1.63.0-noble`; macOS can use `npm run test:visual:docker` for that same environment. Screenshot assertions run on every OS and missing baselines fail. Regenerated candidates require visual review before acceptance. The normal deployment workflow never updates snapshots; its separate manual candidate-capture job cannot deploy.

```sh
npm ci
npx playwright install --with-deps chromium
npm test
npm run build
npm run test:e2e
```

If the browser CDN is unavailable locally, an installed Chrome can be used with `PLAYWRIGHT_CHANNEL=chrome`; report that browser separately. The default and CI use the browser from the locked Playwright version.

For concurrent local work, set `PLAYWRIGHT_PORT` to a free port. Vite uses strict port binding, so the test cannot silently run against a server on another port. CI owns its server; local runs can reuse an existing development server.

Earlier local verification on 7 October 2026, before the evaluator additions, passed: 222 unit tests, the production build (including frontend and Pages Functions typechecks), and 61 browser tests using locked Chromium on Windows. Five mobile-only cases were skipped in the desktop project and passed in the mobile project. That run owned port 5175. The later engineering additions passed six focused E2E cases across desktop and mobile, including eight axe scans. These historical counts do not describe the current suite. Final full-suite, CI and published-build evidence is tracked separately in the [release report](../reports/RELEASE-1.0.md).

## Historical Android Studio emulator verification

The simulator check passed on the earlier 7 October 2026 revision using a Pixel 5 Android Studio AVD, Android 15, and Chrome for Android 124. Tests ran inside Android Chrome through Playwright's Android API, with real OS rotation and three simultaneous browser touch pointers dispatched through CDP. This is historical emulator evidence, not a rerun of the consolidated release; physical ergonomics and hardware performance were not measured.

- Portrait: 393 x 722 CSS pixels at DPR 2.75. Landscape: 802 x 289 CSS pixels at DPR 2.75.
- Forward, right steering, and Front produced movement, rotation, and projectiles together. Releasing Front kept both helm inputs active. Cancellation cleared movement, and pause/resume froze ticks and resumed with cleared inputs.
- All touch controls fit inside the visible viewport. The test exposed a `100vh` overflow beneath Chrome's toolbar; the application now uses `100dvh`.
- No browser page errors occurred. Review the [structured report](media/android-qa.json), [portrait capture](media/android-portrait.png), and [landscape capture](media/android-landscape.png).

Reproduce with a booted Android Studio AVD that includes Chrome, the local server on port 5174, and `adb reverse tcp:5174 tcp:5174`, then run `node tools/test-android.mjs`. Set `ANDROID_SERIAL` and `ANDROID_GAME_URL` for other device/server targets. The script blocks match submission.

Remote CI and production deployment are separate gates. Changing the workflow locally does not prove a GitHub Actions run or a deployed build.
