use crate::modbus::protocol;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::TcpStream;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, Mutex, MutexGuard};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModbusTcpChannelConfig {
    pub channel_id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub unit_id: u8,
    pub connect_timeout_ms: u64,
    pub request_timeout_ms: u64,
    pub reconnect_interval_ms: u64,
}

impl ModbusTcpChannelConfig {
    fn normalized(mut self) -> Self {
        if self.name.trim().is_empty() {
            self.name = self.channel_id.clone();
        }
        if self.connect_timeout_ms == 0 {
            self.connect_timeout_ms = 1000;
        }
        if self.request_timeout_ms == 0 {
            self.request_timeout_ms = 1000;
        }
        if self.reconnect_interval_ms == 0 {
            self.reconnect_interval_ms = 1000;
        }
        self
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductionPointConfig {
    pub point_id: String,
    pub name: String,
    pub function_code: u8,
    pub address: u16,
    pub quantity: u16,
    pub data_type: String,
    pub scale: f64,
    pub offset: f64,
    pub unit: String,
    pub poll_interval_ms: u64,
    pub enabled: bool,
}

impl ProductionPointConfig {
    fn normalized(mut self) -> Self {
        if self.quantity == 0 {
            self.quantity = match self.data_type.to_lowercase().as_str() {
                "uint32" | "int32" | "float32" => 2,
                _ => 1,
            };
        }
        if self.scale == 0.0 {
            self.scale = 1.0;
        }
        if self.poll_interval_ms == 0 {
            self.poll_interval_ms = 1000;
        }
        if self.function_code == 0 {
            self.function_code = 3;
        }
        self
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModbusChannelStats {
    pub request_count: u64,
    pub success_count: u64,
    pub failure_count: u64,
    pub timeout_count: u64,
    pub reconnect_count: u64,
    pub average_latency_ms: f64,
    pub max_latency_ms: f64,
    pub last_error: Option<String>,
    pub last_success_at: Option<i64>,
    pub last_failure_at: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductionPointValue {
    pub point_id: String,
    pub name: String,
    pub address: u16,
    pub function_code: u8,
    pub raw_registers: Vec<u16>,
    pub value: f64,
    pub display_value: String,
    pub unit: String,
    pub quality: String,
    pub timestamp: i64,
    pub latency_ms: f64,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModbusBackendLogEntry {
    pub timestamp: i64,
    pub channel_id: String,
    pub level: String,
    pub message: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModbusChannelSnapshot {
    pub config: ModbusTcpChannelConfig,
    pub running: bool,
    pub connected: bool,
    pub points: Vec<ProductionPointConfig>,
    pub latest_values: Vec<ProductionPointValue>,
    pub stats: ModbusChannelStats,
    pub logs: Vec<ModbusBackendLogEntry>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModbusBackendSnapshot {
    pub channels: Vec<ModbusChannelSnapshot>,
}

#[derive(Debug)]
struct ProductionChannelRuntime {
    // config/points 只在控制命令持有后端锁时替换；worker 启动时拿 clone。
    config: ModbusTcpChannelConfig,
    points: Vec<ProductionPointConfig>,
    // running/connected/stats/latest_values/logs 是 worker 和快照命令之间的共享状态。
    running: Arc<AtomicBool>,
    connected: Arc<AtomicBool>,
    stats: Arc<Mutex<ModbusChannelStats>>,
    latest_values: Arc<Mutex<HashMap<String, ProductionPointValue>>>,
    logs: Arc<Mutex<Vec<ModbusBackendLogEntry>>>,
    worker: Option<JoinHandle<()>>,
}

static MODBUS_BACKEND: LazyLock<Mutex<HashMap<String, ProductionChannelRuntime>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn backend_lock() -> Result<MutexGuard<'static, HashMap<String, ProductionChannelRuntime>>, String>
{
    MODBUS_BACKEND
        .lock()
        .map_err(|_| "通信后端锁定失败".to_string())
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

fn push_backend_log(
    logs: &Arc<Mutex<Vec<ModbusBackendLogEntry>>>,
    channel_id: &str,
    level: &str,
    message: impl Into<String>,
) {
    if let Ok(mut entries) = logs.lock() {
        entries.push(ModbusBackendLogEntry {
            timestamp: now_millis(),
            channel_id: channel_id.to_string(),
            level: level.to_string(),
            message: message.into(),
        });
        let overflow = entries.len().saturating_sub(1000);
        if overflow > 0 {
            entries.drain(0..overflow);
        }
    }
}

fn new_channel_logs(channel_id: &str) -> Arc<Mutex<Vec<ModbusBackendLogEntry>>> {
    let logs = Arc::new(Mutex::new(Vec::new()));
    push_backend_log(&logs, channel_id, "info", "创建 Modbus TCP 通道配置");
    logs
}

fn new_channel_runtime(
    config: ModbusTcpChannelConfig,
    points: Vec<ProductionPointConfig>,
) -> ProductionChannelRuntime {
    let logs = new_channel_logs(&config.channel_id);
    ProductionChannelRuntime {
        config,
        points,
        running: Arc::new(AtomicBool::new(false)),
        connected: Arc::new(AtomicBool::new(false)),
        stats: Arc::new(Mutex::new(ModbusChannelStats::default())),
        latest_values: Arc::new(Mutex::new(HashMap::new())),
        logs,
        worker: None,
    }
}

fn reset_channel_runtime(
    runtime: &mut ProductionChannelRuntime,
    config: ModbusTcpChannelConfig,
    points: Vec<ProductionPointConfig>,
) {
    runtime.config = config;
    runtime.points = points;
    runtime.connected.store(false, Ordering::SeqCst);
    runtime.stats = Arc::new(Mutex::new(ModbusChannelStats::default()));
    runtime.latest_values = Arc::new(Mutex::new(HashMap::new()));
}

fn validate_modbus_channel(config: &ModbusTcpChannelConfig) -> Result<(), String> {
    if config.channel_id.trim().is_empty() {
        return Err("channelId 不能为空".to_string());
    }
    if config.host.trim().is_empty() {
        return Err("host 不能为空".to_string());
    }
    if config.unit_id == 0 {
        return Err("unitId 必须在 1..247".to_string());
    }
    Ok(())
}

fn validate_production_point(point: &ProductionPointConfig) -> Result<(), String> {
    if point.point_id.trim().is_empty() {
        return Err("pointId 不能为空".to_string());
    }
    if !matches!(point.function_code, 3 | 4) {
        return Err(format!("{} 轮询仅支持 FC03/FC04", point.point_id));
    }
    if point.quantity == 0 || point.quantity > 125 {
        return Err(format!("{} quantity 必须在 1..125", point.point_id));
    }
    Ok(())
}

fn decode_production_point(point: &ProductionPointConfig, raw_registers: &[u16]) -> f64 {
    let raw0 = raw_registers.first().copied().unwrap_or_default();
    let base = match point.data_type.to_lowercase().as_str() {
        "int16" => i16::from_be_bytes(raw0.to_be_bytes()) as f64,
        "uint32" => {
            let high = raw0 as u32;
            let low = raw_registers.get(1).copied().unwrap_or_default() as u32;
            ((high << 16) | low) as f64
        }
        "int32" => {
            let high = raw0 as u32;
            let low = raw_registers.get(1).copied().unwrap_or_default() as u32;
            i32::from_be_bytes(((high << 16) | low).to_be_bytes()) as f64
        }
        "float32" => {
            let high = raw0 as u32;
            let low = raw_registers.get(1).copied().unwrap_or_default() as u32;
            f32::from_bits((high << 16) | low) as f64
        }
        _ => raw0 as f64,
    };
    base * point.scale + point.offset
}

fn poll_point_once(
    stream: &mut TcpStream,
    config: &ModbusTcpChannelConfig,
    point: &ProductionPointConfig,
) -> Result<ProductionPointValue, String> {
    let started = SystemTime::now();
    let raw_registers = protocol::read_registers_with_stream(
        stream,
        config.unit_id,
        point.function_code,
        point.address,
        point.quantity,
    )?;
    let latency_ms = started
        .elapsed()
        .map(|duration| duration.as_secs_f64() * 1000.0)
        .unwrap_or_default();
    let value = decode_production_point(point, &raw_registers);
    Ok(ProductionPointValue {
        point_id: point.point_id.clone(),
        name: point.name.clone(),
        address: point.address,
        function_code: point.function_code,
        raw_registers,
        value,
        display_value: format!("{value:.3}"),
        unit: point.unit.clone(),
        quality: "Good".to_string(),
        timestamp: now_millis(),
        latency_ms,
        error: None,
    })
}

fn record_request(
    stats: &Arc<Mutex<ModbusChannelStats>>,
    success: bool,
    latency_ms: f64,
    error: Option<String>,
) {
    if let Ok(mut stats) = stats.lock() {
        stats.request_count += 1;
        if success {
            stats.success_count += 1;
            stats.last_success_at = Some(now_millis());
            let previous_successes = stats.success_count.saturating_sub(1) as f64;
            stats.average_latency_ms = if previous_successes == 0.0 {
                latency_ms
            } else {
                ((stats.average_latency_ms * previous_successes) + latency_ms)
                    / stats.success_count as f64
            };
            stats.max_latency_ms = stats.max_latency_ms.max(latency_ms);
            stats.last_error = None;
        } else {
            stats.failure_count += 1;
            stats.last_failure_at = Some(now_millis());
            stats.last_error = error.clone();
            if error.as_deref().unwrap_or_default().contains("timed out")
                || error.as_deref().unwrap_or_default().contains("超时")
            {
                stats.timeout_count += 1;
            }
        }
    }
}

fn start_channel_worker(runtime: &mut ProductionChannelRuntime) {
    runtime.running.store(true, Ordering::SeqCst);
    let config = runtime.config.clone();
    let points = runtime.points.clone();
    let running = Arc::clone(&runtime.running);
    let connected = Arc::clone(&runtime.connected);
    let stats = Arc::clone(&runtime.stats);
    let latest_values = Arc::clone(&runtime.latest_values);
    let logs = Arc::clone(&runtime.logs);
    runtime.worker = Some(thread::spawn(move || {
        push_backend_log(
            &logs,
            &config.channel_id,
            "info",
            format!(
                "启动 Modbus TCP 主站通道 {}:{} unit={}",
                config.host, config.port, config.unit_id
            ),
        );
        let mut last_poll: HashMap<String, i64> = HashMap::new();
        let mut stream: Option<TcpStream> = None;

        while running.load(Ordering::SeqCst) {
            if stream.is_none() {
                match protocol::connect_modbus_tcp(
                    &config.host,
                    config.port,
                    config.connect_timeout_ms,
                    config.request_timeout_ms,
                ) {
                    Ok(next_stream) => {
                        stream = Some(next_stream);
                        connected.store(true, Ordering::SeqCst);
                        push_backend_log(&logs, &config.channel_id, "info", "连接成功");
                    }
                    Err(error) => {
                        connected.store(false, Ordering::SeqCst);
                        if let Ok(mut stats) = stats.lock() {
                            stats.reconnect_count += 1;
                            stats.last_error = Some(error.clone());
                            stats.last_failure_at = Some(now_millis());
                        }
                        push_backend_log(&logs, &config.channel_id, "warn", error);
                        thread::sleep(Duration::from_millis(config.reconnect_interval_ms));
                        continue;
                    }
                }
            }

            let now = now_millis();
            let mut did_work = false;
            for point in points.iter().filter(|point| point.enabled) {
                let last = last_poll.get(&point.point_id).copied().unwrap_or(0);
                if now - last < point.poll_interval_ms as i64 {
                    continue;
                }
                did_work = true;
                last_poll.insert(point.point_id.clone(), now);
                let Some(active_stream) = stream.as_mut() else {
                    break;
                };
                match poll_point_once(active_stream, &config, point) {
                    Ok(value) => {
                        record_request(&stats, true, value.latency_ms, None);
                        if let Ok(mut latest) = latest_values.lock() {
                            latest.insert(point.point_id.clone(), value);
                        }
                    }
                    Err(error) => {
                        connected.store(false, Ordering::SeqCst);
                        record_request(&stats, false, 0.0, Some(error.clone()));
                        let bad_value = ProductionPointValue {
                            point_id: point.point_id.clone(),
                            name: point.name.clone(),
                            address: point.address,
                            function_code: point.function_code,
                            raw_registers: Vec::new(),
                            value: f64::NAN,
                            display_value: "--".to_string(),
                            unit: point.unit.clone(),
                            quality: "Bad".to_string(),
                            timestamp: now_millis(),
                            latency_ms: 0.0,
                            error: Some(error.clone()),
                        };
                        if let Ok(mut latest) = latest_values.lock() {
                            latest.insert(point.point_id.clone(), bad_value);
                        }
                        push_backend_log(
                            &logs,
                            &config.channel_id,
                            "error",
                            format!("{} 轮询失败: {error}", point.point_id),
                        );
                        stream = None;
                        break;
                    }
                }
            }

            if !did_work {
                thread::sleep(Duration::from_millis(20));
            }
        }

        connected.store(false, Ordering::SeqCst);
        push_backend_log(&logs, &config.channel_id, "info", "通道已停止");
    }));
}

fn stop_channel_runtime(runtime: &mut ProductionChannelRuntime) {
    runtime.running.store(false, Ordering::SeqCst);
    if let Some(handle) = runtime.worker.take() {
        let _ = handle.join();
    }
}

#[tauri::command]
pub(crate) fn configure_modbus_tcp_channel(
    config: ModbusTcpChannelConfig,
) -> Result<ModbusChannelSnapshot, String> {
    let config = config.normalized();
    validate_modbus_channel(&config)?;
    let mut backend = backend_lock()?;
    if let Some(existing) = backend.get_mut(&config.channel_id) {
        if existing.running.load(Ordering::SeqCst) {
            return Err("通道运行中，修改配置前请先停止".to_string());
        }
        let points = existing.points.clone();
        reset_channel_runtime(existing, config, points);
        return Ok(snapshot_channel(existing, 100));
    }
    let channel_id = config.channel_id.clone();
    backend.insert(channel_id.clone(), new_channel_runtime(config, Vec::new()));
    let runtime = backend
        .get(&channel_id)
        .ok_or_else(|| "创建通道失败".to_string())?;
    Ok(snapshot_channel(runtime, 100))
}

#[tauri::command]
pub(crate) fn start_modbus_tcp_channel(
    config: ModbusTcpChannelConfig,
    points: Vec<ProductionPointConfig>,
) -> Result<ModbusChannelSnapshot, String> {
    let config = config.normalized();
    validate_modbus_channel(&config)?;
    let points: Vec<_> = points
        .into_iter()
        .map(ProductionPointConfig::normalized)
        .collect();
    for point in &points {
        validate_production_point(point)?;
    }
    let mut backend = backend_lock()?;
    if let Some(existing) = backend.get_mut(&config.channel_id) {
        if existing.running.load(Ordering::SeqCst) {
            stop_channel_runtime(existing);
        }
        reset_channel_runtime(existing, config, points);
        start_channel_worker(existing);
        return Ok(snapshot_channel(existing, 100));
    }

    let channel_id = config.channel_id.clone();
    let mut runtime = new_channel_runtime(config, points);
    start_channel_worker(&mut runtime);
    backend.insert(channel_id.clone(), runtime);
    let runtime = backend
        .get(&channel_id)
        .ok_or_else(|| "启动通道失败".to_string())?;
    Ok(snapshot_channel(runtime, 100))
}

#[tauri::command]
pub(crate) fn stop_modbus_tcp_channel(channel_id: String) -> Result<ModbusChannelSnapshot, String> {
    let mut backend = backend_lock()?;
    let runtime = backend
        .get_mut(&channel_id)
        .ok_or_else(|| format!("通道 {channel_id} 不存在"))?;
    stop_channel_runtime(runtime);
    Ok(snapshot_channel(runtime, 100))
}

#[tauri::command]
pub(crate) fn remove_modbus_tcp_channel(channel_id: String) -> Result<(), String> {
    let mut backend = backend_lock()?;
    if let Some(mut runtime) = backend.remove(&channel_id) {
        stop_channel_runtime(&mut runtime);
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn get_modbus_backend_snapshot() -> Result<ModbusBackendSnapshot, String> {
    let backend = backend_lock()?;
    Ok(ModbusBackendSnapshot {
        channels: backend
            .values()
            .map(|runtime| snapshot_channel(runtime, 100))
            .collect(),
    })
}

#[tauri::command]
pub(crate) fn get_modbus_channel_logs(
    channel_id: String,
    limit: Option<usize>,
) -> Result<Vec<ModbusBackendLogEntry>, String> {
    let backend = backend_lock()?;
    let runtime = backend
        .get(&channel_id)
        .ok_or_else(|| format!("通道 {channel_id} 不存在"))?;
    Ok(tail_logs(&runtime.logs, limit.unwrap_or(200)))
}

#[tauri::command]
pub(crate) fn read_modbus_tcp_registers(
    config: ModbusTcpChannelConfig,
    function_code: u8,
    address: u16,
    quantity: u16,
) -> Result<Vec<u16>, String> {
    let config = config.normalized();
    validate_modbus_channel(&config)?;
    let mut stream = protocol::connect_modbus_tcp(
        &config.host,
        config.port,
        config.connect_timeout_ms,
        config.request_timeout_ms,
    )?;
    protocol::read_registers_with_stream(
        &mut stream,
        config.unit_id,
        function_code,
        address,
        quantity,
    )
}

#[tauri::command]
pub(crate) fn write_modbus_tcp_single_register(
    config: ModbusTcpChannelConfig,
    address: u16,
    value: u16,
) -> Result<(), String> {
    let config = config.normalized();
    validate_modbus_channel(&config)?;
    let mut stream = protocol::connect_modbus_tcp(
        &config.host,
        config.port,
        config.connect_timeout_ms,
        config.request_timeout_ms,
    )?;
    protocol::write_single_register_with_stream(&mut stream, config.unit_id, address, value)
}

#[tauri::command]
pub(crate) fn write_modbus_tcp_multiple_registers(
    config: ModbusTcpChannelConfig,
    address: u16,
    values: Vec<u16>,
) -> Result<(), String> {
    let config = config.normalized();
    validate_modbus_channel(&config)?;
    let mut stream = protocol::connect_modbus_tcp(
        &config.host,
        config.port,
        config.connect_timeout_ms,
        config.request_timeout_ms,
    )?;
    protocol::write_multiple_registers_with_stream(&mut stream, config.unit_id, address, &values)
}

fn snapshot_channel(runtime: &ProductionChannelRuntime, log_limit: usize) -> ModbusChannelSnapshot {
    ModbusChannelSnapshot {
        config: runtime.config.clone(),
        running: runtime.running.load(Ordering::SeqCst),
        connected: runtime.connected.load(Ordering::SeqCst),
        points: runtime.points.clone(),
        latest_values: ordered_latest_values(runtime),
        stats: runtime
            .stats
            .lock()
            .map(|stats| stats.clone())
            .unwrap_or_default(),
        logs: tail_logs(&runtime.logs, log_limit),
    }
}

fn ordered_latest_values(runtime: &ProductionChannelRuntime) -> Vec<ProductionPointValue> {
    // HashMap 取值顺序不稳定，按配置点位顺序输出，避免前端列表抖动。
    let mut values = runtime
        .latest_values
        .lock()
        .map(|latest| latest.clone())
        .unwrap_or_default();
    let mut ordered = Vec::with_capacity(values.len());
    for point in &runtime.points {
        if let Some(value) = values.remove(&point.point_id) {
            ordered.push(value);
        }
    }
    let mut extras: Vec<_> = values.into_values().collect();
    extras.sort_by(|left, right| left.point_id.cmp(&right.point_id));
    ordered.extend(extras);
    ordered
}

fn tail_logs(
    logs: &Arc<Mutex<Vec<ModbusBackendLogEntry>>>,
    limit: usize,
) -> Vec<ModbusBackendLogEntry> {
    let entries = logs
        .lock()
        .map(|entries| entries.clone())
        .unwrap_or_default();
    let start = entries.len().saturating_sub(limit);
    entries[start..].to_vec()
}

pub fn production_read_registers_for_test(
    config: ModbusTcpChannelConfig,
    function_code: u8,
    address: u16,
    quantity: u16,
) -> Result<Vec<u16>, String> {
    read_modbus_tcp_registers(config, function_code, address, quantity)
}

pub fn production_write_single_register_for_test(
    config: ModbusTcpChannelConfig,
    address: u16,
    value: u16,
) -> Result<(), String> {
    write_modbus_tcp_single_register(config, address, value)
}

pub fn production_write_multiple_registers_for_test(
    config: ModbusTcpChannelConfig,
    address: u16,
    values: Vec<u16>,
) -> Result<(), String> {
    write_modbus_tcp_multiple_registers(config, address, values)
}

pub fn start_production_channel_for_test(
    config: ModbusTcpChannelConfig,
    points: Vec<ProductionPointConfig>,
) -> Result<ModbusChannelSnapshot, String> {
    start_modbus_tcp_channel(config, points)
}

pub fn stop_production_channel_for_test(
    channel_id: String,
) -> Result<ModbusChannelSnapshot, String> {
    stop_modbus_tcp_channel(channel_id)
}

pub fn remove_production_channel_for_test(channel_id: String) -> Result<(), String> {
    remove_modbus_tcp_channel(channel_id)
}
