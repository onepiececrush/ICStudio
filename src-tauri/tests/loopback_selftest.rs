use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

use icstudio_lib::{
    clear_pcs3_fault_for_test, connect_and_read_registers_for_test, create_loopback_store_for_test,
    inject_pcs3_fault_for_test, poll_loopback_dashboard_for_test,
    poll_loopback_dashboard_with_store_for_test, production_read_registers_for_test,
    production_write_multiple_registers_for_test, production_write_single_register_for_test,
    remove_production_channel_for_test, set_loopback_number_for_test,
    start_modbus_tcp_slave_for_test, start_production_channel_for_test,
    stop_production_channel_for_test, ModbusTcpChannelConfig, ProductionPointConfig,
};

static PORT_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

#[test]
fn built_in_slave_serves_register_14001_over_real_modbus_tcp() {
    let _guard = PORT_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let store = create_loopback_store_for_test();
    let server = start_modbus_tcp_slave_for_test("127.0.0.1", 1502, 1, store.clone())
        .expect("server starts");

    let raw = connect_and_read_registers_for_test("127.0.0.1", 1502, 1, 14001, 1)
        .expect("modbus read succeeds");

    assert_eq!(raw, vec![12]);
    let logs = store.logs();
    assert!(
        logs.iter().any(|entry| entry.contains("主站连接建立")),
        "logs: {logs:?}"
    );
    assert!(
        logs.iter()
            .any(|entry| entry.contains("FC03 读寄存器 address=14001 quantity=1")),
        "logs: {logs:?}"
    );
    let frame_logs = store.frame_logs();
    assert!(
        frame_logs.iter().any(|entry| {
            entry.direction == "request" && entry.frame.contains("00 00 00 06 01 03 36 B1 00 01")
        }),
        "frame logs: {frame_logs:?}"
    );
    assert!(
        frame_logs.iter().any(|entry| {
            entry.direction == "response" && entry.frame.contains("00 00 00 05 01 03 02 00 0C")
        }),
        "frame logs: {frame_logs:?}"
    );
    server.stop();
}

#[test]
fn slave_supports_fc04_fc06_and_fc16_over_real_tcp() {
    let _guard = PORT_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let store = create_loopback_store_for_test();
    let server = start_modbus_tcp_slave_for_test("127.0.0.1", 1502, 1, store.clone())
        .expect("server starts");

    assert_eq!(read_registers_fc(4, 14001, 1), vec![12]);

    let fc06_response = modbus_request(&[6, 0x36, 0xB6, 0x3A, 0x98]); // 14006 = 15000 raw, scale 0.1 => 1500.00 kW
    assert_eq!(&fc06_response[..5], &[6, 0x36, 0xB6, 0x3A, 0x98]);
    let after_power = poll_loopback_dashboard_with_store_for_test("127.0.0.1", 1502, 1, &store)
        .expect("poll after FC06");
    assert_eq!(after_power.value("14006").unwrap().display_value, "1500.00");

    let fc16_response = modbus_request(&[16, 0x64, 0x09, 0x00, 0x01, 0x02, 0x1A, 0x04]); // 25609 = 6660 raw, scale 0.01 => 66.60%
    assert_eq!(&fc16_response[..5], &[16, 0x64, 0x09, 0x00, 0x01]);
    let after_soc = poll_loopback_dashboard_with_store_for_test("127.0.0.1", 1502, 1, &store)
        .expect("poll after FC16");
    assert_eq!(after_soc.value("25609").unwrap().display_value, "66.60");

    server.stop();
}

#[test]
fn dashboard_master_polls_loopback_and_decodes_pcs_and_bms_values() {
    let _guard = PORT_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let store = create_loopback_store_for_test();
    let server =
        start_modbus_tcp_slave_for_test("127.0.0.1", 1502, 1, store).expect("server starts");

    let dashboard =
        poll_loopback_dashboard_for_test("127.0.0.1", 1502, 1).expect("dashboard poll succeeds");

    assert_eq!(dashboard.connection_status, "已连接");
    assert_eq!(dashboard.value("14001").unwrap().display_value, "12");
    assert_eq!(dashboard.value("14002").unwrap().display_value, "并网运行");
    assert_eq!(dashboard.value("14006").unwrap().display_value, "1250.00");
    assert_eq!(dashboard.value("14007").unwrap().display_value, "-120.50");
    assert_eq!(dashboard.value("14031").unwrap().display_value, "768.20");
    assert_eq!(dashboard.value("14032").unwrap().display_value, "-325.40");
    assert_eq!(dashboard.value("25609").unwrap().display_value, "78.50");
    assert_eq!(dashboard.value("25611").unwrap().display_value, "95.60");
    let failed: Vec<_> = dashboard
        .verification_rows
        .iter()
        .filter(|row| row.result != "通过")
        .collect();
    assert!(failed.is_empty(), "failed verification rows: {failed:#?}");

    server.stop();
}

#[test]
fn dashboard_polls_all_sixteen_pcs_modules_with_expected_default_states() {
    let _guard = PORT_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let store = create_loopback_store_for_test();
    let server =
        start_modbus_tcp_slave_for_test("127.0.0.1", 1502, 1, store).expect("server starts");

    let dashboard =
        poll_loopback_dashboard_for_test("127.0.0.1", 1502, 1).expect("dashboard poll succeeds");
    let states: Vec<_> = dashboard
        .pcs_modules
        .iter()
        .map(|module| module.state.as_str())
        .collect();

    assert_eq!(dashboard.pcs_modules.len(), 16);
    assert_eq!(states[2], "故障");
    assert_eq!(states[6], "待机");
    assert_eq!(states[10], "待机");
    assert_eq!(states[14], "离线");
    assert!(dashboard.pcs_modules[2].has_fault);
    assert_eq!(dashboard.severe_alarm_count, 1);

    server.stop();
}

#[test]
fn simulator_value_changes_fault_controls_and_communication_interrupt_are_visible_to_dashboard() {
    let _guard = PORT_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let store = create_loopback_store_for_test();
    let server = start_modbus_tcp_slave_for_test("127.0.0.1", 1502, 1, store.clone())
        .expect("server starts");

    set_loopback_number_for_test(&store, 14006, 1500.0).unwrap();
    set_loopback_number_for_test(&store, 25609, 66.6).unwrap();
    let changed = poll_loopback_dashboard_with_store_for_test("127.0.0.1", 1502, 1, &store)
        .expect("poll changed values");
    assert_eq!(changed.value("14006").unwrap().display_value, "1500.00");
    assert_eq!(changed.value("25609").unwrap().display_value, "66.60");

    clear_pcs3_fault_for_test(&store).unwrap();
    let cleared = poll_loopback_dashboard_with_store_for_test("127.0.0.1", 1502, 1, &store)
        .expect("poll after clear");
    assert_eq!(cleared.pcs_modules[2].state, "运行");
    assert!(!cleared.pcs_modules[2].has_fault);
    assert_eq!(cleared.severe_alarm_count, 0);

    inject_pcs3_fault_for_test(&store).unwrap();
    let injected = poll_loopback_dashboard_with_store_for_test("127.0.0.1", 1502, 1, &store)
        .expect("poll after inject");
    assert_eq!(injected.pcs_modules[2].state, "故障");
    assert!(injected.pcs_modules[2].has_fault);
    assert_eq!(injected.severe_alarm_count, 1);

    server.stop();
    let interrupted = poll_loopback_dashboard_with_store_for_test("127.0.0.1", 1502, 1, &store);
    assert!(
        interrupted.is_err(),
        "polling after stopping TCP server should fail"
    );
}

#[test]
fn production_modbus_tcp_backend_reads_writes_and_polls_real_loopback() {
    let _guard = PORT_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let store = create_loopback_store_for_test();
    let server = start_modbus_tcp_slave_for_test("127.0.0.1", 1502, 1, store.clone())
        .expect("server starts");
    let config = production_test_config("prod-loopback");

    let online =
        production_read_registers_for_test(config.clone(), 3, 14001, 1).expect("production read");
    assert_eq!(online, vec![12]);

    production_write_single_register_for_test(config.clone(), 14006, 15000)
        .expect("production FC06 write");
    let after_power = poll_loopback_dashboard_with_store_for_test("127.0.0.1", 1502, 1, &store)
        .expect("poll after production write");
    assert_eq!(after_power.value("14006").unwrap().display_value, "1500.00");

    production_write_multiple_registers_for_test(config.clone(), 25609, vec![6660])
        .expect("production FC16 write");
    let after_soc = poll_loopback_dashboard_with_store_for_test("127.0.0.1", 1502, 1, &store)
        .expect("poll after production FC16");
    assert_eq!(after_soc.value("25609").unwrap().display_value, "66.60");

    let started = start_production_channel_for_test(
        config.clone(),
        vec![
            ProductionPointConfig {
                point_id: "online".to_string(),
                name: "PCS 在线台数".to_string(),
                function_code: 3,
                address: 14001,
                quantity: 1,
                data_type: "uint16".to_string(),
                scale: 1.0,
                offset: 0.0,
                unit: "台".to_string(),
                poll_interval_ms: 50,
                enabled: true,
            },
            ProductionPointConfig {
                point_id: "soc".to_string(),
                name: "SOC".to_string(),
                function_code: 3,
                address: 25609,
                quantity: 1,
                data_type: "uint16".to_string(),
                scale: 0.01,
                offset: 0.0,
                unit: "%".to_string(),
                poll_interval_ms: 50,
                enabled: true,
            },
        ],
    )
    .expect("production channel starts");
    assert!(started.running);

    std::thread::sleep(Duration::from_millis(250));
    let stopped =
        stop_production_channel_for_test("prod-loopback".to_string()).expect("channel stops");
    let online = stopped
        .latest_values
        .iter()
        .find(|value| value.point_id == "online")
        .expect("online latest value");
    let soc = stopped
        .latest_values
        .iter()
        .find(|value| value.point_id == "soc")
        .expect("soc latest value");
    assert_eq!(online.quality, "Good");
    assert_eq!(online.value, 12.0);
    assert_eq!(soc.quality, "Good");
    assert!((soc.value - 66.60).abs() < 0.001);
    assert!(
        stopped.stats.success_count >= 2,
        "stats: {:?}",
        stopped.stats
    );
    assert!(
        stopped
            .logs
            .iter()
            .any(|entry| entry.message.contains("连接成功")),
        "logs: {:?}",
        stopped.logs
    );

    remove_production_channel_for_test("prod-loopback".to_string()).unwrap();
    server.stop();
}

fn production_test_config(channel_id: &str) -> ModbusTcpChannelConfig {
    ModbusTcpChannelConfig {
        channel_id: channel_id.to_string(),
        name: "生产级 Loopback 通道".to_string(),
        host: "127.0.0.1".to_string(),
        port: 1502,
        unit_id: 1,
        connect_timeout_ms: 300,
        request_timeout_ms: 300,
        reconnect_interval_ms: 50,
    }
}

fn read_registers_fc(function_code: u8, address: u16, quantity: u16) -> Vec<u16> {
    let pdu = modbus_request(&[
        function_code,
        (address >> 8) as u8,
        (address & 0xff) as u8,
        (quantity >> 8) as u8,
        (quantity & 0xff) as u8,
    ]);
    assert_eq!(pdu[0], function_code);
    assert_eq!(pdu[1], (quantity * 2) as u8);
    (0..quantity as usize)
        .map(|index| {
            let offset = 2 + index * 2;
            u16::from_be_bytes([pdu[offset], pdu[offset + 1]])
        })
        .collect()
}

fn modbus_request(pdu: &[u8]) -> Vec<u8> {
    let mut stream = TcpStream::connect(("127.0.0.1", 1502)).expect("tcp connect");
    stream
        .set_read_timeout(Some(Duration::from_secs(1)))
        .unwrap();
    let mut request = Vec::new();
    request.extend_from_slice(&1u16.to_be_bytes());
    request.extend_from_slice(&0u16.to_be_bytes());
    request.extend_from_slice(&((pdu.len() + 1) as u16).to_be_bytes());
    request.push(1);
    request.extend_from_slice(pdu);
    stream.write_all(&request).expect("write request");
    let mut header = [0u8; 7];
    stream.read_exact(&mut header).expect("read mbap");
    let length = u16::from_be_bytes([header[4], header[5]]) as usize;
    let mut response_pdu = vec![0u8; length - 1];
    stream.read_exact(&mut response_pdu).expect("read pdu");
    response_pdu
}
