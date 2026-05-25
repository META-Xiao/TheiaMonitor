import { describe, it, expect, beforeEach } from 'vitest';
import { ResourceManager } from '../resource-manager';
import { TelemetrySerialManager } from '../manager';
import { ResourceFrame } from '../protocol';

function makeResFrame(cpu: number): ResourceFrame {
  const resData = new Uint8Array(9);
  resData[0] = cpu;
  // remaining bytes default to 0
  return { type: 'RESOURCE', length: 9, resData, checksum: 0 };
}

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

    serialManager.emit({ type: 'FRAME', frame: makeResFrame(45) });

    expect(manager.getBufferSize()).toBe(1);
    expect(manager.getCurrentData()?.res[0]).toBe(45);
  });

  it('should ignore non-resource frames', () => {
    const serialManager = new TelemetrySerialManager();
    manager.attach(serialManager);

    serialManager.emit({
      type: 'FRAME',
      frame: { type: 'LOG', length: 5, logData: 'test', checksum: 0 },
    });

    expect(manager.getBufferSize()).toBe(0);
  });

  it('should provide access to all data', () => {
    const serialManager = new TelemetrySerialManager();
    manager.attach(serialManager);

    for (let i = 0; i < 3; i++) {
      serialManager.emit({ type: 'FRAME', frame: makeResFrame(40 + i * 5) });
    }

    const all = manager.getAllData();
    expect(all.length).toBe(3);
    expect(all[0].res[0]).toBe(40);
    expect(all[1].res[0]).toBe(45);
    expect(all[2].res[0]).toBe(50);
  });

  it('should detach from serial manager', () => {
    const serialManager = new TelemetrySerialManager();
    manager.attach(serialManager);

    serialManager.emit({ type: 'FRAME', frame: makeResFrame(50) });
    expect(manager.getBufferSize()).toBe(1);

    manager.detach();

    serialManager.emit({ type: 'FRAME', frame: makeResFrame(75) });
    expect(manager.getBufferSize()).toBe(1); // unchanged
  });

  it('should clear all data', () => {
    const serialManager = new TelemetrySerialManager();
    manager.attach(serialManager);

    serialManager.emit({ type: 'FRAME', frame: makeResFrame(50) });
    expect(manager.getBufferSize()).toBe(1);

    manager.clear();
    expect(manager.getBufferSize()).toBe(0);
    expect(manager.getCurrentData()).toBeNull();
  });

  it('should handle reattaching to different manager', () => {
    const serialManager1 = new TelemetrySerialManager();
    const serialManager2 = new TelemetrySerialManager();

    manager.attach(serialManager1);
    serialManager1.emit({ type: 'FRAME', frame: makeResFrame(50) });
    expect(manager.getBufferSize()).toBe(1);

    manager.attach(serialManager2); // switches to manager2

    // manager1 events should be ignored now
    serialManager1.emit({ type: 'FRAME', frame: makeResFrame(60) });
    expect(manager.getBufferSize()).toBe(1);

    serialManager2.emit({ type: 'FRAME', frame: makeResFrame(70) });
    expect(manager.getBufferSize()).toBe(2);
    expect(manager.getCurrentData()?.res[0]).toBe(70);
  });

  it('should report buffer utilization', () => {
    const serialManager = new TelemetrySerialManager();
    manager.attach(serialManager);

    for (let i = 0; i < 5; i++) {
      serialManager.emit({ type: 'FRAME', frame: makeResFrame(50) });
    }

    expect(manager.getBufferUtilization()).toBe(25); // 5/20 * 100
  });
});
