/**
 * 二进制文件回放控制器
 *
 * 读取 Theia Monitor .bin 录制文件，通过 FrameParser 解析后注入 serialManager 事件管道。
 *
 * 格式:
 *   Owner:   "Theia Monitor" (13 bytes, UTF-8)
 *   Magic:   "THEIAv1" (7 bytes)
 *   [Chunk]:
 *     delta_ms: uint16 LE (2 bytes) — 距上一个 chunk 的毫秒数
 *     data_len: uint16 LE (2 bytes)
 *     data:     uint8[data_len]
 */
import { FrameParser, FrameParseError } from './parser';
import type { TelemetryFrame } from './protocol';
import type { TelemetrySerialManager } from './manager';

export type ReplayState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'finished';

export interface ReplayEvents {
  onStateChange?: (state: ReplayState) => void;
  onProgress?: (current: number, total: number) => void;
}

const MAGIC = new Uint8Array([0x54, 0x48, 0x45, 0x49, 0x41, 0x76, 0x31]); // "THEIAv1"
const HEADER_LEN = 13 + MAGIC.length; // owner + magic

export class ReplayController {
  private parser = new FrameParser();
  private serialManager: TelemetrySerialManager;

  private frames: TelemetryFrame[] = [];
  private _state: ReplayState = 'idle';
  private _fileName = '';
  private _currentIdx = 0;
  private _playTimer: ReturnType<typeof setInterval> | null = null;
  private _nextFrameTime = 0;
  private _speed = 1.0;

  /** 每帧对应的 delta 时间（ms），与 frames 一一对应 */
  private _deltas: number[] = [];

  private events: ReplayEvents = {};

  constructor(serialManager: TelemetrySerialManager) {
    this.serialManager = serialManager;
  }

  get state(): ReplayState { return this._state; }
  get fileName(): string { return this._fileName; }
  get currentIndex(): number { return this._currentIdx; }
  get totalFrames(): number { return this.frames.length; }
  get speed(): number { return this._speed; }
  set speed(v: number) { this._speed = Math.max(0.01, Math.min(10.0, v)); }

  setEvents(e: ReplayEvents) { this.events = e; }

  /** 加载 .bin 文件并解析全部帧 */
  async loadFile(file: File): Promise<void> {
    this._state = 'loading';
    this.events.onStateChange?.('loading');

    const buf = await file.arrayBuffer();
    const data = new Uint8Array(buf);
    this._fileName = file.name;

    this._parse(data);

    this._currentIdx = 0;
    this._state = 'ready';
    this.events.onStateChange?.('ready');
    this.events.onProgress?.(0, this.frames.length);

    const kb = (data.length / 1024).toFixed(0);
    const totalMs = this._deltas.reduce((a, b) => a + b, 0);
    console.log(`[replay] 加载完成: ${this.frames.length} 帧, ${kb} KB, 录制时长 ${(totalMs / 1000).toFixed(1)}s`);
  }

  /** 开始/继续播放 */
  play(): void {
    if (this._state !== 'ready' && this._state !== 'paused') return;
    this._state = 'playing';
    this.events.onStateChange?.('playing');
    this._nextFrameTime = performance.now();
    this._playTimer = setInterval(() => this._tick(), 0);
  }

  /** 暂停 */
  pause(): void {
    if (this._state !== 'playing') return;
    this._state = 'paused';
    this.events.onStateChange?.('paused');
    if (this._playTimer !== null) {
      clearInterval(this._playTimer);
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
    this._deltas = [];
    this.parser.reset();
    this._currentIdx = 0;
    this._fileName = '';
    this._state = 'idle';
    this.events.onStateChange?.('idle');
  }

  /* ================================================================
   * 内部 — 加载
   * ================================================================ */

  /** 解析 Theia Monitor 录制文件，计算每帧的 delta 时间 */
  private _parse(data: Uint8Array): void {
    this.frames = [];
    this._deltas = [];
    this.parser.reset();

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let off = HEADER_LEN;

    let absTime = 0;       // 当前 chunk 的绝对时间戳（ms）
    let lastEmitTime = 0;  // 上一个帧的绝对时间戳
    let isFirstChunk = true;

    while (off + 4 <= data.length) {
      const deltaMs = view.getUint16(off, true); off += 2;
      const len = view.getUint16(off, true); off += 2;

      if (off + len > data.length) {
        console.warn(`[replay] chunk 越界: off=${off} len=${len} total=${data.length}`);
        break;
      }

      // 首 chunk 不计时（start → 首数据到达的延迟对回放无意义）
      if (!isFirstChunk) absTime += deltaMs;
      isFirstChunk = false;

      const rawChunk = data.slice(off, off + len);
      off += len;

      const results = this.parser.parse(rawChunk);
      for (const r of results) {
        if (!(r instanceof FrameParseError)) {
          this.frames.push(r);
          this._deltas.push(absTime - lastEmitTime);
          lastEmitTime = absTime;
        }
      }
    }
    this.parser.reset();
  }

  /* ================================================================
   * 内部 — 播放
   * ================================================================ */

  private _tick(): void {
    if (this._state !== 'playing') return;

    // setInterval polling avoids Chrome's 4ms setTimeout nesting clamp.
    const now = performance.now();
    if (now < this._nextFrameTime) return;

    // Emit the entire chunk: all frames that arrived in the same USB packet.
    // Only the first frame of a chunk carries the inter-chunk delta;
    // subsequent frames have delta=0 (same absTime in _parse).
    do {
      this._emitFrame(this._currentIdx);
      this._currentIdx++;
    } while (
      this._currentIdx < this.frames.length &&
      (this._deltas[this._currentIdx] ?? 0) === 0
    );

    this.events.onProgress?.(this._currentIdx, this.frames.length);

    if (this._currentIdx >= this.frames.length) {
      this._onFinished();
      return;
    }

    // Wait exactly the recorded inter-chunk interval
    const delta = this._deltas[this._currentIdx] ?? 0;
    this._nextFrameTime += (delta / this._speed) || 0;
  }

  private _emitFrame(idx: number): void {
    const f = this.frames[idx];
    if (!f) return;
    this.serialManager.emit({ type: 'FRAME', frame: f });
  }

  private _onFinished(): void {
    this._state = 'finished';
    this.events.onStateChange?.('finished');
    if (this._playTimer !== null) {
      clearInterval(this._playTimer);
      this._playTimer = null;
    }
  }
}
