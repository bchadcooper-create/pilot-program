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
    private let store = HKHealthStore()
    private init() {}

    // ── Types we read ────────────────────────────────────────────────────────

    private let readTypes: Set<HKObjectType> = {
        var types = Set<HKObjectType>()
        let quantityTypeIds: [HKQuantityTypeIdentifier] = [
            .stepCount,
            .heartRate,
            .heartRateVariabilitySDNN,
            .restingHeartRate,
            .activeEnergyBurned,
            .oxygenSaturation,
            .respiratoryRate
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
            // Permission granted — read data and detect devices
            self.syncAll(completion: completion)
        }
    }

    // ── Read all data and build the payload ──────────────────────────────────

    func syncAll(completion: @escaping ([String: Any]) -> Void) {
        let group = DispatchGroup()
        var payload: [String: Any] = ["available": true, "granted": true]

        // Today's date range
        let calendar = Calendar.current
        let startOfDay = calendar.startOfDay(for: Date())
        let now = Date()
        let last30Days = calendar.date(byAdding: .day, value: -30, to: now)!

        // Steps today
        group.enter()
        querySum(.stepCount, unit: HKUnit.count(), start: startOfDay, end: now) { value in
            if let v = value { payload["stepsToday"] = Int(v) }
            group.leave()
        }

        // Active energy today
        group.enter()
        querySum(.activeEnergyBurned, unit: HKUnit.kilocalorie(), start: startOfDay, end: now) { value in
            if let v = value { payload["activeCaloriesToday"] = Int(v) }
            group.leave()
        }

        // Latest resting heart rate
        group.enter()
        queryLatestQuantity(.restingHeartRate, unit: HKUnit(from: "count/min")) { value, source in
            if let v = value { payload["restingHR"] = Int(v) }
            if let s = source { payload["restingHRSource"] = s }
            group.leave()
        }

        // Latest HRV (SDNN)
        group.enter()
        queryLatestQuantity(.heartRateVariabilitySDNN, unit: HKUnit.secondUnit(with: .milli)) { value, source in
            if let v = value { payload["hrv"] = Int(v) }
            if let s = source { payload["hrvSource"] = s }
            group.leave()
        }

        // Last night's sleep (last 24 hours, take the longest asleep block)
        group.enter()
        querySleep(start: calendar.date(byAdding: .hour, value: -24, to: now)!, end: now) { minutes, source in
            if let m = minutes { payload["sleepMinutes"] = m }
            if let s = source { payload["sleepSource"] = s }
            group.leave()
        }

        // Last workout (last 30 days)
        group.enter()
        queryLastWorkout(start: last30Days, end: now) { workoutData, source in
            if let w = workoutData { payload["lastWorkout"] = w }
            if let s = source { payload["lastWorkoutSource"] = s }
            group.leave()
        }

        // Detect connected devices from recent samples
        group.enter()
        detectDevices { devices in
            payload["detectedDevices"] = devices
            group.leave()
        }

        group.notify(queue: .main) {
            completion(payload)
        }
    }

    // ── Query helpers ─────────────────────────────────────────────────────────

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
                                      options: .cumulativeSum) { _, stats, _ in
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
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        let query = HKSampleQuery(sampleType: type, predicate: nil,
                                  limit: 1, sortDescriptors: [sort]) { _, samples, _ in
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
                                  limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, _ in
            guard let samples = samples as? [HKCategorySample] else {
                completion(nil, nil); return
            }
            // Sum up asleep + REM + deep + core stages
            let asleepValues: Set<Int> = [
                HKCategoryValueSleepAnalysis.asleep.rawValue,
                HKCategoryValueSleepAnalysis.asleepREM.rawValue,
                HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                HKCategoryValueSleepAnalysis.asleepDeep.rawValue
            ]
            let totalSeconds = samples
                .filter { asleepValues.contains($0.value) }
                .reduce(0.0) { $0 + $1.endDate.timeIntervalSince($1.startDate) }
            let source = samples.first?.sourceRevision.source.name
            completion(totalSeconds > 0 ? Int(totalSeconds / 60) : nil, source)
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
                                  sortDescriptors: [sort]) { _, samples, _ in
            guard let workout = samples?.first as? HKWorkout else {
                completion(nil, nil); return
            }
            let data: [String: Any] = [
                "activityType": workout.workoutActivityType.name,
                "durationMinutes": Int(workout.duration / 60),
                "calories": Int(workout.totalEnergyBurned?.doubleValue(for: .kilocalorie()) ?? 0),
                "date": ISO8601DateFormatter().string(from: workout.endDate)
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

        let cutoff = Calendar.current.date(byAdding: .day, value: -7, to: Date())!
        let predicate = HKQuery.predicateForSamples(withStart: cutoff, end: Date())
        var sourceNames = Set<String>()
        let group = DispatchGroup()

        let typesToCheck: [HKSampleType] = [hrvType, sleepType, HKWorkoutType.workoutType()]
        for sampleType in typesToCheck {
            group.enter()
            let query = HKSampleQuery(sampleType: sampleType, predicate: predicate,
                                      limit: 50, sortDescriptors: nil) { _, samples, _ in
                (samples ?? []).forEach { sourceNames.insert($0.sourceRevision.source.name) }
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
