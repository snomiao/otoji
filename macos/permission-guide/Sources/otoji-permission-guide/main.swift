// otoji-permission-guide <pane> [app-path]
//
// Spawned by otoji-tray. Opens System Settings on <pane> (accessibility,
// inputMonitoring, screenRecording) and shows PermissionFlow's floating panel
// so the user can drag otoji.app into the list. Exits when System Settings
// closes or after 10 minutes; the tray kills it once otoji is granted (the
// helper can't check that itself: TCC may attribute it to whoever launched it).
import AppKit
import PermissionFlow

let args = CommandLine.arguments
guard args.count >= 2, let pane = PermissionFlowPane(rawValue: args[1]) else {
    FileHandle.standardError.write(Data("usage: otoji-permission-guide <pane> [app-path]\n".utf8))
    exit(2)
}

// Default to the .app this helper lives in (Contents/MacOS/<helper>).
let appURL: URL = {
    if args.count >= 3 { return URL(fileURLWithPath: args[2]) }
    return Bundle.main.bundleURL
}()

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

MainActor.assumeIsolated {
    // promptForAccessibilityTrust stays false: no extra system prompt from the helper.
    let controller = PermissionFlow.makeController(configuration: .init(requiredAppURLs: [appURL]))
    controller.authorize(pane: pane, suggestedAppURLs: [appURL])

    let started = Date()
    Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
        MainActor.assumeIsolated {
            let settingsOpen = !NSRunningApplication
                .runningApplications(withBundleIdentifier: "com.apple.systempreferences").isEmpty
            let elapsed = Date().timeIntervalSince(started)
            if (elapsed > 5 && !settingsOpen) || elapsed > 600 {
                controller.closePanel()
                exit(0)
            }
        }
    }
}

app.run()
