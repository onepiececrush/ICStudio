use serde::Serialize;
use std::collections::HashMap;
use std::net::TcpStream;

use super::{
    connect_and_read_register_ranges, decode_raw_to_engineering_value, format_number,
    read_register_ranges_with_stream, DecodedRegisterValue, RegisterPoint, RegisterValue,
    SimulatedRegisterStore, DASHBOARD_ADDRESSES, PCS_MODULE_BASE, PCS_MODULE_COUNT,
    PCS_MODULE_STRIDE,
};

/// 首页自测视图模型：这里把 Modbus 原始寄存器转换为前端展示和校验结果。
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeDashboardValue {
    pub address: String,
    pub name: String,
    pub expected_value: String,
    pub engineering_value: f64,
    pub display_value: String,
    pub unit: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeVerificationRow {
    pub component: String,
    pub bound_address: String,
    pub point_name: String,
    pub expected_value: String,
    pub parsed_value: String,
    pub display_value: String,
    pub unit: String,
    pub error: String,
    pub result: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HomePcsModule {
    pub id: u8,
    pub state: String,
    pub power: String,
    pub max_temp: String,
    pub base: u16,
    pub has_fault: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeLoopbackDashboard {
    pub self_test_mode: bool,
    pub endpoint: String,
    pub connection_status: String,
    pub values: Vec<HomeDashboardValue>,
    pub pcs_modules: Vec<HomePcsModule>,
    pub verification_rows: Vec<HomeVerificationRow>,
    pub severe_alarm_count: u16,
    pub general_alarm_count: u16,
    pub communication_alarm_count: u16,
    pub logs: Vec<String>,
}

impl HomeLoopbackDashboard {
    pub fn value(&self, address: &str) -> Option<&HomeDashboardValue> {
        self.values.iter().find(|value| value.address == address)
    }
}

pub(crate) fn poll_loopback_dashboard(
    ip: &str,
    port: u16,
    unit_id: u8,
    expected_store: &SimulatedRegisterStore,
) -> Result<HomeLoopbackDashboard, String> {
    let raw_by_address =
        connect_and_read_register_ranges(ip, port, unit_id, &loopback_dashboard_read_ranges())?;
    build_loopback_dashboard(format!("{ip}:{port}"), expected_store, raw_by_address, true)
}

pub(crate) fn poll_loopback_dashboard_with_stream(
    stream: &mut TcpStream,
    endpoint: &str,
    unit_id: u8,
    expected_store: &SimulatedRegisterStore,
) -> Result<HomeLoopbackDashboard, String> {
    let raw_by_address =
        read_register_ranges_with_stream(stream, unit_id, &loopback_dashboard_read_ranges())?;
    build_loopback_dashboard(endpoint.to_string(), expected_store, raw_by_address, true)
}

pub(crate) fn poll_realtime_dashboard_with_stream(
    stream: &mut TcpStream,
    endpoint: &str,
    unit_id: u8,
    point_store: &SimulatedRegisterStore,
) -> Result<HomeLoopbackDashboard, String> {
    let raw_by_address =
        read_register_ranges_with_stream(stream, unit_id, &loopback_dashboard_read_ranges())?;
    build_loopback_dashboard(endpoint.to_string(), point_store, raw_by_address, false)
}

fn build_loopback_dashboard(
    endpoint: String,
    expected_store: &SimulatedRegisterStore,
    raw_by_address: HashMap<u16, u16>,
    self_test_mode: bool,
) -> Result<HomeLoopbackDashboard, String> {
    let mut values = Vec::new();
    let mut verification_rows = Vec::new();

    for &address in DASHBOARD_ADDRESSES {
        let point = expected_store
            .point(address)
            .ok_or_else(|| format!("缺少点位 {address}"))?;
        let raw = read_raw_words(&raw_by_address, address, point.length)?;
        let decoded = decode_raw_to_engineering_value(&point, &raw);
        let expected = expected_display(&point);
        let error = value_error(&point, &decoded);
        let readable = decoded.display_value != "--"
            && !decoded.display_value.eq_ignore_ascii_case("nan")
            && !decoded.display_value.is_empty();
        let passed = error <= 0.01
            && decoded.display_value != "--"
            && !decoded.display_value.eq_ignore_ascii_case("nan")
            && !decoded.display_value.is_empty();
        values.push(HomeDashboardValue {
            address: address.to_string(),
            name: point.name.to_string(),
            expected_value: expected.clone(),
            engineering_value: decoded.engineering_value,
            display_value: decoded.display_value.clone(),
            unit: decoded.unit.clone(),
        });
        verification_rows.push(HomeVerificationRow {
            component: component_for_address(address).to_string(),
            bound_address: address.to_string(),
            point_name: point.name.to_string(),
            expected_value: if self_test_mode {
                expected
            } else {
                "--".to_string()
            },
            parsed_value: decoded.display_value.clone(),
            display_value: decoded.display_value,
            unit: point.unit.to_string(),
            error: if self_test_mode {
                format_number(error, 2)
            } else {
                "--".to_string()
            },
            result: if self_test_mode {
                if passed {
                    "通过"
                } else {
                    "失败"
                }
            } else if readable {
                "已读取"
            } else {
                "异常"
            }
            .to_string(),
        });
    }

    let mut pcs_modules = Vec::new();
    let mut severe_alarm_count = 0;
    for index in 0..PCS_MODULE_COUNT {
        let id = index + 1;
        let base = PCS_MODULE_BASE + index * PCS_MODULE_STRIDE;
        let state_point = expected_store
            .point(base + 9)
            .ok_or_else(|| format!("缺少 PCS{id} 状态点"))?;
        expected_store
            .point(base + 20)
            .ok_or_else(|| format!("缺少 PCS{id} 故障点"))?;
        let state_raw = read_raw_words(&raw_by_address, base + 9, 1)?;
        let fault_raw = read_raw_words(&raw_by_address, base + 20, 1)?;
        let state = decode_raw_to_engineering_value(&state_point, &state_raw).display_value;
        let has_fault = fault_raw[0] != 0 || state == "故障";
        if has_fault {
            severe_alarm_count += 1;
        }
        let max_temp = if state == "离线" {
            "--".to_string()
        } else {
            format_number(36.5 + (index % 6) as f64 * 2.1, 1)
        };
        let power = if state == "离线" || state == "故障" {
            "0.00".to_string()
        } else if state == "待机" {
            "2.10".to_string()
        } else {
            format_number(92.0 + index as f64 * 3.7, 2)
        };
        pcs_modules.push(HomePcsModule {
            id: id as u8,
            state,
            power,
            max_temp,
            base,
            has_fault,
        });
    }

    Ok(HomeLoopbackDashboard {
        self_test_mode,
        endpoint,
        connection_status: "已连接".to_string(),
        values,
        pcs_modules,
        verification_rows,
        severe_alarm_count,
        general_alarm_count: 0,
        communication_alarm_count: 0,
        logs: expected_store.logs(),
    })
}

fn loopback_dashboard_read_ranges() -> Vec<(u16, u16)> {
    let mut ranges = vec![(14001, 40), (25601, 26)];
    ranges.extend((0..PCS_MODULE_COUNT).map(|index| {
        let base = PCS_MODULE_BASE + index * PCS_MODULE_STRIDE;
        (base + 9, 12)
    }));
    ranges
}

fn read_raw_words(
    raw_by_address: &HashMap<u16, u16>,
    address: u16,
    length: u16,
) -> Result<Vec<u16>, String> {
    (0..length)
        .map(|offset| {
            raw_by_address
                .get(&(address + offset))
                .copied()
                .ok_or_else(|| format!("缺少寄存器原始值 {}", address + offset))
        })
        .collect()
}

fn expected_display(point: &RegisterPoint) -> String {
    match &point.value {
        RegisterValue::Enum { label, .. } => label.to_string(),
        RegisterValue::Number(value) => format_number(*value, point.precision),
    }
}

fn value_error(point: &RegisterPoint, decoded: &DecodedRegisterValue) -> f64 {
    match &point.value {
        RegisterValue::Enum { label, .. } => {
            if decoded.display_value == *label {
                0.0
            } else {
                1.0
            }
        }
        RegisterValue::Number(value) => (*value - decoded.engineering_value).abs(),
    }
}

fn component_for_address(address: u16) -> &'static str {
    match address {
        14001..=14039 => "PCS/PMU 汇总",
        25601..=25626 => "BMS 电池健康",
        _ => "首页组件",
    }
}
