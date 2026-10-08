# CI steering assertion follow-up

The first combined-delivery CI run, [37716100745](https://github.com/JPClow3/game-developer-challenge/actions/runs/37716100745), passed validation and the complete Linux browser job. Windows passed 100 browser cases, skipped five desktop-only touch cases, and failed one heading assertion. Deployment was correctly skipped.

The keyboard steering test compared the final wrapped heading against zero. On the slower Windows runner, the held right key rotated the ship past the angle boundary, producing a valid negative heading. The corrected assertion checks positive angular velocity and the signed angle change between the latest two simulation ticks while the right key is held. It still requires actual clockwise motion and does not relax gameplay behavior or skip the test.

Both desktop and mobile versions of the corrected test passed locally on 8 October 2026 UTC (two passes, no failures or flaky cases, 31.3 seconds). Lint also passed. The complete CI gates run again on the follow-up commit before deployment. The snapshots in `submission/` retain their original collection provenance and are not relabeled as results from this later commit.

The follow-up [run 37717914950](https://github.com/JPClow3/game-developer-challenge/actions/runs/37717914950) passed all 101 Linux gameplay cases with five expected skips. One optional backend assertion then failed because a score of `1` made the unscoped cell locator match both the rank and score cells. The assertion now targets the first cell of the row containing the current player's `You` marker. It still requires rank 1 and accepts any legitimately verified score.

All four desktop/mobile backend cases passed locally after the locator correction, along with frontend/Functions type checks and targeted lint. The [structured report](ci-followup/leaderboard.json), native [HTML report](ci-followup/leaderboard/index.html) and [provenance](ci-followup/provenance.json) preserve this separate recheck. Run `npx playwright show-report reports/ci-followup/leaderboard` to view it.
