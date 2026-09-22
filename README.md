# Daily Diet Cloud

A mobile-first diet schedule app with daily cloud backup. You plan a day's
meals, log what you actually ate, track weigh-ins and workouts, and a Cloud Sync
key restores the same data on any phone.

## Features

- **Schedule** — a day of meals on a timeline, alongside workouts, busy blocks
  and a weigh-in. Meals can be locked so automation leaves them alone.
- **Meals are the sum of their foods** — each food carries its own calories and
  macros, so a meal's totals are derived rather than typed by hand. A meal with
  no foods yet keeps the planned target the day's macros distribute onto.
- **Custom Foods** — save the foods you eat often with their nutrition, then
  drop one into any meal and its macros come with it.
- **Copy day** — replicate a day's meals, workouts and busy blocks across other
  days, with per-part toggles. Weigh-ins are never copied; they belong to the
  day they were measured on.
- **Shopping list** — totals every food across a week, summing amounts that
  share a unit and converting between grams and ounces.
- **Plan your week** — a weekly review that looks at your weigh-ins and helps
  program the next week's calories.
- **Progress** — weight trend, and a rule-based coach that nudges on low
  protein, unrealistic targets and unusually fast weight loss.
- **Settings** — daily macro and step targets, start and goal weight, and goal
  date. Target changes apply to today forward; logged days keep what they were.
- **Coach sharing** — a coach can follow a client's log through a revocable
  invite link, without the client handing over their sync key.

## Live Site

Cloudflare Sites deployment:

https://daily-diet-cloud-emilio.covan-group-2760.chatgpt-team.site

A static build also deploys to GitHub Pages on every push to
`codex/diet-cloud-app` via `.github/workflows/deploy-pages.yml`.

The app is a PWA, so phone users can open it in Safari or Chrome and add it to
the home screen.

## Local Development

Requirements:

- Node.js `>=22.13.0`

```bash
npm install
npm run dev      # dev server on :3000
npm run lint
npm test         # node --test
npm run build
```

`npm run build:static` and `npm run preview:static` produce and serve the
static (GitHub Pages) build. `npm run deploy:cf` builds and deploys to
Cloudflare Workers.

## Data Model Notes

Two details are easy to trip over:

- **Days are keyed by local date**, not UTC (`dateKey` in `app/DietApp.tsx`).
  Writing day data directly with a UTC-derived key will land on the wrong day
  near midnight.
- **Foods logged before per-food nutrition existed** carry no macros of their
  own. On load they inherit their meal's macros, so older days keep their
  totals. See `normalizeMealFood`.

`app/day-totals.ts` deliberately mirrors `getLoggedTotals` in `app/DietApp.tsx`
— a meal counts as logged only once it has foods attached. If that rule changes
in one place, change it in the other; `day-totals.test.ts` guards it.

## Cloud Backup

The app runs on Cloudflare D1 by default and also supports Supabase. The API
chooses Supabase automatically when `SUPABASE_URL` and a server-only Supabase
secret/service key are present.

Set hosted runtime values in the hosting provider, never in Git.

## Supabase Setup

Create a Supabase project, then run the migrations in order:

```text
supabase/migrations/0001_diet_cloud.sql
supabase/migrations/0002_coach_links.sql
supabase/migrations/0003_rls_policies.sql
```

Then set these runtime environment variables:

```text
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SECRET_KEY=your-server-side-secret-key
BACKUP_DRIVER=supabase
```

Legacy Supabase projects can use `SUPABASE_SERVICE_ROLE_KEY` instead of
`SUPABASE_SECRET_KEY`. Keep secret/service keys server-side only.

## What actually protects the data

Be clear-eyed about this, because the setup looks stricter than it is.

RLS is enabled on every table, but the API connects with the **service role
key, which bypasses RLS entirely**. The policies in `0003_rls_policies.sql` are
therefore preparation, not protection — they start applying only once the app
authenticates end users and passes their JWT instead. That needs real accounts
(Supabase Auth); today identity is a sync key, so `auth.uid()` means nothing.
The migration's own header explains this at length.

So in practice the data is protected by two secrets:

- **The service/secret key**, which must never leave the server.
- **Each user's sync key** — a 192-bit bearer credential that grants full read
  and write over that user's data. It travels in the `X-Sync-Key` header, never
  a query string, since query strings land in proxy logs, server access logs,
  browser history and `Referer`. Anyone holding it has that user's account.

The browser never talks to the database directly; every read and write goes
through the server API route.

Local secrets for `wrangler dev` belong in `.dev.vars`, which is gitignored.

## Git

Work happens on `codex/diet-cloud-app`, which pushes to:

https://github.com/EJRIVERA3/The-Food-Tracker-App

```bash
git push origin codex/diet-cloud-app
```
