# Handoff: Deployment Setup for Daily Diet Cloud

## Goal
Make the diet app accessible to users **without ChatGPT** (outside the ChatGPT
Sites workspace), via two public deployments: a free static GitHub Pages site and
a full Cloudflare Workers deployment.

## Repo
- **GitHub:** `EJRIVERA3/DIET-APP`, branch `codex/diet-cloud-app`
- **Stack:** vinext (Next 16 + React 19 on Vite), Tailwind v4, Cloudflare Workers + D1; Supabase optional.

## Live URLs
| Deployment | URL | Capability |
| --- | --- | --- |
| GitHub Pages (static) | https://ejrivera3.github.io/DIET-APP/ | Full UI, **single-device** storage (localStorage) |
| Cloudflare Workers | https://the-food-tracker-app.emilio-rivera.workers.dev | Full UI **+ cross-device cloud sync** (D1) |

> The Workers URL is tied to the Cloudflare account you deploy from. It currently lives
> on `emilio.rivera@covangroup.com` (worker `the-food-tracker-app`). The older
> `daily-diet-cloud.thedietapp.workers.dev` was a different account and is no longer updated.

## Key architectural fact (important)
The app is **local-first**. All UI is `app/DietApp.tsx` (`"use client"`) and always
persists to `localStorage`. The server route `app/api/diet/route.ts` (→ Cloudflare
D1 or Supabase) **only** adds the cross-device "Cloud Sync key" feature. When that
API is absent (e.g. on GitHub Pages), the app degrades gracefully and keeps working
per-device. This is why a static build is viable.

## What was added/changed

### GitHub Pages (static SPA build — separate from the vinext build, never interferes)
- `web-static/index.html`, `web-static/main.tsx`, `web-static/static.css` — a plain
  client-side entry that mounts `DietApp` as an SPA (fonts loaded from Google Fonts
  since `next/font` isn't used here).
- `vite.static.config.ts` — standalone Vite build. `base: "/DIET-APP/"` (override
  with `STATIC_BASE` env). Outputs to `dist-static/`. Loads root `postcss.config.mjs`
  for Tailwind.
- `.github/workflows/deploy-pages.yml` — builds `npm run build:static` and deploys to
  Pages on every push to `codex/diet-cloud-app`.
- **Repo setting required (one-time, done):** Settings → Pages → Source =
  **"GitHub Actions"**.

### Cloudflare Workers (full app)
- vinext's `npm run build` generates and **owns** the deploy config at
  `dist/server/wrangler.json` (plus the `.wrangler/deploy/config.json` redirect). A
  competing root `wrangler.jsonc` caused **duplicate `DB` bindings**, so it was removed.
- Instead, `scripts/patch-d1.mjs` injects the real D1 binding into the generated
  config after each build.
- `cloudflare.d1.json` holds the D1 details (committed; not a secret):
  - binding `DB`, name `daily-diet-cloud-db`, id `af805070-15ad-45fe-9a96-4f6a303fde73`.
- D1 schema is auto-created by `/api/diet` on first use (`ensureSchema`). Verified
  working (write+read round-trip via `backend: "d1"`).

### package.json scripts
- `build:static` — `vite build --config vite.static.config.ts`
- `preview:static` — local preview of the static build
- `deploy:cf` — `npm run build && node scripts/patch-d1.mjs && wrangler deploy`
- `lint` now also ignores `dist-static`.

### Misc
- `.gitignore`: added `/dist-static/`.
- `DEPLOY.md`: full deployment guide (source of truth).
- `.claude/launch.json`: local preview helper (Claude Code only).

## How to update each deployment
- **Pages:** just `git push` to `codex/diet-cloud-app` → the Action rebuilds and deploys.
- **Cloudflare:** run `npm run deploy:cf` (requires `wrangler login` once). To target a
  different Cloudflare account, update `cloudflare.d1.json` (or set `D1_DATABASE_ID` env).

## Gotchas encountered (so you don't repeat them)
1. **Don't add a root `wrangler.toml`/`wrangler.jsonc`** — vinext merges it into its
   generated config and creates duplicate bindings. Patch `dist/server/wrangler.json`
   post-build instead.
2. **GitHub Pages + Jekyll race:** before Source was set to "GitHub Actions", GitHub's
   built-in "pages build and deployment" (Jekyll) published the README instead of the
   app. Fixed by setting Source = "GitHub Actions" and re-triggering. Confirm the live
   page loads `/DIET-APP/assets/index-*.js` (real app), not `/assets/css/style.css`
   (Jekyll).
3. New `workers.dev` subdomains take ~5–15 min for the TLS cert to provision after
   first deploy (handshake fails until then — expected).

## Commits (on `codex/diet-cloud-app`)
- `df290b6` Add GitHub Pages + Cloudflare deployment
- `4549051` Fix Cloudflare deploy: patch D1 binding into vinext config
- `f33c0b3` Trigger Pages deploy with GitHub Actions source

---

## Status update, 2026-10-05

The deployment above is outdated in three ways:

- **Domain:** the app now serves from `food.enlightenedlifter.us`; the workers.dev hostname was turned off on 2026-09-25.
- **Security:** it had no security headers until 2026-09-28. They are added by a Worker wrapper (`server/security-headers.mjs`, wired in by `scripts/patch-deploy-config.mjs`). A deploy from a tree older than that commit would drop them silently, so `git pull` immediately before `npm run deploy:cf`. CSP still allows `'unsafe-inline'` scripts (needs a per-request nonce).
- **Priorities:** coach features are parked on purpose (owner, 2026-09-09). Work on the single-user app: the inert Help and End Current Diet items and the hardcoded Progress copy.

Added since 2026-09-08: nutrition per food and Settings, custom food library, saved meals, honest weekly progress, readable weight chart, sync key moved to the `X-Sync-Key` header with rate limits, real app icons for iPhone. See the master handoff in the Enlightened Lifter repo at `docs/HANDOFF.md` for the cross-project picture and working conventions.
