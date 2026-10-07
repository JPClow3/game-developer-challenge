# Pirate Battle — High Seas Naval Combat

> **Single-player 2D top-down naval combat web game** built with **React 18**, **PixiJS v8**, and **TypeScript** (Strict Mode).
>
> Production deployment targets **Cloudflare Pages** (static SPA frontend + Edge Functions backend) backed by **Neon Serverless PostgreSQL** via **Drizzle ORM**.

[Play the deployed game](https://game-developer-challenge.pages.dev) · [Source repository](https://github.com/JPClow3/game-developer-challenge)

---

## 1. Project Overview & Architecture Summary

**Pirate Battle** delivers high-performance 2D maritime combat directly in modern web browsers. The game cleanly decouples real-time deterministic physics simulation from hardware-accelerated WebGL rendering and declarative UI:

- **Simulation Engine (`src/core/`):** Pure TypeScript fixed-timestep accumulator loop ($\Delta t = 1/60\text{s} \approx 16.67\text{ms}$) running independent of display refresh rates. Simulates hydrodynamic keel drag, dual-circle capsule ship kinematics, island shoreline sliding vectors, and weapon salvos.
- **Rendering Viewport (`src/pixi/`):** PixiJS v8 GPU pipeline with dynamically allocated canvas lifecycle (guaranteeing zero WebGL context collisions under React 18 Strict Mode), damage deterioration visual tiers, animated cannonball trajectories, and particle blast VFX.
- **Declarative UI & Navigation (`src/ui/`):** React 18 frontend managing Main Menu, Captain's Options, HUD (throttled at 10 Hz to prevent per-frame DOM reconciliation overhead), Pause Dialog, and Result Screen.
- **Data & Resiliency Layer (`src/api/`, `src/db/`, `functions/api/`):**
  - **Client:** Axios + TanStack Query v5 with local storage offline persistence (`PendingSubmissionQueue`) guaranteeing zero duplicate match submissions.
  - **Local/Test Environment:** Mock Service Worker (MSW v2) intercepting network requests with an interactive runtime scenario switcher widget.
  - **Production Deployment:** Cloudflare Pages Functions (`/api/ranking`, `/api/history`, `/api/match`) connected to **Neon Serverless PostgreSQL** via `@neondatabase/serverless` and **Drizzle ORM**.

For an in-depth breakdown of physics math, state machines, and lifecycle management, see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 2. Quickstart & Local Setup

### Prerequisites
- **Node.js:** v18.0.0 or later (LTS recommended)
- **npm:** v9.0.0 or later

### Installation & Launch
```bash
# 1. Clone repository & install dependencies
git clone https://github.com/junglegaming/game-developer-challenge.git
cd game-developer-challenge
npm install

# 2. Start local development server
npm run dev
```

Open your browser at **`http://localhost:5173`**. The game boots immediately with asset preloading, audio synthesis unlocked, and MSW network mocking enabled.

---

## 3. Available NPM Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Starts Vite development server at `http://localhost:5173` with HMR and MSW mocking. |
| `npm run build` | Runs TypeScript strict typecheck (`tsc --noEmit`) and Vite production bundle into `dist/`. |
| `npm run preview` | Serves the production build locally for verification. |
| `npm test` | Executes all 209 Vitest unit test suites covering kinematics, weapons, AI, collisions, contracts, audio safeguards, and offline auto-sync. |
| `npm run test:watch` | Runs Vitest in interactive watch mode. |
| `npm run test:e2e` | Runs all 12 Playwright E2E challenge flows across Desktop Chromium and Mobile Chromium. |
| `npm run typecheck` | Validates TypeScript types across the entire codebase in strict mode (`tsc --noEmit`). |
| `npm run lint` | Runs code analysis and typing validation. |
| `npm run db:push` | Pushes Drizzle schema migrations directly to Neon PostgreSQL. |

---

## 4. Game Controls & HUD

### Desktop Keyboard Controls
- **Throttle Ahead:** `W` or `▲ Up Arrow`
- **Steer Port (Left):** `A` or `◀ Left Arrow`
- **Steer Starboard (Right):** `D` or `▶ Right Arrow`
- **Frontal Cannon (Single shot):** `Space` or `J` (0.60s cooldown, 25 DMG)
- **Port Broadside (3 parallel shots):** `Q` or `K` (1.80s cooldown, 20 DMG per ball)
- **Starboard Broadside (3 parallel shots):** `E` or `L` (1.80s cooldown, 20 DMG per ball)
- **Pause / Resume Game:** `P` or `Escape`

### Mobile Touch Controls
When loaded on mobile devices or viewports below `768px`, on-screen touch controls activate:
- **Left Helm D-Pad:** Forward throttle, steer left, steer right buttons.
- **Right Battery Controls:** Front Cannon, Port Broadside, and Starboard Broadside buttons with real-time recharge indicators.

---

## 5. Gameplay Balancing & Options Persistence

Centralized in `src/types/config.ts` and adjustable via the **Options Modal**:

- **Session Duration:** 60 to 180 seconds (default: 90s).
- **Enemy Spawn Interval:** 1 to 10 seconds (default: 3s).
- **Player Hull:** 100 HP max, longitudinal drag $0.95$, keel damping $5.5$.
- **Chaser Enemy:** 40 HP, ramming collision applies 35 DMG and self-destructs (awards **0 points** on suicide ram).
- **Shooter Enemy:** 60 HP, maintains standoff range (~300–450px) and unleashes frontal cannon fire every 2.0s.
- **Scoring Rule:** 1 point awarded per enemy vessel sunk by player cannon fire.

> All options are validated upon entry and persisted to `localStorage` under `pirate_battle_user_config_v1`. Changes take effect upon starting the next match without mutating an active battle.

---

## 6. MSW Network Scenarios & Fault-Injection

A floating **MSW Scenario Widget** is located in the bottom-right corner during development. Preview builds enable it only when built with `VITE_USE_MSW=true`. Production builds use the live API by default. It enables instant runtime switching between these fault-injection modes:

| Scenario | Simulated Behavior | Verification Purpose |
| --- | --- | --- |
| `success` | Instant 200/201 responses with full fixture data. | Baseline nominal operation. |
| `empty` | Returns empty array `[]` with 0 total items. | Verifies empty state banners and call-to-actions. |
| `slow_network` | Injects 2,500ms network delay. | Verifies loading spinners and UI responsiveness. |
| `timeout` | Stalls for 6,000ms and drops connection. | Verifies query timeout recovery and offline queueing. |
| `error_500` | Responds with HTTP 500 Internal Server Error. | Verifies error boundary banners and "Retry Query" buttons. |
| `error_400` | Responds with HTTP 400 Bad Request. | Verifies client parameter validation. |
| `out_of_order` | Randomized latency (200ms–1000ms). | Verifies TanStack Query sequence-safety without stale overwrites. |
| `server_offline` | Network transport error (`HttpResponse.error()`). | Verifies persistent localStorage queue and retry banners. |

---

## 7. Cloudflare Pages & Neon PostgreSQL Deployment Architecture

### Architecture
```
[ User Browser / Mobile Client ]
              |
              | HTTPS (Static SPA Assets & Assets Preload)
              v
[ Cloudflare Pages Edge CDN ]
              |
              | /api/* routing
              v
[ Cloudflare Pages Functions ] (functions/api/*.ts)
  ├── GET  /api/ranking  -> Query leaderboard ordered by score DESC, played_at ASC
  ├── GET  /api/history  -> Query player battle log with pagination
  └── POST /api/match    -> Idempotent match registration with UUID deduplication
              |
              | WebSocket / HTTP Serverless Driver (@neondatabase/serverless)
              v
[ Neon PostgreSQL Serverless Database ]
  └── Table: "matches" (id PK text, player_id varchar, score int, duration int, ...)
```

### Deployment Steps

The live deployment and repeatable CLI workflow are documented in [DEPLOYMENT.md](./DEPLOYMENT.md).

1. **Provision Neon Database:**
   - Create a project on [Neon Console](https://console.neon.tech/).
   - Copy your serverless connection string:
     ```
     postgres://<user>:<password>@<ep-id>.neon.tech/<dbname>?sslmode=require
     ```

2. **Run Schema Migrations:**
   ```bash
   export DATABASE_URL="postgres://<user>:<password>@<ep-id>.neon.tech/<dbname>?sslmode=require"
   npm run db:push
   ```

3. **Deploy to Cloudflare Pages:**
   - Connect your GitHub repository to Cloudflare Pages.
   - Build configuration:
     - **Framework preset:** `Vite`
     - **Build command:** `npm run build`
     - **Build output directory:** `dist`
   - Environment variables:
     - `DATABASE_URL`: Your Neon PostgreSQL connection string.
   - Deploy! Cloudflare Pages automatically detects `functions/api/` as serverless Edge Functions.

---

## 8. Testing & Quality Assurance

### Vitest Unit Tests
Run the comprehensive suite of 209 unit tests:
```bash
npm test
```
- **Coverage:** Kinematics math, keel drag, obstacle collision algorithms, weapon cooldown clocks, AI pursuit and standoff behaviors, config sanitization, audio manager unlocking, RFC 4122 UUID v4 compliance, and pending submission auto-sync.

### Playwright End-to-End Tests
Execute all 12 mandatory flows on headless Chromium and Mobile Chromium (Pixel 5):
```bash
npx playwright test
```
All 12 challenge flows are fully automated and verified:
1. `01_options_persistence.spec.ts`: Options modal configuration, validation bounds, and reload persistence.
2. `02_asset_loading_and_retry.spec.ts`: Asset preloading progress bar, simulated failure handling, and retry recovery.
3. `03_combat_kinematics_collisions.spec.ts`: Vessel acceleration, steering, arena boundaries, and island hull slide.
4. `04_weapons_firing_and_scoring.spec.ts`: Front cannon, port/starboard broadside salvos, cooldown tracking, and scoring.
5. `05_enemy_ai_and_spawning.spec.ts`: Chaser ramming suicide (0 pts), Shooter standoff range-keeping, and safe spawning.
6. `06_match_lifecycle_and_restart.spec.ts`: Termination by hull destruction or timer expiry, and clean restart.
7. `07_pause_blur_and_resume.spec.ts`: Manual pause, window blur auto-pause, timer freezing, and zero input buffering.
8. `08_result_screen_persistence.spec.ts`: Match metrics display and `#last-result` reload persistence.
9. `09_abandonment_and_touch_controls.spec.ts`: Abandon match discard (no history recorded) and mobile touch helm buttons.
10. `10_ranking_and_history_tabs.spec.ts`: Querying, pagination, empty states, and 500 error retry recovery.
11. `11_match_registration_and_pending_recovery.spec.ts`: Automatic registration, dual tab synchronization, and pending offline recovery.
12. `12_idempotency_and_out_of_order.spec.ts`: Resubmission deduplication and out-of-order response safety.

---

## 9. Performance & 60 FPS Profiling

- **Target:** 60 FPS at $1280 \times 720$ (Desktop) and $393 \times 851$ (Mobile).
- **Frame Delta P95:** $\le 16.9\text{ms}$.
- **Memory Stability:** Evaluated over 5 consecutive cycles of starting, playing, and restarting matches. Pixi textures and ticker callbacks are recycled cleanly; JS Heap remains steady with zero memory leakage.

---

## 10. License & Credits

- **Assets:** [Kenney Pirate Pack](https://kenney.nl/assets/pirate-pack) (Creative Commons Zero, CC0).
- **Audio:** Kenney Interface & Audio Packs (CC0).
- **Engine & Application:** MIT License.
