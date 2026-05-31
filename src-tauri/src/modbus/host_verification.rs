use crate::modbus::protocol;
use serde::{Deserialize, Serialize};
use std::net::TcpStream;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostVerificationConnectionConfig {
    pub host: String,
    pub port: u16,
    pub unit_id: u8,
    pub connect_timeout_ms: u64,
    pub request_timeout_ms: u64,
}

impl HostVerificationConnectionConfig {
    fn normalized(mut self) -> Self {
        if self.connect_timeout_ms == 0 {
            self.connect_timeout_ms = 1000;
        }
        if self.request_timeout_ms == 0 {
            self.request_timeout_ms = 1000;
        }
        self
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostVerificationRegister {
    pub register_id: String,
    pub name: String,
    pub address: u16,
    pub function_code: u8,
    pub quantity: u16,
    pub data_type: String,
    pub scale: f64,
    pub offset: f64,
    pub unit: String,
    pub access: String,
    pub group: String,
}

impl HostVerificationRegister {
    fn normalized(mut self) -> Self {
        if self.quantity == 0 {
            self.quantity = default_quantity(&self.data_type);
        }
        if self.scale == 0.0 {
            self.scale = 1.0;
        }
        if self.function_code == 0 {
            self.function_code = 3;
        }
        self
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostVerificationValue {
    pub register_id: String,
    pub name: String,
    pub address: u16,
    pub function_code: u8,
    pub raw_registers: Vec<u16>,
    pub value: Option<f64>,
    pub display_value: String,
    pub unit: String,
    pub quality: String,
    pub latency_ms: f64,
    pub timestamp: i64,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostVerificationReadSummary {
    pub started_at: i64,
    pub finished_at: i64,
    pub total_count: usize,
    pub readable_count: usize,
    pub writable_count: usize,
    pub success_count: usize,
    pub failed_count: usize,
    pub skipped_count: usize,
    pub values: Vec<HostVerificationValue>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostVerificationWriteResult {
    pub register_id: String,
    pub name: String,
    pub address: u16,
    pub raw_registers: Vec<u16>,
    pub value: f64,
    pub display_value: String,
    pub unit: String,
    pub readback: Option<HostVerificationValue>,
    pub timestamp: i64,
}

#[tauri::command]
pub(crate) fn host_verify_read_all_registers(
    config: HostVerificationConnectionConfig,
    registers: Vec<HostVerificationRegister>,
) -> Result<HostVerificationReadSummary, String> {
    read_all_registers(config, registers)
}

#[tauri::command]
pub(crate) fn host_verify_write_register(
    config: HostVerificationConnectionConfig,
    register: HostVerificationRegister,
    value: String,
) -> Result<HostVerificationWriteResult, String> {
    write_register(config, register, value)
}

fn read_all_registers(
    config: HostVerificationConnectionConfig,
    registers: Vec<HostVerificationRegister>,
) -> Result<HostVerificationReadSummary, String> {
    let started_at = now_millis();
    let config = config.normalized();
    validate_config(&config)?;
    let registers: Vec<_> = registers
        .into_iter()
        .map(HostVerificationRegister::normalized)
        .collect();
    let readable_count = registers
        .iter()
        .filter(|register| is_readable(&register.access))
        .count();
    let writable_count = registers
        .iter()
        .filter(|register| is_writable(&register.access))
        .count();
    let mut stream = connect(&config)?;
    let mut values = Vec::with_capacity(registers.len());

    for register in registers {
        if !is_readable(&register.access) {
            values.push(skipped_value(register, "XLS 标记为只写，主机验证跳过读取"));
            continue;
        }
        values.push(read_one(&mut stream, &config, &register));
    }

    let success_count = values
        .iter()
        .filter(|value| value.quality == "Good")
        .count();
    let skipped_count = values
        .iter()
        .filter(|value| value.quality == "Skipped")
        .count();
    let failed_count = values.len().saturating_sub(success_count + skipped_count);
    Ok(HostVerificationReadSummary {
        started_at,
        finished_at: now_millis(),
        total_count: values.len(),
        readable_count,
        writable_count,
        success_count,
        failed_count,
        skipped_count,
        values,
    })
}

fn write_register(
    config: HostVerificationConnectionConfig,
    register: HostVerificationRegister,
    value: String,
) -> Result<HostVerificationWriteResult, String> {
    let config = config.normalized();
    validate_config(&config)?;
    let register = register.normalized();
    if !is_writable(&register.access) {
        return Err(format!(
            "{} XLS 权限为 {}，不允许写入",
            register.name, register.access
        ));
    }
    let engineering_value = parse_engineering_value(&value)?;
    let raw_registers = encode_engineering_value(&register, engineering_value)?;
    let mut stream = connect(&config)?;
    if raw_registers.len() == 1 {
        protocol::write_single_register_with_stream(
            &mut stream,
            config.unit_id,
            register.address,
            raw_registers[0],
        )?;
    } else {
        protocol::write_multiple_registers_with_stream(
            &mut stream,
            config.unit_id,
            register.address,
            &raw_registers,
        )?;
    }

    let readback = if is_readable(&register.access) {
        Some(read_one(&mut stream, &config, &register))
    } else {
        None
    };

    Ok(HostVerificationWriteResult {
        register_id: register.register_id,
        name: register.name,
        address: register.address,
        raw_registers,
        value: engineering_value,
        display_value: format_display_value(engineering_value, &register.unit),
        unit: register.unit,
        readback,
        timestamp: now_millis(),
    })
}

fn connect(config: &HostVerificationConnectionConfig) -> Result<TcpStream, String> {
    protocol::connect_modbus_tcp(
        &config.host,
        config.port,
        config.connect_timeout_ms,
        config.request_timeout_ms,
    )
}

fn read_one(
    stream: &mut TcpStream,
    config: &HostVerificationConnectionConfig,
    register: &HostVerificationRegister,
) -> HostVerificationValue {
    let started = SystemTime::now();
    let function_code = read_function_code(register);
    let result = protocol::read_registers_with_stream(
        stream,
        config.unit_id,
        function_code,
        register.address,
        register.quantity,
    );
    let latency_ms = started
        .elapsed()
        .map(|duration| duration.as_secs_f64() * 1000.0)
        .unwrap_or_default();
    match result {
        Ok(raw_registers) => {
            let value = decode_engineering_value(register, &raw_registers);
            HostVerificationValue {
                register_id: register.register_id.clone(),
                name: register.name.clone(),
                address: register.address,
                function_code,
                raw_registers,
                value: Some(value),
                display_value: format_display_value(value, &register.unit),
                unit: register.unit.clone(),
                quality: "Good".to_string(),
                latency_ms,
                timestamp: now_millis(),
                error: None,
            }
        }
        Err(error) => HostVerificationValue {
            register_id: register.register_id.clone(),
            name: register.name.clone(),
            address: register.address,
            function_code,
            raw_registers: Vec::new(),
            value: None,
            display_value: "--".to_string(),
            unit: register.unit.clone(),
            quality: "Bad".to_string(),
            latency_ms,
            timestamp: now_millis(),
            error: Some(error),
        },
    }
}

fn skipped_value(
    register: HostVerificationRegister,
    reason: impl Into<String>,
) -> HostVerificationValue {
    let function_code = read_function_code(&register);
    HostVerificationValue {
        register_id: register.register_id,
        name: register.name,
        address: register.address,
        function_code,
        raw_registers: Vec::new(),
        value: None,
        display_value: "--".to_string(),
        unit: register.unit,
        quality: "Skipped".to_string(),
        latency_ms: 0.0,
        timestamp: now_millis(),
        error: Some(reason.into()),
    }
}

fn validate_config(config: &HostVerificationConnectionConfig) -> Result<(), String> {
    if config.host.trim().is_empty() {
        return Err("host 不能为空".to_string());
    }
    if config.unit_id == 0 {
        return Err("unitId 必须在 1..247".to_string());
    }
    Ok(())
}

fn default_quantity(data_type: &str) -> u16 {
    match data_type.to_lowercase().as_str() {
        "uint32" | "int32" | "float32" | "float" => 2,
        _ => 1,
    }
}

fn read_function_code(register: &HostVerificationRegister) -> u8 {
    if register.function_code == 4 {
        4
    } else {
        3
    }
}

fn is_readable(access: &str) -> bool {
    let normalized = normalize_access(access);
    normalized == "read" || normalized == "readwrite"
}

fn is_writable(access: &str) -> bool {
    let normalized = normalize_access(access);
    normalized == "write" || normalized == "readwrite"
}

fn normalize_access(access: &str) -> String {
    let compact = access
        .trim()
        .to_lowercase()
        .replace(['/', '-', '_', ' '], "");
    match compact.as_str() {
        "r" | "ro" | "readonly" | "read" => "read".to_string(),
        "w" | "wo" | "writeonly" | "write" => "write".to_string(),
        "rw" | "wr" | "readwrite" | "writeread" => "readwrite".to_string(),
        _ => compact,
    }
}

fn decode_engineering_value(register: &HostVerificationRegister, raw_registers: &[u16]) -> f64 {
    let raw0 = raw_registers.first().copied().unwrap_or_default();
    let base = match register.data_type.to_lowercase().as_str() {
        "bool" => {
            if raw0 == 0 {
                0.0
            } else {
                1.0
            }
        }
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
        "float32" | "float" => {
            let high = raw0 as u32;
            let low = raw_registers.get(1).copied().unwrap_or_default() as u32;
            f32::from_bits((high << 16) | low) as f64
        }
        _ => raw0 as f64,
    };
    base * register.scale + register.offset
}

fn encode_engineering_value(
    register: &HostVerificationRegister,
    value: f64,
) -> Result<Vec<u16>, String> {
    let raw_value = (value - register.offset) / register.scale;
    match register.data_type.to_lowercase().as_str() {
        "bool" => Ok(vec![if value.abs() > f64::EPSILON { 1 } else { 0 }]),
        "int16" => checked_i16(raw_value).map(|raw| vec![raw as u16]),
        "uint32" => checked_u32(raw_value).map(split_u32),
        "int32" => checked_i32(raw_value).map(|raw| split_u32(raw as u32)),
        "float32" | "float" => {
            let raw = raw_value as f32;
            Ok(split_u32(raw.to_bits()))
        }
        _ => checked_u16(raw_value).map(|raw| vec![raw]),
    }
}

fn parse_engineering_value(value: &str) -> Result<f64, String> {
    let trimmed = value.trim();
    if trimmed.eq_ignore_ascii_case("true") || trimmed == "是" || trimmed == "开" {
        return Ok(1.0);
    }
    if trimmed.eq_ignore_ascii_case("false") || trimmed == "否" || trimmed == "关" {
        return Ok(0.0);
    }
    if let Some(hex) = trimmed
        .strip_prefix("0x")
        .or_else(|| trimmed.strip_prefix("0X"))
    {
        return u64::from_str_radix(hex, 16)
            .map(|raw| raw as f64)
            .map_err(|error| format!("16 进制写入值无效: {error}"));
    }
    trimmed
        .parse::<f64>()
        .map_err(|error| format!("写入值必须是数值: {error}"))
}

fn checked_u16(value: f64) -> Result<u16, String> {
    let rounded = value.round();
    if !(0.0..=u16::MAX as f64).contains(&rounded) {
        return Err(format!("原始值 {rounded} 超出 uint16 范围"));
    }
    Ok(rounded as u16)
}

fn checked_i16(value: f64) -> Result<i16, String> {
    let rounded = value.round();
    if !(i16::MIN as f64..=i16::MAX as f64).contains(&rounded) {
        return Err(format!("原始值 {rounded} 超出 int16 范围"));
    }
    Ok(rounded as i16)
}

fn checked_u32(value: f64) -> Result<u32, String> {
    let rounded = value.round();
    if !(0.0..=u32::MAX as f64).contains(&rounded) {
        return Err(format!("原始值 {rounded} 超出 uint32 范围"));
    }
    Ok(rounded as u32)
}

fn checked_i32(value: f64) -> Result<i32, String> {
    let rounded = value.round();
    if !(i32::MIN as f64..=i32::MAX as f64).contains(&rounded) {
        return Err(format!("原始值 {rounded} 超出 int32 范围"));
    }
    Ok(rounded as i32)
}

fn split_u32(raw: u32) -> Vec<u16> {
    vec![(raw >> 16) as u16, (raw & 0xffff) as u16]
}

fn format_display_value(value: f64, unit: &str) -> String {
    if unit.trim().is_empty() {
        format!("{value:.3}")
    } else {
        format!("{value:.3} {unit}")
    }
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

pub fn host_verify_read_all_registers_for_test(
    config: HostVerificationConnectionConfig,
    registers: Vec<HostVerificationRegister>,
) -> Result<HostVerificationReadSummary, String> {
    read_all_registers(config, registers)
}

pub fn host_verify_write_register_for_test(
    config: HostVerificationConnectionConfig,
    register: HostVerificationRegister,
    value: String,
) -> Result<HostVerificationWriteResult, String> {
    write_register(config, register, value)
}
