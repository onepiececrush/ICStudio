# ICStudio Flutter

ICStudio 的 Flutter macOS 迁移工程。当前已通过 `flutter_rust_bridge` 连接独立 Rust core，并完成应用壳、首页概览、实时监控点表、从机模拟工作台、`AppSnapshot` 基础契约、Modbus TCP 首页连接以及关键寄存器实时轮询。

首页连接成功后每 2 秒轮询一次 9 个关键点；未连接或通信失败时不进行空闲轮询。

首页的“内置闭环自测”会在 `127.0.0.1:1502` 启动确定性 Rust Modbus TCP 从机，并通过正式主站 API 连接和读取；停止自测时会一并停止轮询、主站连接和从机线程。

“从机模拟”使用独立的 Rust TCP Server，默认监听 `127.0.0.1:5020`。它支持 JSON/CSV/XLS/XLSX 协议导入、FC03/04/06/16、工程值编辑、跨页面快调/报文抽屉、运行场景、真实故障注入、帧日志和异常统计。为了避免开发时误开放服务，监听地址仅接受 `127.0.0.1` 或 `localhost`；RTU 当前为界面预留。

从仓库根目录启动：

```bash
cd icstudio_flutter
flutter run -d macos
```

检查工程：

```bash
flutter analyze
flutter test
flutter build macos --debug
```

修改 `rust/src/api/` 后重新生成桥接代码：

```bash
flutter_rust_bridge_codegen generate
cargo test --manifest-path rust/Cargo.toml
```
