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
| Account deletion (Guideline 5.1.1(v)) | **Check needed.** There are no logins; identity is a sync key. If the key counts as an account, the app needs an in-app "delete my cloud data" that erases the D1 record for that key. Local-only users already can clear data. Not yet verified in the code |
| Privacy policy URL and App Privacy label | **To do.** The app handles body weight, food and workouts (health and fitness data) and sends it to Cloudflare when Sync is on |
| Health-data claims (Guideline 1.4, 5.1.3) | Keep "not medical advice"; no diagnosis, no weight-loss promises |
| Coach sharing | Invite links are revocable; mention what a coach can see in the privacy label |
| Metadata must match the app (Guideline 2.3) | Keep the description to shipped features |
| Support URL | **To do** |

## 6. Order of work

1. Done: icon source and generator (this file's commit).
2. Decide whether a store release is wanted at all and what the native reason for 4.2 would be.
3. Verify and, if needed, build in-app deletion of a sync key's cloud data.
4. On a Mac: add a Capacitor shell, generate icons from `assets/icon.png`, take Simulator screenshots, upload.
