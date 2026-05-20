# 日志处理 API 文档

## 模块概述

两个核心模块：
- **log-processor.ts** - 低层日志处理（帧解析、数据存储）
- **log-manager.ts** - 高层事件管理（串口集成、事件分发）

---

## LogFrameProcessor

处理单个日志帧，解析日志文本数据。

### 构造函数

```typescript
constructor()
```

### 方法

#### process()

```typescript
process(frame: LogFrame): LogEntry
```

处理日志帧并返回日志条目。

**返回:** `LogEntry` 对象，包含：
- `id` - 唯一日志ID
- `text` - 日志文本内容
- `timestamp` - 接收时间戳（ms）
- `lineCount` - 日志行数

#### getLastEntry()

```typescript
getLastEntry(): LogEntry | null
```

获取最后处理的日志条目。

#### clear()

```typescript
clear(): void
```

清空缓存和计数器。

---

## LogDataStore

维护日志缓冲和统计信息。

### 构造函数

```typescript
constructor(maxBufferSize: number = 1000)
```

**参数:**
- `maxBufferSize` - 最大缓冲日志条数（默认 1000）

### 方法

#### storeLog()

```typescript
storeLog(entry: LogEntry): void
```

存储新日志条目。自动维护缓冲区大小和统计信息。

#### getAllLogs()

```typescript
getAllLogs(): LogEntry[]
```

返回缓冲区中的所有日志。

#### getLastLogs()

```typescript
getLastLogs(count: number): LogEntry[]
```

返回最后 N 条日志。

#### getLogById()

```typescript
getLogById(id: number): LogEntry | null
```

按 ID 查询日志。

#### searchLogs()

```typescript
searchLogs(query: string, caseSensitive?: boolean): LogEntry[]
```

搜索日志（子字符串匹配）。

**参数:**
- `query` - 搜索关键词
- `caseSensitive` - 是否区分大小写（默认 false）

#### getStats()

```typescript
getStats(): {
  totalFrames: number;
  bufferSize: number;
  totalLines: number;
  totalBytes: number;
  averageBytesPerFrame: number;
}
```

获取统计信息。

#### getBufferUtilization()

```typescript
getBufferUtilization(): number
```

获取缓冲区占用率（0-100）。

#### clear()

```typescript
clear(): void
```

清空所有日志和统计信息。

#### resetStats()

```typescript
resetStats(): void
```

重置统计信息，保留日志数据。

---

## LogProcessManager

高层管理器，集成串口通信和日志处理。

### 构造函数

```typescript
constructor(
  serialManager: TelemetrySerialManager,
  maxBufferSize?: number
)
```

**参数:**
- `serialManager` - TelemetrySerialManager 实例
- `maxBufferSize` - 最大缓冲日志数（默认 1000）

### 方法

#### start()

```typescript
start(): void
```

启动处理：
- 订阅串口管理器的帧事件
- 启动统计更新定时器（每秒一次）

#### stop()

```typescript
stop(): void
```

停止处理，清除所有订阅和定时器。

#### on()

```typescript
on(handler: LogProcessEventHandler): () => void
```

订阅事件。返回取消订阅函数。

#### off()

```typescript
off(handler: LogProcessEventHandler): void
```

取消订阅特定处理器。

#### getAllLogs()

```typescript
getAllLogs(): LogEntry[]
```

获取所有日志。

#### getLastLogs()

```typescript
getLastLogs(count: number): LogEntry[]
```

获取最后 N 条日志。

#### searchLogs()

```typescript
searchLogs(query: string, caseSensitive?: boolean): LogEntry[]
```

搜索日志。

#### getStats()

```typescript
getStats(): {
  totalFrames: number;
  bufferSize: number;
  totalLines: number;
  totalBytes: number;
  averageBytesPerFrame: number;
}
```

获取统计信息。

#### getBufferUtilization()

```typescript
getBufferUtilization(): number
```

获取缓冲区占用率（0-100）。

#### clear()

```typescript
clear(): void
```

清空所有日志。

#### setBufferWarningThreshold()

```typescript
setBufferWarningThreshold(percentage: number): void
```

设置缓冲区警告阈值。当缓冲区占用超过此百分比时发送 `BUFFER_WARNING` 事件。

---

## 事件类型

### LogProcessEvent

```typescript
type LogProcessEvent = 
  | {
      type: 'LOG_RECEIVED';
      entry: LogEntry;
    }
  | {
      type: 'STATS_UPDATED';
      stats: {...};
    }
  | {
      type: 'BUFFER_WARNING';
      utilization: number;
    }
  | {
      type: 'ERROR';
      error: Error;
    };
```

#### LOG_RECEIVED

接收到新日志条目时发送。

#### STATS_UPDATED

每秒发送一次统计信息更新。

#### BUFFER_WARNING

当缓冲区占用超过阈值时发送。

#### ERROR

处理错误时发送。

---

## 数据类型

### LogEntry

单条日志记录。

| 属性 | 类型 | 说明 |
|------|------|------|
| id | number | 唯一日志 ID |
| text | string | 日志文本内容 |
| timestamp | number | 接收时间戳（ms） |
| lineCount | number | 日志行数 |

---

## 使用流程

### 1. 初始化

```typescript
const serialManager = new TelemetrySerialManager();
const logManager = new LogProcessManager(serialManager, 1000);
```

### 2. 连接设备

```typescript
await serialManager.selectPort();
await serialManager.connect(115200);
```

### 3. 启动处理

```typescript
logManager.start();
```

### 4. 订阅事件

```typescript
logManager.on((event) => {
  if (event.type === 'LOG_RECEIVED') {
    console.log(event.entry.text);
  } else if (event.type === 'STATS_UPDATED') {
    console.log(`缓冲区: ${event.stats.bufferSize} / 1000`);
  } else if (event.type === 'BUFFER_WARNING') {
    console.warn(`缓冲区占用: ${event.utilization.toFixed(1)}%`);
  }
});
```

### 5. 访问日志

```typescript
// 获取所有日志
const allLogs = logManager.getAllLogs();

// 获取最后 10 条
const recent = logManager.getLastLogs(10);

// 搜索错误日志
const errors = logManager.searchLogs('ERROR');

// 获取统计信息
const stats = logManager.getStats();
console.log(`总行数: ${stats.totalLines}`);
console.log(`总字节: ${stats.totalBytes}`);
```

### 6. 清理资源

```typescript
logManager.stop();
await serialManager.disconnect();
```

---

## 性能指标

| 指标 | 值 |
|------|-----|
| 帧处理延迟 | < 1ms |
| 搜索延迟（1000条日志） | < 5ms |
| 内存占用（1000条日志） | ~50-100KB |
| 统计更新频率 | 1Hz |

---

## 常见用法

### 实时日志显示

```typescript
const recentLogs: LogEntry[] = [];

logManager.on((event) => {
  if (event.type === 'LOG_RECEIVED') {
    recentLogs.push(event.entry);
    if (recentLogs.length > 100) {
      recentLogs.shift(); // 保留最近 100 条
    }
    updateUI(recentLogs);
  }
});
```

### 日志过滤

```typescript
// 获取所有错误
const errors = logManager.searchLogs('ERROR');

// 获取所有警告
const warnings = logManager.searchLogs('WARN');

// 区分大小写搜索
const debugs = logManager.searchLogs('[DEBUG]', true);
```

### 缓冲区监控

```typescript
logManager.setBufferWarningThreshold(80);

logManager.on((event) => {
  if (event.type === 'BUFFER_WARNING') {
    console.warn(`日志缓冲区即将满: ${event.utilization.toFixed(1)}%`);
    // 可以选择清空旧日志或导出
    const oldLogs = logManager.getLastLogs(50);
    exportLogs(oldLogs);
  }
});
```

### 统计分析

```typescript
setInterval(() => {
  const stats = logManager.getStats();
  console.log(`
    总帧数: ${stats.totalFrames}
    日志行数: ${stats.totalLines}
    总大小: ${(stats.totalBytes / 1024).toFixed(2)} KB
    平均帧大小: ${stats.averageBytesPerFrame} bytes
  `);
}, 10000); // 每 10 秒输出一次
```

---

## 错误处理

### "Buffer size exceeded"

**原因:** 日志缓冲区已满（默认 1000 条）

**解决:** 
- 增加 `maxBufferSize`
- 定期清空旧日志
- 降低日志输出频率

### 内存占用过高

**原因:** 日志缓冲区太大或日志文本过长

**解决:**
- 监听 `BUFFER_WARNING` 事件
- 定期导出和清空日志
- 使用 `getLastLogs()` 而不是 `getAllLogs()`

