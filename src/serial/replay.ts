/**
 * 二进制文件回放控制器
 *
 * 读取 MCU 输出的 .bin 文件，通过 FrameParser 解析后注入 serialManager 事件管道，
 * 复用现有的图像/日志/资源显示管线。支持播放/暂停/逐帧进退/重播。
 */
import { FrameParser, FrameParseError } from './parser';
import type { TelemetryFrame } from './protocol';
import type { TelemetrySerialManager } from './manager';

export type ReplayState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'finished';

export interface ReplayEvents {
  onStateChange?: (state: ReplayState) => void;
  onProgress?: (current: number, total: number) => void;
}

export class ReplayController {
  private parser = new FrameParser();
  private serialManager: TelemetrySerialManager;

  private frames: TelemetryFrame[] = [];
  private _state: ReplayState = 'idle';
  private _fileName = '';
  private _currentIdx = 0;
  private _playTimer: ReturnType<typeof setTimeout> | null = null;

  private events: ReplayEvents = {};

  constructor(serialManager: TelemetrySerialManager) {
    this.serialManager = serialManager;
  }

  get state(): ReplayState { return this._state; }
  get fileName(): string { return this._fileName; }
  get currentIndex(): number { return this._currentIdx; }
  get totalFrames(): number { return this.frames.length; }

  setEvents(e: ReplayEvents) { this.events = e; }

  /** 加载 .bin 文件并解析全部帧 */
  async loadFile(file: File): Promise<void> {
    this._state = 'loading';
    this.events.onStateChange?.('loading');

    const buf = await file.arrayBuffer();
    const data = new Uint8Array(buf);
    this._fileName = file.name;

    // 跳过开头不属于已知帧头的字节
    const FRAME_HEADERS = new Set([0xCC, 0xDD, 0xEE]);
    let start = 0;
    while (start < data.length && !FRAME_HEADERS.has(data[start])) start++;
    if (start > 0) {
      console.log(`[replay] 跳过开头 ${start} 字节无效数据`);
    }

    // 分块解析，模拟流式
    const CHUNK = 4096;
    this.frames = [];
    this.parser.reset();
    let pos = start;

    while (pos < data.length) {
      const end = Math.min(pos + CHUNK, data.length);
      const chunk = data.slice(pos, end);
      const results = this.parser.parse(chunk);
      for (const r of results) {
        if (!(r instanceof FrameParseError)) {
          this.frames.push(r);
        }
      }
      pos = end;
    }

    // 处理 parser 内部残留
    this.parser.reset();

    this._currentIdx = 0;
    this._state = 'ready';
    this.events.onStateChange?.('ready');
    this.events.onProgress?.(0, this.frames.length);

    console.log(`[replay] 加载完成: ${this.frames.length} 帧 (${(data.length / 1024).toFixed(0)} KB)`);
  }

  /** 开始/继续播放 */
  play(): void {
    if (this._state !== 'ready' && this._state !== 'paused') return;
    this._state = 'playing';
    this.events.onStateChange?.('playing');
    this._tick();
  }

  /** 暂停 */
  pause(): void {
    if (this._state !== 'playing') return;
    this._state = 'paused';
    this.events.onStateChange?.('paused');
    if (this._playTimer !== null) {
      clearTimeout(this._playTimer);
      this._playTimer = null;
    }
  }

  /** 快进一帧 */
  stepForward(): void {
    if (this._state !== 'paused' && this._state !== 'ready') return;
    if (this._currentIdx < this.frames.length) {
      this._emitFrame(this._currentIdx);
      this._currentIdx++;
      this.events.onProgress?.(this._currentIdx, this.frames.length);
      if (this._currentIdx >= this.frames.length) {
        this._onFinished();
      }
    }
  }

  /** 倒退一帧 */
  stepBackward(): void {
    if (this._state !== 'paused' && this._state !== 'ready' && this._state !== 'finished') return;
    if (this._currentIdx > 0) {
      this._currentIdx--;
      this._emitFrame(this._currentIdx);
      this.events.onProgress?.(this._currentIdx, this.frames.length);
      if (this._state === 'finished') {
        this._state = 'paused';
        this.events.onStateChange?.('paused');
      }
    }
  }

  /** 重播（从头开始） */
  replay(): void {
    if (this._state !== 'finished' && this._state !== 'paused') return;
    this._currentIdx = 0;
    this.events.onProgress?.(0, this.frames.length);
    this._state = 'ready';
    this.events.onStateChange?.('ready');
    this.play();
  }

  /** 退出回放 */
  exit(): void {
    this.pause();
    this.frames = [];
    this.parser.reset();
    this._currentIdx = 0;
    this._fileName = '';
    this._state = 'idle';
    this.events.onStateChange?.('idle');
  }

  /* ================================================================
   * 内部方法
   * ================================================================ */

  private _tick(): void {
    if (this._state !== 'playing') return;

    // 每 tick 连续发送多帧（LOG/RESOURCE 快发，IMAGE 帧单独发）
    const BATCH = 20;
    let sent = 0;

    while (this._currentIdx < this.frames.length && sent < BATCH) {
      const f = this.frames[this._currentIdx];
      // IMAGE 帧较大，每 tick 只发 1 帧，给 UI 渲染时间
      if (f.type === 'IMAGE' && sent > 0) break;
      this._emitFrame(this._currentIdx);
      this._currentIdx++;
      sent++;
    }

    this.events.onProgress?.(this._currentIdx, this.frames.length);

    if (this._currentIdx >= this.frames.length) {
      this._onFinished();
    } else {
      const delay = this.frames[this._currentIdx]?.type === 'IMAGE' ? 50 : 5;
      this._playTimer = setTimeout(() => this._tick(), delay);
    }
  }

  private _emitFrame(idx: number): void {
    const f = this.frames[idx];
    if (!f) return;

    // 注入 IMAGE 帧时需要保留原始 imageData 用于处理
    this.serialManager.emit({ type: 'FRAME', frame: f });
  }

  private _onFinished(): void {
    this._state = 'finished';
    this.events.onStateChange?.('finished');
    if (this._playTimer !== null) {
      clearTimeout(this._playTimer);
      this._playTimer = null;
    }
  }
}
