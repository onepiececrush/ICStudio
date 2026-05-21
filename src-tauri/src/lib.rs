use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectInfo {
    name: &'static str,
    protocol_version: &'static str,
    operator: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectionInfo {
    mode: &'static str,
    endpoint: &'static str,
    status: &'static str,
    latency_ms: u16,
    success_rate: f32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MetricCard {
    key: &'static str,
    label: &'static str,
    value: &'static str,
    unit: &'static str,
    tone: &'static str,
    helper: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DeviceStatus {
    name: &'static str,
    device_type: &'static str,
    connection: &'static str,
    runtime: &'static str,
    quality: &'static str,
    last_seen: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ActivityItem {
    tone: &'static str,
    title: &'static str,
    detail: &'static str,
    time: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TrendPoint {
    time: &'static str,
    power: f32,
    soc: f32,
    quality: f32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppSnapshot {
    project: ProjectInfo,
    connection: ConnectionInfo,
    metrics: Vec<MetricCard>,
    devices: Vec<DeviceStatus>,
    activities: Vec<ActivityItem>,
    trends: Vec<TrendPoint>,
}

#[tauri::command]
fn get_app_snapshot() -> AppSnapshot {
    AppSnapshot {
        project: ProjectInfo {
            name: "储能系统测试项目",
            protocol_version: "PCS Modbus V3.13 / BMS V1.06",
            operator: "管理员",
        },
        connection: ConnectionInfo {
            mode: "Modbus TCP 主站",
            endpoint: "10.10.1.100:502",
            status: "已连接",
            latency_ms: 128,
            success_rate: 99.2,
        },
        metrics: vec![
            MetricCard {
                key: "health",
                label: "系统健康度",
                value: "96",
                unit: "分",
                tone: "blue",
                helper: "较昨日 +2 分",
            },
            MetricCard {
                key: "online",
                label: "在线设备",
                value: "12",
                unit: "台",
                tone: "green",
                helper: "正常 12 / 异常 0",
            },
            MetricCard {
                key: "alarm",
                label: "活动告警",
                value: "2",
                unit: "条",
                tone: "red",
                helper: "紧急 1 / 重要 1",
            },
            MetricCard {
                key: "simulation",
                label: "运行仿真",
                value: "3",
                unit: "个",
                tone: "purple",
                helper: "TCP 2 / RTU 1",
            },
            MetricCard {
                key: "autotest",
                label: "自动化测试",
                value: "5",
                unit: "项",
                tone: "cyan",
                helper: "通过率 92%",
            },
            MetricCard {
                key: "upgrade",
                label: "固件升级",
                value: "1",
                unit: "项",
                tone: "orange",
                helper: "成功率 87%",
            },
        ],
        devices: vec![
            DeviceStatus {
                name: "PCS-01",
                device_type: "PCS",
                connection: "在线",
                runtime: "运行中",
                quality: "99.4%",
                last_seen: "10:24:32",
            },
            DeviceStatus {
                name: "PCS-02",
                device_type: "PCS",
                connection: "在线",
                runtime: "运行中",
                quality: "98.7%",
                last_seen: "10:24:31",
            },
            DeviceStatus {
                name: "BMS-01",
                device_type: "BMS",
                connection: "在线",
                runtime: "运行中",
                quality: "99.6%",
                last_seen: "10:24:34",
            },
            DeviceStatus {
                name: "PMU-01",
                device_type: "PMU",
                connection: "在线",
                runtime: "运行中",
                quality: "100%",
                last_seen: "10:24:35",
            },
        ],
        activities: vec![
            ActivityItem {
                tone: "red",
                title: "告警: PCS-02 交流过流保护",
                detail: "设备告警 / 10:23:18",
                time: "刚刚",
            },
            ActivityItem {
                tone: "blue",
                title: "自动化测试用例执行完成",
                detail: "E2E 充放电循环测试 / 通过",
                time: "10:22:45",
            },
            ActivityItem {
                tone: "green",
                title: "固件升级开始",
                detail: "BMS-01 / v2.3.1",
                time: "10:21:03",
            },
            ActivityItem {
                tone: "cyan",
                title: "通信已连接",
                detail: "Modbus_TCP_01",
                time: "10:20:11",
            },
            ActivityItem {
                tone: "purple",
                title: "从机模拟已启动",
                detail: "模拟对象: PCS-01",
                time: "10:19:54",
            },
        ],
        trends: vec![
            TrendPoint {
                time: "09:25",
                power: 188.0,
                soc: 66.0,
                quality: 78.0,
            },
            TrendPoint {
                time: "09:40",
                power: 215.0,
                soc: 70.0,
                quality: 86.0,
            },
            TrendPoint {
                time: "09:55",
                power: 176.0,
                soc: 62.0,
                quality: 82.0,
            },
            TrendPoint {
                time: "10:10",
                power: 248.0,
                soc: 91.0,
                quality: 94.0,
            },
            TrendPoint {
                time: "10:25",
                power: 216.0,
                soc: 78.4,
                quality: 99.2,
            },
        ],
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_app_snapshot])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
