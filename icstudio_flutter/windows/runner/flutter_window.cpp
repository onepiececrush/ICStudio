#include "flutter_window.h"

#include <commdlg.h>
#include <flutter/method_result_functions.h>

#include <optional>
#include <string>

#include "flutter/generated_plugin_registrant.h"

namespace {

void StartWindowDrag(HWND hwnd) {
  ReleaseCapture();
  SendMessage(hwnd, WM_NCLBUTTONDOWN, HTCAPTION, 0);
}

void ToggleWindowMaximize(HWND hwnd) {
  ShowWindow(hwnd, IsZoomed(hwnd) ? SW_RESTORE : SW_MAXIMIZE);
}

std::string WideToUtf8(const std::wstring& value) {
  if (value.empty()) {
    return "";
  }
  int size = WideCharToMultiByte(CP_UTF8, 0, value.c_str(), -1, nullptr, 0,
                                nullptr, nullptr);
  std::string result(size - 1, '\0');
  WideCharToMultiByte(CP_UTF8, 0, value.c_str(), -1, result.data(), size,
                      nullptr, nullptr);
  return result;
}

std::optional<std::string> PickSimulatorProfile(HWND hwnd) {
  wchar_t file_path[4096] = {};
  OPENFILENAMEW dialog = {};
  dialog.lStructSize = sizeof(dialog);
  dialog.hwndOwner = hwnd;
  dialog.lpstrFile = file_path;
  dialog.nMaxFile = sizeof(file_path) / sizeof(wchar_t);
  dialog.lpstrFilter =
      L"协议文件 (*.json;*.csv;*.xlsx;*.xls)\0*.json;*.csv;*.xlsx;*.xls\0"
      L"所有文件 (*.*)\0*.*\0";
  dialog.nFilterIndex = 1;
  dialog.Flags = OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR;
  if (!GetOpenFileNameW(&dialog)) {
    return std::nullopt;
  }
  return WideToUtf8(file_path);
}

void HandleWindowMethod(
    HWND hwnd,
    const flutter::MethodCall<flutter::EncodableValue>& call,
    std::unique_ptr<flutter::MethodResult<flutter::EncodableValue>> result) {
  const std::string& method = call.method_name();
  if (method == "startDrag") {
    StartWindowDrag(hwnd);
  } else if (method == "minimize") {
    ShowWindow(hwnd, SW_MINIMIZE);
  } else if (method == "toggleMaximize") {
    ToggleWindowMaximize(hwnd);
  } else if (method == "close") {
    PostMessage(hwnd, WM_CLOSE, 0, 0);
  } else if (method == "pickSimulatorProfile") {
    auto path = PickSimulatorProfile(hwnd);
    if (path.has_value()) {
      result->Success(flutter::EncodableValue(path.value()));
    } else {
      result->Success(flutter::EncodableValue());
    }
    return;
  } else {
    result->NotImplemented();
    return;
  }
  result->Success();
}

}  // namespace

FlutterWindow::FlutterWindow(const flutter::DartProject& project)
    : project_(project) {}

FlutterWindow::~FlutterWindow() {}

bool FlutterWindow::OnCreate() {
  if (!Win32Window::OnCreate()) {
    return false;
  }

  RECT frame = GetClientArea();

  // The size here must match the window dimensions to avoid unnecessary surface
  // creation / destruction in the startup path.
  flutter_controller_ = std::make_unique<flutter::FlutterViewController>(
      frame.right - frame.left, frame.bottom - frame.top, project_);
  // Ensure that basic setup of the controller was successful.
  if (!flutter_controller_->engine() || !flutter_controller_->view()) {
    return false;
  }
  RegisterPlugins(flutter_controller_->engine());
  window_channel_ =
      std::make_unique<flutter::MethodChannel<flutter::EncodableValue>>(
          flutter_controller_->engine()->messenger(), "icstudio/window",
          &flutter::StandardMethodCodec::GetInstance());
  window_channel_->SetMethodCallHandler(
      [hwnd = GetHandle()](const auto& call, auto result) {
        HandleWindowMethod(hwnd, call, std::move(result));
      });
  SetChildContent(flutter_controller_->view()->GetNativeWindow());

  flutter_controller_->engine()->SetNextFrameCallback([&]() {
    this->Show();
  });

  // Flutter can complete the first frame before the "show window" callback is
  // registered. The following call ensures a frame is pending to ensure the
  // window is shown. It is a no-op if the first frame hasn't completed yet.
  flutter_controller_->ForceRedraw();

  return true;
}

void FlutterWindow::OnDestroy() {
  window_channel_ = nullptr;
  if (flutter_controller_) {
    flutter_controller_ = nullptr;
  }

  Win32Window::OnDestroy();
}

LRESULT
FlutterWindow::MessageHandler(HWND hwnd, UINT const message,
                              WPARAM const wparam,
                              LPARAM const lparam) noexcept {
  // Give Flutter, including plugins, an opportunity to handle window messages.
  if (flutter_controller_) {
    std::optional<LRESULT> result =
        flutter_controller_->HandleTopLevelWindowProc(hwnd, message, wparam,
                                                      lparam);
    if (result) {
      return *result;
    }
  }

  switch (message) {
    case WM_FONTCHANGE:
      flutter_controller_->engine()->ReloadSystemFonts();
      break;
  }

  return Win32Window::MessageHandler(hwnd, message, wparam, lparam);
}
