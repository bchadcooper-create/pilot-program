import HealthKit
import Foundation

// MARK: - HealthKitManager
//
// Handles all HealthKit interactions for Flight Crew Fitness.
//
// Flow:
//   1. Web app sends:  window.webkit.messageHandlers.healthkit.postMessage({ action: "requestPermission" })
//   2. ViewController calls HealthKitManager.requestPermissionAndSync()
//   3. iOS shows the standard Health permission sheet (required by Apple — no way around it)
//   4. Once granted, we read available data and detect which devices contributed it
//   5. We post a single fcf:healthkit event back to the web app with everything
//
// The web app listens for fcf:healthkit and stores the payload in ST (app state),
// which drives the Connected Devices page and the Today briefing.

class HealthKitManager {

    static let shared = HealthKitManager()
    // BUG FIX (independent review finding): recreated fresh on every
    // single workout formatted — DateFormatter/ISO8601DateFormatter
    // construction is a genuinely nontrivial allocation, not free, and a
    // shared static instance works identically here since nothing about
    // this formatting is per-instance state.
    private static let iso8601Formatter = ISO8601DateFormatter()
    private let store = HKHealthStore()
    private init() {}

    // ── Types we read ────────────────────────────────────────────────────────

    private let readTypes: Set<HKObjectType> = {
        var types = Set<HKObjectType>()
        // BUG FIX (independent review finding, confirmed real): heartRate,
        // oxygenSaturation, and respiratoryRate were requested here but
        // never actually queried anywhere in this file — asking for
        // permission to data the app doesn't use violates least-
        // privilege for no benefit. Removed; add back alongside an
        // actual query in syncAll if a future feature needs one of them,
        // rather than requesting it speculatively ahead of time.
        let quantityTypeIds: [HKQuantityTypeIdentifier] = [
            .stepCount,
            .heartRateVariabilitySDNN,
            .restingHeartRate,
            .activeEnergyBurned,
        ]
        for id in quantityTypeIds {
            if let t = HKQuantityType.quantityType(forIdentifier: id) { types.insert(t) }
        }
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            types.insert(sleep)
        }
        if let workout = HKObjectType.workoutType() as? HKObjectType {
            types.insert(workout)
        }
        return types
    }()

    // ── Permission request + initial sync ────────────────────────────────────

    func requestPermissionAndSync(completion: @escaping ([String: Any]) -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            completion(["available": false])
            return
        }

        store.requestAuthorization(toShare: nil, read: readTypes) { [weak self] granted, error in
            guard let self = self else { return }
            if let error = error {
                completion(["available": true, "granted": false, "error": error.localizedDescription])
                return
            }
            if !granted {
                completion(["available": true, "granted": false])
                return
            }
            // BUG FIX (independent review findings — one part correct
            // as originally written, one part genuinely worth fixing,
            // sorted out by checking Apple's own documented behavior
            // directly rather than assuming): `granted` here does NOT
            // mean every requested read type was actually authorized —
            // it only means the sheet was presented and responded to at
            // least once. Proceeding to syncAll regardless (rather than
            // trying to gate on some notion of "fully granted" first) IS
            // the correct approach though, not a bug to fix: HealthKit
            // deliberately does not expose per-type READ authorization
            // status at all (confirmed directly — authorizationStatus(
            // for:) is documented to return unreliable/always-denied-
            // looking values for read-only types specifically, so a
            // request to check "which types were granted" up front
            // wouldn't actually work even if added). The only reliable
            // way to know what's actually readable is to attempt each
            // query and see what comes back — which is exactly what
            // syncAll already does, and why individual metric keys are
            // simply absent from the payload for anything not granted,
            // rather than the payload claiming false confidence about
            // any specific type.
            self.syncAll(completion: completion)
        }
    }

    // ── Read all data and build the payload ──────────────────────────────────

    // BUG FIX (independent review findings, both confirmed real via direct
    // inspection — not theoretical): HKSampleQuery/HKStatisticsQuery
    // completions run on an arbitrary HealthKit-internal background
    // queue, with no guarantee that different query objects' callbacks
    // are serialized relative to each other — several of these fire
    // concurrently in practice. syncAll's `payload` dictionary and
    // detectDevices's `sourceNames` set were both being mutated directly
    // from these callbacks with no synchronization at all — a genuine
    // data race on Swift's Dictionary/Set internals, not just a style
    // nitpick, and capable of actually corrupting state or crashing.
    // A plain lock around every write is the same fix already applied to
    // PurchaseManager's cachedProducts for the identical underlying
    // problem, chosen there and here over converting to an actor because
    // that changes call-site requirements for every caller in ways that
    // can't be compile-verified without an actual Xcode build. Scoped
    // locally to each call rather than a shared instance property, so
    // two overlapping syncAll calls (e.g. a rapid double-tap) don't
    // contend on each other's lock unnecessarily — each call protects
    // only its own payload.

    func syncAll(completion: @escaping ([String: Any]) -> Void) {
        let group = DispatchGroup()
        var payload: [String: Any] = ["available": true, "granted": true]
        let payloadLock = NSLock()
        func setPayload(_ key: String, _ value: Any) {
            payloadLock.lock(); defer { payloadLock.unlock() }
            payload[key] = value
        }

        // Today's date range
        let calendar = Calendar.current
        let startOfDay = calendar.startOfDay(for: Date())
        let now = Date()
        let last30Days = calendar.date(byAdding: .day, value: -30, to: now) ?? now

        // Steps today
        group.enter()
        querySum(.stepCount, unit: HKUnit.count(), start: startOfDay, end: now) { value in
            if let v = value { setPayload("stepsToday", Int(v)) }
            group.leave()
        }

        // Active energy today
        group.enter()
        querySum(.activeEnergyBurned, unit: HKUnit.kilocalorie(), start: startOfDay, end: now) { value in
            if let v = value { setPayload("activeCaloriesToday", Int(v)) }
            group.leave()
        }

        // Latest resting heart rate
        group.enter()
        queryLatestQuantity(.restingHeartRate, unit: HKUnit(from: "count/min")) { value, source in
            if let v = value { setPayload("restingHR", Int(v)) }
            if let s = source { setPayload("restingHRSource", s) }
            group.leave()
        }

        // Latest HRV (SDNN)
        group.enter()
        queryLatestQuantity(.heartRateVariabilitySDNN, unit: HKUnit.secondUnit(with: .milli)) { value, source in
            if let v = value { setPayload("hrv", Int(v)) }
            if let s = source { setPayload("hrvSource", s) }
            group.leave()
        }

        // Last night's sleep (last 24 hours, take the longest asleep block)
        group.enter()
        querySleep(start: calendar.date(byAdding: .hour, value: -24, to: now) ?? now, end: now) { minutes, source in
            if let m = minutes { setPayload("sleepMinutes", m) }
            if let s = source { setPayload("sleepSource", s) }
            group.leave()
        }

        // Last workout (last 30 days)
        group.enter()
        queryLastWorkout(start: last30Days, end: now) { workoutData, source in
            if let w = workoutData { setPayload("lastWorkout", w) }
            if let s = source { setPayload("lastWorkoutSource", s) }
            group.leave()
        }

        // Detect connected devices from recent samples
        group.enter()
        detectDevices { devices in
            setPayload("detectedDevices", devices)
            group.leave()
        }

        group.notify(queue: .main) {
            completion(payload)
        }
    }

    // ── Query helpers ─────────────────────────────────────────────────────────

    // BUG FIX (independent review finding): every query helper here
    // silently discarded the Error? HealthKit passed to its callback —
    // a permission or store-level error became an indistinguishable nil
    // in the payload, with nothing to explain why. DEBUG-only, matching
    // the logging discipline already used elsewhere in this app's
    // native code.
    private func logNative(_ message: String) {
        #if DEBUG
        print("FCF HealthKitManager:", message)
        #endif
    }

    private func querySum(_ typeId: HKQuantityTypeIdentifier,
                          unit: HKUnit,
                          start: Date,
                          end: Date,
                          completion: @escaping (Double?) -> Void) {
        guard let type = HKQuantityType.quantityType(forIdentifier: typeId) else {
            completion(nil); return
        }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
        let query = HKStatisticsQuery(quantityType: type,
                                      quantitySamplePredicate: predicate,
                                      options: .cumulativeSum) { [weak self] _, stats, error in
            if let error = error { self?.logNative("querySum(\(typeId.rawValue)) error: \(error)") }
            completion(stats?.sumQuantity()?.doubleValue(for: unit))
        }
        store.execute(query)
    }

    private func queryLatestQuantity(_ typeId: HKQuantityTypeIdentifier,
                                     unit: HKUnit,
                                     completion: @escaping (Double?, String?) -> Void) {
        guard let type = HKQuantityType.quantityType(forIdentifier: typeId) else {
            completion(nil, nil); return
        }
        // BUG FIX (independent review finding, confirmed real): predicate
        // was nil, meaning this returned the single most recent sample of
        // ALL TIME — a user who hasn't worn a device in months still got
        // that stale reading presented as current, with no way to tell
        // it was old. Bounding to the last 7 days means a genuinely
        // stale device shows as "no data" (nil) rather than silently
        // wrong, matching the same recency window detectDevices already
        // uses for its own device-freshness check.
        let cutoff = Calendar.current.date(byAdding: .day, value: -7, to: Date()) ?? Date.distantPast
        let predicate = HKQuery.predicateForSamples(withStart: cutoff, end: Date())
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        let query = HKSampleQuery(sampleType: type, predicate: predicate,
                                  limit: 1, sortDescriptors: [sort]) { [weak self] _, samples, error in
            if let error = error { self?.logNative("queryLatestQuantity(\(typeId.rawValue)) error: \(error)") }
            guard let sample = samples?.first as? HKQuantitySample else {
                completion(nil, nil); return
            }
            let value = sample.quantity.doubleValue(for: unit)
            let source = sample.sourceRevision.source.name
            completion(value, source)
        }
        store.execute(query)
    }

    private func querySleep(start: Date, end: Date,
                            completion: @escaping (Int?, String?) -> Void) {
        guard let type = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
            completion(nil, nil); return
        }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        let query = HKSampleQuery(sampleType: type, predicate: predicate,
                                  limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { [weak self] _, samples, error in
            if let error = error { self?.logNative("querySleep error: \(error)") }
            guard let samples = samples as? [HKCategorySample] else {
                completion(nil, nil); return
            }
            // BUG FIX (independent review findings, both confirmed real
            // and worth fixing together): this used to sum every asleep
            // sample's duration directly. Two separate problems with
            // that, addressed together below:
            // (1) A pilot with more than one sleep-tracking source
            // (Apple Watch auto-detection, an Oura ring, a third-party
            // app) gets OVERLAPPING samples for the same physical sleep
            // period from HealthKit — summing raw samples double- or
            // triple-counts that overlap, and could report something
            // like 20+ hours of "sleep" in an 8-hour night.
            // (2) Even with overlaps correctly merged, this comment's
            // own stated intent — "take the longest asleep block" — was
            // never actually implemented; a mid-day nap within the same
            // 24h lookback window would still get summed in alongside
            // the overnight sleep rather than reported (or ignored)
            // separately from it.
            // Fix: merge overlapping/adjacent intervals into non-
            // overlapping blocks first (solves #1), then report the
            // single longest merged block as "last night's sleep"
            // (solves #2 and actually matches what this comment already
            // said it was doing).
            let asleepValues: Set<Int> = [
                HKCategoryValueSleepAnalysis.asleep.rawValue,
                HKCategoryValueSleepAnalysis.asleepREM.rawValue,
                HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                HKCategoryValueSleepAnalysis.asleepDeep.rawValue
            ]
            let asleepSamples = samples
                .filter { asleepValues.contains($0.value) }
                .sorted { $0.startDate < $1.startDate }

            var mergedIntervals: [(start: Date, end: Date, source: String)] = []
            for sample in asleepSamples {
                let sourceName = sample.sourceRevision.source.name
                if let last = mergedIntervals.last, sample.startDate <= last.end {
                    // Overlaps (or touches) the previous merged block — extend it
                    // rather than counting this sample's own span again.
                    if sample.endDate > last.end {
                        mergedIntervals[mergedIntervals.count - 1].end = sample.endDate
                    }
                } else {
                    mergedIntervals.append((start: sample.startDate, end: sample.endDate, source: sourceName))
                }
            }

            guard let longest = mergedIntervals.max(by: {
                $0.end.timeIntervalSince($0.start) < $1.end.timeIntervalSince($1.start)
            }) else {
                completion(nil, nil); return
            }
            let minutes = Int(longest.end.timeIntervalSince(longest.start) / 60)
            completion(minutes > 0 ? minutes : nil, longest.source)
        }
        store.execute(query)
    }

    private func queryLastWorkout(start: Date, end: Date,
                                  completion: @escaping ([String: Any]?, String?) -> Void) {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        let query = HKSampleQuery(sampleType: HKWorkoutType.workoutType(),
                                  predicate: predicate,
                                  limit: 1,
                                  sortDescriptors: [sort]) { [weak self] _, samples, error in
            if let error = error { self?.logNative("queryLastWorkout error: \(error)") }
            guard let workout = samples?.first as? HKWorkout else {
                completion(nil, nil); return
            }
            let data: [String: Any] = [
                "activityType": workout.workoutActivityType.name,
                // BUG FIX (independent review finding): the switch below
                // only names the common fitness types and falls back to
                // generic "Workout" for the rest (flexibility, cooldown,
                // martial arts, dance, pilates, and others aren't
                // covered). Including the raw type value alongside the
                // display name lets the web side map anything this
                // switch doesn't recognize, rather than needing a native
                // update every time a new activity type needs a name.
                "activityTypeRaw": workout.workoutActivityType.rawValue,
                "durationMinutes": Int(workout.duration / 60),
                "calories": Int(workout.totalEnergyBurned?.doubleValue(for: .kilocalorie()) ?? 0),
                "date": Self.iso8601Formatter.string(from: workout.endDate)
            ]
            let source = workout.sourceRevision.source.name
            completion(data, source)
        }
        store.execute(query)
    }

    // ── Device detection ──────────────────────────────────────────────────────
    //
    // We look at the source names on recent samples. Apple Watch shows up as
    // "Chad's Apple Watch" (or similar). Oura writes to HealthKit as "Oura"
    // if the user has the Oura app installed and has granted it HealthKit access.
    // Whoop, Garmin, etc. follow the same pattern.

    private func detectDevices(completion: @escaping ([[String: String]]) -> Void) {
        guard let hrvType = HKQuantityType.quantityType(forIdentifier: .heartRateVariabilitySDNN),
              let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
            completion([]); return
        }

        let cutoff = Calendar.current.date(byAdding: .day, value: -7, to: Date()) ?? Date.distantPast
        let predicate = HKQuery.predicateForSamples(withStart: cutoff, end: Date())
        var sourceNames = Set<String>()
        let sourceNamesLock = NSLock()
        let group = DispatchGroup()

        let typesToCheck: [HKSampleType] = [hrvType, sleepType, HKWorkoutType.workoutType()]
        for sampleType in typesToCheck {
            group.enter()
            let query = HKSampleQuery(sampleType: sampleType, predicate: predicate,
                                      limit: 50, sortDescriptors: nil) { [weak self] _, samples, error in
                if let error = error { self?.logNative("detectDevices query error: \(error)") }
                // BUG FIX (independent review finding, confirmed real):
                // see the fuller explanation on syncAll's payloadLock —
                // same underlying issue, these three queries' completions
                // aren't guaranteed serialized relative to each other.
                sourceNamesLock.lock()
                (samples ?? []).forEach { sourceNames.insert($0.sourceRevision.source.name) }
                sourceNamesLock.unlock()
                group.leave()
            }
            store.execute(query)
        }

        group.notify(queue: .global()) {
            var devices: [[String: String]] = []
            for name in sourceNames {
                let lower = name.lowercased()
                let kind: String
                if lower.contains("apple watch") || lower.contains("watch") {
                    kind = "appleWatch"
                } else if lower.contains("oura") {
                    kind = "oura"
                } else if lower.contains("whoop") {
                    kind = "whoop"
                } else if lower.contains("garmin") {
                    kind = "garmin"
                } else if lower.contains("iphone") || lower.contains(Bundle.main.bundleIdentifier ?? "") {
                    kind = "iphone"
                } else {
                    kind = "other"
                }
                devices.append(["name": name, "kind": kind])
            }
            completion(devices)
        }
    }
}

// MARK: - HKWorkoutActivityType name helper

extension HKWorkoutActivityType {
    var name: String {
        switch self {
        case .running: return "Running"
        case .cycling: return "Cycling"
        case .swimming: return "Swimming"
        case .walking: return "Walking"
        case .hiking: return "Hiking"
        case .rowing: return "Rowing"
        case .functionalStrengthTraining: return "Strength Training"
        case .traditionalStrengthTraining: return "Strength Training"
        case .highIntensityIntervalTraining: return "HIIT"
        case .yoga: return "Yoga"
        case .crossTraining: return "Cross Training"
        default: return "Workout"
        }
    }
}
