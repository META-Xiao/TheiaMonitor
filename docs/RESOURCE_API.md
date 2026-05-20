# 资源仪表板 API 文档

## 模块概述

两个核心模块：
- **resource-processor.ts** - 低层资源处理（帧解析、数据存储）
- **resource-manager.ts** - 高层事件管理（串口集成、事件分发）

---

## ResourceFrameProcessor

处理单个资源帧，解析资源数据。

### 构造函数

```typescript
constructor()
```

### 方法

#### process()

```typescript
process(frame: ResourceFrame): ProcessedResourceData
```

处理资源帧并返回处理后的数据。

**抛出异常:**
- `Error` - 如果 CPU 占用率不在 0-100% 范围内
- `Error` - 如果 RAM 占用率不在 0-100% 范围内

**返回:** `ProcessedResourceData` 对象，包含：
- `cpuUsage` - CPU 占用率（0-100%）
- `ramUsage` - RAM 占用率（0-100%）
- `freeXDATA` - 剩余 XDATA 字节数
- `freeEDATA` - 剩余 EDATA 字节数
- `speed` - 当前速度（mm/s，支持负数）
- `servoAngle` - 舵机角度（度×10）
- `timestamp` - 接收时间戳（ms）

#### getLastFrame()

```typescript
getLastFrame(): ProcessedResourceData | null
```

获取最后处理的资源帧。

#### clear()

```typescript
clear(): void
```

清空缓存。

---

## ResourceDataStore

维护资源数据缓冲和统计信息。

### 构造函数

```typescript
constructor(maxBufferSize: number = 300)
```

**参数:**
- `maxBufferSize` - 最大缓冲帧数（默认 300）

### 方法

#### storeData()

```typescript
storeData(data: ProcessedResourceData): void
```

存储新资源数据。自动维护缓冲区大小和统计信息。

#### getCurrentData()

```typescript
getCurrentData(): ProcessedResourceData | null
```

获取当前最新的资源数据。

#### getAllData()

```typescript
getAllData(): ProcessedResourceData[]
```

返回缓冲区中的所有资源数据。

#### getDataSince()

```typescript
getDataSince(timestamp: number): ProcessedResourceData[]
```

返回指定时间戳之后的所有资源数据。

**参数:**
- `timestamp` - 时间戳（ms）

#### getStats()

```typescript
getStats(): ResourceStats
```

获取统计信息。返回包含以下字段的对象：
- `cpuUsageAvg` - 平均 CPU 占用率
- `cpuUsageMax` - 最大 CPU 占用率
- `cpuUsageMin` - 最小 CPU 占用率
- `ramUsageAvg` - 平均 RAM 占用率
- `ramUsageMax` - 最大 RAM 占用率
- `ramUsageMin` - 最小 RAM 占用率
- `speedAvg` - 平均速度
- `speedMax` - 最大速度
- `speedMin` - 最小速度
- `servoAngleAvg` - 平均舵机角度
- `servoAngleMax` - 最大舵机角度
- `servoAngleMin` - 最小舵机角度

#### getBufferSize()

```typescript
getBufferSize(): number
```

获取缓冲区中当前数据数量。

#### getBufferUtilization()

```typescript
getBufferUtilization(): number
```

获取缓冲区占用率（0-100）。

#### clear()

```typescript
clear(): void
```

清空所有资源数据和统计信息。

---

## ResourceManager

高层管理器，集成串口通信和资源处理。

### 构造函数

```typescript
constructor(maxBufferSize?: number)
```

**参数:**
- `maxBufferSize` - 最大缓冲帧数（默认 300）

### 方法

#### attach()

```typescript
attach(serialManager: TelemetrySerialManager): void
```

附加到串口管理器：
- 订阅串口管理器的帧事件
- 自动接收和处理资源帧（0xEE）

#### detach()

```typescript
detach(): void
```

断开串口管理器连接，停止接收数据。

#### getCurrentData()

```typescript
getCurrentData(): ProcessedResourceData | null
```

获取当前最新的资源数据。

#### getAllData()

```typescript
getAllData(): ProcessedResourceData[]
```

获取所有历史资源数据。

#### getDataSince()

```typescript
getDataSince(timestamp: number): ProcessedResourceData[]
```

获取指定时间戳之后的资源数据。

#### getStats()

```typescript
getStats(): ResourceStats
```

获取统计信息。

#### getBufferSize()

```typescript
getBufferSize(): number
```

获取缓冲区中的数据数量。

#### getBufferUtilization()

```typescript
getBufferUtilization(): number
```

获取缓冲区占用率（0-100）。

#### clear()

```typescript
clear(): void
```

清空所有数据和统计信息。

---

## 数据类型

### ProcessedResourceData

单条资源数据记录。

| 属性 | 类型 | 说明 |
|------|------|------|
| cpuUsage | number | CPU 占用率（%） |
| ramUsage | number | RAM 占用率（%） |
| freeXDATA | number | 剩余 XDATA（字节） |
| freeEDATA | number | 剩余 EDATA（字节） |
| speed | number | 速度（mm/s） |
| servoAngle | number | 舵机角度（度×10） |
| timestamp | number | 接收时间戳（ms） |

### ResourceStats

资源统计信息。

| 属性 | 类型 | 说明 |
|------|------|------|
| cpuUsageAvg | number | 平均 CPU 占用率（%） |
| cpuUsageMax | number | 最大 CPU 占用率（%） |
| cpuUsageMin | number | 最小 CPU 占用率（%） |
| ramUsageAvg | number | 平均 RAM 占用率（%） |
| ramUsageMax | number | 最大 RAM 占用率（%） |
| ramUsageMin | number | 最小 RAM 占用率（%） |
| speedAvg | number | 平均速度（mm/s） |
| speedMax | number | 最大速度（mm/s） |
| speedMin | number | 最小速度（mm/s） |
| servoAngleAvg | number | 平均舵机角度（度×10） |
| servoAngleMax | number | 最大舵机角度（度×10） |
| servoAngleMin | number | 最小舵机角度（度×10） |

---

## 使用流程

### 1. 初始化

```typescript
const serialManager = new TelemetrySerialManager();
const resourceManager = new ResourceManager(300);
```

### 2. 连接设备

```typescript
await serialManager.selectPort();
await serialManager.connect(115200);
```

### 3. 附加管理器

```typescript
resourceManager.attach(serialManager);
```

### 4. 访问资源数据

```typescript
// 获取当前数据
const current = resourceManager.getCurrentData();
if (current) {
  console.log(`CPU: ${current.cpuUsage}%`);
  console.log(`RAM: ${current.ramUsage}%`);
  console.log(`Speed: ${(current.speed / 1000).toFixed(1)} m/s`);
  console.log(`Servo: ${(current.servoAngle / 10).toFixed(1)}°`);
}

// 获取统计信息
const stats = resourceManager.getStats();
console.log(`平均 CPU: ${stats.cpuUsageAvg}%`);
console.log(`最大 RAM: ${stats.ramUsageMax}%`);

// 获取最近 5 秒的数据
const recent = resourceManager.getDataSince(Date.now() - 5000);
console.log(`最近 5 秒数据点: ${recent.length}`);
```

### 5. 实时监控

```typescript
setInterval(() => {
  const current = resourceManager.getCurrentData();
  if (current) {
    updateUI({
      cpu: current.cpuUsage,
      ram: current.ramUsage,
      speed: (current.speed / 1000).toFixed(1),
      servo: (current.servoAngle / 10).toFixed(1),
    });
  }

  const stats = resourceManager.getStats();
  updateStats({
    avgCpu: stats.cpuUsageAvg,
    maxCpu: stats.cpuUsageMax,
    avgRam: stats.ramUsageAvg,
  });
}, 100);
```

### 6. 清理资源

```typescript
resourceManager.detach();
await serialManager.disconnect();
```

---

## 性能指标

| 指标 | 值 |
|------|-----|
| 帧处理延迟 | < 0.5ms |
| 统计计算延迟 | < 0.05ms |
| 数据查询延迟（300帧） | < 1ms |
| 内存占用（300帧） | ~30KB |
| 缓冲管理复杂度 | O(1) |

---

## 常见用法

### 实时仪表盘显示

```typescript
const resourceManager = new ResourceManager();
resourceManager.attach(serialManager);

setInterval(() => {
  const data = resourceManager.getCurrentData();
  if (data) {
    document.getElementById('cpu').textContent = `${data.cpuUsage}%`;
    document.getElementById('ram').textContent = `${data.ramUsage}%`;
    document.getElementById('speed').textContent = `${(data.speed / 1000).toFixed(2)} m/s`;
    document.getElementById('servo').textContent = `${(data.servoAngle / 10).toFixed(1)}°`;
  }
}, 100);
```

### 数据统计分析

```typescript
setInterval(() => {
  const stats = resourceManager.getStats();
  console.log(`
    CPU 使用情况:
      平均: ${stats.cpuUsageAvg.toFixed(2)}%
      最大: ${stats.cpuUsageMax}%
      最小: ${stats.cpuUsageMin}%
    
    RAM 使用情况:
      平均: ${stats.ramUsageAvg.toFixed(2)}%
      最大: ${stats.ramUsageMax}%
      最小: ${stats.ramUsageMin}%
    
    速度统计:
      平均: ${(stats.speedAvg / 1000).toFixed(2)} m/s
      最大: ${(stats.speedMax / 1000).toFixed(2)} m/s
      最小: ${(stats.speedMin / 1000).toFixed(2)} m/s
  `);
}, 10000); // 每 10 秒输出一次
```

### 缓冲区监控

```typescript
setInterval(() => {
  const utilization = resourceManager.getBufferUtilization();
  const size = resourceManager.getBufferSize();
  
  console.log(`缓冲区: ${size} / 300 (${utilization.toFixed(1)}%)`);
  
  if (utilization > 90) {
    console.warn('资源缓冲区即将满！');
  }
}, 1000);
```

### 时间范围数据查询

```typescript
// 获取最近 1 分钟的数据
const oneMinuteAgo = Date.now() - 60000;
const recentData = resourceManager.getDataSince(oneMinuteAgo);

// 计算平均值
const avgCpu = recentData.reduce((sum, d) => sum + d.cpuUsage, 0) / recentData.length;
const avgRam = recentData.reduce((sum, d) => sum + d.ramUsage, 0) / recentData.length;

console.log(`过去 1 分钟:`);
console.log(`  平均 CPU: ${avgCpu.toFixed(2)}%`);
console.log(`  平均 RAM: ${avgRam.toFixed(2)}%`);
console.log(`  数据点: ${recentData.length}`);
```

### 单位转换示例

```typescript
const data = resourceManager.getCurrentData();

if (data) {
  // 速度转换：mm/s → m/s
  const speedMs = data.speed / 1000;

  // 舵机角度转换：度×10 → 度
  const servoAngle = data.servoAngle / 10;

  // 内存占用率计算（假设总内存 2048 字节）
  const totalMemory = 2048;
  const usedMemory = totalMemory - data.freeXDATA - data.freeEDATA;
  const memoryPercent = (usedMemory / totalMemory) * 100;

  console.log(`
    速度: ${speedMs.toFixed(2)} m/s
    舵机: ${servoAngle.toFixed(1)}°
    内存: ${memoryPercent.toFixed(1)}%
  `);
}
```

---

## 错误处理

### "Invalid CPU usage"

**原因:** CPU 占用率超出 0-100% 范围

**解决:**
- 检查 MCU 端的 CPU 占用率计算
- 确认帧数据未损坏

### "Invalid RAM usage"

**原因:** RAM 占用率超出 0-100% 范围

**解决:**
- 检查 MCU 端的 RAM 占用率计算
- 验证帧校验和正确性

### 缓冲区满

**原因:** 资源帧接收速率超过处理速度

**解决:**
- 增加 `maxBufferSize`
- 检查设备连接和数据流
- 降低采样频率

### 内存占用过高

**原因:** 缓冲区太大或长时间运行

**解决:**
- 定期清空数据（`clear()`）
- 使用 `getDataSince()` 查询近期数据
- 减小 `maxBufferSize`
