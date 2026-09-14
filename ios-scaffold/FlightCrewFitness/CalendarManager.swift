import EventKit
import Foundation

// MARK: - CalendarManager
//
// Handles Apple Calendar (EventKit) access for Flight Crew Fitness.
//
// Flow:
//   1. Web app sends: window.webkit.messageHandlers.calendar.postMessage({ action: "requestPermission" })
//   2. iOS shows the standard Calendar permission sheet
//   3. Once granted, we pull events for past 7 days + next 60 days
//   4. We post a fcf:calendar event back to the web app with the raw event list
//   5. The web app sends events to an AI classifier (Supabase Edge Function)
//      which returns typed events: flight, layover, reserve, training, personal, etc.
//   6. Classified results are stored in Supabase and cached — only re-classified
//      when new events are detected (fingerprint comparison).
//
// The web app also calls action: "sync" to refresh without re-prompting.

class CalendarManager {

    static let shared = CalendarManager()
    private let store = EKEventStore()
    private init() {}

    // ── Permission + initial sync ─────────────────────────────────────────────

    func requestPermissionAndSync(completion: @escaping ([String: Any]) -> Void) {
        let status = EKEventStore.authorizationStatus(for: .event)
        switch status {
        case .authorized, .fullAccess:
            syncEvents(completion: completion)
        case .notDetermined:
            if #available(iOS 17.0, *) {
                store.requestFullAccessToEvents { [weak self] granted, error in
                    if granted {
                        self?.syncEvents(completion: completion)
                    } else {
                        completion(["granted": false, "error": error?.localizedDescription ?? "Access denied"])
                    }
                }
            } else {
                store.requestAccess(to: .event) { [weak self] granted, error in
                    if granted {
                        self?.syncEvents(completion: completion)
                    } else {
                        completion(["granted": false, "error": error?.localizedDescription ?? "Access denied"])
                    }
                }
            }
        case .denied, .restricted:
            completion(["granted": false, "error": "Calendar access denied. Change in Settings → Privacy & Security → Calendars."])
        case .writeOnly:
            // writeOnly means we can write but not read — not useful for us.
            // Request full access.
            if #available(iOS 17.0, *) {
                store.requestFullAccessToEvents { [weak self] granted, error in
                    if granted {
                        self?.syncEvents(completion: completion)
                    } else {
                        completion(["granted": false, "error": error?.localizedDescription ?? "Access denied"])
                    }
                }
            } else {
                completion(["granted": false, "error": "Calendar read access not granted."])
            }
        @unknown default:
            completion(["granted": false, "error": "Unknown authorization status."])
        }
    }

    // ── Pull events ───────────────────────────────────────────────────────────

    func syncEvents(completion: @escaping ([String: Any]) -> Void) {
        let now = Date()
        let calendar = Calendar.current
        let start = calendar.date(byAdding: .day, value: -7, to: now)!
        let end   = calendar.date(byAdding: .day, value: 60, to: now)!

        let predicate = store.predicateForEvents(withStart: start, end: end, calendars: nil)
        let ekEvents = store.events(matching: predicate)

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]

        // BUG FIX — reported "lots of duplicates". Confirmed independently:
        // the same schedule uploaded as .ics reported 190 events for this
        // window, while this native sync reported 328 for the identical
        // window — a 1.73x ratio, not a clean 2x, so this isn't simply
        // "every event is duplicated once". EventKit is documented to be
        // able to surface the same underlying event more than once when
        // searching across all calendars with calendars: nil — most
        // commonly with shared, delegated, or subscribed calendars, where
        // the same calendar can be internally represented more than once.
        // Rather than guess at which exact mechanism is happening on this
        // account, dedupe on what actually defines "the same event" from
        // a user's perspective: identical title AND identical start/end
        // time. Two EKEvents that match on all three are the same
        // real-world layover or duty period, however EventKit produced
        // them, and only the first occurrence encountered is kept.
        var seenKeys = Set<String>()
        var dedupedCount = 0
        let uniqueEkEvents = ekEvents.filter { ev in
            let key = (ev.title ?? "") + "|" + formatter.string(from: ev.startDate) + "|" + formatter.string(from: ev.endDate)
            if seenKeys.contains(key) {
                dedupedCount += 1
                return false
            }
            seenKeys.insert(key)
            return true
        }

        var calendarNames = Set<String>()
        let events: [[String: Any]] = uniqueEkEvents.map { ev in
            let calName = ev.calendar?.title ?? "Unknown"
            calendarNames.insert(calName)
            var dict: [String: Any] = [
                "id":       ev.eventIdentifier ?? UUID().uuidString,
                "title":    ev.title ?? "",
                "calendar": calName,
                "isAllDay": ev.isAllDay,
                "start":    formatter.string(from: ev.startDate),
                "end":      formatter.string(from: ev.endDate),
            ]
            if let loc = ev.location, !loc.isEmpty {
                dict["location"] = loc
            }
            if let notes = ev.notes, !notes.isEmpty {
                dict["notes"] = notes
            }
            return dict
        }

        // Build a lightweight fingerprint so the web app can detect
        // whether events have changed since the last classification.
        // Just a sorted, joined string of id+start — good enough to
        // catch additions, deletions, and time changes.
        let fingerprint = events
            .compactMap { ($0["id"] as? String ?? "") + ($0["start"] as? String ?? "") }
            .sorted()
            .joined()
            .hash

        let payload: [String: Any] = [
            "granted":       true,
            "events":        events,
            "eventCount":    events.count,
            "duplicatesRemoved": dedupedCount,
            "calendarNames": Array(calendarNames),
            "fingerprint":   "\(fingerprint)",
            "windowStart":   formatter.string(from: start),
            "windowEnd":     formatter.string(from: end)
        ]
        completion(payload)
    }
}
