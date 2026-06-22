use crate::modbus::protocol;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const DASHBOARD_ADDRESSES: &[u16] = &[
    14001, 14002, 14005, 14006, 14007, 14008, 14021, 14022, 14023, 14024, 14025, 14026, 14027,
    14028, 14029, 14030, 14031, 14032, 14033, 14035, 14037, 14039, 25601, 25602, 25603, 25604,
    25605, 25606, 25608, 25609, 25610, 25611, 25619, 25620, 25622, 25623, 25624, 25626,
];
const PCS_MODULE_COUNT: u16 = 16;
const PCS_MODULE_BASE: u16 = 15001;
const PCS_MODULE_STRIDE: u16 = 500;
const FRAME_LOG_LIMIT: usize = 1000;

#[derive(Clone, Debug)]
enum RegisterValue {
    Number(f64),
    Enum { raw: u16, label: String },
}

#[derive(Clone, Copy, Debug)]
enum DataType {
    UInt16,
    Int16,
    UInt32,
    Int32,
    Float32,
}

#[derive(Clone, Debug)]
struct RegisterPoint {
    address: u16,
    name: String,
    unit: String,
    scale: f64,
    data_type: DataType,
    value: RegisterValue,
    precision: usize,
    length: u16,
}

impl RegisterPoint {
    fn numeric(
        address: u16,
        name: impl Into<String>,
        value: f64,
        scale: f64,
        unit: impl Into<String>,
        precision: usize,
    ) -> Self {
        Self {
            address,
            name: name.into(),
            unit: unit.into(),
            scale,
            data_type: DataType::Int16,
            value: RegisterValue::Number(value),
            precision,
            length: 1,
        }
    }

    fn unsigned(
        address: u16,
        name: impl Into<String>,
        value: f64,
        scale: f64,
        unit: impl Into<String>,
        precision: usize,
    ) -> Self {
        Self {
            address,
            name: name.into(),
            unit: unit.into(),
            scale,
            data_type: DataType::UInt16,
            value: RegisterValue::Number(value),
            precision,
            length: 1,
        }
    }

    fn unsigned32(
        address: u16,
        name: impl Into<String>,
        value: f64,
        scale: f64,
        unit: impl Into<String>,
        precision: usize,
    ) -> Self {
        Self {
            address,
            name: name.into(),
            unit: unit.into(),
            scale,
            data_type: DataType::UInt32,
            value: RegisterValue::Number(value),
            precision,
            length: 2,
        }
    }

    fn int32(
        address: u16,
        name: impl Into<String>,
        value: f64,
        scale: f64,
        unit: impl Into<String>,
        precision: usize,
    ) -> Self {
        Self {
            address,
            name: name.into(),
            unit: unit.into(),
            scale,
            data_type: DataType::Int32,
            value: RegisterValue::Number(value),
            precision,
            length: 2,
        }
    }

    fn float32(
        address: u16,
        name: impl Into<String>,
        value: f64,
        scale: f64,
        unit: impl Into<String>,
        precision: usize,
    ) -> Self {
        Self {
            address,
            name: name.into(),
            unit: unit.into(),
            scale,
            data_type: DataType::Float32,
            value: RegisterValue::Number(value),
            precision,
            length: 2,
        }
    }

    fn enumeration(
        address: u16,
        name: impl Into<String>,
        raw: u16,
        label: impl Into<String>,
    ) -> Self {
        Self {
            address,
            name: name.into(),
            unit: String::new(),
            scale: 1.0,
            data_type: DataType::UInt16,
            value: RegisterValue::Enum {
                raw,
                label: label.into(),
            },
            precision: 0,
            length: 1,
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulatorRegisterDefinition {
    pub address: u16,
    pub name: String,
    pub data_type: String,
    pub length: u16,
    pub scale: f64,
    pub unit: String,
    pub current_value: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulatorFrameLog {
    pub sequence: u64,
    pub timestamp: i64,
    pub direction: String,
    pub frame: String,
    pub note: String,
}

#[derive(Clone, Debug)]
pub struct SimulatedRegisterStore {
    // store 保存工程值，Modbus 读写时再按点位 scale/data_type 编解码成原始寄存器。
    registers: Arc<Mutex<HashMap<u16, RegisterPoint>>>,
    dynamic_bases: Arc<Mutex<HashMap<u16, f64>>>,
    logs: Arc<Mutex<Vec<String>>>,
    frame_logs: Arc<Mutex<Vec<SimulatorFrameLog>>>,
    frame_sequence: Arc<Mutex<u64>>,
}

impl SimulatedRegisterStore {
    fn new() -> Self {
        Self {
            registers: Arc::new(Mutex::new(HashMap::new())),
            dynamic_bases: Arc::new(Mutex::new(HashMap::new())),
            logs: Arc::new(Mutex::new(Vec::new())),
            frame_logs: Arc::new(Mutex::new(Vec::new())),
            frame_sequence: Arc::new(Mutex::new(0)),
        }
    }

    fn insert(&self, point: RegisterPoint) {
        self.registers
            .lock()
            .expect("register store poisoned")
            .insert(point.address, point);
    }

    fn point(&self, address: u16) -> Option<RegisterPoint> {
        self.registers
            .lock()
            .expect("register store poisoned")
            .get(&address)
            .cloned()
    }

    fn raw(&self, address: u16) -> u16 {
        let registers = self.registers.lock().expect("register store poisoned");
        for point in registers.values() {
            if address >= point.address && address < point.address + point.length {
                let words = encode_engineering_value_to_raw(point);
                return words
                    .get((address - point.address) as usize)
                    .copied()
                    .unwrap_or_default();
            }
        }
        0
    }

    pub(crate) fn set_number(&self, address: u16, value: f64) -> Result<(), String> {
        let mut registers = self
            .registers
            .lock()
            .map_err(|_| "寄存器存储已损坏".to_string())?;
        let point = registers
            .get_mut(&address)
            .ok_or_else(|| format!("寄存器 {address} 不存在"))?;
        point.value = RegisterValue::Number(value);
        if let Ok(mut bases) = self.dynamic_bases.lock() {
            bases.insert(address, value);
        }
        self.log(format!("修改模拟值 {address} {}={value}", point.name));
        Ok(())
    }

    pub(crate) fn set_number_from_frontend_write(
        &self,
        address: u16,
        value: f64,
        unit_id: u8,
    ) -> Result<(), String> {
        self.set_number(address, value)?;
        let raw_words = self.raw_words_for_point(address)?;
        if raw_words.len() == 1 {
            self.log_frontend_fc06_write(unit_id, address, raw_words[0]);
        } else {
            self.log_frontend_fc10_write(unit_id, address, &raw_words);
        }
        Ok(())
    }

    pub(crate) fn set_enum(
        &self,
        address: u16,
        raw: u16,
        label: impl Into<String>,
    ) -> Result<(), String> {
        let mut registers = self
            .registers
            .lock()
            .map_err(|_| "寄存器存储已损坏".to_string())?;
        let point = registers
            .get_mut(&address)
            .ok_or_else(|| format!("寄存器 {address} 不存在"))?;
        let next_label = label.into();
        point.value = RegisterValue::Enum {
            raw,
            label: next_label.clone(),
        };
        self.log(format!(
            "修改模拟枚举 {address} {}={next_label}",
            point.name
        ));
        Ok(())
    }

    fn set_raw_word(&self, address: u16, raw: u16) -> Result<(), String> {
        let mut registers = self
            .registers
            .lock()
            .map_err(|_| "寄存器存储已损坏".to_string())?;
        let point_address = registers
            .iter()
            .find_map(|(point_address, point)| {
                if address >= *point_address && address < *point_address + point.length {
                    Some(*point_address)
                } else {
                    None
                }
            })
            .ok_or_else(|| format!("寄存器 {address} 不存在"))?;
        let point = registers
            .get_mut(&point_address)
            .ok_or_else(|| format!("寄存器 {point_address} 不存在"))?;
        let mut raw_words = encode_engineering_value_to_raw(point);
        let offset = (address - point_address) as usize;
        if offset >= raw_words.len() {
            return Err(format!("寄存器 {address} 写入越界"));
        }
        raw_words[offset] = raw;
        point.value = decode_raw_words_to_value(point, &raw_words);
        if let Ok(mut bases) = self.dynamic_bases.lock() {
            if let Some(value) = engineering_number_value(point) {
                bases.insert(point_address, value);
            }
        }
        self.log(format!("Modbus 写单寄存器 {address} raw={raw}"));
        Ok(())
    }

    fn raw_words_for_point(&self, address: u16) -> Result<Vec<u16>, String> {
        let point = self
            .point(address)
            .ok_or_else(|| format!("寄存器 {address} 不存在"))?;
        let words = encode_engineering_value_to_raw(&point);
        Ok(if words.is_empty() { vec![0] } else { words })
    }

    fn log_frontend_fc06_write(&self, unit_id: u8, address: u16, raw: u16) {
        let frame = frontend_fc06_frame(unit_id, address, raw);
        self.log_frame(
            "request",
            &frame,
            format!("app=frontend Unit={unit_id} FC06 写单寄存器 address={address} raw={raw}"),
        );
        self.log_frame(
            "response",
            &frame,
            format!("app=frontend Unit={unit_id} FC06 写单回显 address={address} raw={raw}"),
        );
    }

    fn log_frontend_fc10_write(&self, unit_id: u8, address: u16, raw_words: &[u16]) {
        let request = frontend_fc10_request_frame(unit_id, address, raw_words);
        let response = frontend_fc10_response_frame(unit_id, address, raw_words.len() as u16);
        self.log_frame(
            "request",
            &request,
            format!("app=frontend Unit={unit_id} FC10/FC16 写多个寄存器 address={address} quantity={}", raw_words.len()),
        );
        self.log_frame(
            "response",
            &response,
            format!("app=frontend Unit={unit_id} FC10/FC16 写多个回执 address={address} quantity={}", raw_words.len()),
        );
    }

    pub(crate) fn log(&self, message: String) {
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or_default();
        let mut logs = self.logs.lock().expect("log store poisoned");
        logs.push(format!("{ts}: {message}"));
        let overflow = logs.len().saturating_sub(120);
        if overflow > 0 {
            logs.drain(0..overflow);
        }
    }

    pub fn logs(&self) -> Vec<String> {
        self.logs.lock().expect("log store poisoned").clone()
    }

    pub fn frame_logs(&self) -> Vec<SimulatorFrameLog> {
        self.frame_logs
            .lock()
            .expect("frame log store poisoned")
            .clone()
    }

    fn log_frame(&self, direction: &str, frame: &[u8], note: String) {
        let sequence = {
            let mut next = self.frame_sequence.lock().expect("frame sequence poisoned");
            *next += 1;
            *next
        };
        let mut logs = self.frame_logs.lock().expect("frame log store poisoned");
        logs.insert(
            0,
            SimulatorFrameLog {
                sequence,
                timestamp: unix_millis(),
                direction: direction.to_string(),
                frame: bytes_to_hex(frame),
                note,
            },
        );
        logs.truncate(FRAME_LOG_LIMIT);
    }

    pub(crate) fn refresh_dynamic_values(&self) -> Result<(), String> {
        let seconds = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs_f64())
            .unwrap_or_default();
        let slow = (seconds / 18.0).sin();
        let fast = (seconds / 5.0).sin();

        let mut registers = self
            .registers
            .lock()
            .map_err(|_| "寄存器存储已损坏".to_string())?;
        let mut bases = self
            .dynamic_bases
            .lock()
            .map_err(|_| "动态数据基线已损坏".to_string())?;
        let updates = [
            (14005, fast * 0.02),
            (14006, slow * 36.0),
            (14007, fast * 4.5),
            (14008, slow * 32.0),
            (14021, -slow * 36.0 * 1.024),
            (14031, slow * 1.6),
            (14032, fast * 7.5),
            (14033, (seconds % 600.0) * 0.01),
            (14035, (seconds % 600.0) * 0.016),
            (14037, (seconds % 3600.0) * 0.03),
            (14039, (seconds % 3600.0) * 0.05),
            (25604, (seconds as u64 % 65535) as f64),
            (25605, slow * 1.6),
            (25606, fast * 7.5),
            (25608, -slow * 36.0 * 1.024),
            (25609, slow * 0.45),
            (25610, slow * 0.45),
            (25619, slow * 0.006),
            (25620, fast * 0.004),
            (25622, slow.abs() * 0.008),
            (25623, fast * 0.7),
            (25624, slow * 0.4),
            (25626, fast.abs() * 0.5),
        ];

        for (address, delta) in updates {
            if let Some(point) = registers.get_mut(&address) {
                let base = bases
                    .entry(address)
                    .or_insert_with(|| engineering_number_value(point).unwrap_or_default());
                point.value = RegisterValue::Number(*base + delta);
            }
        }
        Ok(())
    }
}

fn engineering_number_value(point: &RegisterPoint) -> Option<f64> {
    match point.value {
        RegisterValue::Number(value) => Some(value),
        RegisterValue::Enum { .. } => None,
    }
}

fn encode_engineering_value_to_raw(point: &RegisterPoint) -> Vec<u16> {
    match point.value {
        RegisterValue::Enum { raw, .. } => vec![raw],
        RegisterValue::Number(value) => match point.data_type {
            DataType::UInt16 => {
                let scaled = (value / point.scale).round();
                vec![scaled.clamp(0.0, u16::MAX as f64) as u16]
            }
            DataType::Int16 => {
                let scaled = (value / point.scale).round();
                vec![(scaled.clamp(i16::MIN as f64, i16::MAX as f64) as i16) as u16]
            }
            DataType::UInt32 => {
                let scaled = (value / point.scale).round();
                let raw = scaled.clamp(0.0, u32::MAX as f64) as u32;
                vec![(raw >> 16) as u16, (raw & 0xffff) as u16]
            }
            DataType::Int32 => {
                let scaled = (value / point.scale).round();
                let raw = scaled.clamp(i32::MIN as f64, i32::MAX as f64) as i32 as u32;
                vec![(raw >> 16) as u16, (raw & 0xffff) as u16]
            }
            DataType::Float32 => {
                let raw = ((value / point.scale) as f32).to_bits();
                vec![(raw >> 16) as u16, (raw & 0xffff) as u16]
            }
        },
    }
}

fn decode_raw_words_to_value(point: &RegisterPoint, raw_registers: &[u16]) -> RegisterValue {
    match point.value {
        RegisterValue::Enum { ref label, .. } => RegisterValue::Enum {
            raw: raw_registers.first().copied().unwrap_or_default(),
            label: label.clone(),
        },
        RegisterValue::Number(_) => {
            let value = match point.data_type {
                DataType::Int16 => {
                    i16::from_be_bytes(
                        raw_registers
                            .first()
                            .copied()
                            .unwrap_or_default()
                            .to_be_bytes(),
                    ) as f64
                        * point.scale
                }
                DataType::UInt16 => {
                    raw_registers.first().copied().unwrap_or_default() as f64 * point.scale
                }
                DataType::UInt32 => {
                    let high = raw_registers.first().copied().unwrap_or_default() as u32;
                    let low = raw_registers.get(1).copied().unwrap_or_default() as u32;
                    ((high << 16) | low) as f64 * point.scale
                }
                DataType::Int32 => {
                    let high = raw_registers.first().copied().unwrap_or_default() as u32;
                    let low = raw_registers.get(1).copied().unwrap_or_default() as u32;
                    (((high << 16) | low) as i32) as f64 * point.scale
                }
                DataType::Float32 => {
                    let high = raw_registers.first().copied().unwrap_or_default() as u32;
                    let low = raw_registers.get(1).copied().unwrap_or_default() as u32;
                    f32::from_bits((high << 16) | low) as f64 * point.scale
                }
            };
            RegisterValue::Number(value)
        }
    }
}

fn decode_raw_to_engineering_value(
    point: &RegisterPoint,
    raw_registers: &[u16],
) -> DecodedRegisterValue {
    let raw = raw_registers.first().copied().unwrap_or_default();
    match point.value {
        RegisterValue::Enum { ref label, .. } => DecodedRegisterValue {
            engineering_value: raw as f64,
            display_value: if raw == encode_engineering_value_to_raw(point)[0] {
                label.to_string()
            } else {
                format!("未知({raw})")
            },
            unit: point.unit.to_string(),
        },
        RegisterValue::Number(_) => {
            let signed = match point.data_type {
                DataType::Int16 => i16::from_be_bytes(raw.to_be_bytes()) as f64,
                DataType::UInt16 => raw as f64,
                DataType::UInt32 => {
                    let high = raw as u32;
                    let low = raw_registers.get(1).copied().unwrap_or_default() as u32;
                    ((high << 16) | low) as f64
                }
                DataType::Int32 => {
                    let high = raw as u32;
                    let low = raw_registers.get(1).copied().unwrap_or_default() as u32;
                    (((high << 16) | low) as i32) as f64
                }
                DataType::Float32 => {
                    let high = raw as u32;
                    let low = raw_registers.get(1).copied().unwrap_or_default() as u32;
                    f32::from_bits((high << 16) | low) as f64
                }
            };
            let value = signed * point.scale;
            DecodedRegisterValue {
                engineering_value: value,
                display_value: format_number(value, point.precision),
                unit: point.unit.to_string(),
            }
        }
    }
}

#[derive(Clone, Debug)]
struct DecodedRegisterValue {
    engineering_value: f64,
    display_value: String,
    unit: String,
}

#[derive(Debug)]
pub struct ModbusTcpSlaveServer {
    stop: Arc<AtomicBool>,
    handle: Option<JoinHandle<()>>,
    ip: String,
    port: u16,
}

impl ModbusTcpSlaveServer {
    fn shutdown(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        // listener 是非阻塞 accept 循环；主动连一次本端口用于唤醒线程尽快退出。
        let _ = TcpStream::connect((self.ip.as_str(), self.port));
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }

    pub fn stop(mut self) {
        self.shutdown();
    }
}

impl Drop for ModbusTcpSlaveServer {
    fn drop(&mut self) {
        self.shutdown();
    }
}

pub(crate) fn start_modbus_tcp_slave(
    ip: &str,
    port: u16,
    unit_id: u8,
    store: SimulatedRegisterStore,
) -> Result<ModbusTcpSlaveServer, String> {
    let listener =
        TcpListener::bind((ip, port)).map_err(|error| format!("无法监听 {ip}:{port}: {error}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|error| format!("无法设置非阻塞监听: {error}"))?;
    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = Arc::clone(&stop);
    let server_ip = ip.to_string();

    let handle = thread::spawn(move || {
        while !thread_stop.load(Ordering::SeqCst) {
            match listener.accept() {
                Ok((stream, peer_addr)) => {
                    store.log(format!("主站连接建立：{peer_addr}"));
                    let request_store = store.clone();
                    let request_stop = Arc::clone(&thread_stop);
                    thread::spawn(move || {
                        handle_modbus_connection(
                            stream,
                            peer_addr.to_string(),
                            unit_id,
                            request_store,
                            request_stop,
                        )
                    });
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(10))
                }
                Err(_) => break,
            }
        }
    });

    Ok(ModbusTcpSlaveServer {
        stop,
        handle: Some(handle),
        ip: server_ip,
        port,
    })
}

fn handle_modbus_connection(
    mut stream: TcpStream,
    peer_addr: String,
    unit_id: u8,
    store: SimulatedRegisterStore,
    stop: Arc<AtomicBool>,
) {
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    loop {
        if stop.load(Ordering::SeqCst) {
            let _ = stream.shutdown(Shutdown::Both);
            store.log(format!("主站连接关闭：{peer_addr}，server stopping"));
            return;
        }
        let mut header = [0u8; 7];
        match stream.read_exact(&mut header) {
            Ok(()) => {}
            Err(error)
                if error.kind() == std::io::ErrorKind::WouldBlock
                    || error.kind() == std::io::ErrorKind::TimedOut =>
            {
                continue
            }
            Err(error) => {
                store.log(format!(
                    "主站连接关闭：{peer_addr}，读取 MBAP 失败：{error}"
                ));
                return;
            }
        }
        let transaction_id = u16::from_be_bytes([header[0], header[1]]);
        let protocol_id = u16::from_be_bytes([header[2], header[3]]);
        let length = u16::from_be_bytes([header[4], header[5]]) as usize;
        let request_unit = header[6];
        if protocol_id != 0 || length == 0 {
            store.log(format!(
                "丢弃异常 MBAP：peer={peer_addr} protocol={protocol_id} length={length}"
            ));
            return;
        }
        let mut pdu = vec![0u8; length.saturating_sub(1)];
        if let Err(error) = stream.read_exact(&mut pdu) {
            store.log(format!("主站连接关闭：{peer_addr}，读取 PDU 失败：{error}"));
            return;
        }
        let request_frame = modbus_tcp_frame(&header, &pdu);
        store.log_frame(
            "request",
            &request_frame,
            describe_modbus_request(&peer_addr, request_unit, &pdu),
        );
        if request_unit != unit_id {
            store.log(format!(
                "忽略 Unit ID 不匹配请求：peer={peer_addr} request={request_unit} expected={unit_id}"
            ));
            continue;
        }
        let response_pdu = process_modbus_pdu(&pdu, &store);
        let response_len = (response_pdu.len() + 1) as u16;
        let mut response = Vec::with_capacity(7 + response_pdu.len());
        response.extend_from_slice(&transaction_id.to_be_bytes());
        response.extend_from_slice(&0u16.to_be_bytes());
        response.extend_from_slice(&response_len.to_be_bytes());
        response.push(unit_id);
        response.extend(response_pdu);
        if let Err(error) = stream.write_all(&response) {
            store.log(format!("主站连接关闭：{peer_addr}，写响应失败：{error}"));
            return;
        }
        store.log_frame(
            "response",
            &response,
            describe_modbus_response(&peer_addr, unit_id, &response[7..]),
        );
    }
}

fn modbus_tcp_frame(header: &[u8; 7], pdu: &[u8]) -> Vec<u8> {
    let mut frame = Vec::with_capacity(header.len() + pdu.len());
    frame.extend_from_slice(header);
    frame.extend_from_slice(pdu);
    frame
}

fn frontend_fc06_frame(unit_id: u8, address: u16, raw: u16) -> Vec<u8> {
    vec![
        0x00,
        0x06,
        0x00,
        0x00,
        0x00,
        0x06,
        unit_id,
        0x06,
        (address >> 8) as u8,
        (address & 0xff) as u8,
        (raw >> 8) as u8,
        (raw & 0xff) as u8,
    ]
}

fn frontend_fc10_request_frame(unit_id: u8, address: u16, raw_words: &[u16]) -> Vec<u8> {
    let quantity = raw_words.len() as u16;
    let byte_count = (quantity * 2) as u8;
    let mut frame = frontend_write_header(0x10, unit_id, 7 + quantity * 2);
    frame.extend_from_slice(&[
        0x10,
        (address >> 8) as u8,
        (address & 0xff) as u8,
        (quantity >> 8) as u8,
        (quantity & 0xff) as u8,
        byte_count,
    ]);
    for word in raw_words {
        frame.extend_from_slice(&word.to_be_bytes());
    }
    frame
}

fn frontend_fc10_response_frame(unit_id: u8, address: u16, quantity: u16) -> Vec<u8> {
    let mut frame = frontend_write_header(0x10, unit_id, 6);
    frame.extend_from_slice(&[
        0x10,
        (address >> 8) as u8,
        (address & 0xff) as u8,
        (quantity >> 8) as u8,
        (quantity & 0xff) as u8,
    ]);
    frame
}

fn frontend_write_header(transaction_id: u16, unit_id: u8, length: u16) -> Vec<u8> {
    let mut frame = Vec::with_capacity(12);
    frame.extend_from_slice(&transaction_id.to_be_bytes());
    frame.extend_from_slice(&0u16.to_be_bytes());
    frame.extend_from_slice(&length.to_be_bytes());
    frame.push(unit_id);
    frame
}

fn describe_modbus_request(peer_addr: &str, unit_id: u8, pdu: &[u8]) -> String {
    let Some(function) = pdu.first().copied() else {
        return format!("peer={peer_addr} Unit={unit_id} 空请求 PDU");
    };
    match function {
        3 | 4 if pdu.len() >= 5 => {
            let address = u16::from_be_bytes([pdu[1], pdu[2]]);
            let quantity = u16::from_be_bytes([pdu[3], pdu[4]]);
            format!("peer={peer_addr} Unit={unit_id} FC{function:02} 读寄存器 address={address} quantity={quantity}")
        }
        6 if pdu.len() >= 5 => {
            let address = u16::from_be_bytes([pdu[1], pdu[2]]);
            let raw = u16::from_be_bytes([pdu[3], pdu[4]]);
            format!("peer={peer_addr} Unit={unit_id} FC06 写单寄存器 address={address} raw={raw}")
        }
        16 if pdu.len() >= 6 => {
            let address = u16::from_be_bytes([pdu[1], pdu[2]]);
            let quantity = u16::from_be_bytes([pdu[3], pdu[4]]);
            format!("peer={peer_addr} Unit={unit_id} FC16 写多个寄存器 address={address} quantity={quantity}")
        }
        _ => format!(
            "peer={peer_addr} Unit={unit_id} FC{function:02} 请求 length={}",
            pdu.len()
        ),
    }
}

fn describe_modbus_response(peer_addr: &str, unit_id: u8, pdu: &[u8]) -> String {
    let Some(function) = pdu.first().copied() else {
        return format!("peer={peer_addr} Unit={unit_id} 空响应 PDU");
    };
    if function & 0x80 != 0 {
        return format!(
            "peer={peer_addr} Unit={unit_id} FC{:02} 异常响应 code={}",
            function & 0x7f,
            pdu.get(1).copied().unwrap_or_default()
        );
    }
    match function {
        3 | 4 if pdu.len() >= 2 => format!(
            "peer={peer_addr} Unit={unit_id} FC{function:02} 响应 {} 个寄存器",
            (pdu[1] as usize) / 2
        ),
        6 if pdu.len() >= 5 => {
            let address = u16::from_be_bytes([pdu[1], pdu[2]]);
            let raw = u16::from_be_bytes([pdu[3], pdu[4]]);
            format!("peer={peer_addr} Unit={unit_id} FC06 写单回显 address={address} raw={raw}")
        }
        16 if pdu.len() >= 5 => {
            let address = u16::from_be_bytes([pdu[1], pdu[2]]);
            let quantity = u16::from_be_bytes([pdu[3], pdu[4]]);
            format!("peer={peer_addr} Unit={unit_id} FC16 写多个回执 address={address} quantity={quantity}")
        }
        _ => format!(
            "peer={peer_addr} Unit={unit_id} FC{function:02} 响应 length={}",
            pdu.len()
        ),
    }
}

fn process_modbus_pdu(pdu: &[u8], store: &SimulatedRegisterStore) -> Vec<u8> {
    if pdu.len() < 5 {
        return vec![pdu.first().copied().unwrap_or(0) | 0x80, 0x03];
    }
    let function = pdu[0];
    let address = u16::from_be_bytes([pdu[1], pdu[2]]);
    match function {
        3 | 4 => {
            let quantity = u16::from_be_bytes([pdu[3], pdu[4]]);
            if quantity == 0 || quantity > 125 {
                store.log(format!(
                    "FC{function:02} 非法读取数量 address={address} quantity={quantity}"
                ));
                return vec![function | 0x80, 0x03];
            }
            store.log(format!(
                "FC{function:02} 读寄存器 address={address} quantity={quantity}"
            ));
            let mut response = vec![function, (quantity * 2) as u8];
            for offset in 0..quantity {
                response.extend_from_slice(&store.raw(address + offset).to_be_bytes());
            }
            response
        }
        6 => {
            if pdu.len() < 5 {
                store.log("FC06 请求长度不足".to_string());
                return vec![function | 0x80, 0x03];
            }
            let raw = u16::from_be_bytes([pdu[3], pdu[4]]);
            let _ = store.set_raw_word(address, raw);
            pdu[0..5].to_vec()
        }
        16 => {
            if pdu.len() < 6 {
                store.log("FC16 请求长度不足".to_string());
                return vec![function | 0x80, 0x03];
            }
            let quantity = u16::from_be_bytes([pdu[3], pdu[4]]);
            let byte_count = pdu[5] as usize;
            if byte_count != quantity as usize * 2 || pdu.len() < 6 + byte_count {
                store.log(format!(
                    "FC16 写多个寄存器长度异常 address={address} quantity={quantity} bytes={byte_count}"
                ));
                return vec![function | 0x80, 0x03];
            }
            store.log(format!(
                "FC16 写多个寄存器 address={address} quantity={quantity}"
            ));
            for offset in 0..quantity {
                let index = 6 + offset as usize * 2;
                let raw = u16::from_be_bytes([pdu[index], pdu[index + 1]]);
                let _ = store.set_raw_word(address + offset, raw);
            }
            vec![function, pdu[1], pdu[2], pdu[3], pdu[4]]
        }
        _ => {
            store.log(format!("不支持的功能码 FC{function:02}"));
            vec![function | 0x80, 0x01]
        }
    }
}

fn connect_and_read_registers(
    ip: &str,
    port: u16,
    unit_id: u8,
    address: u16,
    quantity: u16,
) -> Result<Vec<u16>, String> {
    let mut stream = protocol::connect_modbus_tcp(ip, port, 800, 800)?;
    protocol::read_registers_with_stream(&mut stream, unit_id, 3, address, quantity)
}

fn connect_and_read_register_ranges(
    ip: &str,
    port: u16,
    unit_id: u8,
    ranges: &[(u16, u16)],
) -> Result<HashMap<u16, u16>, String> {
    let mut stream = protocol::connect_modbus_tcp(ip, port, 800, 800)?;
    read_register_ranges_with_stream(&mut stream, unit_id, ranges)
}

fn read_register_ranges_with_stream(
    stream: &mut TcpStream,
    unit_id: u8,
    ranges: &[(u16, u16)],
) -> Result<HashMap<u16, u16>, String> {
    let mut values = HashMap::new();
    for &(address, quantity) in ranges {
        let raw = protocol::read_registers_with_stream(stream, unit_id, 3, address, quantity)?;
        for (offset, value) in raw.into_iter().enumerate() {
            values.insert(address + offset as u16, value);
        }
    }
    Ok(values)
}

pub(crate) fn connect_modbus_tcp_master(ip: &str, port: u16) -> Result<TcpStream, String> {
    protocol::connect_modbus_tcp(ip, port, 800, 800)
}

fn format_number(value: f64, precision: usize) -> String {
    match precision {
        0 => format!("{value:.0}"),
        1 => format!("{value:.1}"),
        2 => format!("{value:.2}"),
        3 => format!("{value:.3}"),
        _ => format!("{value:.4}"),
    }
}

fn unix_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or_default()
}

fn bytes_to_hex(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|byte| format!("{byte:02X}"))
        .collect::<Vec<_>>()
        .join(" ")
}

fn infer_precision(scale: f64) -> usize {
    let normalized = scale.abs();
    if (normalized - 1.0).abs() < f64::EPSILON {
        return 0;
    }
    let text = format!("{normalized:.6}");
    text.split('.')
        .nth(1)
        .map(|fraction| fraction.trim_end_matches('0').len())
        .unwrap_or(0)
}

fn normalize_data_type(data_type: &str, length: u16) -> DataType {
    match data_type.trim().to_lowercase().as_str() {
        "int16" => DataType::Int16,
        "uint32" => DataType::UInt32,
        "int32" => DataType::Int32,
        "float" | "float32" => DataType::Float32,
        "bool" | "bitfield" | "enum" | "uint16" => DataType::UInt16,
        _ if length >= 2 => DataType::UInt32,
        _ => DataType::UInt16,
    }
}

mod dashboard;
mod seed;

pub(crate) use dashboard::{
    poll_loopback_dashboard, poll_loopback_dashboard_with_stream,
    poll_realtime_dashboard_with_stream,
};
pub use dashboard::{
    HomeDashboardValue, HomeLoopbackDashboard, HomePcsModule, HomeVerificationRow,
};

pub(crate) fn create_loopback_store() -> SimulatedRegisterStore {
    seed::create_loopback_store()
}

pub(crate) fn create_store_from_register_definitions(
    definitions: &[SimulatorRegisterDefinition],
) -> SimulatedRegisterStore {
    let store = SimulatedRegisterStore::new();
    for definition in definitions {
        let data_type = normalize_data_type(&definition.data_type, definition.length);
        let precision = infer_precision(definition.scale);
        let point = match data_type {
            DataType::UInt16 => RegisterPoint {
                address: definition.address,
                name: definition.name.clone(),
                unit: definition.unit.clone(),
                scale: definition.scale,
                data_type,
                value: RegisterValue::Number(definition.current_value),
                precision,
                length: definition.length.max(1),
            },
            DataType::Int16 => RegisterPoint::numeric(
                definition.address,
                definition.name.clone(),
                definition.current_value,
                definition.scale,
                definition.unit.clone(),
                precision,
            ),
            DataType::UInt32 => RegisterPoint::unsigned32(
                definition.address,
                definition.name.clone(),
                definition.current_value,
                definition.scale,
                definition.unit.clone(),
                precision,
            ),
            DataType::Int32 => RegisterPoint::int32(
                definition.address,
                definition.name.clone(),
                definition.current_value,
                definition.scale,
                definition.unit.clone(),
                precision,
            ),
            DataType::Float32 => RegisterPoint::float32(
                definition.address,
                definition.name.clone(),
                definition.current_value,
                definition.scale,
                definition.unit.clone(),
                precision,
            ),
        };
        store.insert(point);
    }
    store.log(format!(
        "加载导入协议生成的模拟寄存器，共 {} 个点位",
        definitions.len()
    ));
    store
}

pub fn create_loopback_store_for_test() -> SimulatedRegisterStore {
    create_loopback_store()
}

pub fn start_modbus_tcp_slave_for_test(
    ip: &str,
    port: u16,
    unit_id: u8,
    store: SimulatedRegisterStore,
) -> Result<ModbusTcpSlaveServer, String> {
    start_modbus_tcp_slave(ip, port, unit_id, store)
}

pub fn connect_and_read_registers_for_test(
    ip: &str,
    port: u16,
    unit_id: u8,
    address: u16,
    quantity: u16,
) -> Result<Vec<u16>, String> {
    connect_and_read_registers(ip, port, unit_id, address, quantity)
}

pub fn poll_loopback_dashboard_for_test(
    ip: &str,
    port: u16,
    unit_id: u8,
) -> Result<HomeLoopbackDashboard, String> {
    let expected_store = create_loopback_store();
    poll_loopback_dashboard(ip, port, unit_id, &expected_store)
}

pub fn poll_loopback_dashboard_with_store_for_test(
    ip: &str,
    port: u16,
    unit_id: u8,
    store: &SimulatedRegisterStore,
) -> Result<HomeLoopbackDashboard, String> {
    poll_loopback_dashboard(ip, port, unit_id, store)
}

pub fn set_loopback_number_for_test(
    store: &SimulatedRegisterStore,
    address: u16,
    value: f64,
) -> Result<(), String> {
    store.set_number(address, value)
}

pub fn inject_pcs3_fault_for_test(store: &SimulatedRegisterStore) -> Result<(), String> {
    store.set_enum(16010, 3, "故障")?;
    store.set_number(16021, 1.0)?;
    store.set_number(14003, 1.0)
}

pub fn clear_pcs3_fault_for_test(store: &SimulatedRegisterStore) -> Result<(), String> {
    store.set_enum(16010, 1, "运行")?;
    store.set_number(16021, 0.0)?;
    store.set_number(14003, 0.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uint16_register_definitions_with_multi_word_length_do_not_panic_when_reading_padding_words()
    {
        let store = create_store_from_register_definitions(&[SimulatorRegisterDefinition {
            address: 1000,
            name: "预留多字寄存器".to_string(),
            data_type: "uint16".to_string(),
            length: 2,
            scale: 1.0,
            unit: String::new(),
            current_value: 42.0,
        }]);

        assert_eq!(store.raw(1000), 42);
        assert_eq!(store.raw(1001), 0);
    }

    #[test]
    fn frontend_runtime_write_records_fc06_request_and_response_frames() {
        let store = create_loopback_store();

        store
            .set_number_from_frontend_write(14006, 1500.0, 1)
            .expect("frontend write succeeds");

        let frame_logs = store.frame_logs();
        assert!(
            frame_logs
                .iter()
                .any(|entry| entry.direction == "request"
                    && entry.frame.contains("00 06 01 06 36 B6 3A 98")
                    && entry.note.contains("FC06 写单寄存器")),
            "frame logs: {frame_logs:?}"
        );
        assert!(
            frame_logs
                .iter()
                .any(|entry| entry.direction == "response"
                    && entry.frame.contains("00 06 01 06 36 B6 3A 98")
                    && entry.note.contains("FC06 写单回显")),
            "frame logs: {frame_logs:?}"
        );
    }

    #[test]
    fn frontend_runtime_multi_word_write_records_fc10_request_and_response_frames() {
        let store = create_loopback_store();

        store
            .set_number_from_frontend_write(14037, 256800.2, 1)
            .expect("frontend multi-word write succeeds");

        let frame_logs = store.frame_logs();
        assert!(
            frame_logs
                .iter()
                .any(|entry| entry.direction == "request"
                    && entry.frame.contains("01 10 36 D5 00 02 04")
                    && entry.note.contains("FC10/FC16 写多个寄存器")),
            "frame logs: {frame_logs:?}"
        );
        assert!(
            frame_logs
                .iter()
                .any(|entry| entry.direction == "response"
                    && entry.frame.contains("01 10 36 D5 00 02")
                    && entry.note.contains("FC10/FC16 写多个回执")),
            "frame logs: {frame_logs:?}"
        );
    }
}
