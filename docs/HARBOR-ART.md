# A harbor, ready for departure

The Pirate Kit is used in the menu's open heading area: a single pirate ship moored beside a short dock, with a small sandy shore, a palm, rocks, and two supply barrels. The scene gives “Set Sail” a physical setting without expanding the combat's visual vocabulary or filling the screen with unrelated props.

The angled 3D view is appropriate for this quiet departure moment. The existing top-down combat ships and cannon diagram remain consistent with what players see and control at sea. Switching the whole renderer would change aiming, occlusion, mobile performance, and the challenge's 2D presentation for little gameplay benefit.

The composition is baked into transparent WebP images with warm light and muted sea colors. Desktop uses the spare space beside the title. Portrait phones place a smaller image beside a two-line title. Small phones and short landscape screens omit the decoration to preserve action space. The artwork adds no motion, focus targets, canvas, model loading, or render loop; an unavailable image leaves the menu actions usable. Ranking and history omit it to prioritize records.

Source provenance, the original CC0 license, and reproducible rendering instructions are retained in [assets/pirate-kit](../assets/pirate-kit/README.md). Only the two baked images are served to players. Three.js and Sharp are development tools, and the normal build requires no artwork generation.

## Local verification, 7 October 2026

- Artwork generation completed with no missing model or texture requests. Outputs are 1200×600 (104,372 bytes) and 600×300 (40,338 bytes).
- Strict frontend/Functions TypeScript checks and the production build passed. The production output contains no GLB files or Three.js loader/camera code.
- All 222 unit tests passed. Five relevant Playwright suites passed 28 desktop/mobile scenarios, with two expected desktop skips for touch/portrait checks. Harbor, combat, and result screenshot comparisons passed after refreshing the menu artwork baselines.
- Rendered review at 1280×720, 393×727, 320×568, 768×1024, 851×393, and 600×700 found no horizontal overflow. Set Sail stays fully visible at all six sizes. Each viewport exercised options, ranking/history navigation, the complete practice voyage, movement/firing, abandonment, and returning to a menu with no canvas left over.
- Browser checks recorded no unhandled page errors or runtime 3D model requests. Blocking the artwork requests still allowed combat to start, including with reduced motion enabled.

These are local browser and build results. This art pass does not publish a deployment or establish physical-device performance.
