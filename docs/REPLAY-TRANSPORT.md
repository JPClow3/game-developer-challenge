# Deterministic replay

Watch Replay offers 0.5x, 1x, 2x and 4x speed, elapsed/recorded duration, pause and restart. Restart disposes the old renderer and simulation before opening the same recording at normal speed. Returning to results never submits another score.

`ReplaySession.ts` owns recording and playback. Recordings contain the seed, validated config, simulation version, tick-indexed effective inputs, and hashes every 120 ticks plus the final tick. Hashes include RNG, cooldowns and entity counters as well as visible state. `CombatStep.ts` executes every original 60 Hz tick; speed changes presentation pacing. Fast playback allows up to 20 catch-up steps per frame. Unsupported speeds and requests during live battles are ignored.

The delivered engine accepts the Classic `pirate-battle-2` format. `tests/fixtures/classic-v2-before-removal.json` was recorded with the engine before the extra modes were removed. It includes steering, all cannon inputs, a short firing pulse and pause/resume, and verifies the original checkpoints at 30, 60 and 144 Hz. Prototype recordings use incompatible rulesets and are rejected.

Unit checks cover refresh rates, playback speeds, pause/resume, corruption and version validation. Browser checks cover controls, progress, restart, one remaining canvas, final verification and no duplicate submission. Run `npm test` and `npx playwright test tests/e2e/17_replay_transport.spec.ts`. Built fixture previews run without a private backend.

Local verification is separate from CI and deployed behavior. See the committed reports for the final combined delivery.
