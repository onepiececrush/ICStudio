use std::collections::BTreeMap;
use std::io::{ErrorKind, Read, Write};
use std::net::{Shutdown, SocketAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const MAX_LOGS: usize = 120;
const MAX_FRAMES: usize = 120;

#[derive(Debug, Clone, PartialEq)]
pub struct DeviceSimulatorRegisterDefinition {
    pub address: u16,
    pub name: String,
    pub data_type: String,
    pub length: u16,
    pub scale: f64,
    pub unit: String,
    pub engineering_value: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct DeviceSimulatorValueUpdate {
    pub address: u16,
    pub engineering_value: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct DeviceSimulatorRegisterState {
    pub address: u16,
    pub name: String,
    pub data_type: String,
    pub length: u16,
    pub scale: f64,
    pub unit: String,
    pub engineering_value: f64,
    pub raw_words: Vec<u16>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct DeviceSimulatorFrame {
    pub direction: String,
    pub time: String,
    pub frame: String,
    pub note: String,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct DeviceSimulatorExceptionStats {
    pub ok: u32,
    pub exception_code: u32,
    pub timeout: u32,
    pub no_response: u32,
    pub out_of_range: u32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct DeviceSimulatorStatus {
    pub running: bool,
    pub endpoint: String,
    pub unit_id: u8,
    pub fault_mode: String,
    pub registers: Vec<DeviceSimulatorRegisterState>,
    pub logs: Vec<String>,
    pub frames: Vec<DeviceSimulatorFrame>,
    pub stats: DeviceSimulatorExceptionStats,
}

#[derive(Clone, Copy)]
enum PointDataType {
    UInt16,
    Int16,
    UInt32,
    Int32,
    Float32,
}

struct SimulatorPoint {
    definition: DeviceSimulatorRegisterDefinition,
    data_type: PointDataType,
    engineering_value: f64,
}

#[derive(Clone)]
pub struct FaultConfig {
    pub mode: String,
    pub exception_code: u8,
    pub rate: f64,
}

impl Default for FaultConfig {
    fn default() -> Self {
        Self {
            mode: "none".to_string(),
            exception_code: 3,
            rate: 0.0,
        }
    }
}

struct SharedState {
    points: Mutex<BTreeMap<u16, SimulatorPoint>>,
    logs: Mutex<Vec<String>>,
    frames: Mutex<Vec<DeviceSimulatorFrame>>,
    fault: Mutex<FaultConfig>,
    stats: Mutex<DeviceSimulatorExceptionStats>,
    request_sequence: AtomicU64,
}

struct DeviceSimulatorRuntime {
    address: SocketAddr,
    unit_id: u8,
    state: Arc<SharedState>,
    stop: Arc<AtomicBool>,
    thread: JoinHandle<()>,
}

static DEVICE_SIMULATOR: Mutex<Option<DeviceSimulatorRuntime>> = Mutex::new(None);

pub fn start_device_simulator(
    host: String,
    port: u16,
    unit_id: u8,
    registers: Vec<DeviceSimulatorRegisterDefinition>,
) -> Result<DeviceSimulatorStatus, String> {
    let host = normalize_host(&host)?;
    if port == 0 {
        return Err("监听端口必须在 1..65535".to_string());
    }
    if unit_id == 0 || unit_id > 247 {
        return Err("Unit ID 必须在 1..247".to_string());
    }
    if registers.is_empty() {
        return Err("当前 Profile 没有可模拟的数值寄存器".to_string());
    }
    stop_device_simulator()?;
    let points = build_points(registers)?;
    let listener = TcpListener::bind((host.as_str(), port))
        .map_err(|error| format!("无法监听 {host}:{port}: {error}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|error| format!("无法设置非阻塞监听: {error}"))?;
    let address = listener
        .local_addr()
        .map_err(|error| format!("读取监听地址失败: {error}"))?;
    let state = Arc::new(SharedState {
        points: Mutex::new(points),
        logs: Mutex::new(Vec::new()),
        frames: Mutex::new(Vec::new()),
        fault: Mutex::new(FaultConfig::default()),
        stats: Mutex::new(DeviceSimulatorExceptionStats::default()),
        request_sequence: AtomicU64::new(0),
    });
    push_log(
        &state,
        format!("从机模拟 TCP Server 已启动: {address} unit={unit_id}"),
    );
    let stop = Arc::new(AtomicBool::new(false));
    let thread = {
        let state = Arc::clone(&state);
        let stop = Arc::clone(&stop);
        thread::spawn(move || serve(listener, unit_id, state, stop))
    };
    let runtime = DeviceSimulatorRuntime {
        address,
        unit_id,
        state,
        stop,
        thread,
    };
    let status = runtime_status(&runtime)?;
    *DEVICE_SIMULATOR
        .lock()
        .map_err(|_| "从机模拟状态锁定失败".to_string())? = Some(runtime);
    Ok(status)
}

#[flutter_rust_bridge::frb(sync)]
pub fn stop_device_simulator() -> Result<DeviceSimulatorStatus, String> {
    let runtime = DEVICE_SIMULATOR
        .lock()
        .map_err(|_| "从机模拟状态锁定失败".to_string())?
        .take();
    let Some(runtime) = runtime else {
        return Ok(stopped_status("未启动"));
    };
    let endpoint = runtime.address.to_string();
    runtime.stop.store(true, Ordering::SeqCst);
    let _ = TcpStream::connect_timeout(&runtime.address, Duration::from_millis(100));
    runtime
        .thread
        .join()
        .map_err(|_| "从机模拟线程停止失败".to_string())?;
    Ok(stopped_status(&endpoint))
}

#[flutter_rust_bridge::frb(sync)]
pub fn get_device_simulator_status() -> Result<DeviceSimulatorStatus, String> {
    let slot = DEVICE_SIMULATOR
        .lock()
        .map_err(|_| "从机模拟状态锁定失败".to_string())?;
    match slot.as_ref() {
        Some(runtime) => runtime_status(runtime),
        None => Ok(stopped_status("未启动")),
    }
}

#[flutter_rust_bridge::frb(sync)]
pub fn set_device_simulator_register(
    address: u16,
    engineering_value: f64,
) -> Result<DeviceSimulatorStatus, String> {
    with_runtime(|runtime| {
        set_point_value(&runtime.state, address, engineering_value)?;
        push_log(
            &runtime.state,
            format!("手动修改寄存器 {address} = {engineering_value}"),
        );
        runtime_status(runtime)
    })
}

#[flutter_rust_bridge::frb(sync)]
pub fn apply_device_simulator_values(
    updates: Vec<DeviceSimulatorValueUpdate>,
) -> Result<DeviceSimulatorStatus, String> {
    with_runtime(|runtime| {
        for update in updates {
            set_point_value(&runtime.state, update.address, update.engineering_value)?;
        }
        push_log(&runtime.state, "批量应用模拟场景".to_string());
        runtime_status(runtime)
    })
}

#[flutter_rust_bridge::frb(sync)]
pub fn set_device_simulator_fault(
    mode: String,
    exception_code: u8,
    rate: f64,
) -> Result<DeviceSimulatorStatus, String> {
    let normalized = match mode.as_str() {
        "none" | "exceptionCode" | "timeout" | "noResponse" | "outOfRange" => mode,
        _ => return Err("未知故障注入模式".to_string()),
    };
    if !(0.0..=1.0).contains(&rate) {
        return Err("故障注入率必须在 0..1".to_string());
    }
    with_runtime(|runtime| {
        *runtime
            .state
            .fault
            .lock()
            .map_err(|_| "故障注入状态锁定失败".to_string())? = FaultConfig {
            mode: normalized.clone(),
            exception_code: exception_code.max(1),
            rate,
        };
        push_log(
            &runtime.state,
            format!("故障注入更新: {normalized} rate={rate}"),
        );
        runtime_status(runtime)
    })
}

fn with_runtime<T>(
    action: impl FnOnce(&DeviceSimulatorRuntime) -> Result<T, String>,
) -> Result<T, String> {
    let slot = DEVICE_SIMULATOR
        .lock()
        .map_err(|_| "从机模拟状态锁定失败".to_string())?;
    action(
        slot.as_ref()
            .ok_or_else(|| "从机模拟尚未启动".to_string())?,
    )
}

fn build_points(
    definitions: Vec<DeviceSimulatorRegisterDefinition>,
) -> Result<BTreeMap<u16, SimulatorPoint>, String> {
    let mut points = BTreeMap::new();
    for mut definition in definitions {
        if definition.name.trim().is_empty() {
            return Err(format!("寄存器 {} 名称不能为空", definition.address));
        }
        if !definition.engineering_value.is_finite() {
            return Err(format!("寄存器 {} 工程值非法", definition.address));
        }
        if !definition.scale.is_finite() || definition.scale == 0.0 {
            definition.scale = 1.0;
        }
        definition.length = definition.length.max(1);
        let data_type = normalize_data_type(&definition.data_type, definition.length);
        let expected_length = match data_type {
            PointDataType::UInt32 | PointDataType::Int32 | PointDataType::Float32 => 2,
            _ => 1,
        };
        definition.length = definition.length.max(expected_length);
        if points.contains_key(&definition.address) {
            return Err(format!("寄存器地址 {} 重复", definition.address));
        }
        points.insert(
            definition.address,
            SimulatorPoint {
                engineering_value: definition.engineering_value,
                data_type,
                definition,
            },
        );
    }
    Ok(points)
}

fn normalize_data_type(value: &str, length: u16) -> PointDataType {
    let value = value.to_ascii_lowercase();
    if value.contains("float") {
        PointDataType::Float32
    } else if value.contains("uint32") || (value.contains("uint") && length >= 2) {
        PointDataType::UInt32
    } else if value.contains("int32") || (value.contains("int") && length >= 2) {
        PointDataType::Int32
    } else if value.contains("uint")
        || value.contains("bool")
        || value.contains("bit")
        || value.contains("enum")
    {
        PointDataType::UInt16
    } else {
        PointDataType::Int16
    }
}

fn encode_words(point: &SimulatorPoint) -> Vec<u16> {
    let scaled = point.engineering_value / point.definition.scale;
    match point.data_type {
        PointDataType::UInt16 => vec![scaled.round().clamp(0.0, u16::MAX as f64) as u16],
        PointDataType::Int16 => {
            vec![(scaled.round().clamp(i16::MIN as f64, i16::MAX as f64) as i16) as u16]
        }
        PointDataType::UInt32 => {
            let raw = scaled.round().clamp(0.0, u32::MAX as f64) as u32;
            vec![(raw >> 16) as u16, raw as u16]
        }
        PointDataType::Int32 => {
            let raw = scaled.round().clamp(i32::MIN as f64, i32::MAX as f64) as i32 as u32;
            vec![(raw >> 16) as u16, raw as u16]
        }
        PointDataType::Float32 => {
            let raw = (scaled as f32).to_bits();
            vec![(raw >> 16) as u16, raw as u16]
        }
    }
}

fn decode_words(point: &SimulatorPoint, words: &[u16]) -> f64 {
    let raw = words.first().copied().unwrap_or_default();
    let numeric = match point.data_type {
        PointDataType::UInt16 => raw as f64,
        PointDataType::Int16 => (raw as i16) as f64,
        PointDataType::UInt32 => {
            let value = ((raw as u32) << 16) | words.get(1).copied().unwrap_or_default() as u32;
            value as f64
        }
        PointDataType::Int32 => {
            let value = ((raw as u32) << 16) | words.get(1).copied().unwrap_or_default() as u32;
            (value as i32) as f64
        }
        PointDataType::Float32 => {
            let value = ((raw as u32) << 16) | words.get(1).copied().unwrap_or_default() as u32;
            f32::from_bits(value) as f64
        }
    };
    numeric * point.definition.scale
}

fn set_point_value(state: &SharedState, address: u16, value: f64) -> Result<(), String> {
    if !value.is_finite() {
        return Err("工程值必须是有效数字".to_string());
    }
    let mut points = state
        .points
        .lock()
        .map_err(|_| "寄存器状态锁定失败".to_string())?;
    let point = points
        .get_mut(&address)
        .ok_or_else(|| format!("寄存器 {address} 不存在"))?;
    point.engineering_value = value;
    Ok(())
}

fn read_word(state: &SharedState, address: u16) -> u16 {
    let Ok(points) = state.points.lock() else {
        return 0;
    };
    for point in points.values() {
        let end = point
            .definition
            .address
            .saturating_add(point.definition.length.saturating_sub(1));
        if (point.definition.address..=end).contains(&address) {
            return encode_words(point)
                .get((address - point.definition.address) as usize)
                .copied()
                .unwrap_or_default();
        }
    }
    0
}

fn write_word(state: &SharedState, address: u16, value: u16) -> Result<(), String> {
    let mut points = state
        .points
        .lock()
        .map_err(|_| "寄存器状态锁定失败".to_string())?;
    let point_address = points
        .iter()
        .find_map(|(start, point)| {
            let end = start.saturating_add(point.definition.length.saturating_sub(1));
            ((*start..=end).contains(&address)).then_some(*start)
        })
        .ok_or_else(|| format!("寄存器 {address} 不存在"))?;
    let point = points
        .get_mut(&point_address)
        .ok_or_else(|| format!("寄存器 {point_address} 不存在"))?;
    let mut words = encode_words(point);
    let offset = (address - point_address) as usize;
    if offset >= words.len() {
        return Err(format!("寄存器 {address} 写入越界"));
    }
    words[offset] = value;
    point.engineering_value = decode_words(point, &words);
    Ok(())
}

fn serve(listener: TcpListener, unit_id: u8, state: Arc<SharedState>, stop: Arc<AtomicBool>) {
    while !stop.load(Ordering::SeqCst) {
        match listener.accept() {
            Ok((stream, peer)) => {
                push_log(&state, format!("主站连接建立: {peer}"));
                let state = Arc::clone(&state);
                let stop = Arc::clone(&stop);
                thread::spawn(move || serve_client(stream, peer, unit_id, state, stop));
            }
            Err(error) if error.kind() == ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(10));
            }
            Err(error) => {
                push_log(&state, format!("监听失败: {error}"));
                return;
            }
        }
    }
}

fn serve_client(
    mut stream: TcpStream,
    peer: SocketAddr,
    unit_id: u8,
    state: Arc<SharedState>,
    stop: Arc<AtomicBool>,
) {
    let _ = stream.set_read_timeout(Some(Duration::from_millis(100)));
    while !stop.load(Ordering::SeqCst) {
        let mut header = [0u8; 7];
        match stream.read_exact(&mut header) {
            Ok(()) => {}
            Err(error) if matches!(error.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => {
                continue;
            }
            Err(_) => break,
        }
        let length = u16::from_be_bytes([header[4], header[5]]) as usize;
        if u16::from_be_bytes([header[2], header[3]]) != 0 || !(2..=254).contains(&length) {
            break;
        }
        let mut pdu = vec![0; length - 1];
        if stream.read_exact(&mut pdu).is_err() || pdu.is_empty() {
            break;
        }
        let mut request = header.to_vec();
        request.extend_from_slice(&pdu);
        push_frame(&state, "request", &request, request_note(&pdu));
        if header[6] != unit_id {
            let response = exception_response(&header, pdu[0], 0x0b);
            push_frame(&state, "response", &response, "Unit ID 不匹配".to_string());
            let _ = stream.write_all(&response);
            continue;
        }
        if apply_fault(&state, &header, &pdu, &mut stream) {
            continue;
        }
        let response_pdu = process_pdu(&pdu, &state);
        let response = response_frame(&header, &response_pdu);
        push_frame(&state, "response", &response, response_note(&response_pdu));
        if stream.write_all(&response).is_err() {
            break;
        }
        if let Ok(mut stats) = state.stats.lock() {
            stats.ok = stats.ok.saturating_add(1);
        }
    }
    let _ = stream.shutdown(Shutdown::Both);
    push_log(&state, format!("主站连接关闭: {peer}"));
}

fn apply_fault(state: &SharedState, header: &[u8; 7], pdu: &[u8], stream: &mut TcpStream) -> bool {
    let fault = state
        .fault
        .lock()
        .map(|value| value.clone())
        .unwrap_or_default();
    if fault.mode == "none" || fault.rate <= 0.0 {
        return false;
    }
    let sequence = state.request_sequence.fetch_add(1, Ordering::Relaxed);
    if (sequence % 1000) as f64 >= fault.rate * 1000.0 {
        return false;
    }
    let function = pdu[0];
    match fault.mode.as_str() {
        "exceptionCode" => {
            let response = exception_response(header, function, fault.exception_code);
            push_frame(state, "response", &response, "故障注入: 异常码".to_string());
            let _ = stream.write_all(&response);
            if let Ok(mut stats) = state.stats.lock() {
                stats.exception_code = stats.exception_code.saturating_add(1);
            }
        }
        "timeout" => {
            push_frame(state, "response", &[], "故障注入: 超时".to_string());
            thread::sleep(Duration::from_millis(1_500));
            if let Ok(mut stats) = state.stats.lock() {
                stats.timeout = stats.timeout.saturating_add(1);
            }
        }
        "noResponse" => {
            push_frame(state, "response", &[], "故障注入: 无响应".to_string());
            if let Ok(mut stats) = state.stats.lock() {
                stats.no_response = stats.no_response.saturating_add(1);
            }
        }
        "outOfRange" => {
            let response = exception_response(header, function, 0x02);
            push_frame(
                state,
                "response",
                &response,
                "故障注入: 地址越界".to_string(),
            );
            let _ = stream.write_all(&response);
            if let Ok(mut stats) = state.stats.lock() {
                stats.out_of_range = stats.out_of_range.saturating_add(1);
            }
        }
        _ => return false,
    }
    true
}

fn process_pdu(pdu: &[u8], state: &SharedState) -> Vec<u8> {
    if pdu.len() < 5 {
        return vec![pdu.first().copied().unwrap_or_default() | 0x80, 0x03];
    }
    let function = pdu[0];
    let address = u16::from_be_bytes([pdu[1], pdu[2]]);
    match function {
        3 | 4 => {
            let quantity = u16::from_be_bytes([pdu[3], pdu[4]]);
            if quantity == 0 || quantity > 125 {
                return vec![function | 0x80, 0x03];
            }
            let mut response = vec![function, (quantity * 2) as u8];
            for offset in 0..quantity {
                response.extend_from_slice(
                    &read_word(state, address.saturating_add(offset)).to_be_bytes(),
                );
            }
            push_log(
                state,
                format!("FC{function:02} 读取 {address} 数量 {quantity}"),
            );
            response
        }
        6 => {
            let value = u16::from_be_bytes([pdu[3], pdu[4]]);
            if write_word(state, address, value).is_err() {
                return vec![0x86, 0x02];
            }
            push_log(state, format!("FC06 写入 {address} raw={value}"));
            pdu[0..5].to_vec()
        }
        16 => {
            if pdu.len() < 6 {
                return vec![0x90, 0x03];
            }
            let quantity = u16::from_be_bytes([pdu[3], pdu[4]]);
            let byte_count = pdu[5] as usize;
            if byte_count != quantity as usize * 2 || pdu.len() < 6 + byte_count {
                return vec![0x90, 0x03];
            }
            for offset in 0..quantity {
                let index = 6 + offset as usize * 2;
                let value = u16::from_be_bytes([pdu[index], pdu[index + 1]]);
                if write_word(state, address.saturating_add(offset), value).is_err() {
                    return vec![0x90, 0x02];
                }
            }
            push_log(state, format!("FC16 写入 {address} 数量 {quantity}"));
            vec![16, pdu[1], pdu[2], pdu[3], pdu[4]]
        }
        _ => vec![function | 0x80, 0x01],
    }
}

fn response_frame(header: &[u8; 7], pdu: &[u8]) -> Vec<u8> {
    let mut frame = Vec::with_capacity(7 + pdu.len());
    frame.extend_from_slice(&header[0..2]);
    frame.extend_from_slice(&0u16.to_be_bytes());
    frame.extend_from_slice(&((pdu.len() + 1) as u16).to_be_bytes());
    frame.push(header[6]);
    frame.extend_from_slice(pdu);
    frame
}

fn exception_response(header: &[u8; 7], function: u8, code: u8) -> Vec<u8> {
    response_frame(header, &[function | 0x80, code])
}

fn request_note(pdu: &[u8]) -> String {
    format!("FC{:02} 请求", pdu.first().copied().unwrap_or_default())
}

fn response_note(pdu: &[u8]) -> String {
    format!("FC{:02} 响应", pdu.first().copied().unwrap_or_default())
}

fn push_log(state: &SharedState, message: String) {
    if let Ok(mut logs) = state.logs.lock() {
        logs.push(format!("{}: {message}", unix_seconds()));
        if logs.len() > MAX_LOGS {
            logs.remove(0);
        }
    }
}

fn push_frame(state: &SharedState, direction: &str, frame: &[u8], note: String) {
    if let Ok(mut frames) = state.frames.lock() {
        frames.insert(
            0,
            DeviceSimulatorFrame {
                direction: direction.to_string(),
                time: unix_seconds().to_string(),
                frame: if frame.is_empty() {
                    "--".to_string()
                } else {
                    frame
                        .iter()
                        .map(|byte| format!("{byte:02X}"))
                        .collect::<Vec<_>>()
                        .join(" ")
                },
                note,
            },
        );
        frames.truncate(MAX_FRAMES);
    }
}

fn runtime_status(runtime: &DeviceSimulatorRuntime) -> Result<DeviceSimulatorStatus, String> {
    let registers = runtime
        .state
        .points
        .lock()
        .map_err(|_| "寄存器状态锁定失败".to_string())?
        .values()
        .map(|point| DeviceSimulatorRegisterState {
            address: point.definition.address,
            name: point.definition.name.clone(),
            data_type: point.definition.data_type.clone(),
            length: point.definition.length,
            scale: point.definition.scale,
            unit: point.definition.unit.clone(),
            engineering_value: point.engineering_value,
            raw_words: encode_words(point),
        })
        .collect();
    let logs = runtime
        .state
        .logs
        .lock()
        .map_err(|_| "运行日志锁定失败".to_string())?
        .clone();
    let frames = runtime
        .state
        .frames
        .lock()
        .map_err(|_| "报文日志锁定失败".to_string())?
        .clone();
    let fault_mode = runtime
        .state
        .fault
        .lock()
        .map_err(|_| "故障注入状态锁定失败".to_string())?
        .mode
        .clone();
    let stats = runtime
        .state
        .stats
        .lock()
        .map_err(|_| "异常统计锁定失败".to_string())?
        .clone();
    Ok(DeviceSimulatorStatus {
        running: true,
        endpoint: runtime.address.to_string(),
        unit_id: runtime.unit_id,
        fault_mode,
        registers,
        logs,
        frames,
        stats,
    })
}

fn stopped_status(endpoint: &str) -> DeviceSimulatorStatus {
    DeviceSimulatorStatus {
        running: false,
        endpoint: endpoint.to_string(),
        unit_id: 0,
        fault_mode: "none".to_string(),
        registers: Vec::new(),
        logs: vec!["从机模拟 TCP Server 已停止".to_string()],
        frames: Vec::new(),
        stats: DeviceSimulatorExceptionStats::default(),
    }
}

fn normalize_host(host: &str) -> Result<String, String> {
    match host.trim() {
        "127.0.0.1" | "localhost" => Ok("127.0.0.1".to_string()),
        _ => Err("从机模拟当前仅允许监听 127.0.0.1".to_string()),
    }
}

fn unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modbus::protocol::{connect_modbus_tcp, read_registers_with_stream};

    static TEST_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn runs_generic_profile_and_applies_real_fault_responses() {
        let _guard = TEST_LOCK.lock().expect("device simulator test lock");
        let listener = TcpListener::bind("127.0.0.1:0").expect("reserve port");
        let port = listener.local_addr().expect("port").port();
        drop(listener);
        let definitions = vec![DeviceSimulatorRegisterDefinition {
            address: 40002,
            name: "有功设定".to_string(),
            data_type: "int16".to_string(),
            length: 1,
            scale: 0.1,
            unit: "kW".to_string(),
            engineering_value: 120.0,
        }];
        let status = start_device_simulator("127.0.0.1".to_string(), port, 1, definitions)
            .expect("start device simulator");
        assert!(status.running);
        let mut stream = connect_modbus_tcp("127.0.0.1", port, 500, 500).expect("connect");
        assert_eq!(
            read_registers_with_stream(&mut stream, 1, 3, 40002, 1).expect("read"),
            vec![1200]
        );

        set_device_simulator_register(40002, -50.5).expect("set engineering value");
        assert_eq!(
            read_registers_with_stream(&mut stream, 1, 4, 40002, 1).expect("read input"),
            vec![(-505i16) as u16]
        );

        set_device_simulator_fault("exceptionCode".to_string(), 3, 1.0).expect("set fault");
        assert!(read_registers_with_stream(&mut stream, 1, 3, 40002, 1).is_err());
        assert_eq!(
            get_device_simulator_status()
                .expect("status")
                .stats
                .exception_code,
            1
        );

        assert!(!stop_device_simulator().expect("stop").running);
    }
}
