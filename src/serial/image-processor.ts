import { ImageFrame } from './protocol';

/**
 * 图像处理配置
 */
export interface ImageProcessingConfig {
  imageWidth: number;     // 图像宽度（像素）
  imageHeight: number;    // 图像高度（像素）
  fps: number;            // 默认输出帧率（用于配置，非帧头字段）
}

/**
 * 处理后的图像数据
 */
export interface ProcessedImageData {
  frameId: number;        // 帧ID
  width: number;          // 宽度
  height: number;         // 高度
  pixelData: Uint8ClampedArray;  // RGBA 格式像素数据
  timestamp: number;      // 时间戳（ms）
}

/**
 * 图像帧处理器
 *
 * 功能：
 * - 将二进制图像数据转换为可显示的格式
 * - 兼容灰度图 (W×H×1) 和 RGB565 (W×H×2) 两种编码
 * - 缓存处理结果用于显示
 */
export class ImageFrameProcessor {
  private readonly config: ImageProcessingConfig;
  private lastProcessedFrame: ProcessedImageData | null = null;

  constructor(config: ImageProcessingConfig) {
    this.config = config;
  }

  /**
   * 处理图像帧，转 RGBA 格式（兼容灰度和 RGB565）
   * @param frame 原始图像帧
   * @returns 处理后的图像数据
   */
  process(frame: ImageFrame): ProcessedImageData {
    const { frameId, width, height, imageData } = frame;
    const graySize = width * height;
    const rgbSize  = width * height * 2;

    if (imageData.length !== graySize && imageData.length !== rgbSize) {
      throw new Error(
        `Invalid image data size: expected ${graySize}(gray) or ${rgbSize}(RGB565), got ${imageData.length}`,
      );
    }

    const pixelData = new Uint8ClampedArray(width * height * 4);
    const pixelCount = width * height;

    if (imageData.length === graySize) {
      /* 灰度图 (旧格式): R=G=B=gray */
      for (let i = 0; i < pixelCount; i++) {
        const g = imageData[i];
        pixelData[i * 4]     = g;
        pixelData[i * 4 + 1] = g;
        pixelData[i * 4 + 2] = g;
        pixelData[i * 4 + 3] = 255;
      }
    } else {
      /* RGB565 (新格式): 大端序，2字节/像素 */
      for (let i = 0; i < pixelCount; i++) {
        const hi = imageData[i * 2];
        const lo = imageData[i * 2 + 1];
        const rgb565 = (hi << 8) | lo;

        const r5 = (rgb565 >> 11) & 0x1F;
        const g6 = (rgb565 >> 5) & 0x3F;
        const b5 = rgb565 & 0x1F;

        const offset = i * 4;
        pixelData[offset]     = (r5 << 3) | (r5 >> 2);   // R: 5→8 bit
        pixelData[offset + 1] = (g6 << 2) | (g6 >> 4);   // G: 6→8 bit
        pixelData[offset + 2] = (b5 << 3) | (b5 >> 2);   // B: 5→8 bit
        pixelData[offset + 3] = 255;                      // A
      }
    }

    const processed: ProcessedImageData = {
      frameId,
      width,
      height,
      pixelData,
      timestamp: Date.now(),
    };

    this.lastProcessedFrame = processed;
    return processed;
  }

  /**
   * 获取最后处理的图像帧
   */
  getLastFrame(): ProcessedImageData | null {
    return this.lastProcessedFrame;
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.lastProcessedFrame = null;
  }
}

/**
 * 图像数据存储
 *
 * 功能：
 * - 维护当前显示的图像帧
 * - 帧缓冲（可选双缓冲）
 * - 统计信息（FPS、丢帧数）
 */
export class ImageDataStore {
  private currentFrame: ProcessedImageData | null = null;
  private frameBuffer: Map<number, ProcessedImageData> = new Map();
  private readonly maxBufferSize: number;

  // 统计
  private totalFrames: number = 0;
  private droppedFrames: number = 0;
  private lastFrameId: number = -1;
  private frameTimeHistory: number[] = [];
  private readonly maxHistorySize: number = 60; // 保留最近60帧的时间戳

  constructor(maxBufferSize: number = 2) {
    this.maxBufferSize = maxBufferSize;
  }

  /**
   * 存储新的图像帧
   */
  storeFrame(frame: ProcessedImageData): void {
    this.totalFrames++;

    // 检测丢帧
    if (this.lastFrameId !== -1) {
      const expectedNextId = (this.lastFrameId + 1) & 0xFFFF;
      if (frame.frameId !== expectedNextId) {
        this.droppedFrames += (frame.frameId - expectedNextId + 0x10000) & 0xFFFF;
      }
    }
    this.lastFrameId = frame.frameId;

    // 更新当前帧
    this.currentFrame = frame;

    // 缓冲管理
    this.frameBuffer.set(frame.frameId, frame);
    if (this.frameBuffer.size > this.maxBufferSize) {
      const oldestKey = this.frameBuffer.keys().next().value;
      this.frameBuffer.delete(oldestKey);
    }

    // 记录帧时间戳用于FPS计算
    this.frameTimeHistory.push(frame.timestamp);
    if (this.frameTimeHistory.length > this.maxHistorySize) {
      this.frameTimeHistory.shift();
    }
  }

  /**
   * 获取当前帧
   */
  getCurrentFrame(): ProcessedImageData | null {
    return this.currentFrame;
  }

  /**
   * 获取指定ID的帧（如果在缓冲中）
   */
  getFrame(frameId: number): ProcessedImageData | null {
    return this.frameBuffer.get(frameId) ?? null;
  }

  /**
   * 计算实时FPS（基于最近帧的时间戳）
   */
  calculateFps(): number {
    if (this.frameTimeHistory.length < 2) {
      return 0;
    }

    const oldestTime = this.frameTimeHistory[0];
    const newestTime = this.frameTimeHistory[this.frameTimeHistory.length - 1];
    const timeDelta = newestTime - oldestTime;

    if (timeDelta === 0) {
      return 0;
    }

    return (this.frameTimeHistory.length - 1) / (timeDelta / 1000);
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalFrames: number;
    droppedFrames: number;
    currentFps: number;
    dropRate: string;
  } {
    const dropRate =
      this.totalFrames > 0
        ? ((this.droppedFrames / this.totalFrames) * 100).toFixed(2)
        : '0.00';

    return {
      totalFrames: this.totalFrames,
      droppedFrames: this.droppedFrames,
      currentFps: this.calculateFps(),
      dropRate: `${dropRate}%`,
    };
  }

  /**
   * 清空所有数据
   */
  clear(): void {
    this.currentFrame = null;
    this.frameBuffer.clear();
    this.totalFrames = 0;
    this.droppedFrames = 0;
    this.lastFrameId = -1;
    this.frameTimeHistory = [];
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.totalFrames = 0;
    this.droppedFrames = 0;
    this.frameTimeHistory = [];
  }
}
