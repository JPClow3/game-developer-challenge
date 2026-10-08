# Performance evidence

Measured locally on 7 October 2026 (America/Sao_Paulo). All three runs completed a 180-second simulated match with seed 1337, one-second enemy spawning, scripted steering and all three batteries held. A diagnostic 10,000 HP hull prevents an early death. This is an instrumented workload, not an unmodified player voyage. No result is sent to a ranked backend.

## Reference run

| Browser / workload | Viewport, DPR | CPU rate | Simulation / wall seconds | Average FPS | p95 frame interval | Peak enemies / projectiles / total entities | 60 FPS and p95 ≤16.9 ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Installed Chrome 154.0.8037.98, desktop | 1280 × 720, 1 | 1× | 180 / 179.72 | 141.63 | 7.10 ms | 10 / 13 / 27 | Pass in this environment |

Total entities includes the player, three islands, enemies and projectiles. The total peak is sampled simultaneously, rather than adding independently observed peaks.

The desktop Chrome reference meets the local target in this environment. It does not establish a universal 60 FPS guarantee. The [comparison runs in Appendix A](#appendix-a-comparison-runs-and-limitations) include two failed measurements, with their original values and collection conditions. No new quiet-machine run is claimed.

## Machine and rendering environment

- Windows, AMD Ryzen 5 3600 (6 cores), 23.93 GiB system memory.
- Installed Chrome runs report AMD Radeon RX 7600, ANGLE Direct3D11, AMD driver 32.0.31041.1004. Full GPU metadata is retained in the JSON.
- Headless browsers, optimized Vite `--mode test` bundle. Test mode enables diagnostic globals; the published production build omits them. Profiles used the optimized bundle built before final archived-replay compatibility validation, so they are evidence of that measurement snapshot rather than an exact final-release performance guarantee.
- Mobile means a 393 × 851 CSS-pixel viewport at DPR 1. CPU throttling uses CDP `Emulation.setCPUThrottlingRate` with rate 4. It retains the desktop GPU and does not emulate phone hardware, thermals, mobile browser scheduling or real device DPR.

## Frame measurement

`tools/profile-combat.mjs` samples `requestAnimationFrame` intervals throughout combat, discards the first 120 frames and computes FPS as 1000 divided by the remaining mean interval. p95 is the 95th percentile of those intervals. These are presentation intervals, not isolated JavaScript execution times or GPU timer measurements. The simulation stays at 60 Hz while the display can present more frames through interpolation. The approximately 144 FPS desktop cadence reflects this setup, not a requirement for gameplay.

The measurement ends after 180 simulated seconds or a natural match ending, rather than truncating at 180 wall seconds. Scripted inputs keep combat active; entity peaks are sampled on each animation frame. No page errors were captured. The mobile throttled run also captured error-level console messages and recorded none. The separate E2E fixture enforces the console gate across browser tests.

## Memory trend across five exit cycles

After the measured match, each run starts and abandons five additional 2.2-second voyages. Each row is sampled after exit and forced garbage collection through CDP. A final sample follows 10 seconds idle. Forced-GC JS heap is not total browser, texture or GPU memory.

| Exit cycle | Chrome desktop heap MiB | Chrome mobile 4× heap MiB | Initial Chromium shell heap MiB |
| --- | --- | --- | --- |
| 1 | 9.097 | 9.632 | 8.314 |
| 2 | 9.320 | 9.813 | 8.556 |
| 3 | 9.397 | 9.891 | 8.627 |
| 4 | 9.477 | 9.962 | 8.699 |
| 5 | 9.532 | 10.000 | 8.738 |
| After 10 s idle | 9.532 | 10.000 | 8.738 |

Desktop Chrome grows by 0.435 MiB from cycle 1 to 5; mobile grows by 0.368 MiB. DOM nodes remain at 173 desktop / 175 mobile; listeners settle to 185 after idle. Every exited cycle has zero canvases and no attached Pixi game or simulation global. Weak references show zero retained game, application and canvas objects. One latest retired simulation remains, with its index advancing on each cycle; older simulation instances do not accumulate. This supports bounded retention over these five short cycles, not a zero-leak claim or a long-session memory guarantee. More lifecycle evidence is in [AUDIO-LIFECYCLE.md](docs/AUDIO-LIFECYCLE.md).

## Raw evidence and reproduction

- [Chrome desktop JSON](docs/performance/chrome-desktop.json)
- [Chrome mobile 4× JSON](docs/performance/chrome-mobile-4x.json)
- [Initial locked Chromium shell JSON](docs/performance/chromium-shell.json)

On PowerShell, build the optimized diagnostic bundle and keep the preview server running:

```powershell
npm run build -- --mode test
npm run preview -- --host 127.0.0.1 --port 4189 --strictPort
```

In a second terminal, run the workloads sequentially, with no other GPU browser tests running:

```powershell
$env:PROFILE_URL='http://127.0.0.1:4189'
$env:PROFILE_CHANNEL='chrome'
$env:PROFILE_OUTPUT='artifacts/performance-desktop-chrome.json'
node tools/profile-combat.mjs

$env:PROFILE_WIDTH='393'
$env:PROFILE_HEIGHT='851'
$env:PROFILE_CPU_RATE='4'
$env:PROFILE_OUTPUT='artifacts/performance-mobile-4x.json'
node tools/profile-combat.mjs
```

Omit `PROFILE_CHANNEL` to use locked Chromium; install it with `npx playwright install chromium`. `PROFILE_SECONDS` defaults to 180, `PROFILE_CYCLES` to 5 and `PROFILE_CYCLE_SECONDS` to 2.2. The script records hardware/browser metadata, timing, entities, heap, DOM/listeners and retired-object weak references. Its successful exit means the measurement completed without runtime or lifecycle-check errors; FPS and p95 acceptance must be assessed from the table, including the reported failures. Build normally with `npm run build` for publication.

## Appendix A: Comparison runs and limitations

These additional measurements are retained for reproducibility. The throttled mobile viewport exceeded the p95 target, and the initial locked headless-shell run failed both targets. They are comparison runs rather than the desktop reference above.

| Browser / workload | Viewport, DPR | CPU rate | Simulation / wall seconds | Average FPS | p95 frame interval | Peak enemies / projectiles / total entities | 60 FPS and p95 ≤16.9 ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Installed Chrome 154.0.8037.98, mobile viewport | 393 × 851, 1 | 4× | 180 / 179.80 | 70.64 | 27.80 ms | 10 / 13 / 27 | Average FPS passes; p95 fails |
| Locked Chromium 153.0.8010.12 headless shell, initial run | 1280 × 720, 1 | 1× | 180 / 182.38 | 12.74 | 100.10 ms | 10 / 14 / 28 | Fails |

Measurements ran on a shared development machine. Some validation jobs overlapped collection, including a short GPU QA invocation and limited unit testing during the mobile run. CPU/GPU load was not fully controlled. Browser choice and contention both changed, so this comparison cannot isolate their effects or attribute either failure solely to runner load. The mobile viewport retained the desktop GPU and is not physical-device evidence. All three original JSON reports remain linked above.
