# ✈ Flight Crew Fitness

A mobile-first PWA workout tracker built for pilots and flight crew — training that adapts to duty schedules, layover gyms, fatigue, and recovery instead of ignoring them.

**Live:** https://bchadcooper-create.github.io/pilot-program/
**Version:** v5.12.1 · Single-file vanilla JS, no build step · Supabase backend

---

## What It Does

**7 Mission Objectives**, each with real exercise programming behind it — not just a label:
- 🏀 Vertical Jump — explosive power and athletic performance
- 💪 Muscle Gain — bodybuilding-style hypertrophy
- 🌿 General Health — joint-friendly, sustainable long-term training
- 🔥 Weight Loss — higher-volume metabolic conditioning
- 🏋️ Chest & Shoulders — pressing emphasis, suggested default for men
- 🍑 Glute Emphasis — glute-focused programming, suggested default for women
- ⚡ Overall Strength — heavy low-rep compounds plus explosive power

The two sex-suggested objectives run on the same base exercise catalog as everything else — no duplicated workout data. A goal overlay swaps in specific exercises (e.g. Barbell Hip Thrust replaces Romanian Deadlift under Glute Emphasis) and adjusts rep targets, so there's one source of truth per exercise and no drift between versions.

**3 training environments** — Commercial Gym, Hotel Gym, Hotel Room — each with its own full exercise catalog, since a barbell rack isn't always where you are.

**Fitness levels** — Beginner, Intermediate, Advanced — cap how many exercises land in each session phase.

---

## Personalization Inputs

Every one of these has an in-app **ⓘ info button** explaining exactly what it does and why:

- **Pilot Condition (GO / MARGINAL / NO-GO)** — gates workout intensity for the day. Auto-set by Oura readiness score if connected; otherwise by a manual 1–5 self-report.
- **Injury Flag** — flag a body region (shoulder, knee, lower back, etc.) and the app auto-swaps to a known-safer alternative where one exists, or caution-flags the exercise where it doesn't. Name-based heuristic, not a medical assessment.
- **Time Available** — pick 15/30/45/60/90 minutes or a full session; warmup and cooldown are protected, accessory volume gets trimmed first.
- **Sleep Hours** — manual entry for non-Oura users, suggests Pilot Condition.
- **Age** — modest rest-period adjustment for 45+/60+ lifters; never touches volume or exercise selection.
- **Sex + Height** — drives the suggested Mission Objective and the evidence-based female hypertrophy rep scheme (+2 reps in accessory work; heavy strength work and set counts are unaffected — the research doesn't support a difference there).

---

## Oura Ring Integration

OAuth2 connection via a Supabase Edge Function (`oura-auth` — see `DEPLOY.md`). Once connected:
- Daily readiness/sleep/HRV auto-sync, sets Pilot Condition automatically
- 6-month historical import
- Trend charts for readiness, sleep score, and HRV Balance (with an explainer for what HRV Balance actually means)

---

## Tracking & Review

- **28-day rolling training calendar** — tap any day to view it, edit a completed workout, log one you forgot, or delete a session (with confirmation)
- **Progressive overload tracking** with PR detection (⭐) against full session history
- **Rest timers and stretch stopwatches** that chime once on completion (Web Audio, no sound file) — including independent LEFT/RIGHT timers for bilateral stretches
- **Exercise form guides** — tap ⓘ Guide on any exercise; falls back to a YouTube search when no guide exists yet
- **Progress photos** with pagination
- **CSV export** matched column-for-column to a companion **AI Analysis Prompt** — copy both into ChatGPT/Gemini/Claude for a real trend review; the prompt also knows what to do with an optional `.ics` flight-schedule upload for travel context
- **Post-Flight Debrief** after every session — duration, sets, volume, completion %, and any PRs hit

---

## Built for Actual Flying

- **Flight hours + water intake** tracked daily, auto-resets at midnight, hydration target scales with flight hours (FAA aircrew guidance, ~0.3L/hr)
- **Send Feedback** files a GitHub Issue directly from the app via a Supabase Edge Function — no email round-trip
- Installable PWA with offline support and automatic update detection (checks on load, every 5 minutes, and on app foreground; force-checkable by tapping the sync indicator)

---

## Tech Stack

- **Frontend:** single `app.js` file (~4,000 lines), vanilla JS, no framework, no build step
- **Backend:** Supabase — Postgres (RLS-protected per-user data), Auth, Storage (progress photos), Edge Functions (Oura OAuth proxy, GitHub feedback relay)
- **Charts:** Chart.js
- **Wearables:** Oura API v2

The Supabase anon key is baked into `app.js` (this is expected and safe for Supabase's client-side model — Row Level Security is what actually protects user data, not key secrecy). Edge Function secrets (Oura client secret, GitHub feedback token) are never exposed client-side; see `DEPLOY.md` for how those are configured.

---

## Repo Structure

```
index.html          — app shell, loads app.js
app.js               — the entire application
sw.js                — service worker (offline + update detection)
manifest.json        — PWA manifest
guides/              — exercise form guide files
feedback-submit.ts   — Edge Function: in-app feedback → GitHub Issue
index.ts             — Edge Function: oura-auth OAuth proxy
privacy.html / terms.html
DEPLOY.md            — Edge Function deployment instructions
```

---

## Troubleshooting

**App shows an old version after an update:** the update checker needs one refresh to pick up its own fix the very first time; after that, updates should apply automatically within a few minutes of being pushed. Tap the SYNCED/LOCAL indicator top-right to force a manual check.

**Offline not working:** the app has to be opened once with internet to cache itself. After that it works offline.

**Can't sign in:** check for a Supabase confirmation email (including spam).

**Oura not syncing:** confirm the connection under Profile → Oura Ring. Historical import pulls the last 6 months on demand.
