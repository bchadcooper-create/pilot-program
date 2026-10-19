# Runner objective and Crew feed (spec and what shipped)

Owner request, Oct 18 2026: "Look at Strava and see how they run both the social network and the running data. There's a lot of pilots who just run. Add running as a mission objective and replicate what Strava is doing." Decision: all three phases. Clarification the same evening: the social side is for every member, not just runners.

## What Strava does (checked Oct 18 2026)

Two halves on one feed. Data: each run is an activity with distance, time, pace, splits, elevation, heart rate and a route map; from those, weekly and monthly mileage, a training log, personal records at set distances, matched runs. Social: follow people, feed of their activities, kudos, comments, photos, clubs, monthly challenges with badges, segments with leaderboards. Privacy: per-activity visibility, approved followers, a privacy zone around home. Free: logging, following, kudos, comments, clubs, challenges, basic stats. Paid ($11.99/mo or $79.99/yr): route builder, training plans, full segment leaderboards, fitness analysis.

Sources: 220 Triathlon, "What is Strava and how does it work"; trainingplan.dev, "Using Strava for training".

FCF's angle: the pilot layer Strava lacks. Crew at your base, runs on trip days, hotel gyms. No GPS or routes, so no privacy-zone problem and no segments.

## Phase 1, shipped v5.45.0: Runner mission objective

- `GOALS.runner`. Profile shows a Run Plan: goal (Just run 10 mi/wk, 5K 12, 10K 18, Half 25), run days a week (3, 4, 5), weekly miles (chips or typed, 3 to 120). Stored as `profile.runPlan {daysPerWeek, race, weeklyMiles}`.
- `runnerNext()` picks the day instead of rotating: one strength day a week (Lower Body) once a run is in and never within a day of the long run; one long run a week (4, 4, 6, 10 mi by goal) once an easy run is in; otherwise easy run. When run days are used up: shakeout note.
- Today: "This week" bar (miles vs weekly target, run days vs plan) and the day's call (Run day, Long run day, Strength day). Preflight shows an easy-run or long-run banner on the Run mission.
- Coach: `runPlan` in the fatigue context (prompt v12) and 'runner' trainingGoal in the weekly note (v8). Edge function v79.
- Oura-detected runs count as runs (they map to the Outdoor Run exercise).

## Phase 2, shipped v5.45.1: Running card on Trends

- For anyone with a run logged. Week, month and year miles. Monthly challenge: runner's weekly target x 4.3, else 25 mi; badge Monthly Miles. Last 8 weeks bars (Monday-start weeks). Best efforts at 1 mile, 5K, 10K, half: best average pace on a run at least 98% of that distance, time shown is that pace over the distance, labeled est. Recent 5 runs with pace. Badge Thirteen Point One for a 13.1 mi run.
- Honest limit: no splits or routes without GPS. Apple Health distance (build 7) improves the inputs, not this limit.

## Phase 3, shipped v5.46.0: Crew feed

For all members. Opt in; nothing is shared until a member joins.

- Ranks tab: CREW | BOARDS segment. Default CREW once joined.
- Join: call sign (same as the boards; unique, case-insensitive), home base (airport code), who sees posts (everyone, or followers only), crew rules acceptance (stored with a timestamp, required by Apple for user content). Joining shares the last 14 days of workouts so the feed is not empty.
- Posting: every saved workout (lift, walk, run) posts under the call sign with kind, title, muscle group, gym/hotel/room/bands, distance, time, pace, sets. Never an address or route; an airport code only if the member adds one. Editing a workout updates the post. Auto-post can be turned off; any post can be hidden or removed.
- Feed scopes: Following (people I follow plus me), My base, Everyone. Load more pages by time.
- Kudos (one per member per post), comments (500 chars; delete your own or any on your post), follow and unfollow, profile page with followers, following, posts, miles this month.
- Find crew: search by call sign; "Crew at <base> this month" board (month miles, sessions) with follow buttons.
- Safety: block (hides both directions everywhere, removes follows), report (post, comment or profile; stored in crew_reports, readable only by the owner via SQL), leave (deletes the profile and everything cascades).
- Data: `sql/crew_feed.sql`. Tables crew_profiles, crew_follows, crew_activities, crew_kudos, crew_comments, crew_blocks, crew_reports, all RLS. Functions crew_feed (security invoker, so RLS decides), crew_profile_counts, crew_base_board, crew_blocked, crew_follows_active. Client uses only the anon key.

Decisions made by Claude, reversible, flagged to Chad: default visibility is everyone on the feed; auto-post on by default; feed lives on the Ranks tab rather than its own tab; follows are immediate (the `pending` status exists for approval later).

## Not built yet

- Follow requests for followers-only profiles (status 'pending' and an approve button).
- Push notifications for kudos, comments and new followers (needs the APNs path, build 7 territory).
- Photos on posts (storage bucket plus moderation).
- Named clubs beyond the base board (airline, a layover city).
- Crew feed test in tests/e2e as a permanent script (the flow was verified by a scratch Playwright run against the e2e-bot account: join, post, kudos, comment, hide, base board, profile, report, leave).
- Owner moderation view for crew_reports (today: SQL).

## Testing accounts

- e2e-bot@flightcrew.fit: the browser-test account. Tests may create and remove its crew rows.
- qa.test1@flightcrew.fit: Apple's review account. Never delete or alter it (owner, Oct 18 2026).
