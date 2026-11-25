import { getDesktopBridge } from '../desktop';
import { BrowserTcpPort } from './browser-tcp';

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

const USB_NAMES: Record<number, string> = {
  0x0403: "FTDI",
  0x10C4: "CP210x",
  0x1A86: "CH340",
  0x067B: "PL2303",
  0x2341: "Arduino",
  0x239A: "Adafruit",
  0x0483: "STM32",
  0x1D50: "OpenMoko",
  0x16C0: "Teensy",
};

export function deviceNameFromInfo(info: SerialPortInfo): string {
  if (info.usbVendorId !== undefined) {
    const vendor = USB_NAMES[info.usbVendorId];
    const pid = info.usbProductId !== undefined ? `:${info.usbProductId.toString(16).toUpperCase().padStart(4, "0")}` : "";
    return vendor ? `${vendor}${pid}` : `VID:${info.usbVendorId.toString(16).toUpperCase().padStart(4, "0")}${pid}`;
  }
  return "Serial";
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
      const reader = this.reader;
      this.reader = null;
      try { await reader.cancel(); }
      finally { reader.releaseLock(); }
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
      try { await writer.write(data); }
      finally { writer.releaseLock(); }
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

/**
 * TCP 端口管理器：桌面走 Electron IPC，网页走 Vite WiFi 桥接。
 *
 * 接口与 SerialPortManager 对齐，TelemetrySerialManager 可无感切换。
 */
export class TcpPortManager {
  private browserPort = new BrowserTcpPort();
  private streamResetCallback: (() => void) | null = null;
  private unlisten: (() => void) | null = null;
  private isOpen = false;
  private readCallbacks: Array<(data: Uint8Array) => void> = [];
  private disconnectedCallback: (() => void) | null = null;
  static isSupported(): boolean { return Boolean(getDesktopBridge()) || BrowserTcpPort.isSupported(); }

  async connect(ip: string, port: number): Promise<void> {
    const desktop = getDesktopBridge();
    if (!desktop) return this.browserPort.connect(ip, port);
    if (this.unlisten) throw new Error('A WiFi listener is already active.');
    const unlisten = desktop.onTcpEvent((type, data) => {
      if (type === 'client-connected') this.streamResetCallback?.();
      else if (type === 'data' && data) {
        for (const cb of this.readCallbacks) {
          try { cb(data); } catch (e) { console.error(e); }
        }
      } else if (type === 'listener-closed' && this.unlisten === unlisten) {
        this.unlisten = null;
        this.isOpen = false;
        unlisten();
        this.disconnectedCallback?.();
      }
    });
    this.unlisten = unlisten;
    try {
      await desktop.tcpListen(port);
      if (this.unlisten !== unlisten) throw new Error('WiFi listener closed during startup.');
      this.isOpen = true;
    } catch (error) {
      if (this.unlisten === unlisten) {
        this.unlisten = null;
        unlisten();
      }
      throw error;
    }
  }

  async close(): Promise<void> {
    const desktop = getDesktopBridge();
    if (!desktop) return this.browserPort.close();
    const unlisten = this.unlisten;
    this.unlisten = null;
    this.isOpen = false;
    if (unlisten) {
      unlisten();
      await desktop.tcpStop();
    }
  }

  async write(data: Uint8Array): Promise<void> {
    const desktop = getDesktopBridge();
    if (!desktop) return this.browserPort.write(data);
    if (!this.isOpen) throw new Error('WiFi listener is not open.');
    await desktop.tcpSend(data);
  }

  onData(cb: (data: Uint8Array) => void): void { this.readCallbacks.push(cb); this.browserPort.onData(cb); }
  onDisconnect(cb: () => void): void { this.disconnectedCallback = cb; this.browserPort.onDisconnect(cb); }
  onStreamReset(cb: () => void): void { this.streamResetCallback = cb; this.browserPort.onStreamReset(cb); }
  getIsOpen(): boolean { return getDesktopBridge() ? this.isOpen : this.browserPort.getIsOpen(); }
}
