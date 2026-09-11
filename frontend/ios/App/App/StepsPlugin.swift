import Foundation
import CoreMotion
import Capacitor

/**
 * Today's step count from CoreMotion's CMPedometer — the same background-tracked history
 * that backs Apple Health's step count, kept by the M-series motion coprocessor whether or
 * not this app is running or has ever been opened today. Unlike Android's raw hardware
 * step-counter sensor (see StepsPlugin.java on the Android side), CMPedometer can be asked
 * directly for a date range, so there is no baseline/bookkeeping needed here — every call
 * answers with the real total since midnight, even the very first time it's asked that day.
 */
@objc(StepsPlugin)
public class StepsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StepsPlugin"
    public let jsName = "Steps"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getTodaySteps", returnType: CAPPluginReturnPromise)
    ]

    private let pedometer = CMPedometer()

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": CMPedometer.isStepCountingAvailable()])
    }

    @objc func getTodaySteps(_ call: CAPPluginCall) {
        guard CMPedometer.isStepCountingAvailable() else {
            call.reject("Step counting is not available on this device")
            return
        }
        let start = Calendar.current.startOfDay(for: Date())
        pedometer.queryPedometerData(from: start, to: Date()) { data, error in
            if let error = error as NSError? {
                // CMErrorDomain code 1 = "not authorized" — the Motion & Fitness permission
                // was denied. Anything else is a genuine read failure.
                call.reject("Could not read step data", nil, error)
                return
            }
            call.resolve(["steps": data?.numberOfSteps.intValue ?? 0])
        }
    }
}
