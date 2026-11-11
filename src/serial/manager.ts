import { SerialPortManager, TcpPortManager, deviceNameFromInfo } from './port';
import { FrameParser, FrameParseError } from './parser';
import { TelemetryFrame, BAUDRATE } from './protocol';

export type SerialEvent =
  | { type: 'CONNECTED'; info?: Record<string, unknown> }
  | { type: 'DISCONNECTED' }
  | { type: 'FRAME'; frame: TelemetryFrame }
  | { type: 'FRAME_ERROR'; error: FrameParseError }
  | { type: 'ERROR'; error: Error };

export type SerialEventHandler = (event: SerialEvent) => void;

export type TransportMode = 'serial' | 'tcp';

export class TelemetrySerialManager {
  private serialPort: SerialPortManager;
  private tcpPort: TcpPortManager;
  private frameParser: FrameParser;
  private eventHandlers: Set<SerialEventHandler> = new Set();
  private rawHandlers: Set<(data: Uint8Array) => void> = new Set();
  private isReading = false;
  private readAbortController: AbortController | null = null;
  private mode: TransportMode = 'serial';

  constructor() {
    this.serialPort = new SerialPortManager();
    this.tcpPort = new TcpPortManager();
    this.frameParser = new FrameParser();
    this.tcpPort.onStreamReset(() => { this.frameParser = new FrameParser(); });

    this.tcpPort.onData((data: Uint8Array) => {
      if (!this.isReading) return;
      for (const h of this.rawHandlers) {
        try { h(data); } catch (e) { console.error(e); }
      }
      const results = this.frameParser.parse(data);
      for (const result of results) {
        if (result instanceof FrameParseError) {
          this.emitEvent({ type: 'FRAME_ERROR', error: result });
        } else {
          this.emitEvent({ type: 'FRAME', frame: result });
        }
      }
    });

    this.tcpPort.onDisconnect(() => {
      if (this.mode === 'tcp') {
        this.isReading = false;
        this.emitEvent({ type: 'DISCONNECTED' });
      }
    });
  }

  static isSerialSupported(): boolean {
    return SerialPortManager.isSupported();
  }

  static isTcpSupported(): boolean {
    return TcpPortManager.isSupported();
  }

  /** 请求选择串口 (仅 serial 模式) */
  async selectPort(): Promise<void> {
    await this.serialPort.requestPort();
  }

  /** 串口连接 (兼容旧 API) */
  async connect(baudRate: number = BAUDRATE): Promise<void> {
    await this.connectSerial(baudRate);
  }

  /** 串口连接 */
  async connectSerial(baudRate: number = BAUDRATE): Promise<void> {
    try {
      await this.serialPort.open(baudRate);
      this.mode = 'serial';
      const info = this.serialPort.getPortInfo();
      const name = info ? deviceNameFromInfo(info) : "Serial";
      this.emitEvent({ type: 'CONNECTED', info: { deviceName: name, transport: 'serial' } });
      this.startReadingSerial();
    } catch (error) {
      this.emitEvent({ type: 'ERROR', error: error instanceof Error ? error : new Error(String(error)) });
      throw error;
    }
  }

  /** TCP 连接 */
  async connectTcp(ip: string, port: number): Promise<void> {
    this.frameParser = new FrameParser();
    console.log('[Manager] connectTcp called:', ip, port);
    try {
      await this.tcpPort.connect(ip, port);
      console.log('[Manager] tcpPort.connect OK');
      this.mode = 'tcp';
      this.isReading = true;
      this.emitEvent({ type: 'CONNECTED', info: { deviceName: `${ip}:${port}`, transport: 'tcp' } });
    } catch (error) {
      console.error('[Manager] connectTcp failed:', error);
      this.emitEvent({ type: 'ERROR', error: error instanceof Error ? error : new Error(String(error)) });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.isReading = false;
    if (this.readAbortController) { this.readAbortController.abort(); this.readAbortController = null; }
    if (this.mode === 'serial') await this.serialPort.close();
    else await this.tcpPort.close();
    this.emitEvent({ type: 'DISCONNECTED' });
  }

  isConnected(): boolean {
    return this.mode === 'serial' ? this.serialPort.getIsOpen() : this.tcpPort.getIsOpen();
  }

  getMode(): TransportMode { return this.mode; }

  on(handler: SerialEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => { this.eventHandlers.delete(handler); };
  }

  off(handler: SerialEventHandler): void { this.eventHandlers.delete(handler); }

  onRawData(handler: (data: Uint8Array) => void): () => void {
    this.rawHandlers.add(handler);
    return () => { this.rawHandlers.delete(handler); };
  }

  async write(data: Uint8Array): Promise<void> {
    if (this.mode === 'serial') await this.serialPort.write(data);
    else await this.tcpPort.write(data);
  }

  private startReadingSerial(): void {
    if (this.isReading) return;
    this.isReading = true;
    this.readAbortController = new AbortController();
    this.readLoopSerial().catch((error) => {
      if ((error as Error).name !== 'AbortError') {
        this.emitEvent({ type: 'ERROR', error: error instanceof Error ? error : new Error(String(error)) });
      }
    });
  }

  private async readLoopSerial(): Promise<void> {
    try {
      for await (const bytes of this.serialPort.readBytes()) {
        if (!this.isReading) break;
        for (const h of this.rawHandlers) {
          try { h(bytes); } catch (e) { console.error(e); }
        }
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
      if (this.isReading) throw error;
    }
  }

  emit(event: SerialEvent): void { this.emitEvent(event); }

  private emitEvent(event: SerialEvent): void {
    for (const handler of this.eventHandlers) {
      try { handler(event); } catch (e) { console.error(e); }
    }
  }
}
