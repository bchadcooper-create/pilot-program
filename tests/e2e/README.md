# End-to-end crawler

A robot that uses Flight Crew Fitness the way a person does, then writes a
report. Run it before every release, and after any change to app.js.

    npm run e2e              # against https://flightcrew.fit
    SKIP_AI=1 npm run e2e    # same, without the paid AI calls

It signs in as the bot account (credentials in `tests/e2e/.env`, which is
gitignored; copy from the team password note), accepts the safety
disclaimer, then:

1. Gives the bot a believable profile (call sign, 44, 188 lb, muscle
   goal, nutrition targets, both trackers on).
2. Builds a four-day MobileCCI-shaped pairing anchored to today (woke in
   EUG, two legs this afternoon, overnight SEA, home day 4, then days
   off) and uploads it through the real .ics file input. Asserts the app
   reads day 2 of 4, tonight SEA, the right number of legs left, and that
   Today shows both flights. Waits on the fatigue note and the trip plan.
   The fixture is `tests/e2e/fixtures/schedule.js`.
3. Visits every screen and clicks every safe control on each one.
4. Logs water two ways (quick add, typed amount), checks the Today total,
   reloads, and checks it persisted.
5. Logs a meal: USDA search for chicken breast, adds it, saves, checks the
   Nutrition totals, the Today screen, and the AI fueling note.
6. Generates a workout and, on every exercise card: types into every set
   field, taps Add Set and Remove Set, opens Guide, opens Alternate and
   searches the catalog. Asks the AI for one substitute. Sets the Chocks.
7. Adds a medication, checks it off on Today, removes it.
8. Switches text size to Largest and checks nothing runs off the screen.

Anything that throws a JavaScript error, logs a console error, fails a
network request, leaks `undefined` / `NaN` / `[object Object]` into the
page, or leaves the app entirely becomes a finding. The run exits 1 if
there are any, so it can gate a release.

Output: `tests/e2e/report/REPORT.md` plus a screenshot per step.

What it will not catch: wrong-but-plausible coaching text, timing bugs
that depend on the real clock or the real flight schedule, and anything
that only exists inside the iOS shell (HealthKit, notifications, StoreKit).
Those still need a human on a real phone.

The bot account is `e2e-bot@flightcrew.fit`. It is on the seed domain, so
nothing it does touches the leaderboard refresh job or any real account.

## Live set feedback check

    npm run e2e:feedback     # against a local server on :4321

A short, focused run on one exercise card: types reps, then weight, and
asserts the coach's feedback appears without the rest timer, without
dropping the keyboard, and without re-rendering the screen. Also checks
it stays quiet mid-number, clears when corrected, and still works when
the timer is started. Then the same for a reps-only exercise (feedback
from reps alone, no weight advice), and that every card in the hotel
Full Body program, drawn with a shoulder flag, has as many set boxes as
its label promises, including the injury-swapped one.
