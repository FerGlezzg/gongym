import Capacitor

/**
 * A local (hand-written, not npm-published) plugin like StepsPlugin isn't in
 * capacitor.config.json's auto-registration list — `cap sync` only fills that in from
 * installed packages — so it needs registering here instead, the documented way to add a
 * plugin that lives directly in the app target. Main.storyboard points its root view
 * controller at this class (customClass="ViewController", customModule="App") instead of
 * Capacitor's stock CAPBridgeViewController so this override actually runs.
 */
class ViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(StepsPlugin())
    }
}
