## Trace-Vector-PChost

[未开发完成！]

针对21届智能车雁过留痕组STC调试专用的上位机，使用混合编码和 WebSerial API 与 STC32G144K 智能车进行串口通信。能够一次显示更多的调试信息，比逐飞的上位机更完善。

### 功能特性

- **图传显示** : 实时显示 188×120 摄像头画面
- **日志输出** : DEBUG 日志实时显示
- **资源监控** : CPU/RAM/ROM 占用率、速度、舵机角度
- **命令发送** : 向 MCU 发送控制指令

### 项目结构

```
pc-host/
├── src/
│   └── serial/                   # 串口通信层
│       ├── protocol.ts           # 协议定义
│       ├── port.ts               # WebSerial API
│       ├── parser.ts             # 帧解析
│       ├── manager.ts            # 通信管理器
│       ├── examples.ts           # 使用示例
│       └── __tests__/            # 单元 + 集成测试
├── SERIAL_LAYER.md               # 通信层文档
├── COMPLETION_REPORT.md          # 完成报告
└── package.json
```

### 协议规范

三层混合协议在单条 UART 上传输：

| 帧类型 | ID | 大小 | 频率 |
|--------|----|----|------|
| 图传 | 0xCC | 22570B | 25 FPS |
| 日志 | 0xDD | 4+N B | 5 FPS |
| 资源 | 0xEE | 18B | 5 FPS |

详见 [protocol.md](../project/doc/telemetry_protocol.md)

### 快速开始

```bash
npm install
npm run dev
npm run test
npm run build
```

### 开发进度

#### Phase 2: 上位机开发

- [x] **Step 1** - 串口通信层 (1776 LOC, 100+ 测试)
  - [x] WebSerial API 初始化
  - [x] 字节接收和缓冲
  - [x] 帧头识别 (0xCC/0xDD/0xEE)
  - [x] 帧长度解析
  - [x] 校验和验证
  
- [x] **Step 2** - 图传解析与显示 (0xCC, 239 LOC)
  - [x] 灰度图转 RGBA 格式
  - [x] 帧缓冲管理
  - [x] 丢帧检测和统计
  - [x] 实时 FPS 计算
  - [ ] Canvas 显示 (Vue 组件)
  - [ ] 图像缩放和信息显示

- [x] **Step 3** - 日志显示 (0xDD, 190 LOC)
  - [x] 日志帧解析
  - [x] 缓冲管理和搜索
  - [x] 统计信息
  - [x] 日志窗口 UI (Vue 组件)
  - [ ] 实时滚动和清空按钮

- [x] **Step 4** - 资源仪表板 (0xEE, 311 LOC, 29 tests)
  - [x] 资源帧解析
  - [x] CPU/RAM 占用率管理
  - [x] 速度和舵机角度处理
  - [x] 数据缓冲和统计
  - [x] 时间范围查询
  - [x] 仪表盘 UI (Vue 组件)
  - [ ] 图表显示

- [x] **Step 5** - UI/UX 完整实现（进行中）
  - [x] TelemetryDashboard.vue 主仪表板（总览页）
  - [x] SettingsView.vue 设置页（左侧导航+右侧内容，响应式）
    - [x] Serial Connection — 串口配置和连接状态
    - [x] Display — 主题/FPS/缩放/语言
    - [x] Channels — 三路遥测开关（0xCC/0xDD/0xEE）
    - [x] About — 版本信息
  - [x] ImageViewer.vue 图像显示（Canvas 组件）
  - [x] LogConsole.vue 日志控制台
  - [x] ResourceMonitor.vue 资源监控仪表板

### 文档

- [资源显示文档](docs\RESOURCE_API.md) - 资源帧解析和显示
- [图传文档](docs\IMAGE_API.md) - 图传帧解析和显示
- [日志文档](docs\LOG_API.md) - 日志帧解析和显示
- [示例代码](src/serial/examples.ts) - 7个实现示例


