import EventKit
import Foundation
import CryptoKit

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

    func requestPermissionAndSync(baseTimezoneIdentifier: String? = nil, completion: @escaping ([String: Any]) -> Void) {
        let status = EKEventStore.authorizationStatus(for: .event)
        switch status {
        case .authorized, .fullAccess:
            syncEvents(baseTimezoneIdentifier: baseTimezoneIdentifier, completion: completion)
        case .notDetermined:
            if #available(iOS 17.0, *) {
                store.requestFullAccessToEvents { [weak self] granted, error in
                    if granted {
                        self?.syncEvents(baseTimezoneIdentifier: baseTimezoneIdentifier, completion: completion)
                    } else {
                        completion(["granted": false, "error": error?.localizedDescription ?? "Access denied"])
                    }
                }
            } else {
                store.requestAccess(to: .event) { [weak self] granted, error in
                    if granted {
                        self?.syncEvents(baseTimezoneIdentifier: baseTimezoneIdentifier, completion: completion)
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
                        self?.syncEvents(baseTimezoneIdentifier: baseTimezoneIdentifier, completion: completion)
                    } else {
                        completion(["granted": false, "error": error?.localizedDescription ?? "Access denied"])
                    }
                }
            } else {
                // Reviewed and left as-is rather than "fixed": .writeOnly
                // is itself an iOS 17+ EKAuthorizationStatus case — a
                // device actually running iOS 16 or earlier can never
                // return this value from authorizationStatus(for:) in
                // the first place (calendar access there is the older
                // binary granted/denied model), so this branch can't
                // actually execute on a real device. Left in rather than
                // removed as a defensive no-op in case that understanding
                // is ever wrong.
                completion(["granted": false, "error": "Calendar read access not granted."])
            }
        @unknown default:
            completion(["granted": false, "error": "Unknown authorization status."])
        }
    }

    // ── Pull events ───────────────────────────────────────────────────────────

    func syncEvents(baseTimezoneIdentifier: String? = nil, completion: @escaping ([String: Any]) -> Void) {
        // BUG FIX (independent review findings, both confirmed real):
        // (1) events(matching:) is a synchronous, blocking EventKit call —
        // for the common "already authorized" path, this was being called
        // straight from whatever thread requestPermissionAndSync's caller
        // used, which for the returning-user case is the main thread
        // (userContentController(didReceive:) runs on main), meaning
        // every routine sync could hitch the UI while querying a 67-day
        // window across every calendar on the device. (2) EventKit's own
        // permission-request completions aren't guaranteed to run on
        // main either, so this manager's own completion contract was
        // whatever thread happened to call it, not a predictable one —
        // the caller (postToWeb) already tolerates that today, but a
        // manager shouldn't rely on every future caller getting that
        // right on its own. Doing the real work on a background queue
        // and always finishing on main gives this a single, predictable
        // threading contract regardless of what OS-level completion
        // thread triggered it.
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            let payload = self.buildSyncPayload(baseTimezoneIdentifier: baseTimezoneIdentifier)
            DispatchQueue.main.async { completion(payload) }
        }
    }

    private func buildSyncPayload(baseTimezoneIdentifier: String? = nil) -> [String: Any] {
        let now = Date()
        let calendar = Calendar.current
        // BUG FIX (independent review finding): Calendar.date(byAdding:)
        // can theoretically return nil (extreme date overflow) — force-
        // unwrapping here would crash the whole sync over an edge case
        // with a trivial, always-safe fallback available.
        let start = calendar.date(byAdding: .day, value: -7, to: now) ?? now
        let end   = calendar.date(byAdding: .day, value: 60, to: now) ?? now

        let predicate = store.predicateForEvents(withStart: start, end: end, calendars: nil)
        let ekEvents = store.events(matching: predicate)

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]

        // BUG FIX (reported: a flight showed the wrong time — off by
        // exactly 7 hours from the real local departure/arrival).
        // First attempt at this used a version-suffix heuristic specific
        // to one export tool's identifier format — rightly rejected as
        // too fragile to generalize. Real mechanism, confirmed against
        // two independent pieces of evidence: a much older comment in
        // this codebase's .ics parser (parseFlightScheduleICS) documents
        // the exact same crew-schedule sync tool stamping every event
        // with a "+5 hours" correction needed at the time it was written;
        // this account's CURRENT data needs "+7 hours" instead. Those
        // aren't contradictory bugs — they're the same bug, sampled at
        // two different times, consistent with the sync tool stamping
        // every event using whatever timezone the EXPORTING DEVICE
        // currently has set, rather than the actual station's timezone.
        // When that earlier comment was written, the device was on
        // Central time (+5 correction needed); this account's device is
        // now on Phoenix time (+7 correction needed) — the correction
        // factor isn't a fixed constant, it's whatever TimeZone.current
        // is, which is exactly why hardcoding either number would only
        // ever fix one snapshot in time for one person.
        //
        // Fix: for events that look like they came from this crew-
        // schedule sync (recognizable titles — "Layover X", "Flight N",
        // "Duty free period" — the same patterns parseFlightScheduleICS
        // already classifies on), reinterpret the wall-clock numbers in
        // the wrongly-UTC-stamped time as if they were actually local
        // time in the device's current timezone, then correctly convert
        // that to the true UTC instant. This is real timezone math, not
        // a guess at which of several near-duplicate copies to trust —
        // it works the same way for any user hitting this same bug
        // class, adapting automatically to whatever timezone their own
        // device is on, with no per-user or per-account constant.
        //
        // UPDATE: the limitation this comment used to describe (device's
        // current physical-location timezone assumed to match the
        // exporter's reference zone — wrong while traveling) is resolved
        // below via a fixed, user-configured base timezone rather than
        // TimeZone.current. See the comment at reinterpretationZone's
        // definition for the concrete evidence behind that fix.
        func looksLikeCrewScheduleEvent(_ title: String?) -> Bool {
            guard let t = title else { return false }
            return t.hasPrefix("Layover ") || t.hasPrefix("Flight ") || t == "Duty free period"
        }

        func reinterpretAsLocal(_ wrongUTCDate: Date, in timeZone: TimeZone) -> Date {
            var utcCal = Calendar(identifier: .gregorian)
            utcCal.timeZone = TimeZone(identifier: "UTC")!
            let comps = utcCal.dateComponents([.year, .month, .day, .hour, .minute, .second], from: wrongUTCDate)
            var localCal = Calendar(identifier: .gregorian)
            localCal.timeZone = timeZone
            return localCal.date(from: comps) ?? wrongUTCDate
        }

        // REAL FIX (was a documented known limitation, now resolved):
        // TimeZone.current tracks wherever the device physically is right
        // now, which is wrong the moment a pilot syncs while away from
        // home base — confirmed concretely against this account's own
        // data: the crew-schedule sync tool's notes field for one event
        // literally labels its own reference as "Base (PHX) time," and
        // the raw wrong DTSTART/DTEND values matched that base-time
        // figure exactly. The wrong reference zone is tied to a fixed
        // home base, not to wherever the device happens to be sitting —
        // so a fixed, user-set base timezone (baseTimezoneIdentifier,
        // from Settings) is the mechanistically correct fix, not a
        // location-dependent guess. Falls back to TimeZone.current only
        // when the user hasn't set one yet (or sent "auto"), preserving
        // today's behavior rather than breaking existing setups outright.
        let reinterpretationZone = baseTimezoneIdentifier
            .flatMap { $0 == "auto" ? nil : TimeZone(identifier: $0) }
            ?? TimeZone.current
        var correctedTimes: [ObjectIdentifier: (Date, Date)] = [:]
        // BUG FIX (real Xcode build failure, confirmed via an actual
        // compile — not something static review would have caught):
        // EKEvent.startDate/endDate are declared as Date! (implicitly
        // unwrapped optional) in EventKit's Swift bridging. Placed
        // directly into a tuple literal on the right side of ??, Swift's
        // type inference doesn't reliably resolve that to the same
        // non-optional (Date, Date) that correctedTimes' dictionary
        // value type declares — the whole ?? expression ends up typed
        // as (Date?, Date?) instead, which formatter.string(from:)
        // below can't accept without unwrapping. Coalescing each field
        // individually (ev.startDate ?? Date()) forces an unambiguous,
        // genuinely non-optional Date before the tuple is even built,
        // rather than leaving Swift to infer the tuple's optionality
        // from its unwrapped-optional source values. The Date()
        // fallback should never actually be reached in practice — a
        // real EKEvent from the store always has both dates — this
        // exists purely to satisfy the type system's worst case.
        var correctedCount = 0
        for ev in ekEvents where looksLikeCrewScheduleEvent(ev.title) {
            let correctedStart = reinterpretAsLocal(ev.startDate, in: reinterpretationZone)
            let correctedEnd   = reinterpretAsLocal(ev.endDate, in: reinterpretationZone)
            if correctedStart != ev.startDate || correctedEnd != ev.endDate {
                correctedTimes[ObjectIdentifier(ev)] = (correctedStart, correctedEnd)
                correctedCount += 1
            }
        }

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
        // Deduping AFTER the time-correction pass above (not before)
        // matters: two copies of the same event that both needed
        // correcting only converge onto the same key once both have
        // actually been corrected — deduping first would have kept both
        // as separate "unique" (and both still wrong) events.
        var seenKeys = Set<String>()
        var dedupedCount = 0
        let uniqueEkEvents = ekEvents.filter { ev in
            let (s, e) = correctedTimes[ObjectIdentifier(ev)] ?? (ev.startDate ?? Date(), ev.endDate ?? Date())
            let key = (ev.title ?? "") + "|" + formatter.string(from: s) + "|" + formatter.string(from: e)
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
            let (s, e) = correctedTimes[ObjectIdentifier(ev)] ?? (ev.startDate ?? Date(), ev.endDate ?? Date())
            var dict: [String: Any] = [
                "id":       ev.eventIdentifier ?? UUID().uuidString,
                "title":    ev.title ?? "",
                "calendar": calName,
                "isAllDay": ev.isAllDay,
                "start":    formatter.string(from: s),
                "end":      formatter.string(from: e),
            ]
            if let loc = ev.location, !loc.isEmpty {
                dict["location"] = loc
            }
            if let notes = ev.notes, !notes.isEmpty {
                dict["notes"] = notes
            }
            return dict
        }

        // BUG FIX (independent review finding, verified against Swift's
        // own core team announcement — confirmed real and severe): .hash
        // (backed by hashValue/hash(into:)) uses a per-process randomized
        // seed since Swift 4.2, specifically so hash values are NOT
        // guaranteed stable across executions — that's documented,
        // intentional behavior, not an edge case. Every single app
        // launch was therefore producing a completely different
        // fingerprint for the exact same, unchanged calendar, which
        // means fcf-calendar-classify's cachedFingerprint === fingerprint
        // check could never match across launches — defeating the entire
        // point of that cache and triggering a fresh, paid AI
        // classification of the whole calendar on every single app open,
        // regardless of whether anything had actually changed.
        // SHA256 via CryptoKit is genuinely stable for identical input,
        // any process, any launch — which a cache key actually needs.
        let fingerprintSource = events
            .compactMap { ($0["id"] as? String ?? "") + ($0["start"] as? String ?? "") }
            .sorted()
            .joined()
        let fingerprintDigest = SHA256.hash(data: Data(fingerprintSource.utf8))
        let fingerprint = fingerprintDigest.map { String(format: "%02x", $0) }.joined()

        let payload: [String: Any] = [
            "granted":       true,
            "events":        events,
            "eventCount":    events.count,
            "duplicatesRemoved": dedupedCount,
            "timesCorrected": correctedCount,
            "calendarNames": Array(calendarNames),
            "fingerprint":   "\(fingerprint)",
            "windowStart":   formatter.string(from: start),
            "windowEnd":     formatter.string(from: end)
        ]
        return payload
    }
}
