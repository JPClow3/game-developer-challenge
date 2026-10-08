# Harbor artwork source

Selected models from [Kenney Pirate Kit 2.1](https://kenney.nl/assets/pirate-kit), released 17 February 2026. The supplied `kenney_pirate-kit.zip` is the source. The original CC0 license is retained in [License.txt](License.txt).

The menu's departure vignette uses six models: `ship-pirate-medium`, `structure-platform-dock`, `patch-sand`, `palm-detailed-bend`, `rocks-sand-a`, and `barrel`, with their shared `Textures/colormap.png`. The barrels reuse one model. The remaining kit assets are deliberately excluded.

Rebuild from the repository root with `npm run assets:harbor` after installing dependencies and Playwright Chromium (`npx playwright install chromium`). The art direction lives in `tools/harbor-scene.mjs`; `tools/render-harbor.mjs` renders it locally with Three.js and writes two transparent WebP images to `public/assets/harbor/`.

Three.js and Sharp are development dependencies for this offline step. Players receive only the baked images. The source models stay outside `public/`, and the normal application build does not run the artwork tool or include its renderer.
