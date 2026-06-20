use crate::modbus::protocol::{
    connect_modbus_tcp, read_registers_with_stream, write_single_register_with_stream,
};
use std::collections::BTreeMap;
use std::net::{Shutdown, TcpStream};
use std::sync::Mutex;
use std::time::Instant;

const HOME_REGISTER_ADDRESS: u16 = 14001;
const HOME_READ_RANGES: &[(u16, u16)] = &[(14001, 7), (14031, 2), (25609, 3)];

struct HomeConnectionRuntime {
    stream: TcpStream,
    endpoint: String,
    unit_id: u8,
    latency_ms: u32,
    dashboard: HomeDashboard,
}

#[derive(Debug, Clone, PartialEq)]
pub struct HomeConnectionStatus {
    pub connected: bool,
    pub endpoint: String,
    pub unit_id: u8,
    pub status: String,
    pub latency_ms: u32,
    pub success_rate: f64,
    pub last_read_address: u16,
    pub last_read_value: u16,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct HomeDashboardValue {
    pub address: u16,
    pub name: String,
    pub raw_value: u16,
    pub engineering_value: f64,
    pub display_value: String,
    pub unit: String,
    pub quality: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct HomeDashboard {
    pub endpoint: String,
    pub connection_status: String,
    pub values: Vec<HomeDashboardValue>,
    pub last_updated: String,
}

#[derive(Clone, Copy)]
enum ValueKind {
    Unsigned,
    Signed,
    SystemState,
}

#[derive(Clone, Copy)]
struct PointDefinition {
    address: u16,
    name: &'static str,
    scale: f64,
    unit: &'static str,
    precision: usize,
    kind: ValueKind,
}

const HOME_POINTS: &[PointDefinition] = &[
    point(14001, "PCS 在线台数", 1.0, "台", 0, ValueKind::Unsigned),
    point(14002, "系统运行状态", 1.0, "", 0, ValueKind::SystemState),
    point(14005, "电网频率", 0.01, "Hz", 2, ValueKind::Unsigned),
    point(14006, "总有功功率", 0.1, "kW", 2, ValueKind::Signed),
    point(14007, "总无功功率", 0.01, "kvar", 2, ValueKind::Signed),
    point(14031, "电池直流电压", 0.1, "V", 2, ValueKind::Unsigned),
    point(14032, "电池电流", 0.01, "A", 2, ValueKind::Signed),
    point(25609, "SOC", 0.01, "%", 2, ValueKind::Unsigned),
    point(25611, "SOH", 0.01, "%", 2, ValueKind::Unsigned),
];

const fn point(
    address: u16,
    name: &'static str,
    scale: f64,
    unit: &'static str,
    precision: usize,
    kind: ValueKind,
) -> PointDefinition {
    PointDefinition {
        address,
        name,
        scale,
        unit,
        precision,
        kind,
    }
}

static HOME_CONNECTION: Mutex<Option<HomeConnectionRuntime>> = Mutex::new(None);

#[cfg(test)]
pub(crate) static TEST_CONNECTION_LOCK: Mutex<()> = Mutex::new(());

pub fn connect_home_modbus(
    host: String,
    port: u16,
    unit_id: u8,
) -> Result<HomeConnectionStatus, String> {
    let host = normalize_config(&host, port, unit_id)?;
    disconnect_home_modbus()?;

    let endpoint = format!("{host}:{port}");
    let started = Instant::now();
    let mut stream = connect_modbus_tcp(&host, port, 1_500, 1_000)?;
    let dashboard = poll_dashboard(&mut stream, unit_id, &endpoint)?;
    let latency_ms = elapsed_ms(started);
    let runtime = HomeConnectionRuntime {
        stream,
        endpoint,
        unit_id,
        latency_ms,
        dashboard,
    };
    let status = runtime_status(&runtime, "Modbus 关键寄存器轮询成功");
    *HOME_CONNECTION
        .lock()
        .map_err(|_| "首页连接状态锁定失败".to_string())? = Some(runtime);
    Ok(status)
}

pub fn refresh_home_modbus() -> Result<HomeConnectionStatus, String> {
    let mut slot = HOME_CONNECTION
        .lock()
        .map_err(|_| "首页连接状态锁定失败".to_string())?;
    let runtime = slot.as_mut().ok_or_else(|| "首页设备未连接".to_string())?;
    let started = Instant::now();
    match poll_dashboard(&mut runtime.stream, runtime.unit_id, &runtime.endpoint) {
        Ok(dashboard) => {
            runtime.latency_ms = elapsed_ms(started);
            runtime.dashboard = dashboard;
            Ok(runtime_status(runtime, "首页实时数据刷新成功"))
        }
        Err(error) => {
            slot.take();
            Err(error)
        }
    }
}

pub(crate) fn write_home_register(address: u16, value: u16) -> Result<(), String> {
    let mut slot = HOME_CONNECTION
        .lock()
        .map_err(|_| "首页连接状态锁定失败".to_string())?;
    let runtime = slot.as_mut().ok_or_else(|| "首页设备未连接".to_string())?;
    if let Err(error) =
        write_single_register_with_stream(&mut runtime.stream, runtime.unit_id, address, value)
    {
        slot.take();
        return Err(error);
    }
    Ok(())
}

#[flutter_rust_bridge::frb(sync)]
pub fn disconnect_home_modbus() -> Result<HomeConnectionStatus, String> {
    let mut slot = HOME_CONNECTION
        .lock()
        .map_err(|_| "首页连接状态锁定失败".to_string())?;
    if let Some(runtime) = slot.take() {
        let _ = runtime.stream.shutdown(Shutdown::Both);
    }
    Ok(disconnected_status())
}

#[flutter_rust_bridge::frb(sync)]
pub fn get_home_connection_status() -> HomeConnectionStatus {
    HOME_CONNECTION
        .lock()
        .ok()
        .and_then(|slot| {
            slot.as_ref()
                .map(|runtime| runtime_status(runtime, "连接正常"))
        })
        .unwrap_or_else(disconnected_status)
}

#[flutter_rust_bridge::frb(sync)]
pub fn get_home_dashboard() -> Result<HomeDashboard, String> {
    HOME_CONNECTION
        .lock()
        .map_err(|_| "首页连接状态锁定失败".to_string())?
        .as_ref()
        .map(|runtime| runtime.dashboard.clone())
        .ok_or_else(|| "首页设备未连接".to_string())
}

fn poll_dashboard(
    stream: &mut TcpStream,
    unit_id: u8,
    endpoint: &str,
) -> Result<HomeDashboard, String> {
    let mut raw_values = BTreeMap::new();
    for &(address, quantity) in HOME_READ_RANGES {
        let values = read_registers_with_stream(stream, unit_id, 3, address, quantity)?;
        for (offset, value) in values.into_iter().enumerate() {
            raw_values.insert(address + offset as u16, value);
        }
    }
    let values = HOME_POINTS
        .iter()
        .map(|point| {
            let raw = raw_values
                .get(&point.address)
                .copied()
                .ok_or_else(|| format!("缺少寄存器 {}", point.address))?;
            Ok(decode_value(*point, raw))
        })
        .collect::<Result<Vec<_>, String>>()?;
    Ok(HomeDashboard {
        endpoint: endpoint.to_string(),
        connection_status: "已连接".to_string(),
        values,
        last_updated: "刚刚".to_string(),
    })
}

fn decode_value(point: PointDefinition, raw: u16) -> HomeDashboardValue {
    let engineering_value = match point.kind {
        ValueKind::Signed => (raw as i16) as f64 * point.scale,
        ValueKind::Unsigned | ValueKind::SystemState => raw as f64 * point.scale,
    };
    let display_value = match point.kind {
        ValueKind::SystemState => system_state_label(raw).to_string(),
        _ => format!(
            "{engineering_value:.precision$}",
            precision = point.precision
        ),
    };
    HomeDashboardValue {
        address: point.address,
        name: point.name.to_string(),
        raw_value: raw,
        engineering_value,
        display_value,
        unit: point.unit.to_string(),
        quality: "良好".to_string(),
    }
}

fn system_state_label(raw: u16) -> &'static str {
    match raw {
        0 => "停机",
        1 => "并网运行",
        2 => "待机",
        3 => "故障",
        _ => "未知",
    }
}

fn normalize_config(host: &str, port: u16, unit_id: u8) -> Result<String, String> {
    let host = host.trim();
    if host.is_empty() {
        return Err("TCP IP 不能为空".to_string());
    }
    if host == "0.0.0.0" || host == "::" {
        return Err("首页连接不能使用监听地址，请填写下位机实际 IP".to_string());
    }
    if port == 0 {
        return Err("TCP 端口必须在 1..65535".to_string());
    }
    if unit_id == 0 || unit_id > 247 {
        return Err("Unit ID 必须在 1..247".to_string());
    }
    Ok(host.to_string())
}

fn runtime_status(runtime: &HomeConnectionRuntime, message: &str) -> HomeConnectionStatus {
    let online_device_count = runtime
        .dashboard
        .values
        .iter()
        .find(|value| value.address == HOME_REGISTER_ADDRESS)
        .map(|value| value.engineering_value as u16)
        .unwrap_or_default();
    HomeConnectionStatus {
        connected: true,
        endpoint: runtime.endpoint.clone(),
        unit_id: runtime.unit_id,
        status: "已连接".to_string(),
        latency_ms: runtime.latency_ms,
        success_rate: 100.0,
        last_read_address: HOME_REGISTER_ADDRESS,
        last_read_value: online_device_count,
        message: message.to_string(),
    }
}

fn disconnected_status() -> HomeConnectionStatus {
    HomeConnectionStatus {
        connected: false,
        endpoint: "未连接".to_string(),
        unit_id: 0,
        status: "未连接".to_string(),
        latency_ms: 0,
        success_rate: 0.0,
        last_read_address: HOME_REGISTER_ADDRESS,
        last_read_value: 0,
        message: "等待连接".to_string(),
    }
}

fn elapsed_ms(started: Instant) -> u32 {
    started.elapsed().as_millis().min(u32::MAX as u128) as u32
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    #[test]
    fn validates_connection_parameters() {
        assert!(connect_home_modbus(" ".to_string(), 502, 1).is_err());
        assert!(connect_home_modbus("0.0.0.0".to_string(), 502, 1).is_err());
        assert!(connect_home_modbus("127.0.0.1".to_string(), 0, 1).is_err());
        assert!(connect_home_modbus("127.0.0.1".to_string(), 502, 0).is_err());
    }

    #[test]
    fn connects_polls_and_decodes_home_registers() {
        let _guard = TEST_CONNECTION_LOCK.lock().expect("connection test lock");
        let listener = TcpListener::bind("127.0.0.1:0").expect("test listener");
        let port = listener.local_addr().expect("listener address").port();
        let server = thread::spawn(move || serve_poll_cycle(listener));

        let status =
            connect_home_modbus("127.0.0.1".to_string(), port, 1).expect("connect and poll");
        let dashboard = get_home_dashboard().expect("dashboard");

        assert!(status.connected);
        assert_eq!(status.last_read_value, 12);
        assert_eq!(dashboard.values.len(), HOME_POINTS.len());
        assert_eq!(value(&dashboard, 14002).display_value, "并网运行");
        assert_eq!(value(&dashboard, 14006).display_value, "1250.00");
        assert_eq!(value(&dashboard, 14007).display_value, "-120.50");
        assert_eq!(value(&dashboard, 14031).display_value, "768.20");
        assert_eq!(value(&dashboard, 14032).display_value, "-325.40");
        assert_eq!(value(&dashboard, 25609).display_value, "78.50");
        assert_eq!(value(&dashboard, 25611).display_value, "95.60");
        let snapshot = crate::api::snapshot::get_app_snapshot();
        assert!(snapshot.home_dashboard.is_some());
        assert_eq!(
            snapshot
                .metrics
                .iter()
                .find(|metric| metric.key == "active-power")
                .expect("active power metric")
                .value,
            "1250.00"
        );

        disconnect_home_modbus().expect("disconnect");
        server.join().expect("server thread");
    }

    fn value(dashboard: &HomeDashboard, address: u16) -> &HomeDashboardValue {
        dashboard
            .values
            .iter()
            .find(|value| value.address == address)
            .expect("dashboard value")
    }

    fn serve_poll_cycle(listener: TcpListener) {
        let (mut stream, _) = listener.accept().expect("accept client");
        for _ in HOME_READ_RANGES {
            let mut request = [0u8; 12];
            stream.read_exact(&mut request).expect("read request");
            let address = u16::from_be_bytes([request[8], request[9]]);
            let quantity = u16::from_be_bytes([request[10], request[11]]);
            let values: Vec<u16> = (0..quantity)
                .map(|offset| raw_value(address + offset))
                .collect();
            let length = 3 + values.len() * 2;
            let mut response = vec![
                request[0],
                request[1],
                0,
                0,
                (length >> 8) as u8,
                length as u8,
                request[6],
                3,
                (values.len() * 2) as u8,
            ];
            for value in values {
                response.extend_from_slice(&value.to_be_bytes());
            }
            stream.write_all(&response).expect("write response");
        }
    }

    fn raw_value(address: u16) -> u16 {
        match address {
            14001 => 12,
            14002 => 1,
            14005 => 5000,
            14006 => 12500,
            14007 => (-12050i16) as u16,
            14031 => 7682,
            14032 => (-32540i16) as u16,
            25609 => 7850,
            25611 => 9560,
            _ => 0,
        }
    }
}
