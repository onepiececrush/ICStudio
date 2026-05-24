mod app;
mod history;
mod modbus;

use crate::app::{
    clear_loopback_faults, connect_home_modbus_dashboard, disconnect_home_modbus_dashboard,
    get_app_snapshot, get_modbus_simulator_status, inject_pcs3_fault,
    interrupt_loopback_communication, poll_home_loopback_dashboard,
    set_loopback_value, set_modbus_simulator_register_value, start_home_loopback_selftest,
    start_modbus_simulator_server, stop_home_loopback_selftest, stop_modbus_simulator_server,
};
use crate::history::{
    export_history_trend_csv, initialize_history_database, query_alarm_history,
    query_history_trend, write_history_batch,
};
use crate::modbus::backend::{
    configure_modbus_tcp_channel, get_modbus_backend_snapshot, get_modbus_channel_logs,
    read_modbus_tcp_registers, remove_modbus_tcp_channel, start_modbus_tcp_channel,
    stop_modbus_tcp_channel, write_modbus_tcp_multiple_registers, write_modbus_tcp_single_register,
};

pub use crate::history::{
    export_history_trend_csv_for_test, initialize_history_database_for_test,
    query_alarm_history_for_test, query_history_trend_for_test, write_history_batch_for_test,
    HistoryAlarmEvent, HistoryAlarmQuery, HistoryCommunicationRecord, HistoryOperationLog,
    HistoryPersistBatch, HistoryPersistSummary, HistoryPointSample, HistoryTestReport,
    HistoryTestReportDetail, HistoryTrendQuery, HistoryTrendRow,
};
pub use crate::modbus::{
    clear_pcs3_fault_for_test, connect_and_read_registers_for_test, create_loopback_store_for_test,
    inject_pcs3_fault_for_test, poll_loopback_dashboard_for_test,
    poll_loopback_dashboard_with_store_for_test, production_read_registers_for_test,
    production_write_multiple_registers_for_test, production_write_single_register_for_test,
    remove_production_channel_for_test, set_loopback_number_for_test,
    start_modbus_tcp_slave_for_test, start_production_channel_for_test,
    stop_production_channel_for_test, HomeDashboardValue, HomeLoopbackDashboard, HomePcsModule,
    HomeVerificationRow, ModbusBackendLogEntry, ModbusBackendSnapshot, ModbusChannelSnapshot,
    ModbusChannelStats, ModbusTcpChannelConfig, ModbusTcpSlaveServer, ProductionPointConfig,
    ProductionPointValue, SimulatedRegisterStore,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_app_snapshot,
            connect_home_modbus_dashboard,
            disconnect_home_modbus_dashboard,
            start_modbus_simulator_server,
            stop_modbus_simulator_server,
            get_modbus_simulator_status,
            set_modbus_simulator_register_value,
            start_home_loopback_selftest,
            stop_home_loopback_selftest,
            poll_home_loopback_dashboard,
            set_loopback_value,
            inject_pcs3_fault,
            clear_loopback_faults,
            interrupt_loopback_communication,
            configure_modbus_tcp_channel,
            start_modbus_tcp_channel,
            stop_modbus_tcp_channel,
            remove_modbus_tcp_channel,
            get_modbus_backend_snapshot,
            get_modbus_channel_logs,
            read_modbus_tcp_registers,
            write_modbus_tcp_single_register,
            write_modbus_tcp_multiple_registers,
            initialize_history_database,
            write_history_batch,
            query_history_trend,
            query_alarm_history,
            export_history_trend_csv,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
