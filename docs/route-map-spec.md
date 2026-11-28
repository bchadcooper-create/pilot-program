# Route maps for runs and walks

Requested Nov 22 2026. Web side shipped in v5.70.0. The iPhone side is for the next build.

## What the member gets
- A street map of a run or walk, under the time and distance on the workout card.
- A "Share route with Crew" switch on that card, off by default.
- Off: the route is kept on the phone only (localStorage `fcf_routes`, newest 40). Followers see distance and time.
- On: the whole route is saved with the Crew post (table `crew_routes`) and drawn on the post. No trimming of the start or finish (owner's decision: sharing is the member's own choice).
- The owner of a post can take the map off again: post menu, "Remove the route map".
- Tapping any map opens it large, where it can be dragged and zoomed.
- A saved session with a route shows its map in the session editor.

## What the web app does today
Everything above is in app.js under "ROUTE MAPS FOR RUNS AND WALKS". It stays dormant until the iPhone app announces `FCFBridge.capabilities.healthRoute` or `FCFBridge.capabilities.routeRecorder`.

## What the next iPhone build must add

### Option 2: read the route from Apple Health (`capabilities.healthRoute = true`)
- Add `HKSeriesType.workoutRoute()` to the Health read types and ask for it with the distance types.
- Handle `healthkit.postMessage({ action: 'workoutRoute', exId, startMs, endMs })`.
  - With `startMs` and `endMs`: find the run, walk or hike workout that overlaps that window the most.
  - With both null: the latest run, walk or hike in the last 24 hours that has a route.
  - Read its `HKWorkoutRoute` samples with `HKWorkoutRouteQuery` and collect the locations.
- Reply by dispatching `fcf:healthRoute` with
  `{ exId, success: true, points: [[lat, lon, epochMs], ...], source: "Oura", activityType: "Walking", startMs, endMs }`
  or `{ exId, success: false }` when there is no route. The web app thins the points itself; send them all.
- Routes from other apps can land in Health minutes after the walk ends. "Fill from Apple Health" asks again, so a late route still arrives.

### Option 1: record the route in the app (`capabilities.routeRecorder = true`)
- Location permission "While Using the App", plus the `location` background mode so recording continues with the phone locked. iOS shows the blue location indicator while it runs.
- Start listening for a fix when a run or walk card opens, so the first point is ready when Start is tapped.
- Record only between Start and Stop on the stopwatch. Never otherwise.
- On Stop, dispatch the same `fcf:healthRoute` event with `source: "FCF"`.
- App Store review: say plainly in the review notes that location is used only to draw the member's own run or walk, only while they are timing it, and that sharing is off by default.

## Also in the next build (not route related)
- `webViewWebContentProcessDidTerminate` in ViewController.swift reloads the page. Without it, a page that iOS stopped in the background came back as a blank white screen (reported Nov 23 2026, airplane mode). Already written in the repo; ships with the build.
- Launch with Wi-Fi joined but no internet (airplane Wi-Fi not paid for) showed a white screen: the first load waited 30 seconds on a hanging connection. First load now gives up after 10 seconds of silence, and secure-connection failures from a captive Wi-Fi page also fall back to the saved copy (ViewController.swift, loadURL and isConnectivityError). Reported Nov 27 2026.

## Street map tiles
The map uses OpenStreetMap's public tile server with credit shown. Their policy allows light use and forbids heavy use without permission, so if map views grow, move to a paid tile service or draw the map with Apple Maps in the native app. The tile address is one constant, `ROUTE_TILE_URL`. Tiles are never stored by the app (sw.js passes them through).

## Not done yet
- A route attached to a workout that was saved offline is kept on the phone but not shared when the workout syncs later.
- Sharing a route after the workout has been saved (only removal is offered after the fact).
- Splits and pace charts from the route.
