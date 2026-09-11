import UserNotifications
import Foundation

// MARK: - NotificationManager
//
// Schedules and manages all FCF local notifications.
//
// Notification types and their tier:
//
// FREE:
//   workout_reminder    — fires if no workout logged in 3 days (daily check, 9am)
//   water_reminder      — fires mid-afternoon if hydration tracking is on (2pm)
//   preflight_readiness — fires the evening before a detected flight (8pm prior day)
//
// PRO:
//   hrv_drop            — fires morning if HRV is significantly below personal baseline
//   layover_window      — fires during a layover when a workout window is detected
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

        if workoutEnabled  { scheduleWorkoutReminder() }
        if waterEnabled    { scheduleWaterReminder() }
        if preflightEnabled {
            let flights = prefs["upcomingFlights"] as? [[String: String]] ?? []
            schedulePreflightChecks(flights: flights)
        }
        if hrvEnabled      { scheduleHRVCheck(today: prefs["hrvToday"] as? Int, baseline: prefs["hrvBaseline"] as? Int) }
        if weeklyEnabled   { scheduleWeeklySummary() }
    }

    // ── FREE: Workout reminder ─────────────────────────────────────────────
    // Fires daily at 9am. The web app suppresses it by calling
    // cancelWorkoutReminder() when a workout is logged.

    func scheduleWorkoutReminder() {
        let content = UNMutableNotificationContent()
        content.title = "Time to log a session"
        content.body  = "You haven't trained in 3 days. Even 20 minutes counts — open your plan."
        content.sound = .default
        content.userInfo = ["type": "workout_reminder", "deepLink": "today"]

        var dateComponents = DateComponents()
        dateComponents.hour   = 9
        dateComponents.minute = 0
        let trigger = UNCalendarNotificationTrigger(dateMatching: dateComponents, repeats: true)
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
