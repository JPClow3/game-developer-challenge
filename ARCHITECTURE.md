# Pirate Battle — Architecture & Technical Design Document

This document outlines the technical design, architectural patterns, simulation dynamics, rendering pipeline, network data layer, and persistence mechanisms of the **Pirate Battle** application.

---

## 1. High-Level Architecture Overview

Pirate Battle is architected with a strict decoupling between:
1. **PixiJS Combat Simulation Engine (`src/core/`):** Runs a deterministic, fixed-timestep physics loop (`dt = 1/60s`) managing kinematics, obstacle collisions, AI state machines, and weapon salvos.
2. **Visual Rendering Layer (`src/pixi/`):** Canvas-based hardware-accelerated rendering using PixiJS v8, interpolating entity transforms and displaying health bars, damage deterioration, projectiles, and particle VFX.
3. **React Interface & Navigation (`src/ui/`):** Declarative UI layer managing menus, options modals, HUD overlay, pause dialogues, and result screens.
4. **Data Layer & Cloud Deployment (`src/api/`, `src/db/`, `functions/api/`):** Axios and TanStack Query client layer with offline persistence (`localStorage`), simulated through MSW in dev/test, and backed in production by **Cloudflare Pages Functions** and **Neon Serverless PostgreSQL** via Drizzle ORM.

```
+-------------------------------------------------------------------------+
|                              React UI Layer                             |
|  (MainMenu, OptionsModal, MatchHUD, PauseModal, ResultScreen, MSW UI)   |
+------------------------------------+------------------------------------+
                                     | Event Subscriptions (10 Hz)
+------------------------------------v------------------------------------+
|                         SimulationBridge / Hooks                        |
+------------------------------------+------------------------------------+
                                     |
+------------------------------------v------------------------------------+
|                 PixiJS Rendering Viewport (PixiGame)                   |
|   (Ocean background, Islands, Ships with damage tiers, Cannonballs, VFX) |
+------------------------------------+------------------------------------+
                                     | Runs Ticker (60 FPS)
+------------------------------------v------------------------------------+
|                     GameSimulation (Core Engine)                        |
|  - Fixed timestep accumulator (dt = 1/60s, maxSubSteps = 5)             |
|  - ShipKinematics (hydrodynamic keel drag, bilateral steering)          |
|  - WeaponSystem (frontal 1-shot & lateral 3-shot broadside salvos)      |
|  - AI Subsystems (Chaser pursuit & detonation, Shooter standoff fire)   |
|  - CollisionSystem (dual-disk capsule vs island polygons & arena bounds)|
|  - Spawner (safe perimeter distance, island clearance)                  |
+------------------------------------+------------------------------------+
                                     | Completed Match
+------------------------------------v------------------------------------+
|                      Data & Persistence Layer                           |
|  - PendingSubmissionQueue (localStorage persistent queue & deduplication)|
|  - Axios + TanStack React Query (cache, background revalidation)        |
|  - MSW Service Worker (offline mocks & fault-injection scenarios)       |
|  - Cloudflare Pages Functions (/api/*) + Neon Serverless PostgreSQL    |
+-------------------------------------------------------------------------+
```

---

## 2. PixiJS & Simulation Loop Design

### 2.1 Fixed-Timestep Accumulator Pattern
To eliminate frame-rate dependencies across diverse client refresh rates (60 Hz, 120 Hz, 144 Hz) and mobile screens:
- Real delta time is accumulated into `accumulator`.
- Clamped with `maxAccumulator = 0.25s` to prevent the spiral of death during background tab throttling.
- Physics executes in exact discrete slices:
  $$\Delta t = \frac{1}{60} \approx 0.01667 \text{ s}$$
- Up to `maxSubSteps = 5` iterations are processed per animation frame.
- An alpha factor $\alpha = \frac{\text{accumulator}}{\Delta t}$ is computed to support smooth sub-frame interpolation.

### 2.2 Decoupled React Bridge
Updating React components at 60 frames per second causes severe DOM reconciler overhead and frame drops.
- **Solution:** The simulation runs independently on the Pixi ticker.
- A throttled subscriber (`MatchHUD`) queries snapshot metrics at 10 Hz (every 100ms) or upon discrete state transitions (`match_ended`, `match_paused`).
- The React component tree remains idle while PixiJS handles the GPU render loop.

---

## 3. Kinematics, Weapons & Collision Physics

### 3.1 Hydrodynamic Kinematics (`ShipKinematics.ts`)
Naval vessels simulate hydrodynamic resistance:
- **Longitudinal Drag ($d_L = 0.95 \text{ s}^{-1}$):** Resistance against forward thrust.
- **Lateral Keel Damping ($d_T = 5.5 \text{ s}^{-1}$):** High sideways resistance representing the ship's keel cutting through water, eliminating unrealistic drift while enabling authentic drift turns.
- Bilateral rudder steering with angular velocity dampening.
- Forward propulsion and steering execute concurrently with all weapon discharges.

### 3.2 Weapon Systems (`WeaponSystem.ts`)
- **Frontal Cannon:** 1 cannonball fired along vessel heading; cooldown $0.60\text{s}$, damage 25 HP.
- **Port & Starboard Broadsides:** 3 parallel cannonballs spaced along hull beam; cooldown $1.80\text{s}$, damage 20 HP each.
- Cooldowns are maintained independently on distinct clocks.

### 3.3 Collision Detection (`CollisionSystem.ts`)
- **Ship Hitboxes:** Dual-disk capsule collider modeling vessel bow and stern circles, avoiding expensive arbitrary polygon checks while accurately capturing long hull geometry.
- **Island Obstacles:** Circle-circle and disk-line projection with tangent sliding vectors, allowing ships to slide smoothly along shorelines without getting caught.
- **Arena Perimeter:** Boundary clamping with margin padding.
- **Single-Hit Projectile Guarantee:** Projectiles apply damage to the first target intersected and terminate immediately.

---

## 4. Artificial Intelligence Subsystems

### 4.1 Chaser AI (`ChaserAI.ts`)
- Targets player location using direct vector pursuit.
- Steering steers toward the player with maximum turn rate.
- **Detonation Rule:** Ramming into player hull detonates ship, applying 35 HP damage to player.
- **Scoring Invariant:** Suicide collision awards **0 points** to the player. Player must destroy the Chaser with cannon projectiles to claim 1 point.

### 4.2 Shooter AI (`ShooterAI.ts`)
- Maintains standoff engagement distance between 240px and 360px.
- Navigates into firing arcs, aligns heading, and discharges cannon attacks within aim tolerance.
- Reversing and flanking logic when the player closes in.

### 4.3 Safe Spawner (`EnemySpawner.ts`)
- Spawns enemy ships at configured intervals (default 3s).
- Validates spawn coordinates against:
  1. Minimum safe distance from player ($\ge 380\text{px}$) to prevent cheap unavoidable damage.
  2. Island obstacle clearances ($\ge 40\text{px}$).
  3. Arena perimeter padding.

---

## 5. Network Architecture, MSW & Cloud Deployment

### 5.1 REST API Contracts
| Endpoint | Method | Description |
|---|---|---|
| `/api/ranking` | GET | Paginated leaderboard sorted by score DESC, duration ASC, playedAt ASC |
| `/api/history` | GET | Paginated match history filtered by player ID |
| `/api/match` | POST | Idempotent match registration with deduplication |

### 5.2 Idempotency & Deduplication
Every completed match generates a client UUID v4 idempotency token (`id`).
- When sending `POST /api/match`, if the match ID already exists in the database, the backend returns HTTP 200 with the existing record and `isDuplicate: true`.
- Repeated button clicks or retried requests never produce duplicate leaderboard entries.

### 5.3 Offline Persistence & Pending Queue (`PendingSubmissionQueue.ts`)
- Completed matches are immediately persisted in `localStorage`.
- If a submission fails (network loss, 500 error, timeout), it is enqueued into `pirate_battle_pending_submissions_v1`.
- On application restart or network reconnection, the queue automatically attempts background sync.
- Players can start a new match immediately without waiting for pending sync.

### 5.4 MSW Fault-Injection Scenarios (`src/mocks/`)
Accessible via the in-game MSW scenario controller:
- `success`: Standard fast API responses.
- `empty`: Returns 0 records for empty-state UI validation.
- `slow_network`: Injects 2500ms latency.
- `out_of_order`: Simulates variable random latency to verify race-condition protection.
- `error_400`: Simulates client validation errors.
- `error_500`: Simulates internal server error with retry UI.
- `timeout`: Simulates 6000ms network timeout.
- `server_offline`: Simulates complete offline disconnect.

### 5.5 Cloudflare Pages & Neon PostgreSQL Deployment
- **Cloudflare Pages Functions (`functions/api/`):** Serverless edge endpoints handling `/api/ranking`, `/api/history`, and `/api/match`.
- **Neon PostgreSQL (`src/db/`):** Serverless PostgreSQL database managed via Drizzle ORM (`@neondatabase/serverless`).
- **Connection Configuration:** Configured via `DATABASE_URL` secret. In environments without `DATABASE_URL`, the application seamlessly routes through client-side MSW mock persistence.

---

## 6. Accessibility & Responsiveness

- **Keyboard Navigation:** Full keyboard support across menus, tab bars, and modals with visible `:focus` styling.
- **Screen Reader Support:** Semantic HTML headings, ARIA live regions for asset loading, status alerts, and HUD updates.
- **Mobile Touch Controls:** On-screen virtual helm controls (Forward, Left, Right) and cannon discharge buttons (Front, Port, Starboard) displayed on mobile viewports.
- **Viewport Scaling:** Canvas auto-scales maintaining fixed 1600x1000 aspect ratio with letterboxing/pillarboxing across all screen sizes.

---

## 7. Performance & Memory Management

- **Target:** 60 FPS in standard combat simulation.
- **Texture Reuse:** AssetLoader singletons cache WebGL textures and spritesheet frames.
- **Disposal Pipeline:** Canvas unmount cleans up ticker callbacks, event listeners, Pixi containers, and WebAudio loop nodes without leaking GPU memory across match restarts.
