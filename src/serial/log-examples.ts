/**
 * 日志处理使用示例
 */

import {
  TelemetrySerialManager,
  LogProcessManager,
  LogProcessEvent,
  LogEntry,
} from './index';

// ============================================================================
// 示例 1：基本使用流程
// ============================================================================

async function basicLogExample() {
  const serialManager = new TelemetrySerialManager();
  const logManager = new LogProcessManager(serialManager, 1000);

  // 连接设备
  await serialManager.selectPort();
  await serialManager.connect(115200);

  // 启动日志处理
  logManager.start();

  // 订阅日志事件
  const unsubscribe = logManager.on((event: LogProcessEvent) => {
    switch (event.type) {
      case 'LOG_RECEIVED':
        console.log(`[${event.entry.id}] ${event.entry.text}`);
        break;

      case 'STATS_UPDATED':
        console.log(
          `日志统计: ${event.stats.bufferSize}/${1000} (${event.stats.totalLines} 行)`,
        );
        break;

      case 'BUFFER_WARNING':
        console.warn(`⚠️  日志缓冲区: ${event.utilization.toFixed(1)}%`);
        break;

      case 'ERROR':
        console.error('日志处理错误:', event.error);
        break;
    }
  });

  // 程序运行...

  unsubscribe();
  logManager.stop();
  await serialManager.disconnect();
}

// ============================================================================
// 示例 2：实时日志窗口（模拟UI）
// ============================================================================

class LogWindow {
  private logManager: LogProcessManager;
  private logs: LogEntry[] = [];
  private maxVisible: number = 100;

  constructor(logManager: LogProcessManager) {
    this.logManager = logManager;
    this.setupSubscriptions();
  }

  private setupSubscriptions() {
    this.logManager.on((event) => {
      if (event.type === 'LOG_RECEIVED') {
        this.addLog(event.entry);
      } else if (event.type === 'BUFFER_WARNING') {
        this.showWarning(`缓冲区占用 ${event.utilization.toFixed(1)}%`);
      }
    });
  }

  private addLog(entry: LogEntry) {
    this.logs.push(entry);

    // 只保留最近 100 条在内存中
    if (this.logs.length > this.maxVisible) {
      this.logs.shift();
    }

    this.render();
  }

  private showWarning(message: string) {
    console.warn(`[WARNING] ${message}`);
  }

  private render() {
    console.clear();
    console.log('=== 日志窗口 ===\n');

    for (const log of this.logs) {
      console.log(log.text);
    }

    const stats = this.logManager.getStats();
    console.log(`\n缓冲区: ${stats.bufferSize}/${1000}`);
  }

  public search(query: string) {
    return this.logManager.searchLogs(query);
  }

  public export() {
    return this.logManager.getAllLogs();
  }

  public clear() {
    this.logs = [];
    this.logManager.clear();
    this.render();
  }
}

// ============================================================================
// 示例 3：日志分析
// ============================================================================

class LogAnalyzer {
  private logManager: LogProcessManager;

  constructor(logManager: LogProcessManager) {
    this.logManager = logManager;
  }

  /**
   * 分类统计日志
   */
  analyzeLogLevels(): Record<string, number> {
    const allLogs = this.logManager.getAllLogs();
    const levels: Record<string, number> = {
      ERROR: 0,
      WARN: 0,
      INFO: 0,
      DEBUG: 0,
    };

    for (const log of allLogs) {
      if (log.text.includes('[ERROR]')) levels.ERROR++;
      else if (log.text.includes('[WARN]')) levels.WARN++;
      else if (log.text.includes('[INFO]')) levels.INFO++;
      else if (log.text.includes('[DEBUG]')) levels.DEBUG++;
    }

    return levels;
  }

  /**
   * 查找所有错误
   */
  findErrors(): LogEntry[] {
    return this.logManager.searchLogs('[ERROR]');
  }

  /**
   * 获取特定时间段的日志
   */
  getLogsBetweenTime(
    startTime: number,
    endTime: number,
  ): LogEntry[] {
    return this.logManager
      .getAllLogs()
      .filter((log) => log.timestamp >= startTime && log.timestamp <= endTime);
  }

  /**
   * 导出日志为文本
   */
  exportAsText(): string {
    const stats = this.logManager.getStats();
    const header = `
日志导出
================
生成时间: ${new Date().toISOString()}
总帧数: ${stats.totalFrames}
总行数: ${stats.totalLines}
总大小: ${(stats.totalBytes / 1024).toFixed(2)} KB
================\n\n`;

    const logText = this.logManager
      .getAllLogs()
      .map(
        (log) =>
          `[${new Date(log.timestamp).toISOString()}] ${log.text}`,
      )
      .join('\n');

    return header + logText;
  }
}

// ============================================================================
// 示例 4：带缓冲区管理的日志管理器
// ============================================================================

class ManagedLogManager {
  private logManager: LogProcessManager;
  private exportPath: string;

  constructor(logManager: LogProcessManager, exportPath: string) {
    this.logManager = logManager;
    this.exportPath = exportPath;

    // 设置缓冲区警告阈值为 85%
    this.logManager.setBufferWarningThreshold(85);

    this.setupAutoExport();
  }

  private setupAutoExport() {
    this.logManager.on((event) => {
      if (event.type === 'BUFFER_WARNING') {
        this.handleBufferWarning(event.utilization);
      }
    });
  }

  private handleBufferWarning(utilization: number) {
    console.log(
      `日志缓冲区警告: ${utilization.toFixed(1)}%, 开始导出...`,
    );

    // 导出当前日志
    const logs = this.logManager.getAllLogs();
    this.exportLogs(logs);

    // 清空缓冲区
    this.logManager.clear();

    console.log('日志已导出并清空');
  }

  private exportLogs(logs: LogEntry[]) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `logs_${timestamp}.json`;

    const data = {
      exportTime: new Date().toISOString(),
      logCount: logs.length,
      logs,
    };

    // 这里应该实现实际的文件导出
    console.log(`导出到: ${this.exportPath}/${filename}`);
    console.log(JSON.stringify(data, null, 2));
  }

  public getStats() {
    return this.logManager.getStats();
  }
}

// ============================================================================
// 示例 5：监听特定模式的日志
// ============================================================================

class PatternLogListener {
  private logManager: LogProcessManager;
  private patterns: Map<string, (log: LogEntry) => void> = new Map();

  constructor(logManager: LogProcessManager) {
    this.logManager = logManager;
    this.setupListener();
  }

  public addPattern(pattern: string, callback: (log: LogEntry) => void) {
    this.patterns.set(pattern, callback);
  }

  private setupListener() {
    this.logManager.on((event) => {
      if (event.type === 'LOG_RECEIVED') {
        for (const [pattern, callback] of this.patterns) {
          if (event.entry.text.includes(pattern)) {
            callback(event.entry);
          }
        }
      }
    });
  }
}

// ============================================================================
// 使用示例
// ============================================================================

async function example() {
  const serialManager = new TelemetrySerialManager();
  const logManager = new LogProcessManager(serialManager);

  await serialManager.selectPort();
  await serialManager.connect(115200);

  logManager.start();

  // 创建日志窗口
  const window = new LogWindow(logManager);

  // 创建日志分析器
  const analyzer = new LogAnalyzer(logManager);

  // 创建带管理的日志管理器
  const managed = new ManagedLogManager(logManager, './logs');

  // 创建模式监听器
  const listener = new PatternLogListener(logManager);

  listener.addPattern('[ERROR]', (log) => {
    console.error('发现错误:', log.text);
  });

  listener.addPattern('[CRITICAL]', (log) => {
    console.error('发现严重问题:', log.text);
    // 可以选择立即导出和重启
  });

  // 定期输出统计信息
  setInterval(() => {
    const stats = managed.getStats();
    console.log(`
统计信息:
- 缓冲区: ${stats.bufferSize}/1000
- 总行数: ${stats.totalLines}
- 平均帧大小: ${stats.averageBytesPerFrame} bytes
    `);
  }, 30000);
}

export { basicLogExample, LogWindow, LogAnalyzer, ManagedLogManager, PatternLogListener };
