import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ImageProcessManager, ImageProcessEvent } from '../image-manager';
import { TelemetrySerialManager, SerialEvent } from '../manager';
import { ImageFrame } from '../protocol';

describe('ImageProcessManager', () => {
  let manager: ImageProcessManager;
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

    manager = new ImageProcessManager(mockSerialManager);
    serialEventHandlers = [];
  });

  const createImageFrame = (frameId: number): ImageFrame => {
    const imageData = new Uint8Array(188 * 120);
    // 填充渐变数据
    for (let i = 0; i < imageData.length; i++) {
      imageData[i] = i % 256;
    }

    return {
      type: 'IMAGE',
      frameId,
      fps: 25,
      imageData,
      checksum: 0,
    };
  };

  it('should subscribe to serial events on start', () => {
    manager.start();

    expect(mockSerialManager.on).toHaveBeenCalled();
    expect(serialEventHandlers.length).toBeGreaterThan(0);
  });

  it('should handle image frames', (done) => {
    manager.start();

    const eventHandler = vi.fn();
    manager.on(eventHandler);

    const frame = createImageFrame(1);
    serialEventHandlers[0]({
      type: 'FRAME',
      frame,
    });

    setTimeout(() => {
      expect(eventHandler).toHaveBeenCalled();

      const callArgs = eventHandler.mock.calls[0][0] as ImageProcessEvent;
      if (callArgs.type === 'IMAGE_RECEIVED') {
        expect(callArgs.data.frameId).toBe(1);
        expect(callArgs.data.fps).toBe(25);
        expect(callArgs.data.pixelData.length).toBe(188 * 120 * 4);
      }

      done();
    }, 50);
  });

  it('should maintain current image frame', (done) => {
    manager.start();

    const frame1 = createImageFrame(1);
    serialEventHandlers[0]({
      type: 'FRAME',
      frame: frame1,
    });

    setTimeout(() => {
      const current = manager.getCurrentImage();
      expect(current).not.toBeNull();
      expect(current?.frameId).toBe(1);

      const frame2 = createImageFrame(2);
      serialEventHandlers[0]({
        type: 'FRAME',
        frame: frame2,
      });

      setTimeout(() => {
        const current2 = manager.getCurrentImage();
        expect(current2?.frameId).toBe(2);
        done();
      }, 50);
    }, 50);
  });

  it('should emit stats updates', (done) => {
    manager.start();

    const eventHandler = vi.fn();
    manager.on(eventHandler);

    // 添加几个图像帧
    for (let i = 1; i <= 3; i++) {
      serialEventHandlers[0]({
        type: 'FRAME',
        frame: createImageFrame(i),
      });
    }

    // 等待统计更新（间隔为1000ms）
    setTimeout(() => {
      const statsEvents = eventHandler.mock.calls
        .map((call) => call[0] as ImageProcessEvent)
        .filter((event) => event.type === 'STATS_UPDATED');

      expect(statsEvents.length).toBeGreaterThan(0);

      if (statsEvents.length > 0 && statsEvents[0].type === 'STATS_UPDATED') {
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

    const frame = createImageFrame(1);
    serialEventHandlers[0]({
      type: 'FRAME',
      frame,
    });

    setTimeout(() => {
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
      done();
    }, 10);
  });

  it('should unsubscribe from events', (done) => {
    manager.start();

    const handler = vi.fn();
    const unsubscribe = manager.on(handler);

    const frame = createImageFrame(1);
    serialEventHandlers[0]({
      type: 'FRAME',
      frame,
    });

    setTimeout(() => {
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();

      serialEventHandlers[0]({
        type: 'FRAME',
        frame: createImageFrame(2),
      });

      setTimeout(() => {
        expect(handler).toHaveBeenCalledTimes(1); // 不会增加
        done();
      }, 10);
    }, 10);
  });

  it('should provide stats', (done) => {
    manager.start();

    for (let i = 1; i <= 5; i++) {
      serialEventHandlers[0]({
        type: 'FRAME',
        frame: createImageFrame(i),
      });
    }

    setTimeout(() => {
      const stats = manager.getStats();
      expect(stats.totalFrames).toBeGreaterThan(0);
      expect(stats.dropRate).toBeDefined();
      done();
    }, 50);
  });

  it('should clear data', (done) => {
    manager.start();

    serialEventHandlers[0]({
      type: 'FRAME',
      frame: createImageFrame(1),
    });

    setTimeout(() => {
      expect(manager.getCurrentImage()).not.toBeNull();

      manager.clear();

      expect(manager.getCurrentImage()).toBeNull();
      const stats = manager.getStats();
      expect(stats.totalFrames).toBe(0);

      done();
    }, 10);
  });

  it('should handle errors gracefully', (done) => {
    manager.start();

    const eventHandler = vi.fn();
    manager.on(eventHandler);

    // 模拟处理错误
    serialEventHandlers[0]({
      type: 'FRAME',
      frame: {
        type: 'IMAGE',
        frameId: 1,
        fps: 25,
        imageData: new Uint8Array(100), // 错误的大小会触发错误
        checksum: 0,
      } as any,
    });

    setTimeout(() => {
      const errorEvents = eventHandler.mock.calls
        .map((call) => call[0] as ImageProcessEvent)
        .filter((event) => event.type === 'ERROR');

      expect(errorEvents.length).toBeGreaterThan(0);
      done();
    }, 10);
  });
});
