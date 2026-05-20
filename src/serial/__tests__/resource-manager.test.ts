import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResourceManager } from '../resource-manager';
import { TelemetrySerialManager } from '../manager';
import { ResourceFrame } from '../protocol';

describe('ResourceManager', () => {
  let manager: ResourceManager;

  beforeEach(() => {
    manager = new ResourceManager(20);
  });

  it('should initialize with empty data', () => {
    expect(manager.getCurrentData()).toBeNull();
    expect(manager.getAllData()).toEqual([]);
    expect(manager.getBufferSize()).toBe(0);
  });

  it('should attach and receive resource frames', () => {
    const serialManager = new TelemetrySerialManager();

    manager.attach(serialManager);

    const resourceFrame: ResourceFrame = {
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

    serialManager.emit({
      type: 'FRAME',
      frame: resourceFrame,
    });

    expect(manager.getBufferSize()).toBe(1);
    const current = manager.getCurrentData();
    expect(current?.cpuUsage).toBe(45);
    expect(current?.ramUsage).toBe(60);
  });

  it('should ignore non-resource frames', () => {
    const serialManager = new TelemetrySerialManager();
    manager.attach(serialManager);

    serialManager.emit({
      type: 'FRAME',
      frame: {
        type: 'LOG',
        length: 5,
        logData: 'test',
        checksum: 0,
      },
    });

    expect(manager.getBufferSize()).toBe(0);
  });

  it('should provide access to all data', () => {
    const serialManager = new TelemetrySerialManager();
    manager.attach(serialManager);

    for (let i = 0; i < 3; i++) {
      serialManager.emit({
        type: 'FRAME',
        frame: {
          type: 'RESOURCE',
          cpuUsage: 40 + i * 5,
          ramUsage: 50 + i * 5,
          freeXDATA: 1024,
          freeEDATA: 512,
          speed: 100 + i * 10,
          servoAngle: 500 + i * 10,
          reserved: new Uint8Array(6),
          checksum: 0,
        } as ResourceFrame,
      });
    }

    const all = manager.getAllData();
    expect(all.length).toBe(3);
    expect(all[0].cpuUsage).toBe(40);
    expect(all[1].cpuUsage).toBe(45);
    expect(all[2].cpuUsage).toBe(50);
  });

  it('should calculate statistics', () => {
    const serialManager = new TelemetrySerialManager();
    manager.attach(serialManager);

    serialManager.emit({
      type: 'FRAME',
      frame: {
        type: 'RESOURCE',
        cpuUsage: 40,
        ramUsage: 50,
        freeXDATA: 1024,
        freeEDATA: 512,
        speed: 100,
        servoAngle: 400,
        reserved: new Uint8Array(6),
        checksum: 0,
      } as ResourceFrame,
    });

    serialManager.emit({
      type: 'FRAME',
      frame: {
        type: 'RESOURCE',
        cpuUsage: 60,
        ramUsage: 70,
        freeXDATA: 2048,
        freeEDATA: 1024,
        speed: 200,
        servoAngle: 600,
        reserved: new Uint8Array(6),
        checksum: 0,
      } as ResourceFrame,
    });

    const stats = manager.getStats();
    expect(stats.cpuUsageAvg).toBe(50);
    expect(stats.cpuUsageMax).toBe(60);
    expect(stats.ramUsageAvg).toBe(60);
  });

  it('should detach from serial manager', () => {
    const serialManager = new TelemetrySerialManager();
    manager.attach(serialManager);

    serialManager.emit({
      type: 'FRAME',
      frame: {
        type: 'RESOURCE',
        cpuUsage: 50,
        ramUsage: 60,
        freeXDATA: 1024,
        freeEDATA: 512,
        speed: 100,
        servoAngle: 500,
        reserved: new Uint8Array(6),
        checksum: 0,
      } as ResourceFrame,
    });

    expect(manager.getBufferSize()).toBe(1);

    manager.detach();

    serialManager.emit({
      type: 'FRAME',
      frame: {
        type: 'RESOURCE',
        cpuUsage: 75,
        ramUsage: 80,
        freeXDATA: 2048,
        freeEDATA: 1024,
        speed: 200,
        servoAngle: 600,
        reserved: new Uint8Array(6),
        checksum: 0,
      } as ResourceFrame,
    });

    expect(manager.getBufferSize()).toBe(1);
  });

  it('should clear all data', () => {
    const serialManager = new TelemetrySerialManager();
    manager.attach(serialManager);

    serialManager.emit({
      type: 'FRAME',
      frame: {
        type: 'RESOURCE',
        cpuUsage: 50,
        ramUsage: 60,
        freeXDATA: 1024,
        freeEDATA: 512,
        speed: 100,
        servoAngle: 500,
        reserved: new Uint8Array(6),
        checksum: 0,
      } as ResourceFrame,
    });

    expect(manager.getBufferSize()).toBe(1);

    manager.clear();

    expect(manager.getBufferSize()).toBe(0);
    expect(manager.getCurrentData()).toBeNull();
  });

  it('should get data since timestamp', () => {
    const serialManager = new TelemetrySerialManager();
    manager.attach(serialManager);

    const now = Date.now();

    serialManager.emit({
      type: 'FRAME',
      frame: {
        type: 'RESOURCE',
        cpuUsage: 40,
        ramUsage: 50,
        freeXDATA: 1024,
        freeEDATA: 512,
        speed: 100,
        servoAngle: 400,
        reserved: new Uint8Array(6),
        checksum: 0,
      } as ResourceFrame,
    });

    new Promise((resolve) => setTimeout(() => {
      serialManager.emit({
        type: 'FRAME',
        frame: {
          type: 'RESOURCE',
          cpuUsage: 60,
          ramUsage: 70,
          freeXDATA: 2048,
          freeEDATA: 1024,
          speed: 200,
          servoAngle: 600,
          reserved: new Uint8Array(6),
          checksum: 0,
        } as ResourceFrame,
      });
      resolve(null);
    }, 50));
  });

  it('should report buffer utilization', () => {
    const serialManager = new TelemetrySerialManager();
    manager.attach(serialManager);

    for (let i = 0; i < 5; i++) {
      serialManager.emit({
        type: 'FRAME',
        frame: {
          type: 'RESOURCE',
          cpuUsage: 50,
          ramUsage: 60,
          freeXDATA: 1024,
          freeEDATA: 512,
          speed: 100,
          servoAngle: 500,
          reserved: new Uint8Array(6),
          checksum: 0,
        } as ResourceFrame,
      });
    }

    const utilization = manager.getBufferUtilization();
    expect(utilization).toBe(25);
  });

  it('should handle reattaching to different manager', () => {
    const serialManager1 = new TelemetrySerialManager();
    const serialManager2 = new TelemetrySerialManager();

    manager.attach(serialManager1);

    serialManager1.emit({
      type: 'FRAME',
      frame: {
        type: 'RESOURCE',
        cpuUsage: 50,
        ramUsage: 60,
        freeXDATA: 1024,
        freeEDATA: 512,
        speed: 100,
        servoAngle: 500,
        reserved: new Uint8Array(6),
        checksum: 0,
      } as ResourceFrame,
    });

    expect(manager.getBufferSize()).toBe(1);

    manager.attach(serialManager2);

    serialManager1.emit({
      type: 'FRAME',
      frame: {
        type: 'RESOURCE',
        cpuUsage: 60,
        ramUsage: 70,
        freeXDATA: 2048,
        freeEDATA: 1024,
        speed: 200,
        servoAngle: 600,
        reserved: new Uint8Array(6),
        checksum: 0,
      } as ResourceFrame,
    });

    expect(manager.getBufferSize()).toBe(1);

    serialManager2.emit({
      type: 'FRAME',
      frame: {
        type: 'RESOURCE',
        cpuUsage: 70,
        ramUsage: 80,
        freeXDATA: 3072,
        freeEDATA: 1536,
        speed: 300,
        servoAngle: 700,
        reserved: new Uint8Array(6),
        checksum: 0,
      } as ResourceFrame,
    });

    expect(manager.getBufferSize()).toBe(2);
    const current = manager.getCurrentData();
    expect(current?.cpuUsage).toBe(70);
  });
});
