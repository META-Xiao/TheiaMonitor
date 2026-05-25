import { ResourceFrame } from './protocol';
import { resourceSlots, SLOT_BYTES, evalExpr } from '../stores/resourceSlots';

export interface ProcessedResourceData {
  res: number[];      // 按 slot 顺序的原始整数值
  values: number[];   // evalExpr 结果，与 resourceSlots 一一对应
  timestamp: number;
}

export type ResourceStats = Record<string, never>;

export class ResourceFrameProcessor {
  process(frame: ResourceFrame): ProcessedResourceData {
    const res: number[] = [];
    const view = new DataView(frame.resData.buffer, frame.resData.byteOffset, frame.resData.byteLength);
    let offset = 0;
    for (const slot of resourceSlots) {
      const bytes = SLOT_BYTES[slot.type];
      if (offset + bytes > frame.resData.byteLength) break;
      let v: number;
      switch (slot.type) {
        case 'u8':  v = frame.resData[offset]; break;
        case 'u16': v = view.getUint16(offset, false); break;
        case 'i16': v = view.getInt16(offset, false); break;
        case 'u32': v = view.getUint32(offset, false); break;
        case 'i32': v = view.getInt32(offset, false); break;
        case 'u64': v = Number(view.getBigUint64(offset, false)); break;
        case 'i64': v = Number(view.getBigInt64(offset, false)); break;
        default:    v = 0;
      }
      res.push(v);
      offset += bytes;
    }
    const values = resourceSlots.map(slot => evalExpr(slot.expr, res));
    return { res, values, timestamp: Date.now() };
  }

  clear(): void {}
}

export class ResourceDataStore {
  private buf: ProcessedResourceData[] = [];
  private readonly max: number;
  constructor(max = 300) { this.max = max; }

  storeData(d: ProcessedResourceData): void {
    this.buf.push(d);
    if (this.buf.length > this.max) this.buf.shift();
  }
  getCurrentData(): ProcessedResourceData | null {
    return this.buf.length ? this.buf[this.buf.length - 1] : null;
  }
  getAllData(): ProcessedResourceData[] { return [...this.buf]; }
  getDataSince(ts: number): ProcessedResourceData[] { return this.buf.filter(d => d.timestamp >= ts); }
  getStats(): ResourceStats { return {}; }
  getBufferSize(): number { return this.buf.length; }
  getBufferUtilization(): number { return (this.buf.length / this.max) * 100; }
  clear(): void { this.buf = []; }
}
