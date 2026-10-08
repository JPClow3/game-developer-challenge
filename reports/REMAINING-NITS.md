# Evaluator follow-up evidence

The source commit `fc8087e` addresses the six remaining review notes:

- The performance main table contains the existing desktop reference. Both failed comparison runs remain in a linked appendix, with their original numbers and shared-machine limitations. Profiling was not rerun.
- Every gameplay E2E spec uses the automatic console-error fixture, including submission scope.
- Permanent submission rejections survive removal from the retry queue. Background sync updates the result screen, refresh restores the rejection, and the same ID is not submitted again. Up to 50 recent terminal outcomes are retained.
- PixiGame is 533 lines. Static arena scenery and stateless combat overlays have separate modules; renderer lifetime ownership stays in PixiGame.
- Lost acknowledgement immediately commits and loses the first response with a network error. Timeout waits six seconds. Both recover through duplicate acknowledgement, but their POST failure paths are distinct.
- Gameplay E2E specs contain no fixed `waitForTimeout` calls. Input, movement, rendering, resize and recovery assertions wait for observable state; pause checks exercise attempted simulation updates.

All local final gates passed on the stable source:

| Gate | Passed | Expected skips | Failures / flaky |
| --- | --- | --- | --- |
| Unit | 295 across 33 files | 0 | 0 |
| Full desktop/mobile gameplay, visual and accessibility suite | 105 | 5 desktop touch/portrait cases | 0 / 0 |
| Optional backend against isolated PostgreSQL | 4 | 0 | 0 / 0 |
| Optimized production fixture build | 12 | 0 | 0 / 0 |

Lint, frontend/functions type checks and the production build passed. The fixture-build cases cover all eleven scenarios, immediate lost-acknowledgement recovery and persistent background rejection using the actual result screen, without development globals or private services.

The [manifest](remaining-nits/manifest.json) records source provenance and counts. Structured JSON preserves the full browser and unit results. Native [fixture-build HTML](remaining-nits/published/index.html) and [backend HTML](remaining-nits/leaderboard/index.html) retain their reports and attachments. [Screenshots](remaining-nits/screenshots/) show the new rejected and duplicate-recovery result states on desktop and mobile. Earlier complete UI HTML reports remain in `ui-polish/`.

One exploratory browser run was interrupted by a Vite reload when the queue type guard was edited during execution. It is not the acceptance run above. The complete suite was restarted after source changes stopped; its final report has no failures or flaky cases.

## CI scoring follow-up

The first [Linux CI run](https://github.com/JPClow3/game-developer-challenge/actions/runs/37728962997), on `c9d05b8`, passed 104 gameplay cases and skipped the five desktop touch/portrait cases. Its weapons case failed because earlier real keyboard salvos had already earned a point: the controlled kill reached 2 while the test assumed an absolute total of 1. This was a test timing assumption, not a renderer baseline mismatch.

Source `231c0c7` freezes live ticks for the controlled scoring phase, clears unrelated combat and resets the spawn cooldown. It asserts that the target is destroyed, the score increases by exactly one, and the HUD displays the resulting total. [Ten local repetitions](remaining-nits/scoring-followup.json), five per desktop/mobile project, passed with zero failures, flaky results or retries. The [follow-up manifest](remaining-nits/scoring-followup-manifest.json) records that source and test-file digest. These supplement the earlier full local snapshot; the next complete CI run remains a separate gate.

These are local Windows results. CI checks on Windows and the pinned Linux Playwright image, deployment identity and live public-browser checks are separate release gates. No physical-phone performance claim is made.

## Windows browser capture follow-up

[CI run 37730245021](https://github.com/JPClow3/game-developer-challenge/actions/runs/37730245021) passed validation and all Linux gates (105 gameplay, 4 backend and 12 fixture-build cases). Windows passed 101 gameplay cases and skipped five, but four cases failed; deployment was blocked. Its [structured report](remaining-nits/windows-ci-before-trace-fix.json) is retained, including the failures.

The practice and legacy-options assertions completed before context teardown exceeded its 60-second budget. The pause snapshot showed the vessel had sunk during delayed browser commands. The replay trace recorded a 43.075-second resume click; both pause and replay traces included WebGL GPU readback stall warnings. These observations support reducing capture overhead, rather than treating the run as successful.

The gameplay runner now retains action/DOM traces, final screenshots and failure videos without automatically capturing a trace filmstrip on every action. The console fixture stops rendering after assertions and before browser teardown. The keyboard-only pause case freezes live ticks, and replay transport advances time explicitly while checking its controls, so slow commands cannot consume the battle or replay. Input, paused-state, exact speed/tick, restart identity and replay verification assertions remain.

[Two sequential repetitions](remaining-nits/windows-stall-followup.json) of the affected specs passed 26 cases with two expected desktop portrait skips and zero failures, flaky results or retries. The [manifest](remaining-nits/windows-stall-followup-manifest.json) records test/configuration digests and the previous CI findings. One earlier exploratory run collided with a second runner sharing the report directory and failed on a missing trace file; it is not this acceptance run. A six-case standalone replay repetition also passed. Complete CI and public deployment remain separate gates.

Reproduce with `npm ci`, `npm test`, `npm run lint`, `npm run build`, `npm run test:e2e`, `npm run test:leaderboard` and `npm run test:published`. Open the retained fixture-build report with `npx playwright show-report reports/remaining-nits/published`.
