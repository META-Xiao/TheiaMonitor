import { describe, it, expect, beforeEach } from 'vitest';
import { ResourceFrameProcessor, ResourceDataStore, ProcessedResourceData } from '../resource-processor';
import { ResourceFrame } from '../protocol';

describe('ResourceFrameProcessor', () => {
  let processor: ResourceFrameProcessor;

  beforeEach(() => {
    processor = new ResourceFrameProcessor();
  });

  it('should process valid resource frame', () => {
    const frame: ResourceFrame = {
      type: 'RESOURCE',
      cpuUsage: 45,
      ramUsage: 60,
      freeXDATA: 1024,
      freeEDATA: 512,
      speed: 100,
      servoAngle: 500,
      reserved: new Uint8Array(6),
      checksum: 0,
    };

    const processed = processor.process(frame);

    expect(processed.cpuUsage).toBe(45);
    expect(processed.ramUsage).toBe(60);
    expect(processed.freeXDATA).toBe(1024);
    expect(processed.freeEDATA).toBe(512);
    expect(processed.speed).toBe(100);
    expect(processed.servoAngle).toBe(500);
    expect(processed.timestamp).toBeGreaterThan(0);
  });

  it('should throw error for invalid CPU usage above 100', () => {
    const frame: ResourceFrame = {
      type: 'RESOURCE',
      cpuUsage: 105,
      ramUsage: 50,
      freeXDATA: 1024,
      freeEDATA: 512,
      speed: 100,
      servoAngle: 500,
      reserved: new Uint8Array(6),
      checksum: 0,
    };

    expect(() => processor.process(frame)).toThrow('Invalid CPU usage');
  });

  it('should throw error for invalid CPU usage below 0', () => {
    const frame: ResourceFrame = {
      type: 'RESOURCE',
      cpuUsage: -1,
      ramUsage: 50,
      freeXDATA: 1024,
      freeEDATA: 512,
      speed: 100,
      servoAngle: 500,
      reserved: new Uint8Array(6),
      checksum: 0,
    };

    expect(() => processor.process(frame)).toThrow('Invalid CPU usage');
  });

  it('should throw error for invalid RAM usage above 100', () => {
    const frame: ResourceFrame = {
      type: 'RESOURCE',
      cpuUsage: 50,
      ramUsage: 105,
      freeXDATA: 1024,
      freeEDATA: 512,
      speed: 100,
      servoAngle: 500,
      reserved: new Uint8Array(6),
      checksum: 0,
    };

    expect(() => processor.process(frame)).toThrow('Invalid RAM usage');
  });

  it('should throw error for invalid RAM usage below 0', () => {
    const frame: ResourceFrame = {
      type: 'RESOURCE',
      cpuUsage: 50,
      ramUsage: -1,
      freeXDATA: 1024,
      freeEDATA: 512,
      speed: 100,
      servoAngle: 500,
      reserved: new Uint8Array(6),
      checksum: 0,
    };

    expect(() => processor.process(frame)).toThrow('Invalid RAM usage');
  });

  it('should cache last processed frame', () => {
    const frame: ResourceFrame = {
      type: 'RESOURCE',
      cpuUsage: 50,
      ramUsage: 60,
      freeXDATA: 1024,
      freeEDATA: 512,
      speed: 100,
      servoAngle: 500,
      reserved: new Uint8Array(6),
      checksum: 0,
    };

    expect(processor.getLastFrame()).toBeNull();

    processor.process(frame);
    const lastFrame = processor.getLastFrame();

    expect(lastFrame).not.toBeNull();
    expect(lastFrame?.cpuUsage).toBe(50);
  });

  it('should clear last processed frame', () => {
    const frame: ResourceFrame = {
      type: 'RESOURCE',
      cpuUsage: 50,
      ramUsage: 60,
      freeXDATA: 1024,
      freeEDATA: 512,
      speed: 100,
      servoAngle: 500,
      reserved: new Uint8Array(6),
      checksum: 0,
    };

    processor.process(frame);
    expect(processor.getLastFrame()).not.toBeNull();

    processor.clear();
    expect(processor.getLastFrame()).toBeNull();
  });

  it('should accept edge case values 0 and 100 for percentages', () => {
    const frame: ResourceFrame = {
      type: 'RESOURCE',
      cpuUsage: 0,
      ramUsage: 100,
      freeXDATA: 0,
      freeEDATA: 65535,
      speed: -32768,
      servoAngle: 32767,
      reserved: new Uint8Array(6),
      checksum: 0,
    };

    const processed = processor.process(frame);
    expect(processed.cpuUsage).toBe(0);
    expect(processed.ramUsage).toBe(100);
  });
});

describe('ResourceDataStore', () => {
  let store: ResourceDataStore;

  beforeEach(() => {
    store = new ResourceDataStore(10);
  });

  it('should store resource data', () => {
    const data: ProcessedResourceData = {
      cpuUsage: 50,
      ramUsage: 60,
      freeXDATA: 1024,
      freeEDATA: 512,
      speed: 100,
      servoAngle: 500,
      timestamp: Date.now(),
    };

    store.storeData(data);
    expect(store.getBufferSize()).toBe(1);
  });

  it('should get current data', () => {
    const data: ProcessedResourceData = {
      cpuUsage: 50,
      ramUsage: 60,
      freeXDATA: 1024,
      freeEDATA: 512,
      speed: 100,
      servoAngle: 500,
      timestamp: Date.now(),
    };

    store.storeData(data);
    const current = store.getCurrentData();

    expect(current).not.toBeNull();
    expect(current?.cpuUsage).toBe(50);
  });

  it('should get all data', () => {
    const data1: ProcessedResourceData = {
      cpuUsage: 50,
      ramUsage: 60,
      freeXDATA: 1024,
      freeEDATA: 512,
      speed: 100,
      servoAngle: 500,
      timestamp: Date.now(),
    };

    const data2: ProcessedResourceData = {
      cpuUsage: 60,
      ramUsage: 70,
      freeXDATA: 2048,
      freeEDATA: 1024,
      speed: 200,
      servoAngle: 600,
      timestamp: Date.now() + 100,
    };

    store.storeData(data1);
    store.storeData(data2);

    const all = store.getAllData();
    expect(all.length).toBe(2);
    expect(all[0].cpuUsage).toBe(50);
    expect(all[1].cpuUsage).toBe(60);
  });

  it('should calculate statistics correctly', () => {
    store.storeData({
      cpuUsage: 40,
      ramUsage: 50,
      freeXDATA: 1000,
      freeEDATA: 500,
      speed: 100,
      servoAngle: 400,
      timestamp: Date.now(),
    });

    store.storeData({
      cpuUsage: 60,
      ramUsage: 70,
      freeXDATA: 2000,
      freeEDATA: 1000,
      speed: 200,
      servoAngle: 600,
      timestamp: Date.now() + 100,
    });

    const stats = store.getStats();

    expect(stats.cpuUsageAvg).toBe(50);
    expect(stats.cpuUsageMax).toBe(60);
    expect(stats.cpuUsageMin).toBe(40);
    expect(stats.ramUsageAvg).toBe(60);
    expect(stats.ramUsageMax).toBe(70);
    expect(stats.ramUsageMin).toBe(50);
    expect(stats.speedAvg).toBe(150);
    expect(stats.speedMax).toBe(200);
    expect(stats.speedMin).toBe(100);
    expect(stats.servoAngleAvg).toBe(500);
    expect(stats.servoAngleMax).toBe(600);
    expect(stats.servoAngleMin).toBe(400);
  });

  it('should limit buffer size', () => {
    for (let i = 0; i < 15; i++) {
      store.storeData({
        cpuUsage: i,
        ramUsage: i,
        freeXDATA: i * 100,
        freeEDATA: i * 50,
        speed: i * 10,
        servoAngle: i * 20,
        timestamp: Date.now() + i * 100,
      });
    }

    expect(store.getBufferSize()).toBe(10);
  });

  it('should get data since timestamp', () => {
    const now = Date.now();

    store.storeData({
      cpuUsage: 50,
      ramUsage: 60,
      freeXDATA: 1024,
      freeEDATA: 512,
      speed: 100,
      servoAngle: 500,
      timestamp: now - 1000,
    });

    store.storeData({
      cpuUsage: 60,
      ramUsage: 70,
      freeXDATA: 2048,
      freeEDATA: 1024,
      speed: 200,
      servoAngle: 600,
      timestamp: now,
    });

    const recent = store.getDataSince(now - 500);
    expect(recent.length).toBe(1);
    expect(recent[0].cpuUsage).toBe(60);
  });

  it('should handle empty stats', () => {
    const stats = store.getStats();

    expect(stats.cpuUsageAvg).toBe(0);
    expect(stats.cpuUsageMax).toBe(0);
    expect(stats.cpuUsageMin).toBe(0);
    expect(stats.ramUsageAvg).toBe(0);
    expect(stats.ramUsageMax).toBe(0);
    expect(stats.ramUsageMin).toBe(0);
  });

  it('should clear all data and reset stats', () => {
    store.storeData({
      cpuUsage: 50,
      ramUsage: 60,
      freeXDATA: 1024,
      freeEDATA: 512,
      speed: 100,
      servoAngle: 500,
      timestamp: Date.now(),
    });

    expect(store.getBufferSize()).toBe(1);

    store.clear();

    expect(store.getBufferSize()).toBe(0);
    expect(store.getCurrentData()).toBeNull();

    const stats = store.getStats();
    expect(stats.cpuUsageAvg).toBe(0);
  });

  it('should calculate buffer utilization', () => {
    store.storeData({
      cpuUsage: 50,
      ramUsage: 60,
      freeXDATA: 1024,
      freeEDATA: 512,
      speed: 100,
      servoAngle: 500,
      timestamp: Date.now(),
    });

    const utilization = store.getBufferUtilization();
    expect(utilization).toBe(10);
  });

  it('should recalculate stats after buffer overflow', () => {
    for (let i = 0; i < 12; i++) {
      store.storeData({
        cpuUsage: 50 + i,
        ramUsage: 60 + i,
        freeXDATA: 1024,
        freeEDATA: 512,
        speed: 100 + i * 10,
        servoAngle: 500 + i * 10,
        timestamp: Date.now() + i * 100,
      });
    }

    const stats = store.getStats();
    expect(stats.cpuUsageMax).toBeLessThanOrEqual(61);
    expect(stats.cpuUsageMin).toBeGreaterThanOrEqual(52);
  });

  it('should handle negative speed values', () => {
    store.storeData({
      cpuUsage: 50,
      ramUsage: 60,
      freeXDATA: 1024,
      freeEDATA: 512,
      speed: -100,
      servoAngle: 500,
      timestamp: Date.now(),
    });

    store.storeData({
      cpuUsage: 50,
      ramUsage: 60,
      freeXDATA: 1024,
      freeEDATA: 512,
      speed: 100,
      servoAngle: 500,
      timestamp: Date.now() + 100,
    });

    const stats = store.getStats();
    expect(stats.speedAvg).toBe(0);
    expect(stats.speedMax).toBe(100);
    expect(stats.speedMin).toBe(-100);
  });
});
