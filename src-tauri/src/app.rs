use crate::modbus::loopback::{
    connect_modbus_tcp_master, create_loopback_store, create_store_from_register_definitions,
    poll_loopback_dashboard_with_stream, poll_realtime_dashboard_with_stream,
    start_modbus_tcp_slave,
};
use crate::modbus::{
    HomeLoopbackDashboard, HomeVerificationRow, ModbusTcpSlaveServer, SimulatedRegisterStore,
    SimulatorRegisterDefinition,
};
use serde::Serialize;
use std::net::TcpStream;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

const LOOPBACK_HOST: &str = "127.0.0.1";
const LOOPBACK_PORT: u16 = 1502;
const LOOPBACK_UNIT_ID: u8 = 1;
const LOOPBACK_NOT_STARTED: &str = "自测未启动";
const HOME_DEVICE_LOCK_ERROR: &str = "首页设备连接状态锁定失败";
const HOME_DEVICE_NOT_CONNECTED: &str = "首页设备未连接";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectInfo {
    name: &'static str,
    protocol_version: &'static str,
    operator: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectionInfo {
    mode: String,
    endpoint: String,
    status: String,
    latency_ms: u16,
    success_rate: f32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MetricCard {
    key: &'static str,
    label: &'static str,
    value: String,
    unit: &'static str,
    tone: &'static str,
    helper: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DeviceStatus {
    name: String,
    device_type: String,
    connection: String,
    runtime: String,
    quality: String,
    last_seen: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ActivityItem {
    tone: &'static str,
    title: String,
    detail: String,
    time: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TrendPoint {
    time: &'static str,
    power: f32,
    soc: f32,
    quality: f32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppSnapshot {
    project: ProjectInfo,
    connection: ConnectionInfo,
    metrics: Vec<MetricCard>,
    devices: Vec<DeviceStatus>,
    activities: Vec<ActivityItem>,
    trends: Vec<TrendPoint>,
    loopback_dashboard: Option<HomeLoopbackDashboard>,
}

struct LoopbackRuntime {
    store: SimulatedRegisterStore,
    server: Option<ModbusTcpSlaveServer>,
    client: Option<TcpStream>,
    client_host: String,
    port: u16,
    unit_id: u8,
    endpoint: String,
    self_test_mode: bool,
    dynamic_values: bool,
}

struct SimulatorServerRuntime {
    store: SimulatedRegisterStore,
    server: Option<ModbusTcpSlaveServer>,
    endpoint: String,
    unit_id: u8,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SimulatorServerStatus {
    running: bool,
    endpoint: String,
    unit_id: u8,
    logs: Vec<String>,
}

// 首页只保留一个 Modbus TCP 主站长连接：Tauri command 可能并发调用，
// 所有读写和主站长连接统一经过这个 Mutex 串行化，避免同一条 TCP 连接并发收发串包。
static LOOPBACK: Mutex<Option<LoopbackRuntime>> = Mutex::new(None);
static SIMULATOR_SERVER: Mutex<Option<SimulatorServerRuntime>> = Mutex::new(None);

fn take_loopback_runtime() -> Result<Option<LoopbackRuntime>, String> {
    let mut runtime = LOOPBACK
        .lock()
        .map_err(|_| HOME_DEVICE_LOCK_ERROR.to_string())?;
    Ok(runtime.take())
}

fn save_loopback_runtime(runtime: LoopbackRuntime) -> Result<(), String> {
    let mut slot = LOOPBACK
        .lock()
        .map_err(|_| HOME_DEVICE_LOCK_ERROR.to_string())?;
    *slot = Some(runtime);
    Ok(())
}

fn stop_loopback_server(runtime: Option<LoopbackRuntime>) {
    if let Some(mut state) = runtime {
        state.client.take();
        if let Some(existing) = state.server.take() {
            existing.stop();
        }
    }
}

fn stop_simulator_server(runtime: Option<SimulatorServerRuntime>) {
    if let Some(mut state) = runtime {
        if let Some(existing) = state.server.take() {
            existing.stop();
        }
    }
}

fn simulator_status(runtime: &SimulatorServerRuntime) -> SimulatorServerStatus {
    SimulatorServerStatus {
        running: true,
        endpoint: runtime.endpoint.clone(),
        unit_id: runtime.unit_id,
        logs: runtime.store.logs(),
    }
}

#[derive(Clone, Debug)]
struct LoopbackConfig {
    listen_host: String,
    client_host: String,
    port: u16,
    unit_id: u8,
    endpoint: String,
}

fn normalize_loopback_config(
    host: Option<String>,
    port: Option<u16>,
    unit_id: Option<u8>,
) -> Result<LoopbackConfig, String> {
    let listen_host = host
        .unwrap_or_else(|| LOOPBACK_HOST.to_string())
        .trim()
        .to_string();
    if listen_host.is_empty() {
        return Err("TCP IP 不能为空".to_string());
    }
    let port = port.unwrap_or(LOOPBACK_PORT);
    if port == 0 {
        return Err("TCP 端口必须在 1..65535".to_string());
    }
    let unit_id = unit_id.unwrap_or(LOOPBACK_UNIT_ID);
    if unit_id == 0 || unit_id > 247 {
        return Err("Unit ID 必须在 1..247".to_string());
    }
    let client_host = match listen_host.as_str() {
        "0.0.0.0" => "127.0.0.1".to_string(),
        "::" => "::1".to_string(),
        _ => listen_host.clone(),
    };
    Ok(LoopbackConfig {
        endpoint: format!("{listen_host}:{port}"),
        listen_host,
        client_host,
        port,
        unit_id,
    })
}

fn normalize_home_device_config(
    host: Option<String>,
    port: Option<u16>,
    unit_id: Option<u8>,
) -> Result<LoopbackConfig, String> {
    let client_host = host.unwrap_or_default().trim().to_string();
    if client_host.is_empty() {
        return Err("TCP IP 不能为空，请输入下位机 IP".to_string());
    }
    if client_host == "0.0.0.0" || client_host == "::" {
        return Err("首页连接不能使用监听地址 0.0.0.0/::，请填写下位机实际 IP".to_string());
    }
    let port = port.unwrap_or(502);
    if port == 0 {
        return Err("TCP 端口必须在 1..65535".to_string());
    }
    let unit_id = unit_id.unwrap_or(LOOPBACK_UNIT_ID);
    if unit_id == 0 || unit_id > 247 {
        return Err("Unit ID 必须在 1..247".to_string());
    }
    Ok(LoopbackConfig {
        endpoint: format!("{client_host}:{port}"),
        listen_host: client_host.clone(),
        client_host,
        port,
        unit_id,
    })
}

fn ensure_loopback_client(runtime: &mut LoopbackRuntime) -> Result<&mut TcpStream, String> {
    if runtime.client.is_none() {
        runtime.client = Some(connect_modbus_tcp_master(
            &runtime.client_host,
            runtime.port,
        )?);
    }
    runtime
        .client
        .as_mut()
        .ok_or_else(|| "Modbus TCP 长连接未建立".to_string())
}

fn poll_loopback_runtime(runtime: &mut LoopbackRuntime) -> Result<HomeLoopbackDashboard, String> {
    if runtime.dynamic_values {
        runtime.store.refresh_dynamic_values()?;
    }
    let store = runtime.store.clone();
    let endpoint = runtime.endpoint.clone();
    let unit_id = runtime.unit_id;
    let self_test_mode = runtime.self_test_mode;
    let result = if self_test_mode {
        poll_loopback_dashboard_with_stream(
            ensure_loopback_client(runtime)?,
            &endpoint,
            unit_id,
            &store,
        )
    } else {
        poll_realtime_dashboard_with_stream(
            ensure_loopback_client(runtime)?,
            &endpoint,
            unit_id,
            &store,
        )
    };
    if result.is_err() {
        runtime.client.take();
    }
    result
}

fn ensure_self_test_runtime(runtime: &LoopbackRuntime) -> Result<(), String> {
    if runtime.self_test_mode {
        Ok(())
    } else {
        Err("当前首页连接是真实设备，不能执行自测模拟写值/故障注入".to_string())
    }
}

fn loopback_error_dashboard(
    endpoint: &str,
    parsed_value: Option<String>,
    logs: Vec<String>,
    self_test_mode: bool,
) -> HomeLoopbackDashboard {
    // 前端期望通信异常时仍然拿到完整 dashboard 结构，而不是弹出 invoke 异常。
    HomeLoopbackDashboard {
        self_test_mode,
        endpoint: endpoint.to_string(),
        connection_status: "通信异常".to_string(),
        values: Vec::new(),
        pcs_modules: Vec::new(),
        verification_rows: parsed_value
            .map(|parsed_value| {
                vec![HomeVerificationRow {
                    component: "通信链路".to_string(),
                    bound_address: endpoint.to_string(),
                    point_name: "Modbus TCP".to_string(),
                    expected_value: "可连接".to_string(),
                    parsed_value,
                    display_value: "--".to_string(),
                    unit: "".to_string(),
                    error: "通信失败".to_string(),
                    result: "通信失败".to_string(),
                }]
            })
            .unwrap_or_default(),
        severe_alarm_count: 0,
        general_alarm_count: 0,
        communication_alarm_count: 1,
        logs,
    }
}

#[tauri::command]
pub(crate) fn start_home_loopback_selftest(
    host: Option<String>,
    port: Option<u16>,
    unit_id: Option<u8>,
) -> Result<HomeLoopbackDashboard, String> {
    stop_loopback_server(take_loopback_runtime()?);
    let config = normalize_loopback_config(host, port, unit_id)?;
    let store = create_loopback_store();
    let server = start_modbus_tcp_slave(
        &config.listen_host,
        config.port,
        config.unit_id,
        store.clone(),
    )?;
    thread::sleep(Duration::from_millis(40));
    let mut runtime = LoopbackRuntime {
        store,
        server: Some(server),
        client: Some(connect_modbus_tcp_master(&config.client_host, config.port)?),
        client_host: config.client_host,
        port: config.port,
        unit_id: config.unit_id,
        endpoint: config.endpoint,
        self_test_mode: true,
        dynamic_values: true,
    };
    let dashboard = poll_loopback_runtime(&mut runtime)?;
    save_loopback_runtime(runtime)?;
    Ok(dashboard)
}

#[tauri::command]
pub(crate) fn stop_home_loopback_selftest() -> Result<(), String> {
    stop_loopback_server(take_loopback_runtime()?);
    Ok(())
}

#[tauri::command]
pub(crate) fn connect_home_modbus_dashboard(
    host: Option<String>,
    port: Option<u16>,
    unit_id: Option<u8>,
) -> Result<HomeLoopbackDashboard, String> {
    stop_loopback_server(take_loopback_runtime()?);
    let config = normalize_home_device_config(host, port, unit_id)?;
    let store = create_loopback_store();
    let mut runtime = LoopbackRuntime {
        store,
        server: None,
        client: Some(connect_modbus_tcp_master(&config.client_host, config.port)?),
        client_host: config.client_host,
        port: config.port,
        unit_id: config.unit_id,
        endpoint: config.endpoint,
        self_test_mode: false,
        dynamic_values: false,
    };
    let dashboard = poll_loopback_runtime(&mut runtime)?;
    save_loopback_runtime(runtime)?;
    Ok(dashboard)
}

#[tauri::command]
pub(crate) fn disconnect_home_modbus_dashboard() -> Result<(), String> {
    stop_loopback_server(take_loopback_runtime()?);
    Ok(())
}

#[tauri::command]
pub(crate) fn start_modbus_simulator_server(
    host: Option<String>,
    port: Option<u16>,
    unit_id: Option<u8>,
    registers: Option<Vec<SimulatorRegisterDefinition>>,
) -> Result<SimulatorServerStatus, String> {
    let mut slot = SIMULATOR_SERVER
        .lock()
        .map_err(|_| "从机模拟状态锁定失败".to_string())?;
    stop_simulator_server(slot.take());
    let config = normalize_loopback_config(host, port, unit_id)?;
    let store = if let Some(registers) = registers.as_ref().filter(|items| !items.is_empty()) {
        create_store_from_register_definitions(registers)
    } else {
        create_loopback_store()
    };
    store.log(format!(
        "从机模拟 TCP Server 已启动：{} unit={}",
        config.endpoint, config.unit_id
    ));
    let server = start_modbus_tcp_slave(
        &config.listen_host,
        config.port,
        config.unit_id,
        store.clone(),
    )?;
    let runtime = SimulatorServerRuntime {
        store,
        server: Some(server),
        endpoint: config.endpoint,
        unit_id: config.unit_id,
    };
    let status = simulator_status(&runtime);
    *slot = Some(runtime);
    Ok(status)
}

#[tauri::command]
pub(crate) fn set_modbus_simulator_register_value(
    address: u16,
    value: f64,
) -> Result<SimulatorServerStatus, String> {
    let mut slot = SIMULATOR_SERVER
        .lock()
        .map_err(|_| "从机模拟状态锁定失败".to_string())?;
    let runtime = slot
        .as_mut()
        .ok_or_else(|| "从机模拟尚未启动".to_string())?;
    runtime.store.set_number(address, value)?;
    Ok(simulator_status(runtime))
}

#[tauri::command]
pub(crate) fn stop_modbus_simulator_server() -> Result<SimulatorServerStatus, String> {
    let mut slot = SIMULATOR_SERVER
        .lock()
        .map_err(|_| "从机模拟状态锁定失败".to_string())?;
    let stopped_endpoint = slot
        .as_ref()
        .map(|runtime| runtime.endpoint.clone())
        .unwrap_or_else(|| "未启动".to_string());
    stop_simulator_server(slot.take());
    Ok(SimulatorServerStatus {
        running: false,
        endpoint: stopped_endpoint,
        unit_id: 0,
        logs: vec!["从机模拟 TCP Server 已停止".to_string()],
    })
}

#[tauri::command]
pub(crate) fn get_modbus_simulator_status() -> Result<SimulatorServerStatus, String> {
    let slot = SIMULATOR_SERVER
        .lock()
        .map_err(|_| "从机模拟状态锁定失败".to_string())?;
    Ok(slot
        .as_ref()
        .map(simulator_status)
        .unwrap_or(SimulatorServerStatus {
            running: false,
            endpoint: "未启动".to_string(),
            unit_id: 0,
            logs: Vec::new(),
        }))
}

#[tauri::command]
pub(crate) fn poll_home_loopback_dashboard() -> Result<HomeLoopbackDashboard, String> {
    let mut runtime = LOOPBACK
        .lock()
        .map_err(|_| HOME_DEVICE_LOCK_ERROR.to_string())?;
    let state = runtime
        .as_mut()
        .ok_or_else(|| HOME_DEVICE_NOT_CONNECTED.to_string())?;
    match poll_loopback_runtime(state) {
        Ok(dashboard) => Ok(dashboard),
        Err(error) => Ok(loopback_error_dashboard(
            &state.endpoint,
            Some(error),
            state.store.logs(),
            state.self_test_mode,
        )),
    }
}

#[tauri::command]
pub(crate) fn set_loopback_value(
    address: u16,
    value: f64,
) -> Result<HomeLoopbackDashboard, String> {
    let mut runtime = LOOPBACK
        .lock()
        .map_err(|_| HOME_DEVICE_LOCK_ERROR.to_string())?;
    let state = runtime
        .as_mut()
        .ok_or_else(|| LOOPBACK_NOT_STARTED.to_string())?;
    ensure_self_test_runtime(state)?;
    state.store.set_number(address, value)?;
    poll_loopback_runtime(state)
}

#[tauri::command]
pub(crate) fn inject_pcs3_fault() -> Result<HomeLoopbackDashboard, String> {
    let mut runtime = LOOPBACK
        .lock()
        .map_err(|_| HOME_DEVICE_LOCK_ERROR.to_string())?;
    let state = runtime
        .as_mut()
        .ok_or_else(|| LOOPBACK_NOT_STARTED.to_string())?;
    ensure_self_test_runtime(state)?;
    state.store.set_enum(16010, 3, "故障")?;
    state.store.set_number(16021, 1.0)?;
    state.store.set_number(14003, 1.0)?;
    poll_loopback_runtime(state)
}

#[tauri::command]
pub(crate) fn clear_loopback_faults() -> Result<HomeLoopbackDashboard, String> {
    let mut runtime = LOOPBACK
        .lock()
        .map_err(|_| HOME_DEVICE_LOCK_ERROR.to_string())?;
    let state = runtime
        .as_mut()
        .ok_or_else(|| LOOPBACK_NOT_STARTED.to_string())?;
    ensure_self_test_runtime(state)?;
    state.store.set_enum(16010, 1, "运行")?;
    state.store.set_number(16021, 0.0)?;
    state.store.set_number(14003, 0.0)?;
    poll_loopback_runtime(state)
}

#[tauri::command]
pub(crate) fn interrupt_loopback_communication() -> Result<HomeLoopbackDashboard, String> {
    let (server, store, endpoint, self_test_mode) = {
        let mut runtime = LOOPBACK
            .lock()
            .map_err(|_| HOME_DEVICE_LOCK_ERROR.to_string())?;
        let state = runtime
            .as_mut()
            .ok_or_else(|| LOOPBACK_NOT_STARTED.to_string())?;
        ensure_self_test_runtime(state)?;
        state.client.take();
        (
            state.server.take(),
            state.store.clone(),
            state.endpoint.clone(),
            state.self_test_mode,
        )
    };
    if let Some(server) = server {
        server.stop();
    }
    store.log(format!("模拟通信中断：停止 {endpoint} TCP Server"));
    Ok(loopback_error_dashboard(
        &endpoint,
        Some("TCP Server 已停止".to_string()),
        store.logs(),
        self_test_mode,
    ))
}

#[tauri::command]
pub(crate) fn get_app_snapshot() -> AppSnapshot {
    let loopback_dashboard = LOOPBACK.lock().ok().and_then(|mut runtime| {
        runtime.as_mut().map(|state| {
            poll_loopback_runtime(state).unwrap_or_else(|_| {
                loopback_error_dashboard(
                    &state.endpoint,
                    None,
                    state.store.logs(),
                    state.self_test_mode,
                )
            })
        })
    });
    let endpoint = loopback_dashboard
        .as_ref()
        .map(|d| d.endpoint.clone())
        .unwrap_or_else(|| "未连接".to_string());
    let status = loopback_dashboard
        .as_ref()
        .map(|d| d.connection_status.clone())
        .unwrap_or_else(|| "未连接".to_string());
    let connected = status == "已连接";
    AppSnapshot {
        project: ProjectInfo {
            name: "EVE储能项目",
            protocol_version: "PCS Modbus V3.13 / BMS V1.06",
            operator: "admin",
        },
        connection: ConnectionInfo {
            mode: "Modbus TCP 主站".to_string(),
            endpoint,
            status: status.clone(),
            latency_ms: if connected { 12 } else { 0 },
            success_rate: if connected { 100.0 } else { 0.0 },
        },
        metrics: vec![
            MetricCard {
                key: "health",
                label: "系统健康度",
                value: if connected { "96" } else { "--" }.to_string(),
                unit: "分",
                tone: "blue",
                helper: if connected {
                    "较昨日 +2 分"
                } else {
                    "等待连接"
                }
                .to_string(),
            },
            MetricCard {
                key: "online",
                label: "在线设备",
                value: if connected { "12" } else { "0" }.to_string(),
                unit: "台",
                tone: "green",
                helper: if connected {
                    "正常 12 / 异常 0"
                } else {
                    "未连接"
                }
                .to_string(),
            },
            MetricCard {
                key: "alarm",
                label: "活动告警",
                value: loopback_dashboard
                    .as_ref()
                    .map(|d| d.severe_alarm_count.to_string())
                    .unwrap_or_else(|| "0".to_string()),
                unit: "条",
                tone: "red",
                helper: if connected {
                    "紧急 / 重要"
                } else {
                    "等待连接"
                }
                .to_string(),
            },
            MetricCard {
                key: "simulation",
                label: "运行仿真",
                value: if loopback_dashboard.is_some() {
                    "1"
                } else {
                    "0"
                }
                .to_string(),
                unit: "个",
                tone: "purple",
                helper: if connected {
                    "首页连接"
                } else {
                    "未连接"
                }
                .to_string(),
            },
            MetricCard {
                key: "autotest",
                label: "自动化测试",
                value: loopback_dashboard
                    .as_ref()
                    .map(|d| {
                        d.verification_rows
                            .iter()
                            .filter(|row| row.result == "通过")
                            .count()
                            .to_string()
                    })
                    .unwrap_or_else(|| "0".to_string()),
                unit: "项",
                tone: "cyan",
                helper: if connected {
                    "首页数据读取"
                } else {
                    "等待连接"
                }
                .to_string(),
            },
            MetricCard {
                key: "upgrade",
                label: "固件升级",
                value: if connected { "1" } else { "0" }.to_string(),
                unit: "项",
                tone: "orange",
                helper: if connected {
                    "成功率 87%"
                } else {
                    "等待连接"
                }
                .to_string(),
            },
        ],
        devices: (1..=4)
            .map(|id| DeviceStatus {
                name: format!("PCS-{id:02}"),
                device_type: "PCS".to_string(),
                connection: status.clone(),
                runtime: if connected { "运行中" } else { "未连接" }.to_string(),
                quality: if connected { "100%" } else { "--" }.to_string(),
                last_seen: "现在",
            })
            .collect(),
        activities: vec![ActivityItem {
            tone: if connected { "green" } else { "cyan" },
            title: if connected {
                "首页设备已连接"
            } else {
                "等待首页设备连接"
            }
            .to_string(),
            detail: if connected {
                status.clone()
            } else {
                "请在首页输入下位机 IP 和端口后连接".to_string()
            },
            time: "现在",
        }],
        trends: vec![TrendPoint {
            time: "现在",
            power: if connected { 1250.0 } else { 0.0 },
            soc: if connected { 78.5 } else { 0.0 },
            quality: if connected { 100.0 } else { 0.0 },
        }],
        loopback_dashboard,
    }
}
