# Fork-informed gameplay improvements

Scope authorized: implement all recommendations from the 8 October fork comparison.

Acceptance checklist:

- [x] Distinct island silhouettes and landmarks, with matching collision boundaries.
- [x] Persistent foam, readable impacts, sinking aftermath, and reduced-motion support.
- [x] Readable ship scale and offscreen awareness on mobile landscape and portrait.
- [x] Deterministic repair salvage with meaningful collection risk, expiry and pause behavior.
- [x] Gentle opening and escalating enemy pressure.
- [x] Three difficulty presets and three genuinely distinct map layouts.
- [x] Persistent personal bests, grade/progression goals and useful combat results.
- [x] Optional directional joystick, simultaneous steering/firing and input cleanup.
- [x] Obstacle route planning and line-of-sight shooter attacks, preserving attack windups.
- [x] Practice and replay remain usable; legacy recordings remain compatible.
- [x] Ranking scopes distinguish changed rules, difficulties and maps; server verification uses issued rules.
- [x] Relevant unit/integration tests, lint/typecheck/build, desktop/mobile browser flows and rendered evidence.

Implementation is isolated from concurrent robustness edits in the shared checkout. No deployment claim is made by this checklist.


Balance and behavior:

| Rules | Crew hull | Crew speed | Enemy damage | Enemy cap at finish |
| --- | --- | --- | --- | --- |
| Calm waters | 80% | 85% | 60% | 6 |
| Open sea | 100% | 95% | 85% | 10 |
| Storm fleet | 120% | 110% | 115% | 12 |

The cap starts at 3. Spawn intervals scale from 1.35 to 0.75 times the chosen base interval. Repair chance increases while below half hull. A repair restores at most 20 hull, expires after 12 active seconds, and stays in the water while the player has full hull. Pickup clocks freeze during pause.

Land consists of overlapping disks. The renderer draws their union and exposed shoreline; hull and projectile collision use those same disks. A shared 40-pixel navigation field plans around the land. Ship movement, committed charges and shooter warnings remain part of the deterministic simulation. Particle effects and camera movement cannot award points or modify physics.

Personal goals unlock the titles Seafarer, Corsair and Admiral: survive a voyage, sink five ships in one battle, and hit at least 40 percent of twenty or more projectiles. Personal bests include all leaderboard filters. They are local progress; the optional backend accepts only replay-verified scores.

Validation so far:

- 312 unit/integration tests passed, including archived Classic recordings and nine authoritative difficulty/map combinations.
- Focused desktop and mobile flows passed, including actual simultaneous CDP touch pointers, pause cleanup, report persistence and scoped ranking.
- Optional live client to isolated PostgreSQL flow passed on desktop/mobile, including rejection of forged results.
- Nine controlled scenes captured with `node tools/capture-voyages.mjs`: three maps on desktop, portrait and landscape. No page errors; foam remained bounded at 160 particles. Local render submission medians were 1.3-2.7 ms and p95 7.8-13.8 ms. This measures this desktop's emulated viewports, not a physical phone or end-to-end frame rate.
- The full desktop/mobile run exercised 112 cases: 99 passed, six device-specific cases skipped, and seven cases needed reconciliation. The remaining files were rerun successfully (25 passed, three device-specific skips) after updating the fixed-spawn label, compound-island count and landscape bearings. Desktop screenshot/accessibility interruptions during live source updates were also rerun with stable source.
- The optimized production frontend passed eight browser flows. The optional live client to isolated PostgreSQL passed four desktop/mobile flows.
- Linux visual candidates were generated in the canonical Playwright container by GitHub Actions run 37727357633, inspected, and accepted separately from Windows captures. The candidate workflow passed without deployment.
- Final native Windows visual comparisons passed on desktop and mobile without regenerating expected images. Lint, browser/Functions typecheck and production build passed.
- No hosted deployment or physical-phone acceptance is claimed.

New migration `0002_productive_cloak.sql` labels existing rows Classic and adds issued-ticket difficulty/map. Deploying the optional backend requires applying it first. The default fixture build needs no external database.
