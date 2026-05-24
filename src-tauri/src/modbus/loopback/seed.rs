use super::{
    RegisterPoint, SimulatedRegisterStore, PCS_MODULE_BASE, PCS_MODULE_COUNT, PCS_MODULE_STRIDE,
};

/// 确定性模拟点表。测试和首页自测共享同一份 seed，避免 UI 示例数据和 TCP 从站数据漂移。
pub(super) fn create_loopback_store() -> SimulatedRegisterStore {
    let store = SimulatedRegisterStore::new();
    for point in [
        RegisterPoint::unsigned(14001, "PCS 在线台数", 12.0, 1.0, "台", 0),
        RegisterPoint::enumeration(14002, "系统运行状态", 1, "并网运行"),
        RegisterPoint::unsigned(14003, "PCS 总故障信息表 1", 1.0, 1.0, "", 0),
        RegisterPoint::unsigned(14004, "PCS 总故障信息表 2", 0.0, 1.0, "", 0),
        RegisterPoint::unsigned(14005, "电网频率", 50.00, 0.01, "Hz", 2),
        RegisterPoint::numeric(14006, "总有功功率", 1250.00, 0.1, "kW", 2),
        RegisterPoint::numeric(14007, "总无功功率", -120.50, 0.01, "kvar", 2),
        RegisterPoint::numeric(14008, "总视在功率", 1257.80, 0.1, "kVA", 2),
        RegisterPoint::numeric(14021, "直流侧功率", -1280.20, 0.1, "kW", 2),
        RegisterPoint::unsigned(14022, "A 相电压", 229.30, 0.01, "V", 2),
        RegisterPoint::unsigned(14023, "B 相电压", 229.10, 0.01, "V", 2),
        RegisterPoint::unsigned(14024, "C 相电压", 229.50, 0.01, "V", 2),
        RegisterPoint::unsigned(14025, "A 相电流", 396.80, 0.01, "A", 2),
        RegisterPoint::unsigned(14026, "B 相电流", 397.10, 0.01, "A", 2),
        RegisterPoint::unsigned(14027, "C 相电流", 398.20, 0.01, "A", 2),
        RegisterPoint::unsigned(14028, "AB 线电压", 396.80, 0.01, "V", 2),
        RegisterPoint::unsigned(14029, "BC 线电压", 397.10, 0.01, "V", 2),
        RegisterPoint::unsigned(14030, "CA 线电压", 398.20, 0.01, "V", 2),
        RegisterPoint::unsigned(14031, "电池直流电压", 768.20, 0.1, "V", 2),
        RegisterPoint::numeric(14032, "电池电流", -325.40, 0.01, "A", 2),
        RegisterPoint::unsigned(14033, "今日充电量", 256.80, 0.01, "kWh", 2),
        RegisterPoint::unsigned(14035, "今日放电量", 512.40, 0.01, "kWh", 2),
        RegisterPoint::unsigned32(14037, "累计充电量", 256800.20, 0.01, "kWh", 2),
        RegisterPoint::unsigned32(14039, "累计放电量", 512400.50, 0.01, "kWh", 2),
        RegisterPoint::enumeration(25601, "电池簇充放电状态", 2, "放电"),
        RegisterPoint::enumeration(25602, "BMS 故障状态", 0, "无故障"),
        RegisterPoint::enumeration(25603, "充放电允许状态", 3, "允充允放"),
        RegisterPoint::unsigned(25604, "BMS 心跳", 1.0, 1.0, "", 0),
        RegisterPoint::unsigned(25605, "电池簇总电压", 768.20, 0.1, "V", 2),
        RegisterPoint::numeric(25606, "电池簇总电流", -325.40, 0.01, "A", 2),
        RegisterPoint::numeric(25608, "电池簇总功率", -1280.20, 0.1, "kW", 2),
        RegisterPoint::unsigned(25609, "SOC", 78.50, 0.01, "%", 2),
        RegisterPoint::unsigned(25610, "可用 SOC", 76.80, 0.01, "%", 2),
        RegisterPoint::unsigned(25611, "SOH", 95.60, 0.01, "%", 2),
        RegisterPoint::unsigned(25619, "单体最高电压", 3.421, 0.001, "V", 3),
        RegisterPoint::unsigned(25620, "单体最低电压", 3.318, 0.001, "V", 3),
        RegisterPoint::unsigned(25622, "电芯压差", 0.103, 0.001, "V", 3),
        RegisterPoint::unsigned(25623, "单体最高温度", 31.8, 0.1, "℃", 1),
        RegisterPoint::unsigned(25624, "单体最低温度", 24.6, 0.1, "℃", 1),
        RegisterPoint::unsigned(25626, "电芯温差", 7.2, 0.1, "℃", 1),
    ] {
        store.insert(point);
    }

    for index in 0..PCS_MODULE_COUNT {
        let id = index + 1;
        let base = PCS_MODULE_BASE + index * PCS_MODULE_STRIDE;
        let state = match id {
            3 => (3, "故障"),
            7 | 11 => (2, "待机"),
            15 => (0, "离线"),
            _ => (1, "运行"),
        };
        store.insert(RegisterPoint::enumeration(
            base + 9,
            "PCS 运行状态",
            state.0,
            state.1,
        ));
        for offset in 10..=19 {
            store.insert(RegisterPoint::unsigned(
                base + offset,
                "PCS 模块温度",
                36.5 + (index % 6) as f64 * 2.1,
                0.1,
                "℃",
                1,
            ));
        }
        for offset in 20..=29 {
            let fault = if id == 3 && offset == 20 { 1.0 } else { 0.0 };
            store.insert(RegisterPoint::unsigned(
                base + offset,
                "PCS 故障信息",
                fault,
                1.0,
                "",
                0,
            ));
        }
        for offset in 50..=84 {
            store.insert(RegisterPoint::numeric(
                base + offset,
                "PCS 电压电流功率",
                92.0 + index as f64 * 3.7,
                0.01,
                "",
                2,
            ));
        }
    }
    store.log("加载 PCS/BMS loopback 协议模型和确定性模拟数据".to_string());
    store
}
