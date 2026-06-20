use crate::api::connection::{
    connect_home_modbus, disconnect_home_modbus, write_home_register, HomeConnectionStatus,
};
use std::collections::BTreeMap;
use std::io::{ErrorKind, Read, Write};
use std::net::{Shutdown, SocketAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

const MAX_LOGS: usize = 50;

struct SimulatorRuntime {
    address: SocketAddr,
    unit_id: u8,
    registers: Arc<Mutex<BTreeMap<u16, u16>>>,
    logs: Arc<Mutex<Vec<String>>>,
    stop: Arc<AtomicBool>,
    thread: JoinHandle<()>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SimulatorStatus {
    pub running: bool,
    pub endpoint: String,
    pub unit_id: u8,
    pub register_count: u32,
    pub logs: Vec<String>,
}

static HOME_SIMULATOR: Mutex<Option<SimulatorRuntime>> = Mutex::new(None);

pub fn start_home_self_test(
    host: String,
    port: u16,
    unit_id: u8,
) -> Result<HomeConnectionStatus, String> {
    let host = normalize_local_host(&host)?;
    if port == 0 {
        return Err("自测端口必须在 1..65535".to_string());
    }
    if unit_id == 0 || unit_id > 247 {
        return Err("自测 Unit ID 必须在 1..247".to_string());
    }

    stop_home_self_test()?;
    let listener = TcpListener::bind((host.as_str(), port))
        .map_err(|error| format!("启动内置 Modbus 从机失败: {error}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|error| format!("设置内置 Modbus 从机失败: {error}"))?;
    let address = listener
        .local_addr()
        .map_err(|error| format!("读取内置 Modbus 从机地址失败: {error}"))?;
    let registers = Arc::new(Mutex::new(seed_registers()));
    let logs = Arc::new(Mutex::new(vec![format!(
        "从机启动于 {address} · Unit {unit_id}"
    )]));
    let stop = Arc::new(AtomicBool::new(false));
    let thread = {
        let registers = Arc::clone(&registers);
        let logs = Arc::clone(&logs);
        let stop = Arc::clone(&stop);
        thread::spawn(move || serve(listener, unit_id, registers, logs, stop))
    };
    *HOME_SIMULATOR
        .lock()
        .map_err(|_| "内置 Modbus 从机状态锁定失败".to_string())? = Some(SimulatorRuntime {
        address,
        unit_id,
        registers,
        logs,
        stop,
        thread,
    });

    match connect_home_modbus(host, address.port(), unit_id) {
        Ok(status) => Ok(status),
        Err(error) => {
            let _ = stop_home_self_test();
            Err(error)
        }
    }
}

#[flutter_rust_bridge::frb(sync)]
pub fn set_home_self_test_register(
    address: u16,
    raw_value: u16,
) -> Result<SimulatorStatus, String> {
    {
        let slot = HOME_SIMULATOR
            .lock()
            .map_err(|_| "内置 Modbus 从机状态锁定失败".to_string())?;
        let runtime = slot
            .as_ref()
            .ok_or_else(|| "内置 Modbus 从机未启动".to_string())?;
        if !runtime
            .registers
            .lock()
            .map_err(|_| "内置 Modbus 寄存器锁定失败".to_string())?
            .contains_key(&address)
        {
            return Err(format!("自测寄存器 {address} 不存在"));
        }
    }
    write_home_register(address, raw_value)?;
    get_home_self_test_status_result()
}

#[flutter_rust_bridge::frb(sync)]
pub fn stop_home_self_test() -> Result<SimulatorStatus, String> {
    disconnect_home_modbus()?;
    let runtime = HOME_SIMULATOR
        .lock()
        .map_err(|_| "内置 Modbus 从机状态锁定失败".to_string())?
        .take();
    if let Some(runtime) = runtime {
        runtime.stop.store(true, Ordering::Relaxed);
        let _ = TcpStream::connect_timeout(&runtime.address, Duration::from_millis(100));
        runtime
            .thread
            .join()
            .map_err(|_| "内置 Modbus 从机线程停止失败".to_string())?;
    }
    Ok(stopped_status())
}

#[flutter_rust_bridge::frb(sync)]
pub fn get_home_self_test_status() -> SimulatorStatus {
    get_home_self_test_status_result().unwrap_or_else(|_| stopped_status())
}

fn get_home_self_test_status_result() -> Result<SimulatorStatus, String> {
    let slot = HOME_SIMULATOR
        .lock()
        .map_err(|_| "内置 Modbus 从机状态锁定失败".to_string())?;
    let Some(runtime) = slot.as_ref() else {
        return Ok(stopped_status());
    };
    let register_count = runtime
        .registers
        .lock()
        .map_err(|_| "内置 Modbus 寄存器锁定失败".to_string())?
        .len() as u32;
    let logs = runtime
        .logs
        .lock()
        .map_err(|_| "内置 Modbus 日志锁定失败".to_string())?
        .clone();
    Ok(SimulatorStatus {
        running: true,
        endpoint: runtime.address.to_string(),
        unit_id: runtime.unit_id,
        register_count,
        logs,
    })
}

fn serve(
    listener: TcpListener,
    unit_id: u8,
    registers: Arc<Mutex<BTreeMap<u16, u16>>>,
    logs: Arc<Mutex<Vec<String>>>,
    stop: Arc<AtomicBool>,
) {
    while !stop.load(Ordering::Relaxed) {
        match listener.accept() {
            Ok((mut stream, peer)) => {
                let _ = stream.set_read_timeout(Some(Duration::from_millis(100)));
                push_log(&logs, format!("主站已连接: {peer}"));
                serve_client(&mut stream, unit_id, &registers, &logs, &stop);
                let _ = stream.shutdown(Shutdown::Both);
            }
            Err(error) if error.kind() == ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(10));
            }
            Err(error) => {
                push_log(&logs, format!("从机监听失败: {error}"));
                return;
            }
        }
    }
}

fn serve_client(
    stream: &mut TcpStream,
    unit_id: u8,
    registers: &Arc<Mutex<BTreeMap<u16, u16>>>,
    logs: &Arc<Mutex<Vec<String>>>,
    stop: &Arc<AtomicBool>,
) {
    while !stop.load(Ordering::Relaxed) {
        let mut header = [0u8; 7];
        match stream.read_exact(&mut header) {
            Ok(()) => {}
            Err(error) if matches!(error.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => {
                continue;
            }
            Err(_) => return,
        }
        let protocol_id = u16::from_be_bytes([header[2], header[3]]);
        let length = u16::from_be_bytes([header[4], header[5]]) as usize;
        if protocol_id != 0 || !(2..=254).contains(&length) {
            return;
        }
        let mut pdu = vec![0u8; length - 1];
        if stream.read_exact(&mut pdu).is_err() || pdu.is_empty() {
            return;
        }
        let response = handle_request(header[6], unit_id, &pdu, registers, logs);
        let response_length = response.len() + 1;
        let mut frame = Vec::with_capacity(7 + response.len());
        frame.extend_from_slice(&header[0..2]);
        frame.extend_from_slice(&0u16.to_be_bytes());
        frame.extend_from_slice(&(response_length as u16).to_be_bytes());
        frame.push(header[6]);
        frame.extend_from_slice(&response);
        if stream.write_all(&frame).is_err() {
            return;
        }
    }
}

fn handle_request(
    request_unit: u8,
    unit_id: u8,
    pdu: &[u8],
    registers: &Arc<Mutex<BTreeMap<u16, u16>>>,
    logs: &Arc<Mutex<Vec<String>>>,
) -> Vec<u8> {
    let function = pdu[0];
    if request_unit != unit_id {
        return vec![function | 0x80, 0x0b];
    }
    if pdu.len() != 5 {
        return vec![function | 0x80, 0x03];
    }
    let address = u16::from_be_bytes([pdu[1], pdu[2]]);
    let value = u16::from_be_bytes([pdu[3], pdu[4]]);
    match function {
        3 => {
            if value == 0 || value > 125 {
                return vec![0x83, 0x03];
            }
            let register_guard = match registers.lock() {
                Ok(registers) => registers,
                Err(_) => return vec![0x83, 0x04],
            };
            let values = (0..value)
                .map(|offset| {
                    address
                        .checked_add(offset)
                        .and_then(|address| register_guard.get(&address).copied())
                })
                .collect::<Option<Vec<_>>>();
            let Some(values) = values else {
                return vec![0x83, 0x02];
            };
            let mut response = vec![3, (values.len() * 2) as u8];
            for register in values {
                response.extend_from_slice(&register.to_be_bytes());
            }
            push_log(
                logs,
                format!("FC03 读取 {address}..{}", address.saturating_add(value - 1)),
            );
            response
        }
        6 => {
            let mut register_guard = match registers.lock() {
                Ok(registers) => registers,
                Err(_) => return vec![0x86, 0x04],
            };
            let Some(register) = register_guard.get_mut(&address) else {
                return vec![0x86, 0x02];
            };
            *register = value;
            push_log(logs, format!("FC06 写入 {address} = {value}"));
            pdu.to_vec()
        }
        _ => vec![function | 0x80, 0x01],
    }
}

fn seed_registers() -> BTreeMap<u16, u16> {
    let mut registers = BTreeMap::new();
    for address in 14001..=14007 {
        registers.insert(address, 0);
    }
    for address in 14031..=14032 {
        registers.insert(address, 0);
    }
    for address in 25609..=25611 {
        registers.insert(address, 0);
    }
    registers.insert(14001, 12);
    registers.insert(14002, 1);
    registers.insert(14005, 5000);
    registers.insert(14006, 12500);
    registers.insert(14007, (-12050i16) as u16);
    registers.insert(14031, 7682);
    registers.insert(14032, (-32540i16) as u16);
    registers.insert(25609, 7850);
    registers.insert(25611, 9560);
    registers
}

fn push_log(logs: &Arc<Mutex<Vec<String>>>, message: String) {
    if let Ok(mut logs) = logs.lock() {
        logs.push(message);
        if logs.len() > MAX_LOGS {
            logs.remove(0);
        }
    }
}

fn normalize_local_host(host: &str) -> Result<String, String> {
    match host.trim() {
        "127.0.0.1" | "localhost" => Ok("127.0.0.1".to_string()),
        _ => Err("内置 Modbus 从机仅允许监听 127.0.0.1".to_string()),
    }
}

fn stopped_status() -> SimulatorStatus {
    SimulatorStatus {
        running: false,
        endpoint: "未启动".to_string(),
        unit_id: 0,
        register_count: 0,
        logs: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::connection::{get_home_dashboard, refresh_home_modbus, TEST_CONNECTION_LOCK};

    #[test]
    fn runs_closed_loop_and_updates_register_through_fc06() {
        let _guard = TEST_CONNECTION_LOCK.lock().expect("connection test lock");
        let status = start_home_self_test("127.0.0.1".to_string(), 0, 1);
        assert!(status.is_err());

        let listener = TcpListener::bind("127.0.0.1:0").expect("reserve test port");
        let port = listener.local_addr().expect("test port").port();
        drop(listener);
        let status = start_home_self_test("localhost".to_string(), port, 1)
            .expect("start closed-loop self test");
        assert!(status.connected);
        assert_eq!(
            get_home_dashboard()
                .expect("initial dashboard")
                .values
                .iter()
                .find(|value| value.address == 14006)
                .expect("power value")
                .display_value,
            "1250.00"
        );

        let simulator =
            set_home_self_test_register(14006, 15000).expect("write simulator register");
        assert!(simulator.running);
        refresh_home_modbus().expect("refresh after write");
        assert_eq!(
            get_home_dashboard()
                .expect("updated dashboard")
                .values
                .iter()
                .find(|value| value.address == 14006)
                .expect("power value")
                .display_value,
            "1500.00"
        );
        assert!(get_home_self_test_status()
            .logs
            .iter()
            .any(|line| line.contains("FC06 写入 14006 = 15000")));

        assert!(!stop_home_self_test().expect("stop self test").running);
    }
}
