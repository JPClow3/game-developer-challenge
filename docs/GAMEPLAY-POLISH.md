# Game presentation and combat usability

This improvement keeps the original challenge rules and the React, TypeScript, PixiJS, Axios, TanStack Query, and MSW stack. Each ship sunk by the player's attacks still awards one point; ramming deaths do not score. Collision dimensions, weapon balance, and match duration limits are unchanged.

## Player-facing changes

- A nautical harbor menu uses a brass and sea-green palette, the supplied ship art, a firing-direction diagram, enemy descriptions, and an obvious Set Sail action.
- The playfield uses the supplied Kenney ocean, sand, foliage, palm, and rock textures. Sandy shorelines match the simulation's circular island boundaries.
- Cannon trails distinguish friendly and enemy shots. Muzzle flashes, hit flashes, expanding explosions, shadows, ship wakes, and heading guides make movement and combat easier to read.
- The compact HUD shows hull integrity, ships sunk, remaining time, and weapon readiness. An opening hint introduces broadsides without covering the center of the arena.
- Touch helm buttons remain available below 768px and on devices with a coarse pointer, including landscape phones and tablets. Pointer capture handles dragging away, releasing, and cancellation. Multi-pointer state allows movement and attacks together.
- Completed and abandoned simulations release their window listeners and global debug reference. Restart creates a fresh simulation without keeping an old match alive.
- Keyboard and touch commands have separate input sources. Releasing one source preserves commands held by another. Pause, resume, and blur clear held state, including the keyboard's local key tracker.
- Menu tabs support arrow keys, Home, and End. Dialogs trap focus and restore their trigger. Visible focus styling and occasional semantic combat announcements accompany the visual interface.
- Network scenario controls remain available in menus and result screens, keeping the active combat area clear.

## Verification

- 212 unit tests passed, including independent input sources and pause cleanup.
- 42 Playwright scenarios passed across desktop Chrome and emulated Pixel 5. Two desktop-only exclusions cover touch-specific scenarios.
- The production build and strict TypeScript checks passed, including the separate Functions configuration present in the workspace.
- Six screenshot baselines cover menu, a stable rendered combat frame, and result on desktop and mobile. Landscape controls, release outside a button, keyboard pause cleanup, dialog focus, and menu-tab keyboard navigation have direct regression checks.

The Playwright server and base URL use explicit 127.0.0.1 so an unrelated IPv6 localhost listener cannot be reused. Run `npm run test:e2e` to verify the baselines; regenerate them intentionally with `npm exec playwright test -- tests/e2e/13_combat_polish.spec.ts --update-snapshots` after reviewing a visual change.

## Performance reproduction

Build the app, start the optimized preview, and run:

```sh
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
# In another terminal:
node tools/profile-combat.mjs
```

The diagnostic samples three minutes of scripted combat at 1280x720, with a one-second spawn interval, all cannons held, and protected player health so the render load continues for the full session. It blocks match submission. It then records heap and DOM counters after five play/abandon cycles and forced garbage collection. The first 120 frame samples are excluded as warm-up. Raw output is written to `test-results/combat-profile.json`.

These are local headless-browser measurements. Mobile checks use browser emulation, and the result does not establish physical-device performance or deployment status.



## Recorded local measurements, 7 October 2026

The final optimized build was profiled on Windows with an AMD Ryzen 5 3600, approximately 24 GB RAM, and headless Chrome 154.0.8037.97 at 1280x720 and DPR 1. The host reports an AMD Radeon RX 7600. Browser frame timing reflects this machine's roughly 144 Hz cadence.

| Measurement | Observed |
| --- | --- |
| Active combat duration | 180 seconds |
| Mean sampled browser FPS | 143.97 |
| p95 interval between frames | 7.0 ms |
| Peak enemies | 10 |
| Peak projectiles | 16 |
| Runtime errors | 0 |
| Remaining canvases after each exit | 0 |
| Remaining global Pixi game reference after each exit | None |

The raw three-minute run and five restart cycles are saved in `combat-profile.json`. An additional 20-cycle run is saved in `combat-profile-extended.json`. That extended run kept the DOM at 153 nodes and 179 event listeners after every exit. Garbage-collected heap increased from 6.37 MiB to 7.50 MiB, so this report does not claim a perfectly flat heap.

To investigate that increase, two Chrome heap snapshots were compared after an initial play/exit cycle and ten further cycles. Counts for the minified simulation class stayed at one, and Pixi application and renderer instance counts stayed at zero. No errors occurred during application destruction. The largest retained increases were browser compiled instruction streams (691,648 bytes), bytecode arrays (133,312 bytes), and feedback vectors (82,040 bytes), with smaller shader-string/cache growth. This supports compilation and cache warm-up as the primary cause of the observed increase; longer runs and physical-device memory behavior remain outside this local measurement.

The profiler also accepts `PROFILE_SECONDS`, `PROFILE_CYCLES`, and `PROFILE_OUTPUT` environment variables for additional diagnostic runs.
