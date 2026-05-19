import { ImageFrame } from './protocol';

/**
 * 图像处理配置
 */
export interface ImageProcessingConfig {
  imageWidth: number;     // 图像宽度（像素）
  imageHeight: number;    // 图像高度（像素）
  fps: number;            // 帧率显示值
}

/**
 * 处理后的图像数据
 */
export interface ProcessedImageData {
  frameId: number;        // 帧ID
  fps: number;            // 帧率
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
 * - 支持灰度图转 RGBA
 * - 缓存处理结果用于显示
 */
export class ImageFrameProcessor {
  private readonly config: ImageProcessingConfig;
  private pixelBuffer: Uint8ClampedArray;
  private lastProcessedFrame: ProcessedImageData | null = null;

  constructor(config: ImageProcessingConfig) {
    this.config = config;

    // 预分配像素缓冲区：RGB灰度为 W×H，转RGBA为 W×H×4
    const pixelCount = config.imageWidth * config.imageHeight * 4;
    this.pixelBuffer = new Uint8ClampedArray(pixelCount);
  }

  /**
   * 处理图像帧，转换为 RGBA 格式
   * @param frame 原始图像帧
   * @returns 处理后的图像数据
   */
  process(frame: ImageFrame): ProcessedImageData {
    const { frameId, fps, imageData } = frame;

    if (imageData.length !== this.config.imageWidth * this.config.imageHeight) {
      throw new Error(
        `Invalid image data size: expected ${this.config.imageWidth * this.config.imageHeight}, got ${imageData.length}`,
      );
    }

    // 转换灰度图到 RGBA
    this.grayscaleToRgba(imageData);

    const processed: ProcessedImageData = {
      frameId,
      fps,
      width: this.config.imageWidth,
      height: this.config.imageHeight,
      pixelData: new Uint8ClampedArray(this.pixelBuffer),
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
    this.pixelBuffer.fill(0);
  }

  /**
   * 私有方法：灰度图转 RGBA
   * 每个灰度值转换为 RGBA(gray, gray, gray, 255)
   */
  private grayscaleToRgba(grayscaleData: Uint8Array): void {
    for (let i = 0; i < grayscaleData.length; i++) {
      const grayValue = grayscaleData[i];
      const rgbaIndex = i * 4;

      this.pixelBuffer[rgbaIndex] = grayValue;      // R
      this.pixelBuffer[rgbaIndex + 1] = grayValue;  // G
      this.pixelBuffer[rgbaIndex + 2] = grayValue;  // B
      this.pixelBuffer[rgbaIndex + 3] = 255;        // A
    }
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
