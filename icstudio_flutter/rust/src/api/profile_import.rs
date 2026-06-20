use std::collections::HashMap;
use std::fs;
use std::path::Path;

use calamine::{open_workbook_auto, Data, Reader};
use serde_json::Value;

#[derive(Debug, Clone, PartialEq)]
pub struct ImportedSimulatorRegister {
    pub id: String,
    pub address: u16,
    pub name: String,
    pub function_code: u8,
    pub access: String,
    pub data_type: String,
    pub length: u16,
    pub scale: f64,
    pub unit: String,
    pub range_min: Option<f64>,
    pub range_max: Option<f64>,
    pub description: String,
    pub group: String,
    pub engineering_value: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ImportedSimulatorScenarioStep {
    pub register_id: String,
    pub strategy: String,
    pub value: Option<f64>,
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub step: Option<f64>,
    pub amplitude: Option<f64>,
    pub offset: Option<f64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ImportedSimulatorScenario {
    pub id: String,
    pub name: String,
    pub description: String,
    pub steps: Vec<ImportedSimulatorScenarioStep>,
    pub fault_mode: String,
    pub exception_code: u8,
    pub rate: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ImportedSimulatorProfile {
    pub id: String,
    pub name: String,
    pub version: String,
    pub device_type: String,
    pub vendor: String,
    pub communication_type: String,
    pub registers: Vec<ImportedSimulatorRegister>,
    pub scenarios: Vec<ImportedSimulatorScenario>,
}

pub fn import_device_simulator_profile(path: String) -> Result<ImportedSimulatorProfile, String> {
    let file = Path::new(&path);
    let extension = file
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let fallback_name = file
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("导入协议");
    match extension.as_str() {
        "json" => parse_json(&path, fallback_name),
        "csv" => parse_csv(&path, fallback_name),
        "xls" | "xlsx" | "xlsm" | "xlsb" | "ods" => parse_workbook(&path, fallback_name),
        _ => Err("仅支持 JSON、CSV、XLS 和 XLSX 协议文件".to_string()),
    }
}

fn parse_json(path: &str, fallback_name: &str) -> Result<ImportedSimulatorProfile, String> {
    let content = fs::read_to_string(path).map_err(|error| format!("读取 JSON 失败: {error}"))?;
    let root: Value =
        serde_json::from_str(&content).map_err(|error| format!("解析 JSON 失败: {error}"))?;
    let profile = if root.is_array() {
        Value::Object([("registers".to_string(), root)].into_iter().collect())
    } else {
        root
    };
    let registers = profile
        .get("registers")
        .and_then(Value::as_array)
        .ok_or_else(|| "JSON 中缺少 registers 数组".to_string())?
        .iter()
        .enumerate()
        .map(register_from_json)
        .collect::<Result<Vec<_>, _>>()?;
    if registers.is_empty() {
        return Err("协议文件没有有效寄存器".to_string());
    }
    let scenarios = profile
        .get("scenarios")
        .and_then(Value::as_array)
        .map(|items| items.iter().enumerate().map(scenario_from_json).collect())
        .unwrap_or_default();
    Ok(ImportedSimulatorProfile {
        id: json_string(&profile, "id").unwrap_or_else(|| slug(fallback_name)),
        name: json_string(&profile, "name").unwrap_or_else(|| fallback_name.to_string()),
        version: json_string(&profile, "version").unwrap_or_else(|| "1.0.0".to_string()),
        device_type: json_string(&profile, "deviceType")
            .unwrap_or_else(|| "通用 Modbus 设备".to_string()),
        vendor: json_string(&profile, "vendor").unwrap_or_else(|| "导入协议".to_string()),
        communication_type: json_string(&profile, "communicationType")
            .unwrap_or_else(|| "Modbus TCP".to_string()),
        registers,
        scenarios,
    })
}

fn register_from_json(
    (index, value): (usize, &Value),
) -> Result<ImportedSimulatorRegister, String> {
    let address = json_number(value, "address")
        .ok_or_else(|| format!("第 {} 个寄存器缺少 address", index + 1))?;
    if !(0.0..=u16::MAX as f64).contains(&address) {
        return Err(format!("寄存器地址 {address} 超出范围"));
    }
    let data_type = json_string(value, "dataType").unwrap_or_else(|| "uint16".to_string());
    let range = value.get("range");
    Ok(ImportedSimulatorRegister {
        id: json_string(value, "id").unwrap_or_else(|| format!("reg-{}-{index}", address as u16)),
        address: address as u16,
        name: json_string(value, "name").unwrap_or_else(|| format!("寄存器 {}", address as u16)),
        function_code: json_number(value, "functionCode").unwrap_or(3.0) as u8,
        access: json_string(value, "access").unwrap_or_else(|| "read".to_string()),
        length: json_number(value, "length").unwrap_or_else(|| expected_length(&data_type) as f64)
            as u16,
        scale: nonzero(json_number(value, "scale").unwrap_or(1.0)),
        unit: json_string(value, "unit").unwrap_or_default(),
        range_min: range.and_then(|item| json_number(item, "min")),
        range_max: range.and_then(|item| json_number(item, "max")),
        description: json_string(value, "description").unwrap_or_default(),
        group: json_string(value, "group").unwrap_or_else(|| "默认分组".to_string()),
        engineering_value: value
            .get("currentValue")
            .and_then(value_as_number)
            .unwrap_or(0.0),
        data_type,
    })
}

fn scenario_from_json((index, value): (usize, &Value)) -> ImportedSimulatorScenario {
    let fault = value.get("faultInjection").unwrap_or(&Value::Null);
    ImportedSimulatorScenario {
        id: json_string(value, "id").unwrap_or_else(|| format!("scenario-{index}")),
        name: json_string(value, "name").unwrap_or_else(|| format!("场景 {}", index + 1)),
        description: json_string(value, "description").unwrap_or_default(),
        steps: value
            .get("steps")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .map(|step| ImportedSimulatorScenarioStep {
                        register_id: json_string(step, "registerId").unwrap_or_default(),
                        strategy: json_string(step, "strategy")
                            .unwrap_or_else(|| "fixed".to_string()),
                        value: step.get("value").and_then(value_as_number),
                        min: json_number(step, "min"),
                        max: json_number(step, "max"),
                        step: json_number(step, "step"),
                        amplitude: json_number(step, "amplitude"),
                        offset: json_number(step, "offset"),
                    })
                    .collect()
            })
            .unwrap_or_default(),
        fault_mode: json_string(fault, "mode").unwrap_or_else(|| "none".to_string()),
        exception_code: json_string(fault, "exceptionCode")
            .and_then(|item| parse_number(&item))
            .unwrap_or(3.0) as u8,
        rate: json_number(fault, "rate").unwrap_or(0.0).clamp(0.0, 1.0),
    }
}

fn parse_csv(path: &str, fallback_name: &str) -> Result<ImportedSimulatorProfile, String> {
    let mut reader = csv::ReaderBuilder::new()
        .flexible(true)
        .from_path(path)
        .map_err(|error| format!("读取 CSV 失败: {error}"))?;
    let headers = reader
        .headers()
        .map_err(|error| format!("读取 CSV 表头失败: {error}"))?
        .iter()
        .map(str::to_string)
        .collect::<Vec<_>>();
    let rows = reader
        .records()
        .map(|record| {
            let record = record.map_err(|error| format!("读取 CSV 数据失败: {error}"))?;
            Ok(headers
                .iter()
                .zip(record.iter())
                .map(|(header, value)| (header.clone(), value.to_string()))
                .collect())
        })
        .collect::<Result<Vec<HashMap<String, String>>, String>>()?;
    profile_from_rows(fallback_name, rows)
}

fn parse_workbook(path: &str, fallback_name: &str) -> Result<ImportedSimulatorProfile, String> {
    let mut workbook =
        open_workbook_auto(path).map_err(|error| format!("读取工作簿失败: {error}"))?;
    let mut best_rows = Vec::new();
    for sheet_name in workbook.sheet_names().to_vec() {
        let range = workbook
            .worksheet_range(&sheet_name)
            .map_err(|error| format!("读取工作表 {sheet_name} 失败: {error}"))?;
        let values = range
            .rows()
            .map(|row| row.iter().map(cell_text).collect())
            .collect();
        if let Some(rows) = table_rows(values) {
            if rows.len() > best_rows.len() {
                best_rows = rows;
            }
        }
    }
    if best_rows.is_empty() {
        return Err("工作簿中没有识别到包含地址和名称的寄存器表".to_string());
    }
    profile_from_rows(fallback_name, best_rows)
}

fn table_rows(values: Vec<Vec<String>>) -> Option<Vec<HashMap<String, String>>> {
    let header_index = values.iter().take(20).position(|row| {
        let normalized = row
            .iter()
            .map(|value| normalize_header(value))
            .collect::<Vec<_>>();
        normalized
            .iter()
            .any(|item| aliases("address").contains(&item.as_str()))
            && normalized
                .iter()
                .any(|item| aliases("name").contains(&item.as_str()))
    })?;
    let headers = values[header_index].clone();
    Some(
        values
            .into_iter()
            .skip(header_index + 1)
            .filter(|row| row.iter().any(|cell| !cell.trim().is_empty()))
            .map(|row| headers.iter().cloned().zip(row).collect())
            .collect(),
    )
}

fn profile_from_rows(
    fallback_name: &str,
    rows: Vec<HashMap<String, String>>,
) -> Result<ImportedSimulatorProfile, String> {
    let registers = rows
        .iter()
        .enumerate()
        .filter_map(|(index, row)| register_from_row(index, row))
        .collect::<Vec<_>>();
    if registers.is_empty() {
        return Err("没有识别到有效寄存器；至少需要“地址”和“名称”列".to_string());
    }
    Ok(ImportedSimulatorProfile {
        id: slug(fallback_name),
        name: fallback_name.to_string(),
        version: "1.0.0".to_string(),
        device_type: "通用 Modbus 设备".to_string(),
        vendor: "导入协议".to_string(),
        communication_type: "Modbus TCP".to_string(),
        scenarios: generic_scenarios(&registers),
        registers,
    })
}

fn register_from_row(
    index: usize,
    row: &HashMap<String, String>,
) -> Option<ImportedSimulatorRegister> {
    let value = |key: &str| mapped_value(row, key);
    let address = parse_number(&value("address"))?;
    if !(0.0..=u16::MAX as f64).contains(&address) {
        return None;
    }
    let data_type = normalize_data_type(&value("data_type"));
    let (range_min, range_max) = parse_range(&value("range"));
    Some(ImportedSimulatorRegister {
        id: format!("reg-{}-{index}", address as u16),
        address: address as u16,
        name: nonempty(value("name"), format!("寄存器 {}", address as u16)),
        function_code: parse_number(&value("function_code")).unwrap_or(3.0) as u8,
        access: normalize_access(&value("access")),
        length: parse_number(&value("length")).unwrap_or(expected_length(&data_type) as f64) as u16,
        scale: nonzero(parse_number(&value("scale")).unwrap_or(1.0)),
        unit: value("unit"),
        range_min,
        range_max,
        description: value("description"),
        group: nonempty(value("group"), "默认分组".to_string()),
        engineering_value: parse_number(&value("current_value")).unwrap_or(0.0),
        data_type,
    })
}

fn generic_scenarios(registers: &[ImportedSimulatorRegister]) -> Vec<ImportedSimulatorScenario> {
    let first = &registers[0];
    let second = registers.get(1).unwrap_or(first);
    let fixed = |register: &ImportedSimulatorRegister, value: f64| ImportedSimulatorScenarioStep {
        register_id: register.id.clone(),
        strategy: "fixed".to_string(),
        value: Some(value),
        min: None,
        max: None,
        step: None,
        amplitude: None,
        offset: None,
    };
    vec![
        scenario(
            "normal",
            "正常运行",
            "应用导入协议的默认值。",
            vec![
                fixed(first, first.engineering_value),
                fixed(second, second.engineering_value),
            ],
            "none",
            0.0,
        ),
        scenario(
            "standby",
            "待机",
            "将前两个寄存器归零。",
            vec![fixed(first, 0.0), fixed(second, 0.0)],
            "none",
            0.0,
        ),
        scenario(
            "fault",
            "故障",
            "返回 Modbus 异常码。",
            vec![],
            "exceptionCode",
            1.0,
        ),
        scenario(
            "communication-abnormal",
            "通信异常",
            "按比例模拟响应超时。",
            vec![],
            "timeout",
            0.6,
        ),
    ]
}

fn scenario(
    id: &str,
    name: &str,
    description: &str,
    steps: Vec<ImportedSimulatorScenarioStep>,
    fault_mode: &str,
    rate: f64,
) -> ImportedSimulatorScenario {
    ImportedSimulatorScenario {
        id: id.to_string(),
        name: name.to_string(),
        description: description.to_string(),
        steps,
        fault_mode: fault_mode.to_string(),
        exception_code: 3,
        rate,
    }
}

fn mapped_value(row: &HashMap<String, String>, key: &str) -> String {
    let wanted = aliases(key);
    row.iter()
        .find(|(header, _)| wanted.contains(&normalize_header(header).as_str()))
        .map(|(_, value)| value.trim().to_string())
        .unwrap_or_default()
}

fn aliases(key: &str) -> &'static [&'static str] {
    match key {
        "address" => &[
            "地址",
            "寄存器地址",
            "address",
            "addr",
            "offset",
            "偏移地址",
        ],
        "name" => &["名称", "变量名称", "点位名称", "name", "tag", "label"],
        "function_code" => &["功能码", "functioncode", "function", "fc"],
        "access" => &["读写权限", "权限", "access", "rw", "读写", "操作"],
        "data_type" => &["数据类型", "类型", "datatype", "type"],
        "length" => &["长度", "寄存器数量", "字长", "length", "words", "wordcount"],
        "scale" => &["倍率", "比例", "scale", "ratio", "系数", "精度"],
        "unit" => &["单位", "unit"],
        "range" => &["范围", "取值范围", "range", "limit", "上下限"],
        "description" => &["说明", "描述", "备注", "description", "comment"],
        "group" => &["分组", "组", "group", "category", "sheet"],
        "current_value" => &["当前值", "默认值", "currentvalue", "default", "value"],
        _ => &[],
    }
}

fn normalize_header(value: &str) -> String {
    value
        .trim()
        .to_ascii_lowercase()
        .replace([' ', '_', '-', '(', ')', '（', '）'], "")
}

fn normalize_access(value: &str) -> String {
    match value.trim().to_ascii_lowercase().as_str() {
        "w" | "write" | "只写" | "写" => "write".to_string(),
        "rw" | "r/w" | "readwrite" | "read/write" | "读写" | "可读写" => {
            "readWrite".to_string()
        }
        _ => "read".to_string(),
    }
}

fn normalize_data_type(value: &str) -> String {
    match value.trim().to_ascii_lowercase().replace(' ', "").as_str() {
        "uint" | "u16" | "ushort" | "unsignedshort" => "uint16".to_string(),
        "int" | "i16" | "short" => "int16".to_string(),
        "float" | "single" | "real" => "float32".to_string(),
        "" => "uint16".to_string(),
        other => other.to_string(),
    }
}

fn expected_length(data_type: &str) -> u16 {
    if matches!(data_type, "uint32" | "int32" | "float32") {
        2
    } else {
        1
    }
}

fn parse_range(value: &str) -> (Option<f64>, Option<f64>) {
    for separator in ["~", "..", "至"] {
        if let Some((min, max)) = value.split_once(separator) {
            return (parse_number(min), parse_number(max));
        }
    }
    (None, None)
}

fn parse_number(value: &str) -> Option<f64> {
    let value = value.trim();
    if value.to_ascii_lowercase().starts_with("0x") {
        u64::from_str_radix(&value[2..], 16)
            .ok()
            .map(|item| item as f64)
    } else {
        value.parse::<f64>().ok().filter(|item| item.is_finite())
    }
}

fn value_as_number(value: &Value) -> Option<f64> {
    value
        .as_f64()
        .or_else(|| value.as_bool().map(|item| if item { 1.0 } else { 0.0 }))
        .or_else(|| value.as_str().and_then(parse_number))
}

fn json_string(value: &Value, key: &str) -> Option<String> {
    value.get(key)?.as_str().map(str::to_string)
}

fn json_number(value: &Value, key: &str) -> Option<f64> {
    value.get(key).and_then(value_as_number)
}

fn cell_text(value: &Data) -> String {
    match value {
        Data::Empty => String::new(),
        Data::String(value) => value.clone(),
        Data::Float(value) => value.to_string(),
        Data::Int(value) => value.to_string(),
        Data::Bool(value) => value.to_string(),
        Data::Error(value) => format!("{value:?}"),
        Data::DateTime(value) => value.to_string(),
        Data::DateTimeIso(value) | Data::DurationIso(value) => value.clone(),
    }
}

fn slug(value: &str) -> String {
    let slug = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if slug.is_empty() {
        format!("imported-{}", value.chars().count())
    } else {
        slug
    }
}

fn nonempty(value: String, fallback: String) -> String {
    if value.trim().is_empty() {
        fallback
    } else {
        value
    }
}

fn nonzero(value: f64) -> f64 {
    if value == 0.0 {
        1.0
    } else {
        value
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_chinese_table_headers() {
        let rows = vec![HashMap::from([
            ("寄存器地址".to_string(), "0x10".to_string()),
            ("点位名称".to_string(), "温度".to_string()),
            ("数据类型".to_string(), "int16".to_string()),
            ("倍率".to_string(), "0.1".to_string()),
            ("范围".to_string(), "-40~125".to_string()),
        ])];
        let profile = profile_from_rows("sample", rows).unwrap();
        assert_eq!(profile.registers[0].address, 16);
        assert_eq!(profile.registers[0].name, "温度");
        assert_eq!(profile.registers[0].range_min, Some(-40.0));
    }

    #[test]
    fn imports_profile_json_with_scenario() {
        let path = std::env::temp_dir().join(format!(
            "icstudio-profile-{}.json",
            std::process::id()
        ));
        fs::write(
            &path,
            r#"{
              "id":"demo","name":"测试协议","registers":[
                {"id":"power","address":40001,"name":"功率","functionCode":3,
                 "access":"readWrite","dataType":"int16","length":1,"scale":0.1,
                 "unit":"kW","range":{"min":-100,"max":100},"currentValue":12.5}
              ],
              "scenarios":[{"id":"fault","name":"故障","description":"测试",
                "steps":[],"faultInjection":{"mode":"exceptionCode","exceptionCode":"0x03","rate":1}}]
            }"#,
        )
        .unwrap();
        let profile =
            import_device_simulator_profile(path.to_string_lossy().into_owned()).unwrap();
        let _ = fs::remove_file(path);
        assert_eq!(profile.name, "测试协议");
        assert_eq!(profile.registers[0].engineering_value, 12.5);
        assert_eq!(profile.scenarios[0].fault_mode, "exceptionCode");
        assert_eq!(profile.scenarios[0].exception_code, 3);
    }
}
