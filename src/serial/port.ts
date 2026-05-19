import { FRAME_TYPE, FRAME_SIZE } from './protocol';

/**
 * WebSerial API 类型定义
 */
declare global {
  interface Navigator {
    serial?: {
      requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
      getPorts(): Promise<SerialPort[]>;
      onconnect?: (event: SerialPortConnectEvent) => void;
      ondisconnect?: (event: SerialPortDisconnectEvent) => void;
    };
  }
}

export interface SerialPortRequestOptions {
  filters?: { usbVendorId?: number; usbProductId?: number }[];
}

export interface SerialPort {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  getInfo(): SerialPortInfo;
  open(options: SerialOptions): Promise<void>;
  close(): Promise<void>;
}

export interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

export interface SerialOptions {
  baudRate: number;
  dataBits?: number;
  stopBits?: number;
  parity?: 'none' | 'even' | 'odd';
  flowControl?: 'none' | 'hardware';
}

export interface SerialPortConnectEvent extends Event {
  target: SerialPort;
}

export interface SerialPortDisconnectEvent extends Event {
  target: SerialPort;
}

/**
 * WebSerial 端口管理器
 */
export class SerialPortManager {
  private port: SerialPort | null = null;
  private isOpen = false;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private readingAbortController: AbortController | null = null;

  /**
   * 检查浏览器是否支持 WebSerial API
   */
  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.serial;
  }

  /**
   * 请求用户选择串口
   */
  async requestPort(): Promise<void> {
    if (!SerialPortManager.isSupported()) {
      throw new Error('WebSerial API not supported in this browser');
    }

    try {
      this.port = await navigator.serial!.requestPort();
      console.log('Serial port selected:', this.port.getInfo());
    } catch (error) {
      if (error instanceof Error && error.name === 'NotFoundError') {
        throw new Error('No port selected');
      }
      throw error;
    }
  }

  /**
   * 打开串口
   */
  async open(baudRate: number = 115200): Promise<void> {
    if (!this.port) {
      throw new Error('No port selected. Call requestPort() first.');
    }

    try {
      await this.port.open({
        baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none',
      });
      this.isOpen = true;
      console.log(`Serial port opened at ${baudRate} baud`);
    } catch (error) {
      this.isOpen = false;
      throw new Error(`Failed to open serial port: ${error}`);
    }
  }

  /**
   * 关闭串口
   */
  async close(): Promise<void> {
    if (this.readingAbortController) {
      this.readingAbortController.abort();
    }

    if (this.reader) {
      await this.reader.cancel();
      this.reader = null;
    }

    if (this.port && this.isOpen) {
      await this.port.close();
      this.isOpen = false;
      console.log('Serial port closed');
    }
  }

  /**
   * 获取读取流的读取器
   */
  private async getReader(): Promise<ReadableStreamDefaultReader<Uint8Array>> {
    if (!this.port || !this.isOpen) {
      throw new Error('Serial port not open');
    }

    if (!this.reader) {
      this.reader = this.port.readable.getReader();
    }

    return this.reader;
  }

  /**
   * 开始接收数据（返回异步迭代器）
   */
  async *readBytes(): AsyncGenerator<Uint8Array, void, unknown> {
    const reader = await this.getReader();
    this.readingAbortController = new AbortController();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        yield value;
      }
    } finally {
      this.readingAbortController = null;
    }
  }

  /**
   * 写入数据到串口
   */
  async write(data: Uint8Array): Promise<void> {
    if (!this.port || !this.isOpen) {
      throw new Error('Serial port not open');
    }

    try {
      const writer = this.port.writable.getWriter();
      await writer.write(data);
      writer.releaseLock();
    } catch (error) {
      throw new Error(`Failed to write to serial port: ${error}`);
    }
  }

  /**
   * 获取端口信息
   */
  getPortInfo(): SerialPortInfo | null {
    return this.port?.getInfo() ?? null;
  }

  /**
   * 获取连接状态
   */
  getIsOpen(): boolean {
    return this.isOpen;
  }
}
