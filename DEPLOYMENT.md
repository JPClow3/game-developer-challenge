# Published challenge build

[Play the game](https://game-developer-challenge.pages.dev) · [Public delivery repository](https://github.com/JPClow3/game-developer-challenge)

The delivered frontend uses **MSW fixtures by default in development and production**. Ranking opponents come from `src/mocks/fixtures.ts`; matches and history persist in browser storage. No database, account, API key or private service is required to evaluate the game.

Open the bottom-right **Network Lab** panel in the harbor or results screen to select an MSW network scenario. Reset Mock DB restores the initial board and success scenario. The widget stays out of the combat controls while playing.

## Build and evaluate locally

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run build
npm.cmd run preview
```

An existing `.env.local` can override defaults. Remove an old `VITE_USE_MSW=false` setting or set `$env:VITE_USE_MSW='true'` before building the challenge. The checked-in `.env.example` documents the fixture default. Serve `dist` over HTTPS or localhost so the mock service worker can start.

`npm.cmd run test:published` builds with `VITE_USE_MSW=true`, serves the optimized bundle, and checks fixture ranking, scenario selection, simulated network responses and local match persistence on desktop/mobile Chromium. It needs no backend. Install the locked browser with `npx.cmd playwright install chromium` first.

## Deliver a release through CI

Commit and push to `origin/main`. `.github/workflows/deploy.yml` runs validation and browser jobs on Ubuntu and Windows, including the built fixture frontend and the optional backend against isolated PostgreSQL. Deployment waits for those gates and builds with `VITE_USE_MSW: 'true'` explicitly.

The workflow uploads that checkout to the existing Cloudflare Pages project `game-developer-challenge`, branch `main`, and then runs the published browser checks against the public URL. Wrangler records the Git commit with `--commit-dirty=false`.

Repository variable `CLOUDFLARE_DEPLOY_ENABLED=true` enables deployment. Repository secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` authorize the upload; they are deployment credentials, not evaluator prerequisites. The token needs Pages Edit permission. Renew the configured deployment token before its October 7, 2027 expiration.

Pages uses Direct Upload with GitHub Actions supplying continuous deployment. `origin` is the public delivered fork; the original `junglegaming/game-developer-challenge` remains `upstream` for provenance. This account has read-only upstream access.

For a deliberate manual release, `npm.cmd run deploy` refuses an uncommitted tree, builds with mocks, and uploads the committed checkout. CI is the normal delivery path.

## Durable reports

See [reports/README.md](reports/README.md) for committed test, browser and profiling snapshots, their scope and reproduction commands. Disposable `playwright-report/`, `test-results/` and `artifacts/` remain ignored. CI artifacts complement the committed evidence; the submission does not depend on their retention period.

## Optional Neon backend

Neon and Pages Functions are an optional extension, **off in the default frontend**. To exercise it, explicitly build with `VITE_USE_MSW=false`, configure the server-only `DATABASE_URL`, apply all versioned migrations in `drizzle/`, and run Pages Functions. Never give database credentials a `VITE_` prefix.

```powershell
$env:VITE_USE_MSW='false'
npm.cmd run build
npm.cmd run dev:cloudflare
```

Use a separate database for local writes. Wrangler reads the ignored `.dev.vars`; inspect which environment it targets before testing. Drizzle migrations prefer the direct `DATABASE_URL_UNPOOLED` connection. Generate migrations with `npm.cmd run db:generate` and apply them with `npm.cmd run db:migrate` after loading the intended connection into the shell.

Classic backend ranking uses a server-issued voyage and anonymous HttpOnly browser session. `/api/match` reruns a bounded replay with canonical rules, validates its ending, score, duration and elapsed time, and supplies the timestamp. Migration `0001_vengeful_reavers.sql` adds sessions, tickets and verified results. `0002_productive_cloak.sql` adds issued difficulty/map and labels legacy rows Classic. Both were validated on an isolated Neon branch and applied to the hosted main database on 8 October 2026. Legacy rows remain in history but are excluded from competitive ranking. Replay reproducibility does not establish that a human played.

The isolated PostgreSQL tests execute production endpoint code and migrations without Neon credentials. Hosted schema and endpoint acceptance is recorded in [release evidence](reports/RELEASE-1.0.md). Physical-device performance remains separate from browser emulation. Direct requests made outside an MSW-controlled browser, such as curl to `/api/ranking`, address the optional Functions backend and do not represent the fixture board shown to evaluators.
