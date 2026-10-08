# UI and UX polish evidence

The UI uses shared sea, paper and brass surfaces, consistent SVG icons, aligned dialog controls and readable numeric values. Buttons share hover, pressed and keyboard-focus feedback. Loading and retry actions expose their state; saving options and resetting fixtures confirm completion. The leaderboard wraps long captain names and keeps rank, captain and score together on small phones. Practice, replay, pause and result actions use the same hierarchy.

Desktop, portrait phone (390 px), narrow phone (320 px), and short landscape layouts were reviewed. The playfield and simulation rules remain unchanged. Reduced-motion preferences suppress decorative transitions and spinners.

Fresh evidence is retained in `ui-polish/`. Its manifest records the source digest and collection provenance. The original `submission/` and profiling snapshots retain their original provenance; profiling was not repeated for this presentation-only pass.

- Local unit tests: 292 passed.
- Local full desktop/mobile browser suite: 101 passed, five expected desktop touch/portrait skips.
- Final practice/replay follow-up: six passed, two expected desktop touch/portrait skips. These recheck the controls refined after the full suite's desktop portion.
- Optional backend: four passed against isolated PostgreSQL, without hosted Neon credentials.
- Optimized fixture-build and accessibility evidence counts are recorded in the manifest.
- Linux visual capture: [run 37723630635](https://github.com/JPClow3/game-developer-challenge/actions/runs/37723630635), source `112d1cf`, pinned Playwright v1.63.0 image. Six screenshots were reviewed before accepting them. Later refinements affect startup error feedback and practice/replay controls, outside those three capture screens.

The prior integrated delivery passed [CI and public browser verification](https://github.com/JPClow3/game-developer-challenge/actions/runs/37721566756) at `7e647bd`. The UI release has its own complete CI and deployment gate after these snapshots are committed. Local checks do not establish physical-phone performance.

To preserve a new snapshot without replacing an earlier one:

```powershell
$env:REPORT_SNAPSHOT_DIR = 'reports/ui-polish'
node tools/snapshot-reports.mjs
```
