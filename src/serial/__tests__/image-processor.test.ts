import { describe, it, expect, beforeEach } from 'vitest';
import {
  ImageFrameProcessor,
  ImageDataStore,
  ProcessedImageData,
} from '../image-processor';
import { ImageFrame } from '../protocol';

describe('ImageFrameProcessor', () => {
  const WIDTH = 188;
  const HEIGHT = 120;
  const TOTAL_PIXELS = WIDTH * HEIGHT;

  let processor: ImageFrameProcessor;

  beforeEach(() => {
    processor = new ImageFrameProcessor({
      imageWidth: WIDTH,
      imageHeight: HEIGHT,
      fps: 25,
    });
  });

  it('should process a valid grayscale image frame', () => {
    const imageData = new Uint8Array(TOTAL_PIXELS);
    for (let i = 0; i < TOTAL_PIXELS; i++) {
      imageData[i] = i % 256;
    }

    const frame: ImageFrame = {
      type: 'IMAGE',
      frameId: 100,
      length: 4 + TOTAL_PIXELS,
      width: WIDTH,
      height: HEIGHT,
      imageData,
      checksum: 0,
    };

    const processed = processor.process(frame);

    expect(processed.frameId).toBe(100);
    expect(processed.width).toBe(WIDTH);
    expect(processed.height).toBe(HEIGHT);
    expect(processed.pixelData.length).toBe(TOTAL_PIXELS * 4);
  });

  it('should correctly convert grayscale to RGBA', () => {
    const imageData = new Uint8Array(TOTAL_PIXELS);
    imageData[0] = 128;
    imageData[1] = 255;

    const frame: ImageFrame = {
      type: 'IMAGE',
      frameId: 1,
      length: 4 + TOTAL_PIXELS,
      width: WIDTH,
      height: HEIGHT,
      imageData,
      checksum: 0,
    };

    const processed = processor.process(frame);
    const pixels = processed.pixelData;

    // R=G=B=gray, A=255
    expect(pixels[0]).toBe(128);
    expect(pixels[1]).toBe(128);
    expect(pixels[2]).toBe(128);
    expect(pixels[3]).toBe(255);

    expect(pixels[4]).toBe(255);
    expect(pixels[5]).toBe(255);
    expect(pixels[6]).toBe(255);
    expect(pixels[7]).toBe(255);
  });

  it('should process a valid RGB565 image frame', () => {
    const RGB565_SIZE = TOTAL_PIXELS * 2;
    const imageData = new Uint8Array(RGB565_SIZE);
    // 填充 RGB565 纯绿色 (0x07E0): hi=0x07, lo=0xE0
    for (let i = 0; i < TOTAL_PIXELS; i++) {
      imageData[i * 2]     = 0x07;
      imageData[i * 2 + 1] = 0xE0;
    }

    const frame: ImageFrame = {
      type: 'IMAGE',
      frameId: 200,
      length: 4 + RGB565_SIZE,
      width: WIDTH,
      height: HEIGHT,
      imageData,
      checksum: 0,
    };

    const processed = processor.process(frame);

    expect(processed.frameId).toBe(200);
    expect(processed.width).toBe(WIDTH);
    expect(processed.height).toBe(HEIGHT);
    expect(processed.pixelData.length).toBe(TOTAL_PIXELS * 4);
  });

  it('should correctly convert RGB565 to RGBA', () => {
    const RGB565_SIZE = TOTAL_PIXELS * 2;
    const imageData = new Uint8Array(RGB565_SIZE);

    // pixel 0: 红色 0xF800 → R5=31 → R8=255
    imageData[0] = 0xF8; imageData[1] = 0x00;
    // pixel 1: 绿色 0x07E0 → G6=63 → G8=255
    imageData[2] = 0x07; imageData[3] = 0xE0;
    // pixel 2: 蓝色 0x001F → B5=31 → B8=255
    imageData[4] = 0x00; imageData[5] = 0x1F;

    const frame: ImageFrame = {
      type: 'IMAGE',
      frameId: 1,
      length: 4 + RGB565_SIZE,
      width: WIDTH,
      height: HEIGHT,
      imageData,
      checksum: 0,
    };

    const processed = processor.process(frame);
    const pixels = processed.pixelData;

    // red 0xF800: R5=31→R8=255
    expect(pixels[0]).toBe(255);
    expect(pixels[1]).toBe(0);
    expect(pixels[2]).toBe(0);
    expect(pixels[3]).toBe(255);

    // green 0x07E0: G6=63→G8=255
    expect(pixels[4]).toBe(0);
    expect(pixels[5]).toBe(255);
    expect(pixels[6]).toBe(0);
    expect(pixels[7]).toBe(255);

    // blue 0x001F: B5=31→B8=255
    expect(pixels[8]).toBe(0);
    expect(pixels[9]).toBe(0);
    expect(pixels[10]).toBe(255);
    expect(pixels[11]).toBe(255);
  });

  it('should reject invalid image data size (neither gray nor RGB565)', () => {
    const imageData = new Uint8Array(TOTAL_PIXELS - 1);

    const frame: ImageFrame = {
      type: 'IMAGE',
      frameId: 1,
      length: 4 + TOTAL_PIXELS,
      width: WIDTH,
      height: HEIGHT,
      imageData,
      checksum: 0,
    };

    expect(() => processor.process(frame)).toThrow('Invalid image data size');
  });

  it('should cache the last processed frame', () => {
    const imageData = new Uint8Array(TOTAL_PIXELS);

    const frame1: ImageFrame = {
      type: 'IMAGE',
      length: 4 + TOTAL_PIXELS,
      frameId: 1,
      width: WIDTH,
      height: HEIGHT,
      imageData,
      checksum: 0,
    };

    const processed1 = processor.process(frame1);
    expect(processor.getLastFrame()).toBe(processed1);

    const frame2: ImageFrame = {
      type: 'IMAGE',
      length: 4 + TOTAL_PIXELS,
      frameId: 2,
      width: WIDTH,
      height: HEIGHT,
      imageData,
      checksum: 0,
    };

    const processed2 = processor.process(frame2);
    expect(processor.getLastFrame()).toBe(processed2);
    expect(processor.getLastFrame()).not.toBe(processed1);
  });

  it('should clear cached frame', () => {
    const imageData = new Uint8Array(TOTAL_PIXELS);

    const frame: ImageFrame = {
      type: 'IMAGE',
      frameId: 1,
      length: 4 + TOTAL_PIXELS,
      width: WIDTH,
      height: HEIGHT,
      imageData,
      checksum: 0,
    };

    processor.process(frame);
    expect(processor.getLastFrame()).not.toBeNull();

    processor.clear();
    expect(processor.getLastFrame()).toBeNull();
  });
});

describe('ImageDataStore', () => {
  let store: ImageDataStore;
  let processor: ImageFrameProcessor;

  beforeEach(() => {
    store = new ImageDataStore(2);
    processor = new ImageFrameProcessor({
      imageWidth: 188,
      imageHeight: 120,
      fps: 25,
    });
  });

  const createProcessedFrame = (frameId: number): ProcessedImageData => {
    return {
      frameId,
      width: 188,
      height: 120,
      pixelData: new Uint8ClampedArray(188 * 120 * 4),
      timestamp: Date.now(),
    };
  };

  it('should store and retrieve current frame', () => {
    const frame = createProcessedFrame(1);
    store.storeFrame(frame);

    expect(store.getCurrentFrame()).toBe(frame);
  });

  it('should maintain buffer with max size limit', () => {
    const frame1 = createProcessedFrame(1);
    const frame2 = createProcessedFrame(2);
    const frame3 = createProcessedFrame(3);

    store.storeFrame(frame1);
    store.storeFrame(frame2);
    store.storeFrame(frame3);

    // 缓冲大小为2，所以应该只有frame2和frame3
    expect(store.getFrame(1)).toBeNull();
    expect(store.getFrame(2)).toBeTruthy();
    expect(store.getFrame(3)).toBeTruthy();
  });

  it('should detect dropped frames', () => {
    const frame1 = createProcessedFrame(1);
    const frame5 = createProcessedFrame(5); // 跳过 2, 3, 4

    store.storeFrame(frame1);
    store.storeFrame(frame5);

    const stats = store.getStats();
    expect(stats.droppedFrames).toBe(3); // 丢失帧 2, 3, 4
  });

  it('should handle frame ID wraparound', () => {
    const frame1 = createProcessedFrame(0xFFFF);
    const frame2 = createProcessedFrame(0); // 环绕回 0

    store.storeFrame(frame1);
    store.storeFrame(frame2);

    const stats = store.getStats();
    expect(stats.totalFrames).toBe(2);
    // 0xFFFF -> 0 应该被识别为连续，无丢帧
    expect(stats.droppedFrames).toBe(0);
  });

  it('should calculate FPS correctly', (done) => {
    let timestamp = Date.now();

    const frame1: ProcessedImageData = {
      frameId: 1,
      width: 188,
      height: 120,
      pixelData: new Uint8ClampedArray(188 * 120 * 4),
      timestamp,
    };
    store.storeFrame(frame1);

    // 模拟时间推进，添加多个帧
    setTimeout(() => {
      for (let i = 2; i <= 10; i++) {
        const frame: ProcessedImageData = {
          frameId: i,
          width: 188,
          height: 120,
          pixelData: new Uint8ClampedArray(188 * 120 * 4),
          timestamp: Date.now(),
        };
        store.storeFrame(frame);
      }

      const fps = store.calculateFps();
      // 应该接近 1000/100 = 10 FPS（10帧在100ms内）
      expect(fps).toBeGreaterThan(0);
      expect(fps).toBeLessThan(100); // 合理范围
      done();
    }, 100);
  });

  it('should track total frames and stats', () => {
    for (let i = 1; i <= 5; i++) {
      store.storeFrame(createProcessedFrame(i));
    }

    const stats = store.getStats();
    expect(stats.totalFrames).toBe(5);
  });

  it('should clear all data', () => {
    store.storeFrame(createProcessedFrame(1));
    store.storeFrame(createProcessedFrame(2));

    expect(store.getCurrentFrame()).not.toBeNull();

    store.clear();

    expect(store.getCurrentFrame()).toBeNull();
    expect(store.getFrame(1)).toBeNull();
    expect(store.getFrame(2)).toBeNull();

    const stats = store.getStats();
    expect(stats.totalFrames).toBe(0);
  });

  it('should reset stats', () => {
    for (let i = 1; i <= 5; i++) {
      store.storeFrame(createProcessedFrame(i));
    }

    let stats = store.getStats();
    expect(stats.totalFrames).toBe(5);

    store.resetStats();

    stats = store.getStats();
    expect(stats.totalFrames).toBe(0);
    expect(stats.droppedFrames).toBe(0);
  });

  it('should handle empty state gracefully', () => {
    expect(store.getCurrentFrame()).toBeNull();

    const stats = store.getStats();
    expect(stats.totalFrames).toBe(0);
    expect(stats.currentFps).toBe(0);
    expect(stats.dropRate).toBe('0.00%');
  });
});
