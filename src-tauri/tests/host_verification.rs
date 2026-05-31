use std::sync::{LazyLock, Mutex};

use icstudio_lib::{
    create_loopback_store_for_test, host_verify_read_all_registers_for_test,
    host_verify_write_register_for_test, start_modbus_tcp_slave_for_test,
    HostVerificationConnectionConfig, HostVerificationRegister,
};

static PORT_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

#[test]
fn host_verification_reads_and_writes_from_xls_register_model() {
    let _guard = PORT_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let store = create_loopback_store_for_test();
    let server =
        start_modbus_tcp_slave_for_test("127.0.0.1", 1504, 1, store).expect("server starts");
    let config = HostVerificationConnectionConfig {
        host: "127.0.0.1".to_string(),
        port: 1504,
        unit_id: 1,
        connect_timeout_ms: 1000,
        request_timeout_ms: 1000,
    };
    let power = register(
        "pcs-total-active-power",
        "总有功功率",
        14006,
        "int16",
        0.1,
        "kW",
        "readWrite",
    );
    let write_only = register(
        "pcs-write-only",
        "只写测试",
        14007,
        "int16",
        0.1,
        "kvar",
        "write",
    );

    let summary = host_verify_read_all_registers_for_test(
        config.clone(),
        vec![power.clone(), write_only.clone()],
    )
    .expect("read all succeeds");

    assert_eq!(summary.total_count, 2);
    assert_eq!(summary.success_count, 1);
    assert_eq!(summary.skipped_count, 1);
    assert!(summary
        .values
        .iter()
        .any(|value| value.register_id == power.register_id && value.quality == "Good"));
    assert!(summary
        .values
        .iter()
        .any(|value| value.register_id == write_only.register_id && value.quality == "Skipped"));

    let write_result = host_verify_write_register_for_test(config, power, "1500.0".to_string())
        .expect("write succeeds");
    assert_eq!(write_result.raw_registers, vec![15000]);
    assert_eq!(
        write_result.readback.expect("readback").display_value,
        "1500.000 kW"
    );

    server.stop();
}

#[test]
fn host_verification_rejects_non_writable_register() {
    let config = HostVerificationConnectionConfig {
        host: "127.0.0.1".to_string(),
        port: 1504,
        unit_id: 1,
        connect_timeout_ms: 100,
        request_timeout_ms: 100,
    };
    let readonly = register(
        "pcs-readonly",
        "只读测试",
        14006,
        "int16",
        0.1,
        "kW",
        "read",
    );
    let error = host_verify_write_register_for_test(config, readonly, "1".to_string())
        .expect_err("readonly write must fail before network connect");
    assert!(error.contains("不允许写入"));
}

fn register(
    register_id: &str,
    name: &str,
    address: u16,
    data_type: &str,
    scale: f64,
    unit: &str,
    access: &str,
) -> HostVerificationRegister {
    HostVerificationRegister {
        register_id: register_id.to_string(),
        name: name.to_string(),
        address,
        function_code: 3,
        quantity: 1,
        data_type: data_type.to_string(),
        scale,
        offset: 0.0,
        unit: unit.to_string(),
        access: access.to_string(),
        group: "PCS".to_string(),
    }
}
