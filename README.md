# Trace-Vector-PChost

针对21届智能车雁过留痕组 STC32G144K 调试专用上位机。使用混合编码和 WebSerial API 与 STC32G144K 智能车进行串口通信。

## 功能特性

- **图传显示** — 实时显示 188×120 摄像头画面，支持截图/录制
- **日志输出** — MCU DEBUG 日志实时显示
- **资源监控** — CPU/RAM/ROM 占用率、速度、舵机角度折线图
- **命令发送** — 向 MCU 发送控制指令（CLI，开发中）

## 协议规范

三路混合协议在单条 UART (115200) 上传输：

| 帧类型 | ID | 大小 | 频率 |
|--------|-----|------|------|
| 图传 | 0xCC | 22566 B | 25 FPS |
| 日志 | 0xDD | 4+N B | 5 Hz |
| 资源 | 0xEE | 18 B | 5 Hz |

详见 [telemetry_protocol.md](docs/telemetry_protocol.md)

## 项目结构

```
src/
├── composables/
│   ├── useTelemetry.ts       # 串口 + 数据管理（单例）
│   ├── useCanvasAnimation.ts
│   └── useChartPath.ts
├── serial/                   # 通信层
│   ├── protocol.ts           # 协议常量与类型
│   ├── port.ts               # WebSerial API 封装
│   ├── parser.ts             # 帧解析状态机
│   ├── manager.ts            # 串口事件分发
│   ├── image-manager.ts      # 图传帧处理
│   ├── log-manager.ts        # 日志帧处理
│   ├── resource-manager.ts   # 资源帧处理
│   └── __tests__/            # 单元 + 集成测试
├── stores/connection.ts      # 连接状态（reactive）
├── views/
│   ├── TelemetryDashboard.vue
│   ├── VisionView.vue
│   └── SettingsView.vue
└── components/
    ├── SensorCard.vue
    ├── ServoCard.vue
    └── LogCard.vue
```

## 快速开始

```bash
npm install
npm run dev    # 开发服务器（含 frontend mock，无需硬件）
npm run test   # 运行测试
npm run build  # 构建
```

## 开发进度

- [x] 串口通信层（WebSerial、帧解析、校验和，100+ 测试）
- [x] 图传解析（灰度→RGBA、丢帧检测、FPS 统计）
- [x] 日志解析与显示
- [x] 资源帧解析（CPU/RAM/ROM/速度/舵机）
- [x] 主仪表板 UI（Overview / Vision / Settings，响应式）
- [x] 截图 / 录制功能
- [x] `useTelemetry` composable（串口+数据管理统一入口）
- [ ] CLI 命令发送面板
- [ ] 图传 Canvas 直接渲染（当前为 mirror 模式）
- [ ] Settings 功能实际生效（Channels 开关、Display 设置）

## TODO

- [ ] **实体 MCU 联调测试** — 用真实 STC32G144K 硬件验证三路帧收发、FPS、资源数据准确性；确认波特率 115200 稳定性
- [ ] **CLI 命令发送** — 实现向 MCU 发送控制指令（对应固件 `value_change` / `get_button_state`）
- [ ] **图传直接渲染** — 将 `ImageProcessManager` 的 RGBA 数据直接写入 Vision Canvas，替换当前 mirror 方案，解锁真实 FPS 显示
- [ ] **Settings Channels 开关接入** — 三路帧订阅（0xCC/0xDD/0xEE）响应 Settings 页面开关
- [ ] **Manager API 统一** — `ImageProcessManager` 改为 `attach/detach` 模式，与 `ResourceManager` 一致
- [ ] **examples.ts 整理** — 将 `*-examples.ts` 移至 `__tests__/fixtures/`

## 文档

- [资源帧 API](docs/RESOURCE_API.md)
- [图传 API](docs/IMAGE_API.md)
- [日志 API](docs/LOG_API.md)
