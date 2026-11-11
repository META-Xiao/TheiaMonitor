# Theia Monitor

原名 Trace-Vector-PChost 为[我队21届智能车竞赛所适配](https://github.com/META-Xiao/Trace-Vector)上位机，在开发的过程中对其进行大幅扩展，目前可以支持市面上常见的MCU

<!-- ![showoverview](docs\img\showoverview.gif) -->

<!-- ![showreplay](docs\img\showreplay.gif) -->

<!-- ![showhexview](docs\img\showhexview.gif) -->

![showoverview](docs/img/showoverview.jpg)

## 功能特性

- **图传显示**： 实时显示 MCU 图像数据，支持 Binary1 / Gray8 / RGB565 / RGB888 / YUV422，编码 RAW / RLE / HeatShrink / Tile / Patch
- **日志输出**： MCU DEBUG 日志实时显示
- **资源监控**： 可扩展的资源数据输出，并在上位机可视化显示，默认支持CPU/RAM/ROM 占用率、速度等折线图
- **录制和回放**： bin 文件保存 MCU 原始输出数据，支持离线回放与 Hex 分析
- **命令发送**： 向 MCU 发送控制指令（CLI）

## 协议规范

三路混合协议在**单条 UART** 上传输（8N1）：

```
┌────────┬──────────┬─────────────────────┬──────┐
│ Sync   │ Length   │ Body                │ CS   │
│ 1B     │ 2B (BE)  │ N bytes             │ 1B   │
└────────┴──────────┴─────────────────────┴──────┘
CS = Σ(Sync + Length + Body) & 0xFF
```

| 帧类型 | Sync | Body 结构 | 典型频率 |
|--------|------|-----------|---------|
| 图传 | 0xCC | FrameID(2B) + W(1B) + H(1B) + Format(1B) + Payload | 硬件决定¹ |
| 日志 | 0xDD | UTF-8 文本 (≤ 256B) | ≤ 5 Hz |
| 资源 | 0xEE | CPU(1B) + RAM(2B) + ROM(2B) + Speed(2B) + Servo(2B) | ≤ 5 Hz |
| CLI | 0xFF | Flags(1B) + UTF-8 文本 (≤ 255B) | 按需 |

> ¹ **Host 不设帧率上限。** 实际 FPS = MCU 渲染 + 传输时间。USB-CDC 下小帧传输可忽略，瓶颈在渲染；物理 UART 下大帧带宽可能成为瓶颈。FreeRTOS 可做动态帧率——场景简单时自动快、复杂时自动慢，Host 零改动。

**Format 字节**：高 4 位 = PixelFormat，低 4 位 = Codec

| PixelFormat | 值 | 说明 | Codec | 值 | 说明 |
|-------------|------|------|-------|------|------|
| Binary1 | 0 | 1bpp 二值化 | RAW | 0 | 无压缩 |
| Gray8 | 1 | 8bpp 灰度 | RLE | 1 | 游程编码 |
| RGB565 | 2 | 16bpp 彩色 | HeatShrink | 2 | LZ 压缩 |
| RGB888 | 3 | 24bpp 真彩 | Tile | 3 | 分块变化检测 |
| YUV422 | 4 | 16bpp 色度抽样 | Patch | 4 | 矩形变化检测 |

详见 [telemetry_protocol.md](docs/telemetry_protocol.md)

## 项目结构

```
src/
├── serial/                   # 协议层（解析 / 编解码 / 录制回放）
│   ├── protocol.ts           #   帧类型、PixelFormat、Codec 定义
│   ├── parser.ts             #   帧解析状态机
│   ├── port.ts               #   WebSerial 封装
│   ├── manager.ts            #   事件总线
│   ├── image-processor.ts    #   图像解码器（RAW / RLE / HS / Tile / Patch）
│   ├── *-manager.ts          #   图像 / 日志 / 资源管理器
│   ├── record.ts             #   录制（→ .bin）
│   ├── replay.ts             #   回放（.bin →）
│   └── __tests__/            #   100+ 单元测试
├── composables/              # Vue 状态管理
│   └── useTelemetry.ts       #   串口 + 数据统一入口
├── stores/                   # 全局状态
├── views/
│   ├── Overview.vue          #   主仪表板
│   ├── HexView.vue           #   Hex 编辑器
│   └── SettingsView.vue      #   设置
└── components/               # UI 组件
    ├── VisionPane.vue        #   图传渲染
    ├── BinOutput.vue         #   二进制帧输出
    ├── LogCard.vue           #   日志面板
    └── SensorCard.vue        #   传感器卡片
```

## 快速开始

```bash
npm install
npm run vite       # 浏览器开发版，内置 WiFi SPI TCP/WebSocket 桥接
npm run front      # 浏览器模拟数据演示
npm run build:web  # 构建浏览器版
npm run preview    # 预览构建结果，同样支持 WiFi SPI
npm run test       # 运行测试
npm run dev        # Tauri 桌面开发（需要 Rust/Cargo）
npm run build      # Tauri 桌面打包
npm run cap:sync   # 打包 APK
```

## 浏览器 WiFi SPI 图传

运行 `npm run vite`，打开终端显示的网页地址（默认 `http://localhost:5173`）。
选择右上角 WIFI，确认电脑的局域网 IPv4 和端口（默认 8086），点击 Connect 开始监听，
然后启动单片机。`Auto IP` 每次读取运行 Vite 的电脑网卡，可手动修改并保存。
多网卡时选择与设备处于同一网络的 IP，并让固件的 `SETTING_WIFI_TARGET_IP` 和端口匹配。

数据路径：WiFi SPI 模块 → 电脑 TCP 监听 → 同源 WebSocket → 原有图像解析器。
不需要 Rust，不需要额外启动桥接进程，也不改 MCU 的 Theia 0xCC 图像协议。
浏览器页面关闭或 Disconnect 会释放 TCP 监听；设备断开后保留监听，重连时清空半帧。
同一时间只允许一个浏览器会话控制 WiFi 监听，避免重复接收和端口冲突。
端口被占用、桥接不可用时页面会显示原因。

网页可在运行 Vite 的电脑上访问，也可用同一局域网其他设备的浏览器访问
`http://电脑IP:5173`；TCP 监听始终位于运行 Vite 的电脑上。
必要时允许 Node.js 通过 Windows 防火墙接收设备连接。
`npm run build:web` 后需用 `npm run preview` 提供网页和桥接；仅把 dist 放到静态站点不提供 TCP 接收能力。
`npm run front` 使用模拟数据，实际图传请运行 `npm run vite`。

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
- [x] WIFI 传输功能
- [ ] CLI 命令发送功能
- [ ] CLI 在MCU上接收指令并执行相应任务的方法文档

## TODO

- [x] **Hex 查看器**：这个页面将替代现有的vision界面（vision界面看起来多余了）
  - [x] 打开已有 .bin 文件进行离线查看
  - [x] Hex 查看器：类似 Hex Editor，按字节显示二进制数据
  - [x] 不同帧类型（0xCC/0xDD/0xEE）用不同颜色高亮
  - [x] 每帧内分块标注：Header（帧头+长度+帧号）、Data（图像/日志/资源数据）、Checksum
  - [x] 鼠标悬停显示字段名称和数值解析
  - [x] 悬浮帧时右侧显示图片预览 + Payload hex dump

- [ ] `serial` 实现 Pixel Format：JPEG(5)、PNG(6)、User(7)
- [ ] `serial` 实现 Codec：TileHS(5)、PatchHS(6) 

## 文档

- [资源帧 API](docs/RESOURCE_API.md)
- [图传 API](docs/IMAGE_API.md)
- [日志 API](docs/LOG_API.md)
