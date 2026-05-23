# 图传混合协议设计文档

## 1. 协议概览

**目标**：统一传输图像、日志、资源/IMU信息，供上位机(Vue)实时显示与分析

**通道配置**
- 波特率: 115200 bps，帧格式 8N1（硬件固定，`SCON=0x50`，不可软件修改）
- 通道: USB-CDC / UART（无线转串口）/ WIFI-UART（无线转串口）/ WIFI-SPI（高速SPI）
- 编码: 二进制多帧混合协议

---

## 2. 帧类型定义

### 2.1 图传帧 (0xCC)

**发送频率**: 25 FPS（每4帧发1次）  
**帧结构**:
```
┌─────┬───────┬─────────┬──────────┬──────────────┬──────────┐
│ ID  │ Frame │ FPS_cam │ FPS_out  │ ImageData    │ Checksum │
├─────┼───────┼─────────┼──────────┼──────────────┼──────────┤
│ 0xCC│ (2B)  │ (1B)    │ (1B)     │ (22560B)     │ (1B)     │
└─────┴───────┴─────────┴──────────┴──────────────┴──────────┘
```

**字段说明**:
- `Frame`: 帧计数器（0-65535，uint16 大端）
- `FPS_cam`: 摄像头实际帧率（固定100）
- `FPS_out`: 图传输出帧率（固定25，每4帧发1次）
- `ImageData`: 原始188×120灰度图像
- `Checksum`: 简单和校验（所有字节之和 & 0xFF）

**总字节数**: 22566B（1+2+1+1+22560+1）  
**上位机处理**: 图像解析→显示，可选缩放/压缩

---

### 2.2 日志帧 (0xDD)

**发送频率**: 5 FPS（每20帧发1次）  
**帧结构**:
```
┌─────┬────────┬────────────┬──────────┐
│ ID  │ Length │ LogData    │ Checksum │
├─────┼────────┼────────────┼──────────┤
│ 0xDD│ (2B)   │ (0-256B)   │ (1B)     │
└─────┴────────┴────────────┴──────────┘
```

**字段说明**:
- `Length`: 日志数据实际字节数（0表示此帧无日志）
- `LogData`: printf缓冲中的文本内容（FIFO读取）
- `Checksum`: 简单和校验

**总字节数**: 4 + N（N=0-256）  
**MCU处理**: 从debug_uart_fifo读取，零额外CPU开销  
**上位机处理**: 文本解析→控制台显示

---

### 2.3 资源/IMU帧 (0xEE)

**发送频率**: 5 FPS（每20帧发1次）  
**帧结构**:
```
┌─────┬──────────┬──────────┬────────────┬──────────┬────────────┬──────────────┬────────────────┬──────────┐
│ ID  │ CPUUsage │ RAMUsage │ FreeXDATA  │ FreeEDATA│ Speed      │ ServoAngle   │ Reserved       │ Checksum │
├─────┼──────────┼──────────┼────────────┼──────────┼────────────┼──────────────┼────────────────┼──────────┤
│ 0xEE│ (1B)%    │ (1B)%    │ (2B)       │ (2B)     │ (2B int16) │ (2B int16)   │ (6B)           │ (1B)     │
└─────┴──────────┴──────────┴────────────┴──────────┴────────────┴──────────────┴────────────────┴──────────┘
```

**字段说明**:
- `CPUUsage`: CPU占用率(%) = (UsedCycles / TotalCycles) × 100，范围 0-100
- `RAMUsage`: RAM占用率(%) = ((EDATA已用 + XDATA已用) / 24576) × 100，范围 0-100
  - EDATA已用 = 8192 - FreeEDATA （硬件栈）
  - XDATA已用 = 16384 - FreeXDATA （数据内存）
  - 总容量 = 8KB + 16KB = 24KB
- `FreeXDATA`: XDATA剩余字节数（0-16384）
- `FreeEDATA`: EDATA剩余字节数/栈深（0-8192）
- `Speed`: 前进方向速度（mm/s, int16, 正=前进 负=后退）
- `ServoAngle`: 舵机偏转角度×10（度数×10, int16, 参考err定义）
- `Reserved`: 预留字段，填0便于扩展
- `Checksum`: 简单和校验

**总字节数**: 18B  
**MCU处理**: 内存剩余量由 telemetry_resource 模块定期更新 + 硬件计数器读取 + RAM计算，零额外开销  
**上位机计算**:
```javascript
cpu_load = CPUUsage;                              // CPU占用率 % (直接读取)
ram_load = RAMUsage;                              // RAM占用率 % (直接读取)
edata_usage = (8192 - FreeEDATA) / 81.92;         // EDATA占用率 %
xdata_usage = (16384 - FreeXDATA) / 163.84;       // XDATA占用率 %
speed_ms = Speed / 1000.0;                        // 速度 m/s
servo_deg = ServoAngle / 10.0;                    // 舵机角度 度
```

---

## 3. 控制开关 (setting.h)

```c
/* =========================================================================
 * 图传输出开关
 * ========================================================================= */
#define SETTING_TELEMETRY_IMAGE_ENABLE    ( 1 )  // 图传帧 (0xCC)
#define SETTING_TELEMETRY_LOG_ENABLE      ( 1 )  // 日志帧 (0xDD)
#define SETTING_TELEMETRY_RESOURCE_ENABLE ( 1 )  // 资源帧 (0xEE)

/* 资源帧子开关 */
#define SETTING_TELEMETRY_CPU_ENABLE      ( 1 )  // CPU周期统计
#define SETTING_TELEMETRY_XDATA_ENABLE    ( 1 )  // XDATA剩余量
#define SETTING_TELEMETRY_SPEED_ENABLE    ( 1 )  // 前进速度
#define SETTING_TELEMETRY_SERVO_ENABLE    ( 1 )  // 舵机偏转

/* 发送频率配置 */
#define SETTING_TELEMETRY_BAUD_RATE       ( 115200 )     // 波特率
#define SETTING_TELEMETRY_IMAGE_INTERVAL  ( 4 )          // 图传间隔 (4=25FPS)
#define SETTING_TELEMETRY_LOG_INTERVAL    ( 20 )         // 日志间隔 (20=5FPS)
#define SETTING_TELEMETRY_RESOURCE_INTERVAL ( 20 )       // 资源间隔 (20=5FPS)
```

---

## 4. 代码结构规划

### 4.1 Libraries 二次开发

**新建文件夹**: `libraries/zf_device/zf_device_telemetry/`

```
libraries/zf_device/zf_device_telemetry/
├── zf_device_telemetry.h          (公共接口)
├── zf_device_telemetry.c          (核心实现)
├── telemetry_image.c              (图传帧处理)
├── telemetry_log.c                (日志帧处理)
└── telemetry_resource.c           (资源/IMU帧处理)
```

**接口定义** (zf_device_telemetry.h):
```c
#ifndef __ZF_DEVICE_TELEMETRY_H__
#define __ZF_DEVICE_TELEMETRY_H__

void telemetry_init(void);                    // 初始化
void telemetry_tick(void);                    // 每帧调用（处理发送逻辑）

// 资源信息更新接口
void telemetry_update_speed(int16 speed_mm_s);
void telemetry_update_servo_angle(int16 angle_x10);
void telemetry_update_cpu_cycles(uint32 total, uint32 used);
void telemetry_update_xdata_free(uint16 free_bytes);

#endif
```

### 4.2 Project/Code 修改

**修改文件**: 
- `project/code/imgtrans.c` → 删除或注释（用新的telemetry替代）
- `project/code/telemetry_config.c` (新建) → 配置与初始化

**关键修改**:
```c
// 在 setting.c 的 setting_loop_tick() 中添加
#if SETTING_ENABLE_TELEMETRY
    telemetry_tick();           // 每帧调用
#endif

// 在 vehicle_control.c 的速度更新处添加
telemetry_update_speed(current_speed_mm_s);
telemetry_update_servo_angle(servo_angle_x10);
```

### 4.3 Setting.h 修改

- 添加所有 `SETTING_TELEMETRY_*` 宏定义
- 添加发送间隔常量

---

## 5. MCU端处理流程

```
每帧(10ms)调用 telemetry_tick():
│
├─ 图传计数器 ++
│  if (计数 % SETTING_TELEMETRY_IMAGE_INTERVAL == 0)
│    → 发送 0xCC 帧（直接流发送22560B）
│
├─ 日志计数器 ++
│  if (计数 % SETTING_TELEMETRY_LOG_INTERVAL == 0)
│    → 从 debug_uart_fifo 读取
│    → 发送 0xDD 帧
│
└─ 资源计数器 ++
   if (计数 % SETTING_TELEMETRY_RESOURCE_INTERVAL == 0)
     → 读取全局变量（速度、舵机、CPU、XDATA）
     → 发送 0xEE 帧
```

**总CPU开销**: < 1ms per frame（图传异步DMA）

---

## 6. 上位机处理 (Vue PChost)

### 6.1 SerialPort接收层
```javascript
// 伪代码
async function processIncomingByte(byte) {
    if (byte === 0xCC) {
        frame_type = 'image';
        await parseImageFrame();
    } else if (byte === 0xDD) {
        frame_type = 'log';
        await parseLogFrame();
    } else if (byte === 0xEE) {
        frame_type = 'resource';
        await parseResourceFrame();
    }
}
```

### 6.2 数据显示
- **图像**: Canvas显示，可选缩放
- **日志**: 文本窗口，实时滚动
- **资源**: 仪表板展示（CPU/ROM/XDATA占用率、速度、舵机角度）

---

## 7. 时序分析

```
10ms帧周期（100FPS @96MHz）:

 0ms  ┌─ 图像采集(DMA)
      ├─ Track处理 (~3-5ms)
      ├─ 控制更新 (~1ms)
      │
 8ms  ├─ telemetry_tick()
      │  ├─ 图传: 22570B@115200bps ≈ 2000ms (异步DMA, 不阻塞)
      │  ├─ 日志: ~100B@115200bps ≈ 10ms (5帧一次)
      │  └─ 资源: 16B@115200bps ≈ 1ms (5帧一次)
      │
 9ms  └─ 帧完成, 下一帧开始

关键: 所有串口发送均使用DMA异步模式, MCU不阻塞
```

---

## 8. 实现检查清单

- [ ] `libraries/zf_device/zf_device_telemetry/` 文件夹创建
- [ ] `telemetry_*.c/h` 实现（图/日/资三层）
- [ ] `setting.h` 添加所有开关宏
- [ ] `project/code/telemetry_config.c` 创建
- [ ] `project/code/imgtrans.c` 注释或删除
- [ ] `setting.c` 的 `setting_loop_tick()` 添加 `telemetry_tick()`
- [ ] `vehicle_control.c` 添加 `telemetry_update_*()` 调用
- [ ] Keil工程 添加 telemetry 源文件
- [ ] 编译验证、测试各帧输出

---

## 9. 上位机协议解析参考

**伪代码框架**:
```python
# Python示例
while True:
    byte = ser.read(1)[0]
    
    if byte == 0xCC:  # 图传帧
        frame_id = read_uint16()
        fps = read_uint8()
        image_data = read_bytes(22560)
        checksum = read_uint8()
        display_image(image_data)
        
    elif byte == 0xDD:  # 日志帧
        length = read_uint16()
        log_data = read_bytes(length)
        checksum = read_uint8()
        append_log_console(log_data.decode('utf-8'))
        
    elif byte == 0xEE:  # 资源帧
        total_cycles = read_uint32()
        used_cycles = read_uint32()
        free_xdata = read_uint16()
        speed = read_int16()
        servo_angle = read_int16()
        checksum = read_uint8()
        
        cpu_load = (used_cycles / total_cycles) * 100
        update_dashboard(cpu_load, speed, servo_angle)
```

---

**文档版本**: 1.0  
**更新日期**: 2026-05-19  
**状态**: 待实现
