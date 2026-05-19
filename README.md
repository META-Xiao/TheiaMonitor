## Trace-Vector-PChost

实时遥测可视化上位机，基于 Vue3 + TypeScript，使用 WebSerial API 与 STC32G144K 智能车进行串口通信。

### 功能特性

- 📡 **图传显示** - 实时显示 188×120 摄像头画面
- 📝 **日志输出** - DEBUG 日志实时显示
- 📊 **资源监控** - CPU/RAM 占用率、速度、舵机角度
- 🛠 **命令发送** - 向 MCU 发送控制指令

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
# 安装依赖
npm install

# 开发
npm run dev

# 测试
npm run test

# 构建
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
  
- [x] **Step 2** - 图传解析与显示 (0xCC)
- [x] **Step 3** - 日志显示 (0xDD)
- [ ] **Step 4** - 资源仪表板 (0xEE)
- [ ] **Step 5** - UI/UX 完整实现

### 浏览器支持

- ✅ Chrome 89+
- ✅ Edge 89+
- ✅ Opera 75+

### 文档

- [SERIAL_LAYER.md](SERIAL_LAYER.md) - 通信层完整文档
- [COMPLETION_REPORT.md](COMPLETION_REPORT.md) - Phase 2 Step 1 完成报告
- [示例代码](src/serial/examples.ts) - 7个实现示例


