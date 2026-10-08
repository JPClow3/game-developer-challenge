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

These are local Windows results. CI checks on Windows and the pinned Linux Playwright image, deployment identity and live public-browser checks are separate release gates. No physical-phone performance claim is made.

Reproduce with `npm ci`, `npm test`, `npm run lint`, `npm run build`, `npm run test:e2e`, `npm run test:leaderboard` and `npm run test:published`. Open the retained fixture-build report with `npx playwright show-report reports/remaining-nits/published`.
