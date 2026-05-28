# Theia Monitor

原名 Trace-Vector-PChost 为[我队21届智能车竞赛所适配](https://github.com/META-Xiao/Trace-Vector)上位机，在开发的过程中对其进行大幅扩展，目前可以支持市面上常见的MCU

<!-- ![showoverview](docs\img\showoverview.gif) -->

![showreplay](docs\img\showreplay.gif)

<!-- ![showhexview](docs\img\showhexview.gif) -->

## 功能特性

- **图传显示**： 实时显示MCU输出的图像数据，支持多种格式（二值图、灰度、RGB565等）以及对应的压缩编码方式（LZ、Tile、Patch等）
- **日志输出**： MCU DEBUG 日志实时显示
- **资源监控**： 可扩展的资源数据输出，并在上位机可视化显示，默认支持CPU/RAM/ROM 占用率、速度等折线图
- **录制和回放**： 通过经行编码的bin文件直接保存MCU输出的数据，以及支持对该数据进行读取（回放）  
- **命令发送**： 向 MCU 发送控制指令（CLI，开发中）

## 协议规范

三路混合协议在**单条UART**上传输：

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
npm run dev     # 开发服务器（含 frontend mock，无需硬件）
npm run test    # 运行测试，仅测试后端脚本
npm run mcutest # 运行 MCU 测试
npm run build   # 构建
```

## 开发进度

- [x] 串口通信层（WebSerial、帧解析、校验和，100+ 测试）
- [x] 图传解析（灰度→RGBA、丢帧检测、FPS 统计）
- [x] 日志解析与显示
- [x] 资源帧解析（CPU/RAM/ROM/速度/舵机）
- [x] 主仪表板 UI（Overview / Vision / Settings，响应式）
- [x] 截图 / 录制功能
- [x] `useTelemetry` composable（串口+数据管理统一入口）
- [x] 图传 Canvas 直接渲染（当前为 mirror 模式）
- [x] CLI 命令发送面板
- [x] Settings 功能实际生效（Channels 开关、Display 设置）
- [x] 录制和回放功能（bin 文件直接读写）
- [ ] WIFI 传输功能
- [ ] CLI 命令发送功能
- [ ] CLI 在MCU上接收指令并执行相应任务的方法文档

## TODO

- [x] **Hex 查看器**：这个页面将替代现有的vision界面（vision界面看起来多余了）
  - [x] 打开已有 .bin 文件进行离线查看
  - [x] Hex 查看器：类似 Hex Editor，按字节显示二进制数据
  - [x] 不同帧类型（0xCC/0xDD/0xEE）用不同颜色高亮
  - [x] 每帧内分块标注：Header（帧头+长度+帧号）、Data（图像/日志/资源数据）、Checksum
  - [x] 鼠标悬停显示字段名称和数值解析
  - [ ] 考虑是否添加悬浮在各帧时，右侧显示具体的渲染效果
    - [x] 实现对图像 `Payload` 数据的预览

- [ ] `serial` 实现 Pixel Format：JPEG(5)、PNG(6)、User(7)
- [ ] `serial` 实现 Codec：TileHS(5)、PatchHS(6) 

## 文档

- [资源帧 API](docs/RESOURCE_API.md)
- [图传 API](docs/IMAGE_API.md)
- [日志 API](docs/LOG_API.md)
