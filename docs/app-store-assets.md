# App Store assets: Daily Diet Cloud

Written 2026-10-13. Source: Apple's asset best practices page
(https://developer.apple.com/app-store/asset-best-practices/). That page gives
the rules and counts but links out for pixel sizes and character limits. The
numbers marked **(verify)** are from memory of App Store Connect and must be
re-checked on Apple's screenshot-specifications and app-preview pages before
upload.

**Status: there is no native app yet.** Daily Diet Cloud is a PWA (open in
Safari, Add to Home Screen). There is no Capacitor shell, no Xcode project and
no App Store plan on record. This file prepares the assets so the listing is
not the slow part if a store release is ever decided. Nothing here changes the
live app.

## 1. App icon

| Apple rule | Status |
|---|---|
| One design, legible from App Store size down to Spotlight and the Home Screen | The four-tile mark from `public/favicon.svg` reads at small sizes. It is a generic mark with no text |
| 1024x1024 PNG, fully opaque, square corners (Apple applies the rounded mask) **(verify)** | **Done 2026-10-13.** `node scripts/build-icons.mjs` now also writes `assets/icon.png` (1024x1024, no alpha, radius 0), viewed. The existing PWA PNGs came out byte-for-byte unchanged |
| Layered Liquid Glass icon from one design in Icon Composer (optional) | Later, Mac only. The flat 1024 PNG is accepted without it |
| Brand fit | Light ground `#f7f7fb` with blues, matching the app. A distinctive mark would help the listing stand out; owner's call |

## 2. Screenshots (up to 10; the first 3 show in search)

Specs **(verify)**: iPhone 6.9" portrait 1320x2868 (older 6.5" and 6.7" sets are
accepted if 6.9" is missing); iPad 13" 2064x2752 only if the app supports iPad.

Plan, in order. Real UI, one idea per frame, a short phrase overlay at most:

1. **Schedule** (the hook, shown in search): "Plan your day's meals"
2. **Meal with foods**, totals derived from each food's nutrition
3. **Shopping list** for the week
4. **Progress**: weight trend and coach nudge
5. **Plan your week**

Apple's rules applied:

- Real UI only. No invented features.
- Focal point centered, inside the safe area; check in App Store Connect's Preview tool.
- No prices, discounts, URLs (including the chatgpt-team.site address) or copyright symbols in a frame.
- No unverifiable claims ("lose weight fast", "#1") and no Apple recognitions. Weight-loss claims are especially risky here, and the app's own coach flags unusually fast loss; do not contradict that in marketing.
- Assets must be 4+ even though the app may rate higher.
- One consistent style across all frames.
- Use a throwaway demo day with plausible, plain data. No real weigh-ins.

How to capture: a Mac with the Xcode Simulator (iPhone 17 Pro Max for 6.9").
Without a Mac, a browser window at 440x956 CSS pixels at 3x yields 1320x2868 of
the same web UI, usable as drafts only.

## 3. App preview video (optional, up to 3)

Skip for a first submission. If added **(verify)**: 15 to 30 seconds, real UI,
strong first 3 seconds, a poster frame that works alone, no dependence on
sound, no quick cuts, no sudden loud audio, loops cleanly.

## 4. Product page text

Limits **(verify)**: name 30, subtitle 30, promotional text 170, description
4000, keywords 100 (comma separated, no spaces, do not repeat the name).

| Field | Draft | Length |
|---|---|---|
| Name | Daily Diet Cloud | 16 |
| Subtitle | Meal plans and macro tracking | 29 |
| Promotional text | Plan your meals, log what you ate and watch your weight trend. Restore everything on any phone with your sync key. | 113 |
| Keywords | diet,meal planner,macros,calorie,nutrition,weigh in,shopping list,food log | 74 |

Description (draft; describe only what ships; no prices, no URLs, no health promises):

> Daily Diet Cloud is a simple diet schedule for your phone.
>
> Lay out a day of meals on a timeline next to workouts and your weigh-in. Each meal is the sum of its foods, so calories and macros add up on their own. Save the foods you eat often, copy a day across the week, and get a shopping list that totals every food.
>
> Your data stays on your device and backs up with a sync key you control, so you can restore it on any phone. A weekly review looks at your weigh-ins and helps set next week's calories.
>
> Daily Diet Cloud is a planning and logging tool, not medical advice.

## 5. Things the page does not cover but review will check

| Item | Status |
|---|---|
| Guideline 4.2 (website in a wrapper) | **Open, and the biggest risk.** A PWA wrapped as-is is the exact case 4.2 rejects. It needs a native reason to exist (local notifications for meal reminders, HealthKit weight read/write, offline-first is already true). Decide before building a shell |
| Account deletion (Guideline 5.1.1(v)) | **Verified 2026-10-13: missing.** Nothing deletes a sync key's cloud record, and Settings has no such action. Treat the key as an account. Findings and implementation plan in 5.1 below. Not built; waiting on Emilio's go-ahead |
| Privacy policy URL and App Privacy label | **To do.** The app handles body weight, food and workouts (health and fitness data) and sends it to Cloudflare when Sync is on |
| Health-data claims (Guideline 1.4, 5.1.3) | Keep "not medical advice"; no diagnosis, no weight-loss promises |
| Coach sharing | Invite links are revocable; mention what a coach can see in the privacy label |
| Metadata must match the app (Guideline 2.3) | Keep the description to shipped features |
| Support URL | **To do** |

### 5.1 In-app deletion of a sync key's cloud data

**What the code does today (checked 2026-10-13)**

- `app/api/diet/route.ts` exports only `GET` and `PUT`. There is no `DELETE` and no
  `DELETE FROM` anywhere in the repo.
- The coach routes only flip `coach_links.status` to `revoked`
  (`app/api/coach/links/[linkId]/revoke/route.ts`). That stops a coach seeing the data
  and deliberately leaves the data and the key alone.
- The UI has no deletion. Settings (`renderSettingsScreen` in `app/DietApp.tsx`) is
  daily targets only. The Cloud Sync sheet offers Copy, Restore and Stop sharing.
- The earlier claim here that local-only users can already clear their data is not
  backed by the code: there is no clear-data action. Today the only local wipe is the
  user clearing Safari site data or deleting the Home Screen app, which also leaves
  the cloud copy in place.

**Rows stored per sync key (D1)**: `user_settings`, `daily_logs`, `daily_totals`
(derived mirror), `coach_links` (`user_key` is set once an invite is accepted).
`coach_rate_limits` is keyed by IP, not by user. The Supabase driver has the same
three diary tables plus `user_keys` from migration 0003.

**Does the sync key count as an account? Yes, treat it as one.** The app has no
sign-up screen, which is the argument for "no". Against that: the app mints a
persistent identifier for every user, stores their body weight, food and workouts
under it on a server, and lets them sign back in from another phone by presenting
it. Coach sharing hangs more identity off it. A reviewer who sees "Cloud Sync" and a
restore-by-key field will reasonably ask where deletion is, and the privacy policy
and App Privacy label need a real deletion answer regardless. Building it costs
little. Re-read Guideline 5.1.1(v) on Apple's site before submission **(verify)**; this
reading comes from memory.

**Plan (not started)**

1. **Route**: `DELETE /api/diet`, key in the `X-Sync-Key` header via the existing
   `readSyncKey`, no query-string or body fallback. Put the SQL in a new module
   (`app/delete-user-data.ts`) taking the `D1Database`, so tests can run without the
   `cloudflare:workers` import. One `db.batch` that deletes `daily_logs`,
   `daily_totals`, `user_settings` where `user_key = ?`, and closes out the key's
   `coach_links` (set `status = 'revoked'`, `revoked_at`, then null `user_key` and
   `client_label`, so no row still ties the key to a coach; the coach_id and
   timestamps remain as the audit trail). Idempotent: an unknown key returns
   `{ ok: true }`. Supabase branch: REST `DELETE ...?user_key=eq.` on the same tables
   plus `user_keys`, for driver parity.
2. **Rate limit**: reuse `enforceRateLimit` and `requestIp` from `app/coach-links.ts`,
   `delete:<ip>`, about 5 per hour, 429 on excess. Guessing a 192-bit key is not the
   threat; this stops loops and abuse. Needs `ensureCoachSchema` for the
   `coach_rate_limits` table.
3. **UI**: a "Your data" section at the bottom of the Settings screen with a
   `danger-button` "Delete my cloud data", and a one-line pointer from the Cloud Sync
   sheet. It acts immediately and is separate from Settings' Save button.
4. **Confirmation**: a sheet that says what goes (meals, weigh-ins, plan, profile,
   coach shares), that it cannot be undone, and that it erases the data for every
   device using this key. Require typing DELETE to enable the final button.
5. **Client reset after success**: this step is easy to miss. The autosave effect
   re-`PUT`s whenever `profile` or `days` change, so deleting without resetting
   re-creates the record within a second. On success: cancel the pending save
   (`setBooted(false)`, as `restoreCloudKey` does), remove `SYNC_KEY_STORAGE` and
   `${APP_STATE_PREFIX}<key>` (and any other cached keys) from localStorage, mint a
   fresh key with `makeSyncKey`, and reload fresh defaults.
6. **Other devices (decision for Emilio)**: another phone holding the same key will
   re-upload on its next edit. Options: (a) accept it and say so in the confirm text;
   (b) keep a tombstone table of SHA-256 hashes of deleted keys, have `PUT` return 410
   for them, and have the client wipe itself and rotate its key on a 410. (b) is the
   right behaviour for a deletion feature and is about 30 more lines. Hash, not the
   key, because the key is a credential.
7. **Tests** (`node --test`, repo-root `*.test.ts` files): a fake `D1Database` that
   records prepared statements and bound values, asserting every statement is scoped
   by `user_key`, the whole thing is a single batch, and an invalid or missing key
   throws before any SQL runs; the rate limiter returns 429 past the limit; the
   client reset helper returns a new key and clears the expected storage keys.
   Then by hand on `npm run dev` with local D1: write a day, delete, confirm
   `GET /api/diet` returns `profile: null, days: []`, confirm no re-upload follows.
8. **Rollout**: Claude deploys, after `git pull`, then checks the security headers are
   still on the response (CSP, HSTS, frame protection) and the other assistant's
   latest work is still live. Privacy policy gets a deletion sentence: D1 point-in-time
   history keeps a deleted row restorable for a limited window **(verify the window
   for the plan in use)**, and the policy should not promise instant erasure from it.

**Not required for this app today.** All of this only matters if a store release
goes ahead (see the Guideline 4.2 row). The PWA itself is unaffected.

## 6. Order of work

1. Done: icon source and generator (this file's commit).
2. Decide whether a store release is wanted at all and what the native reason for 4.2 would be.
3. Build in-app deletion of a sync key's cloud data (verified missing; plan in 5.1; needs Emilio's go-ahead).
4. On a Mac: add a Capacitor shell, generate icons from `assets/icon.png`, take Simulator screenshots, upload.
