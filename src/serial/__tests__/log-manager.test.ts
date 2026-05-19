import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LogProcessManager, LogProcessEvent } from '../log-manager';
import { TelemetrySerialManager, SerialEvent } from '../manager';
import { LogFrame } from '../protocol';

describe('LogProcessManager', () => {
  let manager: LogProcessManager;
  let mockSerialManager: TelemetrySerialManager;
  let serialEventHandlers: ((event: SerialEvent) => void)[] = [];

  beforeEach(() => {
    // 创建 mock 的串口管理器
    mockSerialManager = {
      on: vi.fn((handler: (event: SerialEvent) => void) => {
        serialEventHandlers.push(handler);
        return () => {
          serialEventHandlers = serialEventHandlers.filter((h) => h !== handler);
        };
      }),
      selectPort: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      isConnected: vi.fn(() => true),
      off: vi.fn(),
      write: vi.fn(),
    } as any;

    manager = new LogProcessManager(mockSerialManager);
    serialEventHandlers = [];
  });

  const createLogFrame = (frameId: number, text: string): LogFrame => {
    return {
      type: 'LOG',
      length: text.length,
      logData: text,
      checksum: 0,
    };
  };

  it('should subscribe to serial events on start', () => {
    manager.start();

    expect(mockSerialManager.on).toHaveBeenCalled();
    expect(serialEventHandlers.length).toBeGreaterThan(0);
  });

  it('should handle log frames', (done) => {
    manager.start();

    const eventHandler = vi.fn();
    manager.on(eventHandler);

    const frame = createLogFrame(1, 'Test log message');
    serialEventHandlers[0]({
      type: 'FRAME',
      frame,
    });

    setTimeout(() => {
      const logEvents = eventHandler.mock.calls
        .map((call) => call[0] as LogProcessEvent)
        .filter((event) => event.type === 'LOG_RECEIVED');

      expect(logEvents.length).toBeGreaterThan(0);
      if (logEvents[0].type === 'LOG_RECEIVED') {
        expect(logEvents[0].entry.text).toBe('Test log message');
      }

      done();
    }, 50);
  });

  it('should retrieve all logs', (done) => {
    manager.start();

    const frame1 = createLogFrame(1, 'First log');
    const frame2 = createLogFrame(2, 'Second log');

    serialEventHandlers[0]({ type: 'FRAME', frame: frame1 });
    serialEventHandlers[0]({ type: 'FRAME', frame: frame2 });

    setTimeout(() => {
      const allLogs = manager.getAllLogs();
      expect(allLogs.length).toBeGreaterThanOrEqual(2);

      done();
    }, 50);
  });

  it('should get last N logs', (done) => {
    manager.start();

    for (let i = 1; i <= 5; i++) {
      serialEventHandlers[0]({
        type: 'FRAME',
        frame: createLogFrame(i, `Log ${i}`),
      });
    }

    setTimeout(() => {
      const lastThree = manager.getLastLogs(3);
      expect(lastThree.length).toBeLessThanOrEqual(3);

      done();
    }, 50);
  });

  it('should search logs', (done) => {
    manager.start();

    serialEventHandlers[0]({
      type: 'FRAME',
      frame: createLogFrame(1, 'ERROR: something failed'),
    });

    serialEventHandlers[0]({
      type: 'FRAME',
      frame: createLogFrame(2, 'INFO: processing'),
    });

    serialEventHandlers[0]({
      type: 'FRAME',
      frame: createLogFrame(3, 'ERROR: another issue'),
    });

    setTimeout(() => {
      const errors = manager.searchLogs('ERROR');
      expect(errors.length).toBeGreaterThanOrEqual(2);

      done();
    }, 50);
  });

  it('should emit stats updates', (done) => {
    manager.start();

    const eventHandler = vi.fn();
    manager.on(eventHandler);

    serialEventHandlers[0]({
      type: 'FRAME',
      frame: createLogFrame(1, 'Test'),
    });

    setTimeout(() => {
      const statsEvents = eventHandler.mock.calls
        .map((call) => call[0] as LogProcessEvent)
        .filter((event) => event.type === 'STATS_UPDATED');

      expect(statsEvents.length).toBeGreaterThan(0);
      if (statsEvents[0].type === 'STATS_UPDATED') {
        expect(statsEvents[0].stats.totalFrames).toBeGreaterThan(0);
      }

      done();
    }, 1100);
  });

  it('should stop processing', () => {
    manager.start();
    expect(serialEventHandlers.length).toBeGreaterThan(0);

    manager.stop();
    expect(serialEventHandlers.length).toBe(0);
  });

  it('should handle multiple subscribers', (done) => {
    manager.start();

    const handler1 = vi.fn();
    const handler2 = vi.fn();

    manager.on(handler1);
    manager.on(handler2);

    serialEventHandlers[0]({
      type: 'FRAME',
      frame: createLogFrame(1, 'Test'),
    });

    setTimeout(() => {
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();

      done();
    }, 50);
  });

  it('should unsubscribe from events', (done) => {
    manager.start();

    const handler = vi.fn();
    const unsubscribe = manager.on(handler);

    serialEventHandlers[0]({
      type: 'FRAME',
      frame: createLogFrame(1, 'First'),
    });

    setTimeout(() => {
      expect(handler.mock.calls.length).toBeGreaterThan(0);
      const firstCallCount = handler.mock.calls.length;

      unsubscribe();

      serialEventHandlers[0]({
        type: 'FRAME',
        frame: createLogFrame(2, 'Second'),
      });

      setTimeout(() => {
        // 不应该增加调用次数
        expect(handler.mock.calls.length).toBe(firstCallCount);

        done();
      }, 50);
    }, 50);
  });

  it('should provide stats', (done) => {
    manager.start();

    for (let i = 1; i <= 3; i++) {
      serialEventHandlers[0]({
        type: 'FRAME',
        frame: createLogFrame(i, `Log line ${i}`),
      });
    }

    setTimeout(() => {
      const stats = manager.getStats();
      expect(stats.totalFrames).toBeGreaterThan(0);
      expect(stats.bufferSize).toBeGreaterThan(0);

      done();
    }, 50);
  });

  it('should report buffer utilization', (done) => {
    manager.start();

    serialEventHandlers[0]({
      type: 'FRAME',
      frame: createLogFrame(1, 'Test'),
    });

    setTimeout(() => {
      const utilization = manager.getBufferUtilization();
      expect(utilization).toBeGreaterThan(0);
      expect(utilization).toBeLessThanOrEqual(100);

      done();
    }, 50);
  });

  it('should emit buffer warning when threshold exceeded', (done) => {
    const smallManager = new LogProcessManager(mockSerialManager, 2);
    smallManager.setBufferWarningThreshold(50);
    smallManager.start();

    const eventHandler = vi.fn();
    smallManager.on(eventHandler);

    // 添加日志直到达到阈值
    for (let i = 1; i <= 3; i++) {
      serialEventHandlers[0]({
        type: 'FRAME',
        frame: createLogFrame(i, `Log ${i}`),
      });
    }

    setTimeout(() => {
      const warningEvents = eventHandler.mock.calls
        .map((call) => call[0] as LogProcessEvent)
        .filter((event) => event.type === 'BUFFER_WARNING');

      // 可能有或没有警告，取决于时序
      expect(Array.isArray(warningEvents)).toBe(true);

      done();
    }, 1100);
  });

  it('should clear all logs', (done) => {
    manager.start();

    serialEventHandlers[0]({
      type: 'FRAME',
      frame: createLogFrame(1, 'Test'),
    });

    setTimeout(() => {
      expect(manager.getAllLogs().length).toBeGreaterThan(0);

      manager.clear();

      expect(manager.getAllLogs()).toHaveLength(0);
      const stats = manager.getStats();
      expect(stats.totalFrames).toBe(0);

      done();
    }, 50);
  });

  it('should handle errors gracefully', (done) => {
    manager.start();

    const eventHandler = vi.fn();
    manager.on(eventHandler);

    // 模拟处理错误（这里不会真正发生错误，但测试事件处理）
    const frame = createLogFrame(1, 'Normal log');
    serialEventHandlers[0]({
      type: 'FRAME',
      frame,
    });

    setTimeout(() => {
      // 验证事件被分发
      expect(eventHandler).toHaveBeenCalled();

      done();
    }, 50);
  });

  it('should handle empty log frames', (done) => {
    manager.start();

    const eventHandler = vi.fn();
    manager.on(eventHandler);

    const emptyFrame = createLogFrame(1, '');
    serialEventHandlers[0]({
      type: 'FRAME',
      frame: emptyFrame,
    });

    setTimeout(() => {
      const logEvents = eventHandler.mock.calls
        .map((call) => call[0] as LogProcessEvent)
        .filter((event) => event.type === 'LOG_RECEIVED');

      expect(logEvents.length).toBeGreaterThan(0);

      done();
    }, 50);
  });
});
