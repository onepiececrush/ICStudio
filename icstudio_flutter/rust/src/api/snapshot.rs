use super::connection::{get_home_connection_status, get_home_dashboard, HomeDashboard};

#[derive(Debug, Clone, PartialEq)]
pub struct ProjectInfo {
    pub name: String,
    pub protocol_version: String,
    pub operator: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ConnectionInfo {
    pub mode: String,
    pub endpoint: String,
    pub status: String,
    pub latency_ms: u16,
    pub success_rate: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct MetricCard {
    pub key: String,
    pub label: String,
    pub value: String,
    pub unit: String,
    pub tone: String,
    pub helper: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct DeviceStatus {
    pub name: String,
    pub device_type: String,
    pub connection: String,
    pub runtime: String,
    pub quality: String,
    pub last_seen: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ActivityItem {
    pub tone: String,
    pub title: String,
    pub detail: String,
    pub time: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TrendPoint {
    pub time: String,
    pub power: f64,
    pub soc: f64,
    pub quality: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct AppSnapshot {
    pub project: ProjectInfo,
    pub connection: ConnectionInfo,
    pub metrics: Vec<MetricCard>,
    pub devices: Vec<DeviceStatus>,
    pub activities: Vec<ActivityItem>,
    pub trends: Vec<TrendPoint>,
    pub home_dashboard: Option<HomeDashboard>,
}

#[flutter_rust_bridge::frb(sync)]
pub fn get_app_snapshot() -> AppSnapshot {
    let home = get_home_connection_status();
    let connected = home.connected;
    let status = home.status.clone();
    let home_dashboard = if connected {
        get_home_dashboard().ok()
    } else {
        None
    };
    AppSnapshot {
        project: ProjectInfo {
            name: "EVE储能项目".to_string(),
            protocol_version: "PCS Modbus V3.13 / BMS V1.06".to_string(),
            operator: "admin".to_string(),
        },
        connection: ConnectionInfo {
            mode: "Modbus TCP 主站".to_string(),
            endpoint: home.endpoint.clone(),
            status: status.clone(),
            latency_ms: home.latency_ms.min(u16::MAX as u32) as u16,
            success_rate: home.success_rate,
        },
        metrics: vec![
            metric(
                "health",
                "系统健康度",
                if connected { "96" } else { "--" },
                "分",
                "blue",
                if connected {
                    "通信正常"
                } else {
                    "等待连接"
                },
            ),
            MetricCard {
                key: "online".to_string(),
                label: "在线设备".to_string(),
                value: home.last_read_value.to_string(),
                unit: "台".to_string(),
                tone: "green".to_string(),
                helper: if connected {
                    "FC03 / 14001"
                } else {
                    "未连接"
                }
                .to_string(),
            },
            metric(
                "active-power",
                "总有功功率",
                dashboard_value(&home_dashboard, 14006),
                "kW",
                "orange",
                "FC03 / 14006",
            ),
            metric(
                "dc-voltage",
                "电池直流电压",
                dashboard_value(&home_dashboard, 14031),
                "V",
                "purple",
                "FC03 / 14031",
            ),
            metric(
                "soc",
                "SOC",
                dashboard_value(&home_dashboard, 25609),
                "%",
                "cyan",
                "FC03 / 25609",
            ),
            metric(
                "soh",
                "SOH",
                dashboard_value(&home_dashboard, 25611),
                "%",
                "green",
                "FC03 / 25611",
            ),
        ],
        devices: (1..=4)
            .map(|id| DeviceStatus {
                name: format!("PCS-{id:02}"),
                device_type: "PCS".to_string(),
                connection: status.clone(),
                runtime: if connected { "运行中" } else { "未连接" }.to_string(),
                quality: if connected { "100%" } else { "--" }.to_string(),
                last_seen: "现在".to_string(),
            })
            .collect(),
        activities: vec![ActivityItem {
            tone: if connected { "green" } else { "cyan" }.to_string(),
            title: if connected {
                "首页设备已连接"
            } else {
                "等待首页设备连接"
            }
            .to_string(),
            detail: if connected {
                format!(
                    "{} · 已轮询 {} 个关键点",
                    home.endpoint,
                    home_dashboard
                        .as_ref()
                        .map(|dashboard| dashboard.values.len())
                        .unwrap_or_default()
                )
            } else {
                "请在首页输入下位机 IP 和端口后连接".to_string()
            },
            time: "现在".to_string(),
        }],
        trends: vec![TrendPoint {
            time: "现在".to_string(),
            power: dashboard_engineering_value(&home_dashboard, 14006),
            soc: dashboard_engineering_value(&home_dashboard, 25609),
            quality: if connected { 100.0 } else { 0.0 },
        }],
        home_dashboard,
    }
}

fn dashboard_value(dashboard: &Option<HomeDashboard>, address: u16) -> &str {
    dashboard
        .as_ref()
        .and_then(|dashboard| {
            dashboard
                .values
                .iter()
                .find(|value| value.address == address)
        })
        .map(|value| value.display_value.as_str())
        .unwrap_or("--")
}

fn dashboard_engineering_value(dashboard: &Option<HomeDashboard>, address: u16) -> f64 {
    dashboard
        .as_ref()
        .and_then(|dashboard| {
            dashboard
                .values
                .iter()
                .find(|value| value.address == address)
        })
        .map(|value| value.engineering_value)
        .unwrap_or_default()
}

fn metric(key: &str, label: &str, value: &str, unit: &str, tone: &str, helper: &str) -> MetricCard {
    MetricCard {
        key: key.to_string(),
        label: label.to_string(),
        value: value.to_string(),
        unit: unit.to_string(),
        tone: tone.to_string(),
        helper: helper.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_keeps_the_shell_contract() {
        let snapshot = get_app_snapshot();

        assert_eq!(snapshot.project.name, "EVE储能项目");
        assert_eq!(snapshot.metrics.len(), 6);
        assert_eq!(snapshot.devices.len(), 4);
        assert_eq!(snapshot.activities.len(), 1);
        assert_eq!(snapshot.trends.len(), 1);
    }
}
