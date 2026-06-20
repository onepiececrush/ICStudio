import Cocoa
import FlutterMacOS

class MainFlutterWindow: NSWindow {
  private var windowChannel: FlutterMethodChannel?

  override func awakeFromNib() {
    let flutterViewController = FlutterViewController()
    let windowFrame = self.frame
    self.contentViewController = flutterViewController
    self.titleVisibility = .hidden
    self.titlebarAppearsTransparent = true
    if #available(macOS 11.0, *) {
      self.titlebarSeparatorStyle = .none
    }
    self.styleMask.insert(.fullSizeContentView)
    self.standardWindowButton(.closeButton)?.isHidden = true
    self.standardWindowButton(.miniaturizeButton)?.isHidden = true
    self.standardWindowButton(.zoomButton)?.isHidden = true
    self.backgroundColor = NSColor(
      calibratedRed: 7.0 / 255.0,
      green: 16.0 / 255.0,
      blue: 24.0 / 255.0,
      alpha: 1
    )
    self.minSize = NSSize(width: 960, height: 640)
    if windowFrame.width < 1180 || windowFrame.height < 760 {
      self.setContentSize(NSSize(width: 1180, height: 760))
      self.center()
    } else {
      self.setFrame(windowFrame, display: true)
    }

    RegisterGeneratedPlugins(registry: flutterViewController)

    let channel = FlutterMethodChannel(
      name: "icstudio/window",
      binaryMessenger: flutterViewController.engine.binaryMessenger
    )
    channel.setMethodCallHandler { [weak self] call, result in
      guard let self else {
        result(FlutterError(code: "window_unavailable", message: nil, details: nil))
        return
      }
      switch call.method {
      case "startDrag":
        if let event = NSApp.currentEvent {
          self.performDrag(with: event)
        }
        result(nil)
      case "minimize":
        self.miniaturize(nil)
        result(nil)
      case "toggleMaximize":
        self.zoom(nil)
        result(nil)
      case "close":
        self.close()
        result(nil)
      case "pickSimulatorProfile":
        let panel = NSOpenPanel()
        panel.title = "导入从机模拟协议"
        panel.prompt = "导入"
        panel.allowedFileTypes = ["json", "csv", "xlsx", "xls"]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.beginSheetModal(for: self) { response in
          result(response == .OK ? panel.url?.path : nil)
        }
      default:
        result(FlutterMethodNotImplemented)
      }
    }
    self.windowChannel = channel

    super.awakeFromNib()
  }
}
