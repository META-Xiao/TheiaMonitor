import { LogFrame } from './protocol';

/**
 * 日志条目
 */
export interface LogEntry {
  id: number;              // 唯一ID，用于去重
  text: string;            // 日志文本
  timestamp: number;       // 接收时间（ms）
  lineCount: number;       // 行数
}

/**
 * 日志帧处理器
 *
 * 功能：
 * - 解析日志帧中的文本数据
 * - 分行处理日志
 * - 缓存日志条目
 */
export class LogFrameProcessor {
  private lastProcessedEntry: LogEntry | null = null;
  private entryCounter: number = 0;

  /**
   * 处理日志帧
   * @param frame 原始日志帧
   * @returns 处理后的日志条目
   */
  process(frame: LogFrame): LogEntry {
    if (!frame.logData || frame.logData.length === 0) {
      return {
        id: this.entryCounter++,
        text: '',
        timestamp: Date.now(),
        lineCount: 0,
      };
    }

    const lineCount = frame.logData.split('\n').length;

    const entry: LogEntry = {
      id: this.entryCounter++,
      text: frame.logData,
      timestamp: Date.now(),
      lineCount,
    };

    this.lastProcessedEntry = entry;
    return entry;
  }

  /**
   * 获取最后处理的日志条目
   */
  getLastEntry(): LogEntry | null {
    return this.lastProcessedEntry;
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.lastProcessedEntry = null;
    this.entryCounter = 0;
  }
}

/**
 * 日志数据存储
 *
 * 功能：
 * - 维护日志缓冲
 * - 日志统计（收到数、行数、字节数等）
 * - 去重
 */
export class LogDataStore {
  private logBuffer: LogEntry[] = [];
  private readonly maxBufferSize: number;

  // 统计
  private totalFrames: number = 0;
  private totalLines: number = 0;
  private totalBytes: number = 0;
  private lastFrameId: number = -1;

  constructor(maxBufferSize: number = 1000) {
    this.maxBufferSize = maxBufferSize;
  }

  /**
   * 存储新日志条目
   */
  storeLog(entry: LogEntry): void {
    this.totalFrames++;
    this.totalLines += entry.lineCount;
    this.totalBytes += entry.text.length;
    this.logBuffer.push(entry);

    // 缓冲管理（保留最新的 maxBufferSize 条）
    if (this.logBuffer.length > this.maxBufferSize) {
      const removed = this.logBuffer.shift();
      if (removed) {
        this.totalBytes -= removed.text.length;
      }
    }

    this.lastFrameId = entry.id;
  }

  /**
   * 获取所有日志
   */
  getAllLogs(): LogEntry[] {
    return [...this.logBuffer];
  }

  /**
   * 获取最后N条日志
   */
  getLastLogs(count: number): LogEntry[] {
    return this.logBuffer.slice(-count);
  }

  /**
   * 获取指定ID的日志
   */
  getLogById(id: number): LogEntry | null {
    return this.logBuffer.find((log) => log.id === id) || null;
  }

  /**
   * 搜索日志（子字符串匹配）
   */
  searchLogs(query: string, caseSensitive: boolean = false): LogEntry[] {
    const searchStr = caseSensitive ? query : query.toLowerCase();
    return this.logBuffer.filter((log) => {
      const text = caseSensitive ? log.text : log.text.toLowerCase();
      return text.includes(searchStr);
    });
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalFrames: number;
    bufferSize: number;
    totalLines: number;
    totalBytes: number;
    averageBytesPerFrame: number;
  } {
    return {
      totalFrames: this.totalFrames,
      bufferSize: this.logBuffer.length,
      totalLines: this.totalLines,
      totalBytes: this.totalBytes,
      averageBytesPerFrame:
        this.totalFrames > 0 ? Math.round(this.totalBytes / this.totalFrames) : 0,
    };
  }

  /**
   * 清空所有日志
   */
  clear(): void {
    this.logBuffer = [];
    this.totalFrames = 0;
    this.totalLines = 0;
    this.totalBytes = 0;
    this.lastFrameId = -1;
  }

  /**
   * 重置统计信息（保留日志）
   */
  resetStats(): void {
    this.totalFrames = 0;
    this.totalLines = this.logBuffer.reduce((sum, log) => sum + log.lineCount, 0);
    this.totalBytes = this.logBuffer.reduce((sum, log) => sum + log.text.length, 0);
  }

  /**
   * 获取缓冲区占用率
   */
  getBufferUtilization(): number {
    return (this.logBuffer.length / this.maxBufferSize) * 100;
  }
}
