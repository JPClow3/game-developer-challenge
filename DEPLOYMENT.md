# Cloudflare Pages and Neon

Live game: https://game-developer-challenge.pages.dev

Cloudflare Pages project: `game-developer-challenge`, production branch `main`.
Neon project: `crimson-fog-19762627`, branch `main` (`br-orange-wildflower-b5a8ydci`), PostgreSQL 17 in `aws-us-east-2`.

The frontend is served from `dist`. Pages Functions serve `/api/match`, `/api/ranking`, and `/api/history`. Only `/api/*` invokes Functions. `DATABASE_URL` is an encrypted production Pages secret with the pooled Neon connection. It is never embedded in the frontend.

## Deploy an update

From the project directory, using the authenticated Cloudflare account:

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run deploy
```

`deploy` typechecks the frontend and Functions, builds the production frontend, and uploads assets and Functions with Wrangler. It publishes the current local files to the `main` production branch.

## GitHub Actions

Repository: https://github.com/JPClow3/game-developer-challenge (private).

`.github/workflows/deploy.yml` validates pushes and pull requests. Automatic deployment is enabled with the repository variable `CLOUDFLARE_DEPLOY_ENABLED=true`: validated pushes to `main` deploy to this existing Pages project. Manual runs are available through Actions.

Deployment requires repository secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. The token needs Cloudflare Pages Edit permission on the deployment account. The Neon connection remains a Pages secret; GitHub does not need database credentials. Schema migrations remain a separate, deliberate operation.

The dedicated account token `game-developer-challenge-github-deploy` has Pages Write permission and expires October 7, 2027. Renew it and update the Actions secret before expiration to keep automatic deployments working.

This Pages project uses Direct Upload. GitHub Actions supplies automatic deployment without replacing the project or changing its public URL. The original `junglegaming/game-developer-challenge` remote is preserved as `upstream`; `origin` points to this private repository.

## Database migrations

The versioned Drizzle migration in `drizzle/` initializes the matches table and indexes. It has been applied to the live database. Generate additional migrations after changing `src/db/schema.ts`:

```powershell
npm.cmd run db:generate
```

Load `DATABASE_URL_UNPOOLED` from the gitignored `.env.local` into the shell before running `npm.cmd run db:migrate`. Drizzle prefers that direct connection for migrations. Do not expose either database URL with a `VITE_` prefix or commit credentials.

## Local development

`npm.cmd run dev` uses mock API responses unless `VITE_USE_MSW=false`. Production builds use the real API unless explicitly built with `VITE_USE_MSW=true`. The mock scenario widget is hidden in live builds.

To exercise Pages Functions locally, build the production frontend and run `npm.cmd run dev:cloudflare`. Wrangler loads the ignored `.dev.vars` file. The existing local file targets the live Neon database, so local API writes persist there.

The game currently uses a browser-local player identity and client-submitted scores. The deployment preserves that challenge architecture.

## Verification on October 7, 2026

Verified manual deployment ID: `8ec55950-ef45-4234-b2d4-297b80d8aba3`. Subsequent GitHub deployments can be inspected in the repository's Actions and Deployments views.

Frontend and Functions typechecks, production build, and 212 unit tests passed. Live desktop and mobile Chromium checks covered asset loading, the menu, ranking, rendered combat, match submission, and history. Automation ended the test matches through the simulation harness; this was not a complete natural-duration playthrough or a physical-device test.

Neon SQL reads confirmed the browser submissions were stored. Four concurrent submissions of one match returned one creation and three duplicate responses, with exactly one stored row. Invalid JSON shapes returned HTTP 400. Test records were removed after verification. Production dependency audit reported zero vulnerabilities.
