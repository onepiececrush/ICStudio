mod schema;
mod sqlite;
mod types;

use std::collections::BTreeMap;
use std::path::Path;

use schema::{DEFAULT_TEMPLATE_SQL, HISTORY_SCHEMA_SQL};
use sqlite::{SqliteConnection, SqliteStatement};
pub use types::*;

#[tauri::command]
pub(crate) fn initialize_history_database(db_path: String) -> Result<(), String> {
    initialize_history_database_impl(&db_path)
}

#[tauri::command]
pub(crate) fn write_history_batch(
    db_path: String,
    batch: HistoryPersistBatch,
) -> Result<HistoryPersistSummary, String> {
    write_history_batch_impl(&db_path, batch)
}

#[tauri::command]
pub(crate) fn query_history_trend(
    db_path: String,
    query: HistoryTrendQuery,
) -> Result<Vec<HistoryTrendRow>, String> {
    query_history_trend_impl(&db_path, query)
}

#[tauri::command]
pub(crate) fn query_alarm_history(
    db_path: String,
    query: HistoryAlarmQuery,
) -> Result<Vec<HistoryAlarmEvent>, String> {
    query_alarm_history_impl(&db_path, query)
}

#[tauri::command]
pub(crate) fn export_history_trend_csv(
    db_path: String,
    query: HistoryTrendQuery,
) -> Result<String, String> {
    export_history_trend_csv_impl(&db_path, query)
}

pub fn initialize_history_database_for_test(db_path: &str) -> Result<(), String> {
    initialize_history_database_impl(db_path)
}

pub fn write_history_batch_for_test(
    db_path: &str,
    batch: HistoryPersistBatch,
) -> Result<HistoryPersistSummary, String> {
    write_history_batch_impl(db_path, batch)
}

pub fn query_history_trend_for_test(
    db_path: &str,
    query: HistoryTrendQuery,
) -> Result<Vec<HistoryTrendRow>, String> {
    query_history_trend_impl(db_path, query)
}

pub fn query_alarm_history_for_test(
    db_path: &str,
    query: HistoryAlarmQuery,
) -> Result<Vec<HistoryAlarmEvent>, String> {
    query_alarm_history_impl(db_path, query)
}

pub fn export_history_trend_csv_for_test(
    db_path: &str,
    query: HistoryTrendQuery,
) -> Result<String, String> {
    export_history_trend_csv_impl(db_path, query)
}

fn initialize_history_database_impl(db_path: &str) -> Result<(), String> {
    if let Some(parent) = Path::new(db_path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("无法创建历史数据库目录 {}: {error}", parent.display()))?;
    }
    let db = SqliteConnection::open(db_path)?;
    db.exec(HISTORY_SCHEMA_SQL)?;
    db.exec(DEFAULT_TEMPLATE_SQL)
}

fn write_history_batch_impl(
    db_path: &str,
    batch: HistoryPersistBatch,
) -> Result<HistoryPersistSummary, String> {
    initialize_history_database_impl(db_path)?;
    let db = SqliteConnection::open(db_path)?;
    // 批量写入必须原子化：任何一类历史数据失败都回滚整批，避免报表引用缺失。
    db.exec("BEGIN IMMEDIATE TRANSACTION;")?;

    let result = (|| {
        insert_point_samples(&db, &batch.point_samples)?;
        insert_alarm_events(&db, &batch.alarm_events)?;
        insert_communication_records(&db, &batch.communication_records)?;
        insert_operation_logs(&db, &batch.operation_logs)?;
        insert_test_reports(&db, &batch.test_reports)?;

        Ok::<(), String>(())
    })();

    match result {
        Ok(()) => {
            db.exec("COMMIT;")?;
            Ok(HistoryPersistSummary {
                point_samples_written: batch.point_samples.len(),
                alarm_events_written: batch.alarm_events.len(),
                communication_records_written: batch.communication_records.len(),
                operation_logs_written: batch.operation_logs.len(),
                test_reports_written: batch.test_reports.len(),
            })
        }
        Err(error) => {
            let _ = db.exec("ROLLBACK;");
            Err(error)
        }
    }
}

fn insert_point_samples(
    db: &SqliteConnection,
    samples: &[HistoryPointSample],
) -> Result<(), String> {
    let mut stmt = db.prepare(
        "INSERT INTO point_history(timestamp, device_id, device_type, point_id, point_name, page, value, unit, quality, source) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )?;
    for sample in samples {
        stmt.bind_i64(1, sample.timestamp)?;
        stmt.bind_text(2, &sample.device_id)?;
        stmt.bind_text(3, &sample.device_type)?;
        stmt.bind_text(4, &sample.point_id)?;
        stmt.bind_text(5, &sample.point_name)?;
        stmt.bind_text(6, &sample.page)?;
        stmt.bind_f64(7, sample.value)?;
        stmt.bind_text(8, &sample.unit)?;
        stmt.bind_text(9, &sample.quality)?;
        stmt.bind_text(10, &sample.source)?;
        stmt.step_done()?;
        stmt.reset()?;
    }
    Ok(())
}

fn insert_alarm_events(db: &SqliteConnection, alarms: &[HistoryAlarmEvent]) -> Result<(), String> {
    let mut stmt = db.prepare(
        "INSERT INTO alarm_history(timestamp, alarm_id, device_id, severity, status, title, message, source) VALUES(?, ?, ?, ?, ?, ?, ?, ?)",
    )?;
    for alarm in alarms {
        stmt.bind_i64(1, alarm.timestamp)?;
        stmt.bind_text(2, &alarm.alarm_id)?;
        stmt.bind_text(3, &alarm.device_id)?;
        stmt.bind_text(4, &alarm.severity)?;
        stmt.bind_text(5, &alarm.status)?;
        stmt.bind_text(6, &alarm.title)?;
        stmt.bind_text(7, &alarm.message)?;
        stmt.bind_text(8, &alarm.source)?;
        stmt.step_done()?;
        stmt.reset()?;
    }
    Ok(())
}

fn insert_communication_records(
    db: &SqliteConnection,
    records: &[HistoryCommunicationRecord],
) -> Result<(), String> {
    let mut stmt = db.prepare(
        "INSERT INTO communication_history(timestamp, channel, protocol, request_count, success_count, failure_count, timeout_count, crc_error_count, average_latency_ms, max_latency_ms, success_rate) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )?;
    for record in records {
        stmt.bind_i64(1, record.timestamp)?;
        stmt.bind_text(2, &record.channel)?;
        stmt.bind_text(3, &record.protocol)?;
        stmt.bind_i64(4, record.request_count)?;
        stmt.bind_i64(5, record.success_count)?;
        stmt.bind_i64(6, record.failure_count)?;
        stmt.bind_i64(7, record.timeout_count)?;
        stmt.bind_i64(8, record.crc_error_count)?;
        stmt.bind_f64(9, record.average_latency_ms)?;
        stmt.bind_f64(10, record.max_latency_ms)?;
        stmt.bind_f64(11, record.success_rate)?;
        stmt.step_done()?;
        stmt.reset()?;
    }
    Ok(())
}

fn insert_operation_logs(
    db: &SqliteConnection,
    logs: &[HistoryOperationLog],
) -> Result<(), String> {
    let mut stmt = db.prepare(
        "INSERT INTO operation_log(timestamp, operator, action, target, result, detail) VALUES(?, ?, ?, ?, ?, ?)",
    )?;
    for log in logs {
        stmt.bind_i64(1, log.timestamp)?;
        stmt.bind_text(2, &log.operator)?;
        stmt.bind_text(3, &log.action)?;
        stmt.bind_text(4, &log.target)?;
        stmt.bind_text(5, &log.result)?;
        stmt.bind_text(6, &log.detail)?;
        stmt.step_done()?;
        stmt.reset()?;
    }
    Ok(())
}

fn insert_test_reports(db: &SqliteConnection, reports: &[HistoryTestReport]) -> Result<(), String> {
    let mut stmt = db.prepare(
        "INSERT OR REPLACE INTO test_report(report_id, timestamp, project_name, protocol_version, report_type, title, summary, total_cases, passed_cases, failed_cases, duration_ms, operator, result, details_json) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )?;
    for report in reports {
        let details = serde_json::to_string(&report.details)
            .map_err(|error| format!("序列化测试报告明细失败: {error}"))?;
        stmt.bind_text(1, &report.report_id)?;
        stmt.bind_i64(2, report.timestamp)?;
        stmt.bind_text(3, &report.project_name)?;
        stmt.bind_text(4, &report.protocol_version)?;
        stmt.bind_text(5, &report.report_type)?;
        stmt.bind_text(6, &report.title)?;
        stmt.bind_text(7, &report.summary)?;
        stmt.bind_i64(8, report.total_cases)?;
        stmt.bind_i64(9, report.passed_cases)?;
        stmt.bind_i64(10, report.failed_cases)?;
        stmt.bind_i64(11, report.duration_ms)?;
        stmt.bind_text(12, &report.operator)?;
        stmt.bind_text(13, &report.result)?;
        stmt.bind_text(14, &details)?;
        stmt.step_done()?;
        stmt.reset()?;
    }
    Ok(())
}

fn query_history_trend_impl(
    db_path: &str,
    query: HistoryTrendQuery,
) -> Result<Vec<HistoryTrendRow>, String> {
    initialize_history_database_impl(db_path)?;
    let db = SqliteConnection::open(db_path)?;
    let mut stmt = db.prepare("SELECT timestamp, device_id, device_type, point_id, point_name, page, value, unit, quality, source FROM point_history WHERE device_id = ? AND point_id = ? AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC")?;
    stmt.bind_text(1, &query.device_id)?;
    stmt.bind_text(2, &query.point_id)?;
    stmt.bind_i64(3, query.start_time)?;
    stmt.bind_i64(4, query.end_time)?;

    let mut rows = Vec::new();
    while stmt.step_row()? {
        rows.push(HistoryTrendRow {
            timestamp: stmt.column_i64(0),
            time: format_history_time(stmt.column_i64(0)),
            device_id: stmt.column_text(1),
            device_type: stmt.column_text(2),
            point_id: stmt.column_text(3),
            point_name: stmt.column_text(4),
            page: stmt.column_text(5),
            value: stmt.column_f64(6),
            unit: stmt.column_text(7),
            quality: stmt.column_text(8),
            source: stmt.column_text(9),
            sample_count: 1,
            aggregate: "raw".to_string(),
        });
    }

    if query.aggregate == "raw" || query.sampling_period_ms.unwrap_or_default() <= 0 {
        return Ok(rows);
    }

    aggregate_trend_rows(
        rows,
        query.start_time,
        query.sampling_period_ms.unwrap_or(60_000),
        &query.aggregate,
    )
}

fn aggregate_trend_rows(
    rows: Vec<HistoryTrendRow>,
    start_time: i64,
    sampling_period_ms: i64,
    aggregate: &str,
) -> Result<Vec<HistoryTrendRow>, String> {
    if !matches!(aggregate, "avg" | "max" | "min") {
        return Err(format!("不支持的聚合方式: {aggregate}"));
    }
    // BTreeMap 同时完成分桶和按时间排序，避免 Vec 线性查找造成大查询退化。
    let mut buckets: BTreeMap<i64, Vec<HistoryTrendRow>> = BTreeMap::new();
    for row in rows {
        let bucket_timestamp =
            start_time + ((row.timestamp - start_time) / sampling_period_ms) * sampling_period_ms;
        buckets.entry(bucket_timestamp).or_default().push(row);
    }
    buckets
        .into_iter()
        .map(|(timestamp, bucket)| {
            let first = bucket.first().ok_or_else(|| "空聚合桶".to_string())?;
            let value = match aggregate {
                "max" => bucket
                    .iter()
                    .map(|row| row.value)
                    .fold(f64::NEG_INFINITY, f64::max),
                "min" => bucket
                    .iter()
                    .map(|row| row.value)
                    .fold(f64::INFINITY, f64::min),
                _ => bucket.iter().map(|row| row.value).sum::<f64>() / bucket.len() as f64,
            };
            Ok(HistoryTrendRow {
                timestamp,
                time: format_history_time(timestamp),
                device_id: first.device_id.clone(),
                device_type: first.device_type.clone(),
                point_id: first.point_id.clone(),
                point_name: first.point_name.clone(),
                page: first.page.clone(),
                value: round2(value),
                unit: first.unit.clone(),
                quality: first.quality.clone(),
                source: first.source.clone(),
                sample_count: bucket.len() as i64,
                aggregate: aggregate.to_string(),
            })
        })
        .collect()
}

fn query_alarm_history_impl(
    db_path: &str,
    query: HistoryAlarmQuery,
) -> Result<Vec<HistoryAlarmEvent>, String> {
    initialize_history_database_impl(db_path)?;
    let db = SqliteConnection::open(db_path)?;
    let mut stmt = db.prepare("SELECT timestamp, alarm_id, device_id, severity, status, title, message, source FROM alarm_history WHERE (? IS NULL OR timestamp >= ?) AND (? IS NULL OR timestamp <= ?) AND (? IS NULL OR severity = ?) AND (? IS NULL OR device_id = ?) AND (? IS NULL OR status = ?) ORDER BY timestamp ASC")?;
    bind_optional_i64(&mut stmt, 1, query.start_time)?;
    bind_optional_i64(&mut stmt, 2, query.start_time)?;
    bind_optional_i64(&mut stmt, 3, query.end_time)?;
    bind_optional_i64(&mut stmt, 4, query.end_time)?;
    bind_optional_text(&mut stmt, 5, query.severity.as_deref())?;
    bind_optional_text(&mut stmt, 6, query.severity.as_deref())?;
    bind_optional_text(&mut stmt, 7, query.device_id.as_deref())?;
    bind_optional_text(&mut stmt, 8, query.device_id.as_deref())?;
    bind_optional_text(&mut stmt, 9, query.status.as_deref())?;
    bind_optional_text(&mut stmt, 10, query.status.as_deref())?;

    let mut rows = Vec::new();
    while stmt.step_row()? {
        rows.push(HistoryAlarmEvent {
            timestamp: stmt.column_i64(0),
            alarm_id: stmt.column_text(1),
            device_id: stmt.column_text(2),
            severity: stmt.column_text(3),
            status: stmt.column_text(4),
            title: stmt.column_text(5),
            message: stmt.column_text(6),
            source: stmt.column_text(7),
        });
    }
    Ok(rows)
}

fn export_history_trend_csv_impl(
    db_path: &str,
    query: HistoryTrendQuery,
) -> Result<String, String> {
    let rows = query_history_trend_impl(db_path, query)?;
    let mut csv = String::from("时间,设备,点位,数值,单位,页面,质量\n");
    for row in rows {
        csv.push_str(
            &[
                csv_cell(&row.time),
                csv_cell(&row.device_id),
                csv_cell(&row.point_name),
                csv_cell(&format_history_number(row.value)),
                csv_cell(&row.unit),
                csv_cell(&row.page),
                csv_cell(&row.quality),
            ]
            .join(","),
        );
        csv.push('\n');
    }
    Ok(csv)
}

fn bind_optional_i64(
    stmt: &mut SqliteStatement,
    index: i32,
    value: Option<i64>,
) -> Result<(), String> {
    match value {
        Some(value) => stmt.bind_i64(index, value),
        None => stmt.bind_null(index),
    }
}

fn bind_optional_text(
    stmt: &mut SqliteStatement,
    index: i32,
    value: Option<&str>,
) -> Result<(), String> {
    match value {
        Some(value) => stmt.bind_text(index, value),
        None => stmt.bind_null(index),
    }
}

fn format_history_time(timestamp: i64) -> String {
    timestamp.to_string()
}

fn format_history_number(value: f64) -> String {
    if (value.fract()).abs() < f64::EPSILON {
        format!("{value:.0}")
    } else {
        format!("{:.2}", round2(value))
    }
}

fn round2(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

fn csv_cell(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\n') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}
