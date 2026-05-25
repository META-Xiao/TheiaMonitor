/**
 * 图传处理使用示例
 *
 * 示例演示：
 * 1. 初始化序列管理器和图传处理管理器
 * 2. 订阅图像事件
 * 3. 获取统计信息
 * 4. 渲染到Canvas（伪代码）
 */

import {
  TelemetrySerialManager,
  ImageProcessManager,
  ImageProcessEvent,
  ProcessedImageData,
} from './index';

// ============================================================================
// 示例 1：基本使用流程
// ============================================================================

async function basicExample() {
  // 创建串口管理器
  const serialManager = new TelemetrySerialManager();

  // 创建图传处理管理器
  const imageManager = new ImageProcessManager(serialManager, {
    imageWidth: 188,
    imageHeight: 120,
    fps: 25,
  });

  // 选择串口并连接
  await serialManager.selectPort();
  await serialManager.connect(115200);

  // 启动图传处理
  imageManager.start();

  // 订阅图像事件
  imageManager.on((event: ImageProcessEvent) => {
    switch (event.type) {
      case 'IMAGE_RECEIVED':
        console.log(`收到图像帧: ID=${event.data.frameId}`);
        renderImageToCanvas(event.data);
        break;

      case 'STATS_UPDATED':
        console.log(`统计信息:`, event.stats);
        updateStatsDisplay(event.stats);
        break;

      case 'ERROR':
        console.error(`处理错误:`, event.error);
        break;
    }
  });

  // ... 应用程序运行 ...

  // 清理资源
  imageManager.stop();
  await serialManager.disconnect();
}

// ============================================================================
// 示例 2：React 组件中的使用（伪代码，需要在 .tsx 中使用）
// ============================================================================

/*
import { useEffect, useRef, useState } from 'react';

function ImageDisplay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fps, setFps] = useState(0);
  const [stats, setStats] = useState({
    totalFrames: 0,
    droppedFrames: 0,
    currentFps: 0,
    dropRate: '0%',
  });

  const imageManagerRef = useRef<ImageProcessManager | null>(null);
  const serialManagerRef = useRef<TelemetrySerialManager | null>(null);

  useEffect(() => {
    const initSerialAndImage = async () => {
      const serialManager = new TelemetrySerialManager();
      const imageManager = new ImageProcessManager(serialManager);

      serialManagerRef.current = serialManager;
      imageManagerRef.current = imageManager;

      try {
        // 连接设备
        await serialManager.selectPort();
        await serialManager.connect(115200);

        // 启动图传处理
        imageManager.start();

        // 订阅事件
        imageManager.on((event: ImageProcessEvent) => {
          if (event.type === 'IMAGE_RECEIVED') {
            renderToCanvas(event.data);
          } else if (event.type === 'STATS_UPDATED') {
            setStats(event.stats);
            setFps(Math.round(event.stats.currentFps));
          }
        });
      } catch (error) {
        console.error('Failed to initialize:', error);
      }
    };

    initSerialAndImage();

    return () => {
      imageManagerRef.current?.stop();
      serialManagerRef.current?.disconnect().catch(() => {});
    };
  }, []);

  const renderToCanvas = (imageData: ProcessedImageData) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 创建 ImageData 对象
    const imageDataObj = new ImageData(
      imageData.pixelData,
      imageData.width,
      imageData.height,
    );

    // 渲染到 Canvas
    ctx.putImageData(imageDataObj, 0, 0);
  };

  return (
    <div className="image-display">
      <div className="canvas-container">
        <canvas
          ref={canvasRef}
          width={188}
          height={120}
          style={{
            border: '1px solid #ccc',
            maxWidth: '100%',
            height: 'auto',
          }}
        />
      </div>
      <div className="stats">
        <div>FPS: {fps}</div>
        <div>Total Frames: {stats.totalFrames}</div>
        <div>Dropped Frames: {stats.droppedFrames}</div>
        <div>Drop Rate: {stats.dropRate}</div>
      </div>
    </div>
  );
}
*/

// ============================================================================
// 示例 3：自定义图像处理（缩放、滤镜等）
// ============================================================================

class AdvancedImageProcessor {
  private imageManager: ImageProcessManager;
  private canvasRef: HTMLCanvasElement;

  constructor(serialManager: TelemetrySerialManager, canvas: HTMLCanvasElement) {
    this.canvasRef = canvas;
    this.imageManager = new ImageProcessManager(serialManager);
  }

  start() {
    this.imageManager.start();

    this.imageManager.on((event: ImageProcessEvent) => {
      if (event.type === 'IMAGE_RECEIVED') {
        // 应用自定义处理
        this.processAndRender(event.data);
      }
    });
  }

  private processAndRender(imageData: ProcessedImageData) {
    const ctx = this.canvasRef.getContext('2d');
    if (!ctx) return;

    // 创建 ImageData 对象
    const imageDataObj = ctx.createImageData(imageData.width, imageData.height);
    imageDataObj.data.set(imageData.pixelData);

    // 选项 1: 直接渲染
    ctx.putImageData(imageDataObj, 0, 0);

    // 选项 2: 应用缩放（使用 Canvas drawImage）
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = imageData.width;
    tmpCanvas.height = imageData.height;
    const tmpCtx = tmpCanvas.getContext('2d');
    if (tmpCtx) {
      tmpCtx.putImageData(imageDataObj, 0, 0);

      // 按 2倍 缩放渲染
      const scale = 2;
      ctx.drawImage(
        tmpCanvas,
        0,
        0,
        tmpCanvas.width,
        tmpCanvas.height,
        0,
        0,
        tmpCanvas.width * scale,
        tmpCanvas.height * scale,
      );
    }
  }

  stop() {
    this.imageManager.stop();
  }
}

// ============================================================================
// 辅助函数
// ============================================================================

function renderImageToCanvas(imageData: ProcessedImageData) {
  const canvas = document.getElementById('imageCanvas') as HTMLCanvasElement;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const imageDataObj = ctx.createImageData(imageData.width, imageData.height);
  imageDataObj.data.set(imageData.pixelData);

  ctx.putImageData(imageDataObj, 0, 0);
}

function updateStatsDisplay(stats: ReturnType<ImageProcessManager['getStats']>) {
  const fpsElement = document.getElementById('fps');
  const droppedElement = document.getElementById('dropped');

  if (fpsElement) {
    fpsElement.textContent = `FPS: ${Math.round(stats.currentFps)}`;
  }

  if (droppedElement) {
    droppedElement.textContent = `Dropped: ${stats.droppedFrames} (${stats.dropRate})`;
  }
}

// ============================================================================
// 导出示例使用
// ============================================================================

export { basicExample, AdvancedImageProcessor };
