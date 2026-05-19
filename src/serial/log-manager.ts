import { TelemetrySerialManager, SerialEvent } from './manager';
import { LogFrameProcessor, LogDataStore, LogEntry } from './log-processor';
import { LogFrame } from './protocol';

/**
 * 日志处理事件
 */
export type LogProcessEvent =
  | {
      type: 'LOG_RECEIVED';
      entry: LogEntry;
    }
  | {
      type: 'STATS_UPDATED';
      stats: ReturnType<LogDataStore['getStats']>;
    }
  | {
      type: 'BUFFER_WARNING';
      utilization: number;
    }
  | {
      type: 'ERROR';
      error: Error;
    };

export type LogProcessEventHandler = (event: LogProcessEvent) => void;

/**
 * 日志处理管理器
 *
 * 功能：
 * - 订阅串口管理器的帧事件
 * - 处理日志帧 (0xDD)
 * - 维护日志缓存和统计
 * - 分发处理事件到UI层
 */
export class LogProcessManager {
  private serialManager: TelemetrySerialManager;
  private processor: LogFrameProcessor;
  private store: LogDataStore;
  private eventHandlers: Set<LogProcessEventHandler> = new Set();
  private unsubscribeSerialEvents: (() => void) | null = null;
  private statsUpdateInterval: NodeJS.Timeout | null = null;
  private bufferWarningThreshold: number = 90; // 90%

  constructor(
    serialManager: TelemetrySerialManager,
    maxBufferSize: number = 1000,
  ) {
    this.serialManager = serialManager;
    this.processor = new LogFrameProcessor();
    this.store = new LogDataStore(maxBufferSize);
  }

  /**
   * 启动日志处理（订阅串口事件）
   */
  start(): void {
    if (this.unsubscribeSerialEvents) {
      return; // 已经启动
    }

    // 订阅串口事件
    this.unsubscribeSerialEvents = this.serialManager.on(
      (event: SerialEvent) => {
        try {
          if (event.type === 'FRAME' && event.frame.type === 'LOG') {
            this.handleLogFrame(event.frame as LogFrame);
          }
        } catch (error) {
          this.emitEvent({
            type: 'ERROR',
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      },
    );

    // 定期更新统计信息
    this.statsUpdateInterval = setInterval(() => {
      const stats = this.store.getStats();
      this.emitEvent({
        type: 'STATS_UPDATED',
        stats,
      });

      // 检查缓冲区警告
      const utilization = this.store.getBufferUtilization();
      if (utilization > this.bufferWarningThreshold) {
        this.emitEvent({
          type: 'BUFFER_WARNING',
          utilization,
        });
      }
    }, 1000);
  }

  /**
   * 停止日志处理
   */
  stop(): void {
    if (this.unsubscribeSerialEvents) {
      this.unsubscribeSerialEvents();
      this.unsubscribeSerialEvents = null;
    }

    if (this.statsUpdateInterval) {
      clearInterval(this.statsUpdateInterval);
      this.statsUpdateInterval = null;
    }
  }

  /**
   * 订阅日志处理事件
   */
  on(handler: LogProcessEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  /**
   * 取消订阅
   */
  off(handler: LogProcessEventHandler): void {
    this.eventHandlers.delete(handler);
  }

  /**
   * 获取所有日志
   */
  getAllLogs(): LogEntry[] {
    return this.store.getAllLogs();
  }

  /**
   * 获取最后N条日志
   */
  getLastLogs(count: number): LogEntry[] {
    return this.store.getLastLogs(count);
  }

  /**
   * 搜索日志
   */
  searchLogs(query: string, caseSensitive?: boolean): LogEntry[] {
    return this.store.searchLogs(query, caseSensitive);
  }

  /**
   * 获取统计信息
   */
  getStats(): ReturnType<LogDataStore['getStats']> {
    return this.store.getStats();
  }

  /**
   * 获取缓冲区占用率
   */
  getBufferUtilization(): number {
    return this.store.getBufferUtilization();
  }

  /**
   * 清空所有日志
   */
  clear(): void {
    this.store.clear();
    this.processor.clear();
  }

  /**
   * 设置缓冲区警告阈值
   */
  setBufferWarningThreshold(percentage: number): void {
    this.bufferWarningThreshold = Math.max(0, Math.min(100, percentage));
  }

  /**
   * 私有方法：处理日志帧
   */
  private handleLogFrame(frame: LogFrame): void {
    const entry = this.processor.process(frame);
    this.store.storeLog(entry);

    this.emitEvent({
      type: 'LOG_RECEIVED',
      entry,
    });
  }

  /**
   * 私有方法：分发事件
   */
  private emitEvent(event: LogProcessEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('Error in log process event handler:', error);
      }
    }
  }
}
