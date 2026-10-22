# Cloudflare CI/CD

Workers Builds on `game-developer-challenge-build` tracks `main`, with root `/ci`. Both commands return to the repository root and run `node scripts/cloudflare-build.mjs` / `node scripts/cloudflare-deploy.mjs`.

The controller has no public endpoint, cron or storage bindings. It allows Cloudflare's Git integration to validate and publish into the existing Direct Upload Pages project, which cannot be converted to a Git-integrated project in place. The public URL, Pages Functions and DATABASE_URL runtime secret stay on `game-developer-challenge`.

Before publication, Cloudflare runs unit tests, lint/type/build, isolated leaderboard browser checks and published-fixture browser checks. After publication it runs the existing public browser smoke. Chromium system libraries are downloaded from the build image's official apt repositories and extracted without root, following the FATEC hosted-build helper. Windows/Linux gameplay and visual-baseline matrices remain in GitHub for pull requests and manual evidence runs; they do not run automatically again after merge.

The GitHub deployment workflow is manual emergency fallback. Never re-enable its automatic deployment while Workers Builds owns production. The build token must permit Workers Scripts Edit and Cloudflare Pages Edit in this account. No database credential belongs in the controller.
