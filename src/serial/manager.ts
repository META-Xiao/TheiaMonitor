import { SerialPortManager, SerialOptions } from './port';
import { FrameParser, FrameParseError } from './parser';
import { TelemetryFrame, BAUDRATE } from './protocol';

/**
 * 串口通信事件
 */
export type SerialEvent =
  | { type: 'CONNECTED'; info?: Record<string, unknown> }
  | { type: 'DISCONNECTED' }
  | { type: 'FRAME'; frame: TelemetryFrame }
  | { type: 'FRAME_ERROR'; error: FrameParseError }
  | { type: 'ERROR'; error: Error };

export type SerialEventHandler = (event: SerialEvent) => void;

/**
 * 遥测串口通信管理器
 *
 * 功能：
 * - WebSerial 端口管理
 * - 帧解析和验证
 * - 事件分发
 */
export class TelemetrySerialManager {
  private portManager: SerialPortManager;
  private frameParser: FrameParser;
  private eventHandlers: Set<SerialEventHandler> = new Set();
  private isReading = false;
  private readAbortController: AbortController | null = null;

  constructor() {
    this.portManager = new SerialPortManager();
    this.frameParser = new FrameParser();
  }

  /**
   * 检查 WebSerial 支持
   */
  static isSupported(): boolean {
    return SerialPortManager.isSupported();
  }

  /**
   * 请求选择串口
   */
  async selectPort(): Promise<void> {
    await this.portManager.requestPort();
  }

  /**
   * 连接串口
   */
  async connect(baudRate: number = BAUDRATE): Promise<void> {
    try {
      await this.portManager.open(baudRate);
      this.emitEvent({ type: 'CONNECTED' });
      this.startReading();
    } catch (error) {
      this.emitEvent({
        type: 'ERROR',
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    this.stopReading();
    await this.portManager.close();
    this.emitEvent({ type: 'DISCONNECTED' });
  }

  /**
   * 获取连接状态
   */
  isConnected(): boolean {
    return this.portManager.getIsOpen();
  }

  /**
   * 订阅事件
   */
  on(handler: SerialEventHandler): () => void {
    this.eventHandlers.add(handler);
    // 返回取消订阅函数
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  /**
   * 取消订阅事件
   */
  off(handler: SerialEventHandler): void {
    this.eventHandlers.delete(handler);
  }

  /**
   * 发送数据
   */
  async write(data: Uint8Array): Promise<void> {
    await this.portManager.write(data);
  }

  /**
   * 私有方法：开始读取数据
   */
  private startReading(): void {
    if (this.isReading) return;

    this.isReading = true;
    this.readAbortController = new AbortController();

    this.readLoop().catch((error) => {
      if (error.name !== 'AbortError') {
        this.emitEvent({
          type: 'ERROR',
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    });
  }

  /**
   * 私有方法：停止读取数据
   */
  private stopReading(): void {
    this.isReading = false;
    if (this.readAbortController) {
      this.readAbortController.abort();
      this.readAbortController = null;
    }
  }

  /**
   * 私有方法：读取循环
   */
  private async readLoop(): Promise<void> {
    try {
      for await (const bytes of this.portManager.readBytes()) {
        if (!this.isReading) break;

        // 解析帧
        console.debug('[MCU RX]', bytes);
        const results = this.frameParser.parse(bytes);

        for (const result of results) {
          if (result instanceof FrameParseError) {
            this.emitEvent({ type: 'FRAME_ERROR', error: result });
          } else {
            this.emitEvent({ type: 'FRAME', frame: result });
          }
        }
      }
    } catch (error) {
      if (this.isReading) {
        throw error;
      }
    }
  }

  /**
   * 公开方法：分发事件（用于测试）
   */
  emit(event: SerialEvent): void {
    this.emitEvent(event);
  }

  /**
   * 私有方法：分发事件
   */
  private emitEvent(event: SerialEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('Error in event handler:', error);
      }
    }
  }
}
