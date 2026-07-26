# Flight Crew Fitness — Continuity Handoff

Generated because the prior chat hit its attachment limit. Everything here
is verified against the live repo as of the moment this was written, not
recalled from memory.

## What this is

Flight Crew Fitness (FCF) — a single-file vanilla JS PWA for pilots, built
by Chad (an E75 Captain, sole developer, non-programmer working through
Claude). Live at **flightcrew.fit**, launched to 2,000+ pilots in a
Facebook group. No build step — `app.js` is one file, deployed via GitHub
Pages.

## Repo & infrastructure facts (verified, not recalled)

- **GitHub repo:** `https://github.com/bchadcooper-create/pilot-program.git`
- **Latest commit as of this handoff:** `f48ece4`
- **Current version:** `v5.19.46` (set in two places, always kept in sync —
  see "Version bump pattern" below)
- **Supabase project ref:** `dnxkydxbyihgsictbzjz`
- **File sizes:** `app.js` ~8,330 lines, `index.html` ~258 lines, `sw.js` 71 lines
- **SQL files:** `sql/meal_logs.sql` (confirmed run in Supabase)
- **Edge functions:** `edge-functions/usda-food/index.ts` — needs Supabase
  secret `USDA_API_KEY` (already deployed and working)
- **Test suite:** `test/test_overlays.js`, 488 assertions, **now committed
  to the repo** (see security/continuity note below for why this mattered)

## ⚠️ Security note — read this first

Throughout the prior session(s), a **GitHub PAT was pasted in plaintext
into many tool calls** to authenticate `git push` (pattern: temporarily
`git remote set-url` with the token embedded, push, then reset the remote
back to the clean HTTPS URL). This PAT has been sitting in plaintext across
dozens of conversation turns for an extended period. Memory notes flagged
this PAT for revocation once already, and it does not appear to have
happened — the same token was still in active use as of this handoff.

**Recommend Chad revokes the current PAT and generates a fresh one before
the next session**, providing it fresh in the new chat rather than it
persisting across sessions indefinitely. Do not write the actual token
into any file that gets downloaded or committed.

**→ First thing to do in the new chat:** paste your current GitHub PAT as
a plain message when Claude needs to push (same as this session's
workflow). If you haven't rotated it yet, this is also the moment to do
that — revoke the old one at GitHub → Settings → Developer settings →
Personal access tokens, generate a new one, and paste that instead.

## Continuity note — why a test file got committed today

`test/test_overlays.js` had lived only in the sandbox's `/tmp` directory
for the entire prior session (488 assertions accumulated one bug fix at a
time). It was **never part of the repo** until this handoff. Its own header
comment reveals this already happened once before — an earlier ~400-test
version was lost to a sandbox reset. It's now committed specifically so a
third loss can't happen. See `test/README.md` for how to run it.

## Standard workflow (established over many sessions, keep following it)

1. `git pull origin main` first, always — never assume local state is current.
2. Make the code change with `str_replace` or targeted Python `open()`/`write()`.
   **View the file immediately before editing** — str_replace's `old_str`
   must match exactly, and stale views cause silent wrong-location edits.
3. `node --check app.js` after every edit.
4. Add or update tests in `test/test_overlays.js` for the actual change —
   not just happy-path, but the specific bug/scenario reported.
5. Rebuild the combined test file and run it (see `test/README.md` for the
   exact snippet) — **under both `TZ=America/Phoenix` and no TZ set**.
   Several real bugs this session were timezone-dependent and invisible
   under only one of the two.
6. Bump `FCF_VERSION` in `app.js` AND the matching `// Version:` comment +
   `CACHE` constant in `sw.js` — these must move together or the service
   worker won't correctly invalidate old caches.
7. Commit with a detailed message (the commit log doubles as documentation
   — write it for a future reader, not just as a changelog entry).
8. Push using the temporary-remote-URL-with-token pattern, then immediately
   reset the remote back to the clean URL (never leave the token embedded
   in `.git/config`).

## Architecture map (current, high-level)

**Navigation:** 4 bottom tabs — Today, Trends, Ranks, **+** (quick actions
sheet) — plus a hamburger menu (top-left) for everything else (Profile,
Devices, Badges [standalone], Data & Import/Export, Nutrition Log detail).
Preflight and Flight are reachable via action (not permanent tabs) and both
show a "← Back to Today" affordance since they're no longer always-visible.

**Today tab** (`renderToday`, `getTodayContext`, `buildTodayBriefing`):
a rules-based (not AI-based — deliberately, for cost/offline/latency
reasons) daily briefing. Priority-ordered rules: mid-duty > low readiness >
nap-recovery detected > long duty yesterday > already trained > real
free-window > tight window > evening-before-early-report > no-duty-today >
generic fallback. Trip-aware duty tracking (`currentTripContext`) partitions
the full flight schedule into continuous duty periods — handles legs that
cross midnight correctly, which calendar-day-bounded logic did not.
Hydration status/advice are time-of-day-paced (`hydroPacedTarget`), not a
flat fraction of the full day's target — 6am with 0L consumed reads as
"too early to judge," not an alarming deficit.

**Nutrition:** USDA FoodData Central search (edge function) +
`STAPLE_FOOD_BOOSTS` (curated regex map boosting plain versions of common
foods above branded/processed noise) + manual entry fallback. Goals
(`calculateNutritionTargets`) use Mifflin-St Jeor with hard safety
guardrails (`enforceNutritionGuardrails` — never below BMR, min 20g fat)
applied identically whether a target was calculated or manually typed in.

**Ranks:** at-a-glance summary (top-3 across marquee lifts + running,
parallel-fetched) plus badges grid plus the full filterable board.

**Badges:** `BADGES` array with `check:` functions run against
`computeBadgeStats`. Raising a threshold doesn't revoke already-earned
badges — `awardBadges` only checks forward.

## Known pending items (as of this handoff)

- Anthropic API account for photo-based food recognition — Chad was given
  setup instructions this session; not yet built. This is the agreed next
  major feature once the account exists (photo → identify → confirm → log).
- Full MyFitnessPal-style visual density pass on Trends' biometric charts —
  the calendar relocation and Fuel Trends card shipped, but the older
  chart-based cards weren't restyled to match Nutrition/Today's density.
- Welcome email on signup, 7-day inactivity reminder email — mentioned in
  earlier memory, not confirmed done in this session's work.
- Nap-recovery detection is in-memory only for the current app session, not
  persisted across app closes — a known, documented limitation, not a bug.

## If picking this up in a fresh chat

Search past conversations for `Flight Crew Fitness` or `FCF` — full session
transcripts exist back through early July 2026 and are searchable even
without this file. This document exists to save re-deriving repo facts and
the current architecture from scratch, not to replace that history.
