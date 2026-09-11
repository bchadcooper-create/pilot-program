import UserNotifications
import Foundation

// MARK: - NotificationManager
//
// Schedules and manages all FCF local notifications.
//
// Notification types and their tier:
//
// FREE:
//   workout_reminder    — fires exactly 3 days after the last logged workout, 9am
//   water_reminder      — fires mid-afternoon if hydration tracking is on (2pm)
//   preflight_readiness — fires the evening before a detected flight (8pm prior day)
//
// PRO:
//   hrv_drop            — fires morning if HRV is genuinely >20% below the user's
//                          own trailing 14-day average (see scheduleNotifications()
//                          in app.js for the actual comparison — this file only
//                          ever receives the already-decided true/false)
//   layover_window      — fires ~90 min into a detected layover with no workout
//                          logged yet today and a real window before next duty
//   weekly_summary      — fires Sunday evening with the week's training recap
//
// The web app sends notification preferences via the `notifications` bridge message.
// This manager schedules local notifications based on those prefs. The actual
// hrv_drop eligibility check (is HRV genuinely below the user's own rolling
// baseline) is computed web-side before this is ever called — see
// scheduleNotifications() in app.js — since it needs Supabase history the
// native layer doesn't have. There is no separate server-push path for
// hrv_drop or weekly_summary; despite an earlier version of this comment
// describing one via an fcf-push-notify edge function, that function was
// never actually built. Everything in this file is the real mechanism, not
// a fallback for one.

class NotificationManager {

    static let shared = NotificationManager()
    private init() {}

    // ── Schedule all enabled notifications ───────────────────────────────────

    func scheduleAll(prefs: [String: Any]) {
        UNUserNotificationCenter.current().removeAllPendingNotificationRequests()

        let workoutEnabled  = prefs["workoutReminder"]  as? Bool ?? true
        let waterEnabled    = prefs["waterReminder"]    as? Bool ?? false
        let preflightEnabled = prefs["preflightCheck"]  as? Bool ?? true
        let hrvEnabled      = prefs["hrvAlert"]         as? Bool ?? false   // pro
        let weeklyEnabled   = prefs["weeklySummary"]    as? Bool ?? false   // pro

        let iso = ISO8601DateFormatter()
        if workoutEnabled {
            let fireAt = (prefs["workoutReminderDate"] as? String).flatMap { iso.date(from: $0) }
            scheduleWorkoutReminder(fireAt: fireAt)
        }
        if waterEnabled    { scheduleWaterReminder() }
        if preflightEnabled {
            let flights = prefs["upcomingFlights"] as? [[String: String]] ?? []
            schedulePreflightChecks(flights: flights)
        }
        if hrvEnabled      { scheduleHRVCheck(today: prefs["hrvToday"] as? Int, baseline: prefs["hrvBaseline"] as? Int) }
        if weeklyEnabled   { scheduleWeeklySummary() }
        // NEW (Pro) — was advertised in the upgrade comparison table but
        // never actually implemented anywhere until now.
        if let layover = prefs["layoverReminder"] as? [String: Any],
           let airport = layover["airport"] as? String,
           let fireAtStr = layover["fireAt"] as? String,
           let fireAt = iso.date(from: fireAtStr) {
            scheduleLayoverWorkoutReminder(airport: airport, fireAt: fireAt)
        }
    }

    // ── FREE: Workout reminder ─────────────────────────────────────────────
    // BUG FIX (reported: "haven't trained in 3 days" fired after as little
    // as one day). This used to be a REPEATING daily 9am trigger,
    // unconditionally rescheduled on every app boot with no actual
    // day-count check anywhere — cancelWorkoutReminder() below only ever
    // cleared it for the exact day a workout finished, with nothing to
    // correctly bring it back exactly 3 days later. Now takes the real
    // target date (computed web-side in scheduleNotifications(), from the
    // user's actual last-workout date) and schedules ONE precise one-time
    // notification for it — same pattern schedulePreflightChecks already
    // used correctly for real flight times.
    // cancelWorkoutReminder() below is no longer called from the current
    // web app (superseded by re-running the full scheduling pass instead,
    // which correctly resets the countdown) — left in place harmlessly in
    // case anything else ever needs a hard cancel without a reschedule.

    func scheduleWorkoutReminder(fireAt: Date?) {
        guard let fireAt = fireAt else { return }
        let calendar = Calendar.current
        // Date is the real, correctly-computed target day; time-of-day is
        // pinned to 9am regardless of what time fireAt's date component
        // carries — preserves the original "fires at 9am" design while
        // fixing which DAY it's allowed to be.
        var components = calendar.dateComponents([.year, .month, .day], from: fireAt)
        components.hour   = 9
        components.minute = 0
        guard let scheduledDate = calendar.date(from: components), scheduledDate > Date() else { return }

        let content = UNMutableNotificationContent()
        content.title = "Time to log a session"
        content.body  = "You haven't trained in 3 days. Even 20 minutes counts — open your plan."
        content.sound = .default
        content.userInfo = ["type": "workout_reminder", "deepLink": "today"]

        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
        let request = UNNotificationRequest(identifier: "fcf_workout_reminder",
                                            content: content, trigger: trigger)
        UNUserNotificationCenter.current().add(request) { err in
            if let err = err { print("FCF: workout reminder error:", err) }
        }
    }

    func cancelWorkoutReminder() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(
            withIdentifiers: ["fcf_workout_reminder"]
        )
    }

    // ── FREE: Water reminder ───────────────────────────────────────────────
    // Fires at 2pm daily if hydration tracking is enabled.

    func scheduleWaterReminder() {
        let content = UNMutableNotificationContent()
        content.title = "Hydration check"
        content.body  = "Dehydration at altitude hits harder than on the ground. Log your water."
        content.sound = .default
        content.userInfo = ["type": "water_reminder", "deepLink": "today"]

        var dateComponents = DateComponents()
        dateComponents.hour   = 14
        dateComponents.minute = 0
        let trigger = UNCalendarNotificationTrigger(dateMatching: dateComponents, repeats: true)
        let request = UNNotificationRequest(identifier: "fcf_water_reminder",
                                            content: content, trigger: trigger)
        UNUserNotificationCenter.current().add(request) { err in
            if let err = err { print("FCF: water reminder error:", err) }
        }
    }

    // ── FREE: Pre-flight readiness check ──────────────────────────────────
    // Fires at 8pm the evening before each detected flight.

    func schedulePreflightChecks(flights: [[String: String]]) {
        // Remove any existing preflight notifications before rescheduling
        UNUserNotificationCenter.current().getPendingNotificationRequests { requests in
            let ids = requests
                .filter { $0.identifier.hasPrefix("fcf_preflight_") }
                .map { $0.identifier }
            UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ids)

            let formatter = ISO8601DateFormatter()
            let now = Date()

            for flight in flights {
                guard let startStr = flight["start"],
                      let flightDate = formatter.date(from: startStr) else { continue }

                // Fire at 8pm the evening before
                let calendar = Calendar.current
                guard let priorEvening = calendar.date(byAdding: .day, value: -1, to: flightDate) else { continue }
                var components = calendar.dateComponents([.year, .month, .day], from: priorEvening)
                components.hour   = 20
                components.minute = 0
                guard let fireDate = calendar.date(from: components), fireDate > now else { continue }

                let origin      = flight["origin"]      ?? "your departure"
                let destination = flight["destination"] ?? "your destination"

                let content = UNMutableNotificationContent()
                content.title = "Flight tomorrow — \(origin) → \(destination)"
                content.body  = "Check your readiness score and hydration before wheels up."
                content.sound = .default
                content.userInfo = ["type": "preflight_check", "deepLink": "today",
                                    "flightStart": startStr]

                let fireComponents = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: fireDate)
                let trigger = UNCalendarNotificationTrigger(dateMatching: fireComponents, repeats: false)
                let id = "fcf_preflight_\(startStr.prefix(10))"
                let request = UNNotificationRequest(identifier: id, content: content, trigger: trigger)
                UNUserNotificationCenter.current().add(request) { err in
                    if let err = err { print("FCF: preflight notification error:", err) }
                }
            }
        }
    }

    // ── PRO: HRV drop alert ────────────────────────────────────────────────
    // BUG FIX (reported: this fired for a user whose own Oura app showed HRV
    // as completely normal). The eligibility check (is HRV actually more
    // than 20% below the user's own rolling 14-day baseline) now happens
    // web-side in scheduleNotifications() before this is ever called —
    // hrvEnabled being true already MEANS the condition is genuinely met.
    // today/baseline are passed through purely so the notification body can
    // state real numbers instead of a generic unverifiable claim.
    func scheduleHRVCheck(today: Int?, baseline: Int?) {
        let content = UNMutableNotificationContent()
        content.title = "HRV below baseline"
        if let today = today, let baseline = baseline {
            content.body = "Today's HRV balance is \(today), vs. your recent average of \(baseline). Consider scaling today's session."
        } else {
            content.body = "Your recovery score is down. Consider scaling today's session."
        }
        content.sound = .default
        content.userInfo = ["type": "hrv_alert", "deepLink": "today"]

        var dateComponents = DateComponents()
        dateComponents.hour   = 7
        dateComponents.minute = 0
        let trigger = UNCalendarNotificationTrigger(dateMatching: dateComponents, repeats: true)
        let request = UNNotificationRequest(identifier: "fcf_hrv_alert",
                                            content: content, trigger: trigger)
        UNUserNotificationCenter.current().add(request) { err in
            if let err = err { print("FCF: HRV alert error:", err) }
        }
    }

    // ── PRO: Layover workout window ─────────────────────────────────────────
    // NEW (was listed in the upgrade comparison table as a Pro feature but
    // never actually implemented anywhere — no function, no prefs flag,
    // nothing). Eligibility (currently on a layover, real time before next
    // duty, not already trained today) is fully decided web-side in
    // scheduleNotifications(), which has access to the parsed flight
    // schedule and today's logged sessions — this just fires the already-
    // computed one-time notification at the already-computed time.
    func scheduleLayoverWorkoutReminder(airport: String, fireAt: Date) {
        guard fireAt > Date() else { return }
        let content = UNMutableNotificationContent()
        content.title = "Layover window open — \(airport)"
        content.body  = "You've got time before your next duty. Good window for a session."
        content.sound = .default
        content.userInfo = ["type": "layover_window", "deepLink": "today"]

        let calendar = Calendar.current
        let components = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: fireAt)
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
        let request = UNNotificationRequest(identifier: "fcf_layover_window",
                                            content: content, trigger: trigger)
        UNUserNotificationCenter.current().add(request) { err in
            if let err = err { print("FCF: layover window notification error:", err) }
        }
    }

    // ── PRO: Weekly summary ────────────────────────────────────────────────
    // Fires Sunday at 7pm.

    func scheduleWeeklySummary() {
        let content = UNMutableNotificationContent()
        content.title = "Weekly debrief ready"
        content.body  = "Your training summary for the week is ready to review."
        content.sound = .default
        content.userInfo = ["type": "weekly_summary", "deepLink": "trends"]

        var dateComponents = DateComponents()
        dateComponents.weekday = 1  // Sunday
        dateComponents.hour    = 19
        dateComponents.minute  = 0
        let trigger = UNCalendarNotificationTrigger(dateMatching: dateComponents, repeats: true)
        let request = UNNotificationRequest(identifier: "fcf_weekly_summary",
                                            content: content, trigger: trigger)
        UNUserNotificationCenter.current().add(request) { err in
            if let err = err { print("FCF: weekly summary error:", err) }
        }
    }

    // ── Cancel all ────────────────────────────────────────────────────────

    func cancelAll() {
        UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
    }
}
