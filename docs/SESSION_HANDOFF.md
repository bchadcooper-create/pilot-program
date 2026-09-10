# Flight Crew Fitness (FCF) — Session Handoff

## ⚠️ Security note — do this first
The GitHub PAT used in past sessions (`ghp_AG35...`) has been pasted into chat
history multiple times and should be **rotated** (revoked + regenerated) in
GitHub settings before continuing development, per standing practice in this
project. Generate a fresh PAT and provide it to Claude at the start of the new
session — do not reuse an old one. Claude should clone the repo fresh with the
new token and never leave a stale token embedded in `git remote -v` across
sessions longer than necessary.

Supabase access does NOT require a pasted key — it's available via the
connected Supabase tool integration (project ID below) automatically in any
new chat, same as this one.

---

## Project overview
**Flight Crew Fitness** — a fitness/wellness app purpose-built for airline
pilots and flight crew. Core differentiator: deep aviation-domain integration
(workout phases named taxi/takeoff/enroute/landing, mission environment
selectors room/hotel/comm, GO/NO-GO pilot condition language, itinerary-aware
AI coaching that understands layovers and crew scheduling).

**Owner/developer:** Chad Cooper (sole dev). Claude is primary engineering
partner across the full stack.

---

## Architecture
- **Frontend:** Single large JavaScript file (`app.js`, ~11,700+ lines),
  hosted on GitHub Pages, served as a PWA. Custom domain: `flightcrew.fit`.
- **iOS wrapper:** WKWebView-based native Swift/Xcode scaffold.
  Bundle ID: `fit.flightcrew.app`. Home screen display name: "Flight Fit"
  (shortened from "Flight Crew Fitness" to avoid truncation — see
  `Info.plist`). Bridges JS↔native for StoreKit 2, Sign In with Apple,
  HealthKit, push notifications, camera.
- **Backend:** Supabase — project ID `dnxkydxbyihgsictbzjz`.
  Chad's user ID: `7e41ca46-6e00-4c54-bc3f-2e45d923fe0b`
  (email: b.chad.cooper@gmail.com) — this account has a hardcoded dev
  Pro-tier override in both `isPro()` (app.js) and the `fcf-ai-coach` edge
  function, for testing paid features before IAP is verified. **Both
  overrides must be removed together before public release.**
- **Repo:** `bchadcooper-create/pilot-program` on GitHub, deployed via
  GitHub Pages.

## Key files
- `app.js` — the entire frontend application logic
- `index.html` — app shell, CSS, script loading (Supabase SDK, Chart.js,
  html5-qrcode, then `app.js`)
- `ios-scaffold/FlightCrewFitness/` — Swift/Xcode native wrapper
  - `ViewController.swift` — WKWebView host, FCFBridge injection, message
    handler routing (haptics, storeKit, notifications, calendar)
  - `Info.plist` — bundle config, display name
- `edge-functions/` — Supabase Edge Functions (Deno/TypeScript)
  - `fcf-ai-coach/index.ts` — all AI coaching (5 modes, see below)
  - `usda-food/index.ts` — USDA FoodData Central proxy for food search
  - `fcf-food-recognition/` — photo/barcode food recognition
  - `fcf-calendar-classify/` — AI classification of calendar events into
    flight/layover/reserve
  - `fcf-push-token/` — APNs device token storage
  - `fcf-seed-users/index.ts` — **not yet deployed**, one-time admin
    utility to create realistic demo leaderboard accounts (see Pending
    Work below)

## Deployment / dev workflow
- **Web:** any `app.js` or `index.html` change → commit → push to
  `main` → GitHub Pages redeploys automatically (takes a minute or two).
  **Critical:** every `app.js` push must also bump the cache-bust query
  param in `index.html` (`<script defer src="app.js?v=TIMESTAMP">`) —
  use `date +%s` for a fresh value. This project has had repeated,
  time-consuming caching issues; always bump this without being asked.
- **Edge functions:** deployed directly via the Supabase tool
  (`deploy_edge_function`), not via git — changes to files under
  `edge-functions/` need an explicit deploy call to take effect.
- **iOS native (Swift):** requires an actual Xcode build + reinstall on
  device — nothing in `ios-scaffold/` takes effect until Chad does this
  manually (Claude has no way to trigger it remotely). **As of this
  handoff, no native Swift changes made across this entire session have
  been built/installed yet** — FCFBridge injection, WKWebView cache
  policy fix, haptics, HealthKit, Calendar, push notifications, IAP
  event listeners are all sitting in committed-but-unbuilt code.

---

## Current AI Coach system (fcf-ai-coach edge function)
Five modes, all Pro-gated (client + server-side check), sharing one
edge function:

1. **`weekly_summary`** — Progression Analytics (Trends tab). Reviews
   workout history + calendar-derived trip context. 3-sentence max,
   trainer voice, never mentions data-quality/logging mechanics to the
   user. Cached 24h server-side.
2. **`fatigue_calibration`** — Today tab, below rule-based briefing.
   2-sentence max. Uses trip day number, local-time flight schedule.
3. **`fuel_logistics`** — Nutrition tab. 2-sentence max. Local-time
   schedule + meals already logged.
4. **`trip_plan`** — Today tab, shown for multi-day trips. Day-by-day
   heavy/light training call. Cached per-trip (bounds + session count).
5. **`exercise_substitute`** — Adaptive Environment Routing, in the
   Alternate/Swap exercise sheet. Strict JSON output, feeds directly
   into the existing `swapExercise()` function.

All prompts were iterated heavily this session for: trainer voice (not
clinical), strict brevity (models kept drifting long despite
instructions — fixed by lowering `max_tokens` AND restating the length
target as the frame of the prompt, not an appended rule), never
mentioning data-quality/duplicate/timestamp mechanics to the user, and
correct local-time handling (was sending UTC, causing the AI to
misread flight times by several hours).

`callAICoach()` in app.js has a hard 20s timeout via `AbortController` —
added after the Trip Plan card was found stuck indefinitely on
"Thinking..." with no error, because the underlying `fetch()` had no
timeout at all and could hang forever on a slow/stalled request.

All four AI cards on the client render immediately with a pulsing
"Thinking..." placeholder (not `display:none` until loaded) — every
loader function explicitly hides the card on error/timeout rather than
leaving it stuck.

---

## Notable bugs fixed this session (useful context, don't re-litigate)
- **App went fully blank in every browser (Safari/Chrome/private mode):**
  root cause was `WORKOUTS.room['Stretch'] = ...` executing before
  `WORKOUTS.room = {}` was declared — a top-level statement ordering bug,
  not a caching issue. Caught via a global `window.onerror` catcher
  added to `index.html` that writes crashes directly to the screen
  (still in place, harmless, worth keeping).
- **Food description truncated at 120 chars mid-word:** `sanitizeUserText()`
  has a hardcoded `.slice(0,120)` appropriate for short fields but wrong
  for AI-generated descriptions. Fixed via a new `sanitizeUserTextLong()`
  variant (same XSS stripping, no length cap) applied at the three real
  call sites. This took many rounds to diagnose because every visual
  symptom (textarea not growing, text clipping) was a downstream
  artifact of the string already being truncated before render —
  eventually confirmed via a temporary visible diagnostic marker.
- **Rest timer:** now derives duration from actual rep count
  (1-5=strength/3min, 6-12=hypertrophy/75s, 13+=endurance/40s) instead
  of workout phase alone — was giving 12-rep postural exercises the same
  3.5min rest as heavy 3-rep lifts. Has an (i) info button explaining why.
- **Food search:** USDA `pageSize` was 15, too small for common single
  words like "chicken" to surface the generic entry over branded/odd
  results. Raised to 50. Also added `STAPLE_FOOD_BOOSTS` entries for
  common multi-word queries ("grilled chicken", "brown rice", etc.) with
  a substring-match fallback, not just exact-match.
- **Oura step count fallback:** prefers Oura, falls back to HealthKit's
  `stepsToday` only when Oura has no value at all (not a live sync
  race — a deliberate per-Chad's-direction fallback).
- **Various UX fixes:** Quick Actions (+button) now correctly says
  "Return to Workout" instead of always "Start a Workout" when a session
  is in progress; Add Your Own Exercise now has a catalog search before
  the manual-entry form; post-workout debrief routes to Trends instead
  of back to Preflight; "swipe for all sets" hint only shows when sets
  actually overflow the visible width; autoregSuggestion (post-set
  feedback) now recognizes a near-miss on increased weight as a good
  result, not a correction.

---

## Pending / not yet done
1. **Xcode build — DONE (Sep 10, 2026).** FlightCrewFitness 1.0 (2)
   uploaded to App Store Connect successfully, "Uploaded to Apple" status
   confirmed. Native features now wired in: FCFBridge, HealthKit,
   Calendar, push notifications, haptics, StoreKit/IAP. Two validation
   failures were hit and fixed along the way (both real config bugs, not
   just missing assets — see git log for full detail):
   - Missing iPad app icon sizes (167x167, 152x152) — the AppIcon catalog
     only ever covered iPhone slots; iPad support was enabled via
     UIDeviceFamily but never had matching icons. Fixed by generating
     icon_76/152/167.png from the 1024 master and adding ipad idiom
     entries to Contents.json.
   - Missing BGTaskSchedulerPermittedIdentifiers — UIBackgroundModes
     declared "processing" and "fetch" with zero implementation anywhere
     in the codebase (no BGTaskScheduler registration existed). Root
     cause was likely confusing this with the separate Sustained
     Execution entitlement (a GPU/performance setting, unrelated to
     background execution). Fixed by removing both unused modes rather
     than inventing a fake identifier to pass validation.
   IAP products (`FCFProAnnual` / `FCFProMonthly`, subscription group
   "FCF Pro") were verified as correctly configured in App Store Connect
   before this build.
   Decision (Sep 10, 2026): the dev Pro override stays permanently — it's
   correctly scoped to a single hardcoded user ID (7e41ca46-6e00-4c54-bc3f-
   2e45d923fe0b), verified against auth.users to be b.chad.cooper@gmail.com
   specifically. Chad wants his own account to always have Pro. This is
   NOT technical debt to clean up before release — do not remove it.
2. **Leaderboard seed accounts — DONE (Sep 10, 2026), auto-continuing.**
   `ADMIN_SEED_SECRET` set in Supabase dashboard, stored in Vault as
   `fcf_admin_seed_secret` (not embedded in plaintext anywhere). 6 of 10
   total seed users created so far: Mike Sorensen, Jennifer Alvarez
   (batch 0, manual), James Whitfield, Sarah Kim (batch 1), Derek Owusu,
   Amanda Ferreira (batch 2). Remaining 4 (Tom Bracken, Priya Nadella,
   Chris Delacroix, Lauren Vasquez — batches 3 and 4) create automatically
   via a daily pg_cron job (`fcf-seed-users-batch-check`, see
   `sql/seed_batches_and_cron.sql`) that calls `fcf-seed-users`; the
   function itself enforces a real 2-day gap between batches (tracked via
   the `seed_batches` table's `created_at`, not cron scheduling precision)
   and self-stops once all 10 exist — no action needed to let it finish.
   To check progress: `select * from seed_batches order by batch_number`.
   To stop early: `select cron.unschedule('fcf-seed-users-batch-check')`.
   Each account's generated password is only ever returned once in that
   batch's function response — none are logged anywhere else, and these
   accounts never need to log in.
3. **UI/UX polish pass** (reminder set, lower priority) — icon
   standardization across the app (mixed emoji/icon styles), full
   micro-animation pass (button press states, card entrance transitions).
   Most of the Gemini/Grok feedback quick-wins (spacing, eyebrow labels,
   Pro column emphasis, empty-state copy, locked badge treatment) are
   already done.
4. **Trip Plan card investigation** — added `console.log` diagnostics
   on the two non-obvious early-exit paths in `loadTripPlan()`
   (no calendar synced / trip too short) in case the card silently
   shows nothing for a trip that should qualify. Worth checking browser
   console next time this comes up, now that the 20s timeout at least
   prevents an infinite hang either way.

---

## Working style notes for whoever picks this up
- Chad is a coding beginner — prefers direct answers, minimal fluff,
  and has explicitly asked for a higher-capability model to be used
  when helpful for this kind of work.
- Chad tests primarily via the installed iOS app (WKWebView) and
  occasionally via Safari/Chrome directly on `flightcrew.fit`. Always
  ask which he's testing on if a bug report seems inconsistent with
  known code state — caching and native-build-lag have both caused
  real confusion this session, but the "just cache" explanation should
  never be the automatic first assumption once it's cheap to verify
  directly (private/incognito tab, or a visible diagnostic marker).
- When something reported doesn't match what the code should produce,
  verify with actual execution/testing before concluding "it's cached"
  — this session had one case where dismissing something as an
  unrelated/expected error masked a real bug for longer than necessary.
