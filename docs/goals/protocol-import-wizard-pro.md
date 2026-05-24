# 通用协议导入向导 Pro

## 目标

实现一个通用协议导入向导，让软件能够导入不同厂家、不同格式的 Excel/CSV/JSON 协议文件。

不能依赖固定列名或固定 sheet。必须支持字段映射和导入校验。

## 页面流程

1. 选择协议文件
2. 选择 sheet 或数据源
3. 自动识别表头
4. 字段映射
5. 地址格式识别
6. 数据类型识别
7. 倍率/单位识别
8. 枚举/bit 位识别
9. 导入预览
10. 校验结果
11. 确认导入
12. 生成协议模型

## 统一点位模型 PointModel

字段：

- point_id
- device_type
- area
- address
- name
- data_type
- word_count
- byte_order
- scale
- offset
- unit
- rw
- min
- max
- default_value
- enum_map
- bit_define
- remark
- group
- page
- poll_cycle
- simulate_rule

## 字段映射能力

用户可以把 Excel 列映射到统一字段，例如：

- 寄存器地址 -> address
- 寄存器名称 -> name
- 类型 -> data_type
- 单位 -> unit
- 读写属性 -> rw
- 备注 -> remark

支持保存字段映射模板，下次导入同类协议可复用。

## 智能识别

自动识别：

- 十进制地址
- 十六进制地址
- 40001 类 Modbus 地址
- uint16 / int16 / uint32 / int32 / float
- R / W / R/W
- 单位中的倍率，例如 0.1V、0.01kW
- 备注中的枚举
- bit0~bit15 位定义

## 协议校验

必须校验：

- 地址为空
- 地址重复
- 地址范围冲突
- 数据类型缺失
- word_count 不匹配
- rw 缺失
- 倍率异常
- 单位缺失
- 枚举格式异常
- bit 位重复
- 读写属性非法

校验结果分三级：

- error：不能导入
- warning：可以导入但需要提醒
- info：普通提示

## 导入结果

导入后生成：

- ProtocolModel
- PointModel 列表
- DeviceTemplate
- RegisterTable
- RealtimePageConfig
- SimulationModel

## UI 要求

使用向导式页面：

左侧步骤条  
中间主要配置区  
右侧导入摘要  
底部上一步 / 下一步 / 确认导入

导入预览要支持表格筛选、错误高亮、字段映射修改。

## 验收标准

1. 可以导入当前 EVE PCS/BMS xlsx 协议。
2. 可以导入列名被改过的协议，只要手动映射字段即可。
3. 地址重复能被检测出来。
4. 倍率和单位能正确解析。
5. 导入后能生成实时监控页面配置。
6. 导入后能生成从机模拟寄存器表。
7. 导入模板可以保存和复用。