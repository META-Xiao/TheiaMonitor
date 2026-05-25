import { describe, it, expect, beforeEach } from 'vitest';
import { ResourceFrameProcessor, ResourceDataStore, ProcessedResourceData } from '../resource-processor';
import { ResourceFrame } from '../protocol';

function makeFrame(resData: Uint8Array): ResourceFrame {
  return { type: 'RESOURCE', length: resData.length, resData, checksum: 0 };
}

describe('ResourceFrameProcessor', () => {
  let processor: ResourceFrameProcessor;

  beforeEach(() => {
    processor = new ResourceFrameProcessor();
  });

  // 默认 preset: CPU(u8) + RAM(u16) + ROM(u16) + Speed(i16) + Servo(i16) = 9B
  it('should parse resData into res[] according to default slots', () => {
    const resData = new Uint8Array([
      50,           // CPU = 50 (u8)
      0x56, 0x78,   // RAM = 0x5678 = 22136 (u16)
      0x12, 0x34,   // ROM = 0x1234 = 4660 (u16)
      0x00, 0x64,   // Speed = 100 (i16)
      0x00, 0xC8,   // Servo = 200 (i16)
    ]);

    const processed = processor.process(makeFrame(resData));

    expect(processed.res).toHaveLength(5);
    expect(processed.res[0]).toBe(50);    // CPU
    expect(processed.res[1]).toBe(0x5678); // RAM
    expect(processed.res[2]).toBe(0x1234); // ROM
    expect(processed.res[3]).toBe(100);   // Speed
    expect(processed.res[4]).toBe(200);   // Servo
    expect(processed.values).toHaveLength(5);
    expect(processed.timestamp).toBeGreaterThan(0);
  });

  it('should handle negative i16 values', () => {
    const resData = new Uint8Array([
      50, 0x12, 0x34, 0x56, 0x78,
      0xFF, 0x9C,   // Speed = -100 (i16)
      0x00, 0xC8,
    ]);

    const processed = processor.process(makeFrame(resData));
    expect(processed.res[3]).toBe(-100);
  });

  it('should handle edge values 0 and max', () => {
    const resData = new Uint8Array([
      0,            // CPU = 0
      0xFF, 0xFF,   // RAM = 65535
      0, 0,         // ROM = 0
      0x7F, 0xFF,   // Speed = 32767
      0x80, 0x00,   // Servo = -32768
    ]);

    const processed = processor.process(makeFrame(resData));
    expect(processed.res[0]).toBe(0);
    expect(processed.res[1]).toBe(65535);
    expect(processed.res[2]).toBe(0);
    expect(processed.res[3]).toBe(32767);
    expect(processed.res[4]).toBe(-32768);
  });

  it('should stop parsing when resData is shorter than total slot bytes', () => {
    const resData = new Uint8Array([50, 0x12]); // only 2 bytes, slots need 9

    const processed = processor.process(makeFrame(resData));
    expect(processed.res.length).toBeLessThan(5);
  });
});

describe('ResourceDataStore', () => {
  let store: ResourceDataStore;

  beforeEach(() => {
    store = new ResourceDataStore(10);
  });

  function makeData(cpu: number): ProcessedResourceData {
    return { res: [cpu, 0, 0, 0, 0], values: [cpu, 0, 0, 0, 0], timestamp: Date.now() };
  }

  it('should store and retrieve current data', () => {
    const data = makeData(50);
    store.storeData(data);
    expect(store.getBufferSize()).toBe(1);
    expect(store.getCurrentData()?.res[0]).toBe(50);
  });

  it('should get all data', () => {
    store.storeData(makeData(40));
    store.storeData(makeData(60));
    expect(store.getAllData()).toHaveLength(2);
  });

  it('should limit buffer size', () => {
    for (let i = 0; i < 15; i++) store.storeData(makeData(i));
    expect(store.getBufferSize()).toBe(10);
  });

  it('should filter data since timestamp', () => {
    const now = Date.now();
    store.storeData({ res: [50], values: [50], timestamp: now - 1000 });
    store.storeData({ res: [60], values: [60], timestamp: now });
    expect(store.getDataSince(now - 500)).toHaveLength(1);
  });

  it('should clear all data', () => {
    store.storeData(makeData(50));
    store.clear();
    expect(store.getBufferSize()).toBe(0);
    expect(store.getCurrentData()).toBeNull();
  });

  it('should calculate buffer utilization', () => {
    store.storeData(makeData(50));
    expect(store.getBufferUtilization()).toBe(10); // 1/10 * 100
  });
});
