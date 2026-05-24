use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

use icstudio_lib::{
    export_history_trend_csv_for_test, initialize_history_database_for_test,
    query_alarm_history_for_test, query_history_trend_for_test, write_history_batch_for_test,
    HistoryAlarmEvent, HistoryAlarmQuery, HistoryCommunicationRecord, HistoryOperationLog,
    HistoryPersistBatch, HistoryPointSample, HistoryTestReport, HistoryTestReportDetail,
    HistoryTrendQuery,
};

#[test]
fn sqlite_history_store_initializes_tables_and_queries_point_trends() {
    let db_path = temp_db_path("trend");
    initialize_history_database_for_test(&db_path).expect("history database initializes");

    let base = 1_779_600_000_000_i64;
    let summary = write_history_batch_for_test(
        &db_path,
        HistoryPersistBatch {
            point_samples: vec![
                point_sample(base, 100.0),
                point_sample(base + 20_000, 140.0),
                point_sample(base + 80_000, 180.0),
                HistoryPointSample {
                    timestamp: base + 20_000,
                    device_id: "BMS-01".to_string(),
                    device_type: "BMS".to_string(),
                    point_id: "soc".to_string(),
                    point_name: "SOC".to_string(),
                    page: "实时监控".to_string(),
                    value: 72.6,
                    unit: "%".to_string(),
                    quality: "good".to_string(),
                    source: "rust-test".to_string(),
                },
            ],
            ..HistoryPersistBatch::default()
        },
    )
    .expect("point samples write");

    assert_eq!(summary.point_samples_written, 4);

    let raw = query_history_trend_for_test(
        &db_path,
        HistoryTrendQuery {
            device_id: "PCS-01".to_string(),
            point_id: "active-power".to_string(),
            start_time: base,
            end_time: base + 90_000,
            sampling_period_ms: None,
            aggregate: "raw".to_string(),
        },
    )
    .expect("raw trend query");
    assert_eq!(
        raw.iter().map(|row| row.value).collect::<Vec<_>>(),
        vec![100.0, 140.0, 180.0]
    );

    let averaged = query_history_trend_for_test(
        &db_path,
        HistoryTrendQuery {
            device_id: "PCS-01".to_string(),
            point_id: "active-power".to_string(),
            start_time: base,
            end_time: base + 120_000,
            sampling_period_ms: Some(60_000),
            aggregate: "avg".to_string(),
        },
    )
    .expect("aggregated trend query");
    assert_eq!(
        averaged.iter().map(|row| row.value).collect::<Vec<_>>(),
        vec![120.0, 180.0]
    );
    assert_eq!(averaged[0].sample_count, 2);

    let csv = export_history_trend_csv_for_test(
        &db_path,
        HistoryTrendQuery {
            device_id: "PCS-01".to_string(),
            point_id: "active-power".to_string(),
            start_time: base,
            end_time: base + 90_000,
            sampling_period_ms: None,
            aggregate: "raw".to_string(),
        },
    )
    .expect("trend csv export");
    assert!(csv.contains("时间,设备,点位,数值,单位,页面,质量"));
    assert!(csv.contains("PCS-01,总有功功率,100,kW,首页,good"));

    let _ = fs::remove_file(db_path);
}

#[test]
fn sqlite_history_store_records_alarm_communication_operation_and_test_report_rows() {
    let db_path = temp_db_path("events");
    initialize_history_database_for_test(&db_path).expect("history database initializes");
    let base = 1_779_600_000_000_i64;

    let summary = write_history_batch_for_test(
        &db_path,
        HistoryPersistBatch {
            alarm_events: vec![HistoryAlarmEvent {
                timestamp: base + 1_000,
                alarm_id: "alarm-pcs-over-temp".to_string(),
                device_id: "PCS-03".to_string(),
                severity: "critical".to_string(),
                status: "active".to_string(),
                title: "PCS3 模块过温故障".to_string(),
                message: "温度超过阈值".to_string(),
                source: "首页告警中心".to_string(),
            }],
            communication_records: vec![HistoryCommunicationRecord {
                timestamp: base + 2_000,
                channel: "tcp://127.0.0.1:1502".to_string(),
                protocol: "Modbus TCP".to_string(),
                request_count: 120,
                success_count: 118,
                failure_count: 2,
                timeout_count: 1,
                crc_error_count: 0,
                average_latency_ms: 12.4,
                max_latency_ms: 86.0,
                success_rate: 98.33,
            }],
            operation_logs: vec![HistoryOperationLog {
                timestamp: base + 3_000,
                operator: "admin".to_string(),
                action: "设置有功功率 1000kW".to_string(),
                target: "PCS".to_string(),
                result: "success".to_string(),
                detail: "参数下发".to_string(),
            }],
            test_reports: vec![HistoryTestReport {
                report_id: "home-self-test-001".to_string(),
                timestamp: base + 4_000,
                project_name: "EVE储能项目".to_string(),
                protocol_version: "PCS Modbus V3.13 / BMS V1.06".to_string(),
                report_type: "home-self-test".to_string(),
                title: "首页自测报告".to_string(),
                summary: "首页闭环自测 2/2 通过".to_string(),
                total_cases: 2,
                passed_cases: 2,
                failed_cases: 0,
                duration_ms: 18_000,
                operator: "admin".to_string(),
                result: "passed".to_string(),
                details: vec![HistoryTestReportDetail {
                    name: "通信链路".to_string(),
                    expected: "可连接".to_string(),
                    actual: "127.0.0.1:1502".to_string(),
                    result: "passed".to_string(),
                    duration_ms: Some(10),
                    message: None,
                }],
            }],
            ..HistoryPersistBatch::default()
        },
    )
    .expect("history rows write");

    assert_eq!(summary.alarm_events_written, 1);
    assert_eq!(summary.communication_records_written, 1);
    assert_eq!(summary.operation_logs_written, 1);
    assert_eq!(summary.test_reports_written, 1);

    let alarms = query_alarm_history_for_test(
        &db_path,
        HistoryAlarmQuery {
            start_time: Some(base),
            end_time: Some(base + 10_000),
            severity: Some("critical".to_string()),
            device_id: None,
            status: None,
        },
    )
    .expect("alarm history query");
    assert_eq!(alarms.len(), 1);
    assert_eq!(alarms[0].title, "PCS3 模块过温故障");

    let _ = fs::remove_file(db_path);
}

fn point_sample(timestamp: i64, value: f64) -> HistoryPointSample {
    HistoryPointSample {
        timestamp,
        device_id: "PCS-01".to_string(),
        device_type: "PCS".to_string(),
        point_id: "active-power".to_string(),
        point_name: "总有功功率".to_string(),
        page: "首页".to_string(),
        value,
        unit: "kW".to_string(),
        quality: "good".to_string(),
        source: "rust-test".to_string(),
    }
}

fn temp_db_path(prefix: &str) -> String {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("time")
        .as_nanos();
    std::env::temp_dir()
        .join(format!("icstudio-{prefix}-{suffix}.sqlite"))
        .to_string_lossy()
        .to_string()
}
