# End-to-end crawler

A robot that uses Flight Crew Fitness the way a person does, then writes a
report. Run it before every release, and after any change to app.js.

    npm run e2e              # against https://flightcrew.fit
    SKIP_AI=1 npm run e2e    # same, without the paid AI calls

It signs in as the bot account (credentials in `tests/e2e/.env`, which is
gitignored; copy from the team password note), accepts the safety
disclaimer, then:

1. Visits every screen and clicks every safe control on each one.
2. Waits for the AI Coach cards on Today to settle.
3. Generates a workout and, on every exercise card: types into every set
   field, taps Add Set and Remove Set, opens Guide, opens Alternate and
   searches the catalog. Asks the AI for one substitute. Sets the Chocks.
4. Adds a medication, checks it off on Today, removes it.
5. Switches text size to Largest and checks nothing runs off the screen.

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
