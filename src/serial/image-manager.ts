import { TelemetrySerialManager, SerialEvent } from './manager';
import {
  ImageFrameProcessor,
  ImageDataStore,
  ProcessedImageData,
  ImageProcessingConfig,
} from './image-processor';
import { ImageFrame } from './protocol';

/**
 * 图像处理事件
 */
export type ImageProcessEvent =
  | {
      type: 'IMAGE_RECEIVED';
      data: ProcessedImageData;
    }
  | {
      type: 'STATS_UPDATED';
      stats: ReturnType<ImageDataStore['getStats']>;
    }
  | {
      type: 'ERROR';
      error: Error;
    };

export type ImageProcessEventHandler = (event: ImageProcessEvent) => void;

/**
 * 图像处理管理器
 *
 * 功能：
 * - 订阅串口管理器的帧事件
 * - 处理图像帧 (0xCC)
 * - 维护图像缓存和统计
 * - 分发处理事件到UI层
 */
export class ImageProcessManager {
  private serialManager: TelemetrySerialManager;
  private processor: ImageFrameProcessor;
  private store: ImageDataStore;
  private eventHandlers: Set<ImageProcessEventHandler> = new Set();
  private unsubscribeSerialEvents: (() => void) | null = null;
  private statsUpdateInterval: NodeJS.Timeout | null = null;

  constructor(
    serialManager: TelemetrySerialManager,
    config?: Partial<ImageProcessingConfig>,
  ) {
    this.serialManager = serialManager;

    const processingConfig: ImageProcessingConfig = {
      imageWidth: 188,
      imageHeight: 120,
      fps: 25,
      ...config,
    };

    this.processor = new ImageFrameProcessor(processingConfig);
    this.store = new ImageDataStore();
  }

  /**
   * 启动图像处理（订阅串口事件）
   */
  start(): void {
    if (this.unsubscribeSerialEvents) {
      return; // 已经启动
    }

      // 订阅串口事件
    this.unsubscribeSerialEvents = this.serialManager.on(
      (event: SerialEvent) => {
        try {
          if (event.type === 'FRAME' && event.frame.type === 'IMAGE') {
            this.handleImageFrame(event.frame as ImageFrame);
          }
        } catch (error) {
          this.emitEvent({
            type: 'ERROR',
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      },
    );

    // 定期更新统计信息
    this.statsUpdateInterval = setInterval(() => {
      const stats = this.store.getStats();
      this.emitEvent({
        type: 'STATS_UPDATED',
        stats,
      });
    }, 1000); // 每秒更新一次
  }

  /**
   * 停止图像处理
   */
  stop(): void {
    if (this.unsubscribeSerialEvents) {
      this.unsubscribeSerialEvents();
      this.unsubscribeSerialEvents = null;
    }

    if (this.statsUpdateInterval) {
      clearInterval(this.statsUpdateInterval);
      this.statsUpdateInterval = null;
    }
  }

  /**
   * 订阅图像处理事件
   */
  on(handler: ImageProcessEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  /**
   * 取消订阅
   */
  off(handler: ImageProcessEventHandler): void {
    this.eventHandlers.delete(handler);
  }

  /**
   * 获取当前图像帧
   */
  getCurrentImage(): ProcessedImageData | null {
    return this.store.getCurrentFrame();
  }

  /**
   * 获取统计信息
   */
  getStats(): ReturnType<ImageDataStore['getStats']> {
    return this.store.getStats();
  }

  /**
   * 清空所有数据
   */
  clear(): void {
    this.store.clear();
    this.processor.clear();
  }

  /**
   * 私有方法：处理图像帧
   */
  private handleImageFrame(frame: ImageFrame): void {
    const processed = this.processor.process(frame);
    this.store.storeFrame(processed);

    this.emitEvent({
      type: 'IMAGE_RECEIVED',
      data: processed,
    });
  }

  /**
   * 私有方法：分发事件
   */
  private emitEvent(event: ImageProcessEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('Error in image process event handler:', error);
      }
    }
  }
}
