// Kafra Notifier: posts one macOS notification as "Kafra" and opens a link when
// it is clicked. Built locally by integrations/notifier/build.sh; no network.
//
//   KafraNotifier --title <pct-encoded> --body <pct-encoded> --url <pct-encoded>
//
// Arguments arrive percent-encoded (the server encodes them), so the shell
// plugin that calls this never has to quote user text. Only http(s) links to
// 127.0.0.1 or localhost are ever opened.
//
// Launched with arguments: post the notification, then quit. Launched by macOS
// because a notification was clicked: open its link, then quit.

import AppKit
import UserNotifications

final class Delegate: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
    private let center = UNUserNotificationCenter.current()

    func applicationWillFinishLaunching(_ notification: Notification) {
        // Must be set before launch finishes, or a click that launched us is lost.
        center.delegate = self
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let args = parse(CommandLine.arguments)
        guard let body = args["body"] else {
            // No arguments: we were opened to deliver a click. Give it a moment, then go.
            quit(after: 5)
            return
        }
        center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
            guard granted else { return self.quit(after: 0) }
            let content = UNMutableNotificationContent()
            content.title = args["title"] ?? "Kafra"
            content.body = body
            content.sound = .default
            if let url = args["url"], Self.isLocal(url) { content.userInfo = ["url": url] }
            let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
            self.center.add(request) { _ in self.quit(after: 0.5) }
        }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler done: @escaping () -> Void) {
        if let link = response.notification.request.content.userInfo["url"] as? String,
           Self.isLocal(link), let url = URL(string: link) {
            NSWorkspace.shared.open(url)
        }
        done()
        quit(after: 0.5)
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler done: @escaping (UNNotificationPresentationOptions) -> Void) {
        done([.banner, .sound])
    }

    /// Kafra only ever links to itself; anything else is ignored.
    static func isLocal(_ link: String) -> Bool {
        guard let url = URL(string: link), let scheme = url.scheme, let host = url.host else { return false }
        return ["http", "https"].contains(scheme) && ["127.0.0.1", "localhost"].contains(host)
    }

    private func parse(_ argv: [String]) -> [String: String] {
        var out: [String: String] = [:]
        var i = 1
        while i + 1 < argv.count {
            if argv[i].hasPrefix("--") {
                let key = String(argv[i].dropFirst(2))
                out[key] = argv[i + 1].removingPercentEncoding ?? argv[i + 1]
                i += 2
            } else {
                i += 1
            }
        }
        return out
    }

    private func quit(after seconds: Double) {
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { NSApp.terminate(nil) }
    }
}

let app = NSApplication.shared
let delegate = Delegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
