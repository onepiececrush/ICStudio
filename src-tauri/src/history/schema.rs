/// 历史库 schema 统一放在这里，避免查询逻辑里混入大段 DDL。
pub(super) const HISTORY_SCHEMA_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS point_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    device_id TEXT NOT NULL,
    device_type TEXT NOT NULL,
    point_id TEXT NOT NULL,
    point_name TEXT NOT NULL,
    page TEXT NOT NULL,
    value REAL NOT NULL,
    unit TEXT NOT NULL,
    quality TEXT NOT NULL,
    source TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_point_history_lookup ON point_history(device_id, point_id, timestamp);

CREATE TABLE IF NOT EXISTS alarm_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    alarm_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    severity TEXT NOT NULL,
    status TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    source TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alarm_history_lookup ON alarm_history(timestamp, device_id, severity, status);

CREATE TABLE IF NOT EXISTS communication_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    channel TEXT NOT NULL,
    protocol TEXT NOT NULL,
    request_count INTEGER NOT NULL,
    success_count INTEGER NOT NULL,
    failure_count INTEGER NOT NULL,
    timeout_count INTEGER NOT NULL,
    crc_error_count INTEGER NOT NULL,
    average_latency_ms REAL NOT NULL,
    max_latency_ms REAL NOT NULL,
    success_rate REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS operation_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    operator TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    result TEXT NOT NULL,
    detail TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS test_report (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id TEXT NOT NULL UNIQUE,
    timestamp INTEGER NOT NULL,
    project_name TEXT NOT NULL,
    protocol_version TEXT NOT NULL,
    report_type TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    total_cases INTEGER NOT NULL,
    passed_cases INTEGER NOT NULL,
    failed_cases INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    operator TEXT NOT NULL,
    result TEXT NOT NULL,
    details_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS report_template (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    report_type TEXT NOT NULL,
    description TEXT NOT NULL,
    sections_json TEXT NOT NULL
);
"#;

pub(super) const DEFAULT_TEMPLATE_SQL: &str = r#"
INSERT OR IGNORE INTO report_template(template_id, name, report_type, description, sections_json) VALUES
('device-debug', '设备调试报告', 'device-debug', '设备接线、通信、点位与参数调试记录。', '["项目信息","设备信息","点位趋势","调试结论"]'),
('automation-test', '自动化测试报告', 'automation-test', '自动化用例执行结果与失败原因。', '["测试概览","用例结果","步骤日志","通信报文"]'),
('alarm-statistics', '告警统计报告', 'alarm-statistics', '告警等级、设备、时段统计。', '["告警概览","Top 告警","恢复情况"]'),
('communication-quality', '通信质量报告', 'communication-quality', '通信成功率、延迟、异常码和失败地址段。', '["质量概览","延迟趋势","异常诊断"]'),
('home-self-test', '首页自测报告', 'home-self-test', '首页 KPI、PCS 矩阵和闭环模拟自测结果。', '["首页 KPI","自测步骤","结果判定"]');
"#;
