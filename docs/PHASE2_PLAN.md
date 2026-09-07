# Phase 2 Plan — Preflight Schedule Mapping & Adaptive Environment Routing

Status: SCAFFOLD / NOT YET BUILT. This is the plan to review before implementation starts.

---

## 1. Preflight Schedule Mapping

**What it does:** Instead of a single day's briefing, look at an entire pairing (3-4 day trip)
at once and recommend which days should carry the heaviest training load and which should be
light/rest, based on report times, layover lengths, and rest requirements across the whole trip.

### What already exists to build on
- `ST.calendarEvents` — classified calendar events (flight/layover/reserve/etc.) with origin,
  destination, start/end times, already coming from the `fcf-calendar-classify` edge function
- `scheduleContextForToday()` / `currentTripContext()` — per-day schedule reasoning, but scoped
  to "today" only, not a whole trip
- `ST.sessionCache` — workout history, so the AI can see what's already been trained this trip

### What's new
1. **`getTripBounds(schedule, referenceDate)`** (client, app.js)
   Walks `ST.calendarEvents` backward and forward from a reference date to find the full
   contiguous pairing boundaries (first duty-on to last duty-off, treating gaps of 18+ hours
   as "not on a trip" / home). Returns `{ tripStart, tripEnd, days: [...] }` where each day
   entry has: date, flights that day, layover (if any) with airport + duration, duty start/end.

2. **New edge function mode: `trip_plan`** (fcf-ai-coach)
   Input: the full trip's day-by-day structure from `getTripBounds`, the user's current workout
   rotation/muscle group history, and today's date within the trip.
   Output: a short per-day recommendation — e.g. "Day 1: light/mobility only (early report,
   short overnight). Day 2: your best day for a heavy session — 14hr layover in DFW. Day 3:
   moderate — the layover's short and you land late." Same trainer voice as the other three
   prompts, same length discipline (this is a list of 3-4 one-line day calls, not an essay).

3. **UI surface: new card on Today, shown only when currently on a multi-day trip**
   "Trip Plan" card, using the same `aiCoachCard()` wrapper, teal or a new color. Shows today's
   line from the plan prominently, with the rest of the trip's days collapsed/tappable below.
   Cached per-trip (keyed by trip start+end dates) so it doesn't regenerate every day of the
   same trip — regenerate only if the trip boundaries change (schedule updated) or workout
   history changes meaningfully.

4. **Pro gate:** same pattern as the other three — client + server-side check.

### Open questions to resolve before building
- **Trip detection edge case:** reserve/on-call days don't have fixed flights — how much of a
  "trip" is a reserve period? Simplest first version: only build trip plans around confirmed
  flight pairings, skip reserve entirely (show nothing rather than guess).
- **What happens on day 1 of a trip, before any of it has happened yet?** The plan should
  probably generate as soon as the trip's schedule is visible (via calendar sync), not wait
  until the user is mid-trip.
- **Multi-leg same day vs. multi-day**: a single long duty day with 3 legs is not "day 3 of a
  trip" — trip-day boundaries need to be calendar-day boundaries, not duty-period boundaries.
  `getTripBounds` needs to be careful about this distinction (this is exactly the kind of bug
  the "legs today vs legs in sequence" fix from earlier addressed for single-day text — same
  care needed here at the multi-day level).

---

## 2. Adaptive Environment Routing

**What it does:** When the static environment-specific workout catalogs (`WORKOUTS.room`,
`WORKOUTS.hotel`, `WORKOUTS.comm`) don't fit what's actually available — no equipment at all,
an unusual hotel gym, or the user wants a specific exercise swapped — use AI to generate an
equivalent substitute that preserves the training stimulus, rather than relying only on the
fixed `ALTERNATES` lookup table.

### What already exists to build on
- `WORKOUTS[env][muscleGroup]` — pre-authored, environment-specific exercise lists (this is
  the primary system and already works well for the three standard environments)
- `ALTERNATES` — a static per-exercise substitute list, used by the manual "Alternate" button
- `swapExercise(exId, alt)` — the actual mechanism that reassigns an exercise into a workout
  phase slot and rebuilds `ST.sets` for the new input type. This is the primitive Phase 2 reuses.
- `applyInjuryFilter()` — already does automatic per-exercise substitution based on injury flags

### What's new
This is narrower in scope than it first sounds, because the static system already covers the
three declared environments well. The actual gap is:

1. **"I don't have any of this" escape hatch.** Add a 4th environment option or a modifier on
   top of the existing three: "No equipment" or "Something's not available." When selected,
   don't try to pre-author a 4th full static catalog — call the AI instead.

2. **New edge function mode: `exercise_substitute`** (fcf-ai-coach)
   Input: the exercise being replaced (name, target muscle, sets/reps, input type), a
   free-text or short-list description of what's actually available (e.g. "hotel room, no
   equipment, carpeted floor" or "resistance bands only"), and the training goal.
   Output: a single substitute exercise in the same shape `ALTERNATES` entries use today —
   `{ name, target, note, inputType }` — so it can be fed directly into the EXISTING
   `swapExercise()` function unchanged. This is deliberately the smallest possible surface:
   the AI's job is only to pick a good substitute, not to touch any of the working
   sets/reps/logging machinery.

3. **UI surface:** in the exercise detail/swap sheet where "Alternate" already lives today,
   add "Don't have this either — describe what I've got" as a fallback when the static
   `ALTERNATES` list doesn't have a good option (or always available as a secondary choice).
   Free-text input, one AI call, one exercise back, user accepts or tries again.

4. **Pro gate:** same pattern.

### Explicit non-goals for this phase
- Not rebuilding the environment selector UX (room/hotel/comm stays as-is)
- Not making AI substitution the default path — the static catalogs remain primary and free;
  AI substitution is the Pro-only fallback for the genuinely uncovered case
- Not attempting whole-workout AI regeneration — one exercise in, one exercise out, reusing
  the exact same `swapExercise()` call the manual Alternate button already uses

---

## Build order

1. `getTripBounds()` — pure function, testable without any AI call, do this first
2. `trip_plan` edge function mode + prompt
3. Trip Plan card on Today tab
4. `exercise_substitute` edge function mode + prompt (smaller, can happen in parallel with #2-3)
5. "Describe what I've got" UI entry point in the exercise swap sheet

Both edge function modes get added to the SAME `fcf-ai-coach` function (just two more entries
in the `PROMPTS` object and `MAX_TOKENS_BY_MODE`), not a new function — no reason to duplicate
the auth/Pro-gate/CORS boilerplate a fifth time.
