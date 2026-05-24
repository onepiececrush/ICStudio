use serde::{Deserialize, Serialize};

/// 数据结构保持 camelCase 序列化，直接匹配前端 Tauri invoke 参数和返回值。
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPointSample {
    pub timestamp: i64,
    pub device_id: String,
    pub device_type: String,
    pub point_id: String,
    pub point_name: String,
    pub page: String,
    pub value: f64,
    pub unit: String,
    pub quality: String,
    pub source: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryAlarmEvent {
    pub timestamp: i64,
    pub alarm_id: String,
    pub device_id: String,
    pub severity: String,
    pub status: String,
    pub title: String,
    pub message: String,
    pub source: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryCommunicationRecord {
    pub timestamp: i64,
    pub channel: String,
    pub protocol: String,
    pub request_count: i64,
    pub success_count: i64,
    pub failure_count: i64,
    pub timeout_count: i64,
    pub crc_error_count: i64,
    pub average_latency_ms: f64,
    pub max_latency_ms: f64,
    pub success_rate: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryOperationLog {
    pub timestamp: i64,
    pub operator: String,
    pub action: String,
    pub target: String,
    pub result: String,
    pub detail: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryTestReportDetail {
    pub name: String,
    pub expected: String,
    pub actual: String,
    pub result: String,
    pub duration_ms: Option<i64>,
    pub message: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryTestReport {
    pub report_id: String,
    pub timestamp: i64,
    pub project_name: String,
    pub protocol_version: String,
    pub report_type: String,
    pub title: String,
    pub summary: String,
    pub total_cases: i64,
    pub passed_cases: i64,
    pub failed_cases: i64,
    pub duration_ms: i64,
    pub operator: String,
    pub result: String,
    pub details: Vec<HistoryTestReportDetail>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPersistBatch {
    pub point_samples: Vec<HistoryPointSample>,
    pub alarm_events: Vec<HistoryAlarmEvent>,
    pub communication_records: Vec<HistoryCommunicationRecord>,
    pub operation_logs: Vec<HistoryOperationLog>,
    pub test_reports: Vec<HistoryTestReport>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPersistSummary {
    pub point_samples_written: usize,
    pub alarm_events_written: usize,
    pub communication_records_written: usize,
    pub operation_logs_written: usize,
    pub test_reports_written: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryTrendQuery {
    pub device_id: String,
    pub point_id: String,
    pub start_time: i64,
    pub end_time: i64,
    pub sampling_period_ms: Option<i64>,
    pub aggregate: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryTrendRow {
    pub timestamp: i64,
    pub time: String,
    pub device_id: String,
    pub device_type: String,
    pub point_id: String,
    pub point_name: String,
    pub page: String,
    pub value: f64,
    pub unit: String,
    pub quality: String,
    pub source: String,
    pub sample_count: i64,
    pub aggregate: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryAlarmQuery {
    pub start_time: Option<i64>,
    pub end_time: Option<i64>,
    pub severity: Option<String>,
    pub device_id: Option<String>,
    pub status: Option<String>,
}
