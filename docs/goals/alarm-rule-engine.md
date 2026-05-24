# 故障/告警规则引擎

## 目标

实现统一告警引擎。不要只显示故障字 raw value，要把 bit 位解析成可管理的告警事件。

## 数据模型

AlarmRule：

- rule_id
- device_type
- point_address
- bit_index
- alarm_name
- alarm_level
- trigger_condition
- recover_condition
- delay_ms
- auto_recover
- enabled
- description

AlarmEvent：

- event_id
- rule_id
- device_instance
- level
- status
- trigger_time
- recover_time
- acknowledge_time
- acknowledge_user
- raw_value
- message

## 告警等级

- 严重故障
- 一般告警
- 预警
- 提示

## 功能

1. 故障 bit 解析
2. 告警生成
3. 告警恢复
4. 告警确认
5. 告警屏蔽
6. 告警抑制
7. 告警过滤
8. 告警历史
9. 告警统计
10. 告警导出

## 页面设计

页面分 4 个 Tab：

1. 当前告警
2. 历史告警
3. 告警规则
4. 告警统计

当前告警字段：

- 时间
- 等级
- 设备
- 点位
- bit
- 告警名称
- 状态
- 确认人
- 操作

## 首页联动

首页告警中心显示：

- 当前严重故障数量
- 当前一般告警数量
- 当前预警数量
- 最近 5 条告警

PCS 模块矩阵要根据告警状态变色。

## 自测联动

自测模式下，注入 PCS3 故障后：

- 生成告警事件
- 首页告警数量增加
- PCS3 卡片变红
- 清除故障后告警恢复

## 验收标准

1. 能解析 PCS 故障字。
2. 能解析 BMS 故障字。
3. 能解析液冷故障字。
4. 能解析动环 DI/报警位。
5. 首页告警中心来自统一告警引擎。
6. 告警确认和恢复有历史记录。
7. 告警规则可启用/禁用。