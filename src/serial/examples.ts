/**
 * 串口通信层使用示例
 *
 * 这个文件演示了如何在实际应用中使用 TelemetrySerialManager
 */

import { TelemetrySerialManager, ImageFrame, LogFrame, ResourceFrame } from '@/serial';

/**
 * 示例 1: 基础连接和断开
 */
export async function example_basicConnection() {
  const manager = new TelemetrySerialManager();

  try {
    // 检查支持
    if (!TelemetrySerialManager.isSupported()) {
      console.error('当前浏览器不支持 WebSerial API');
      return;
    }

    // 选择串口（会弹出对话框）
    await manager.selectPort();
    console.log('用户已选择串口');

    // 连接
    await manager.connect(115200);
    console.log('已连接到串口');

    // 使用...
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // 断开
    await manager.disconnect();
    console.log('已断开连接');
  } catch (error) {
    console.error('连接失败:', error);
  }
}

/**
 * 示例 2: 订阅事件处理所有帧类型
 */
export function example_eventHandling() {
  const manager = new TelemetrySerialManager();

  // 订阅事件
  const unsubscribe = manager.on((event) => {
    switch (event.type) {
      case 'CONNECTED':
        console.log('✓ 已连接');
        break;

      case 'DISCONNECTED':
        console.log('✗ 已断开');
        break;

      case 'FRAME':
        handleTelemetryFrame(event.frame);
        break;

      case 'FRAME_ERROR':
        console.error(`帧错误 [${event.error.code}]: ${event.error.message}`);
        break;

      case 'ERROR':
        console.error('通信错误:', event.error);
        break;
    }
  });

  // 在某个时刻取消订阅
  // unsubscribe();
}

/**
 * 帧处理函数
 */
function handleTelemetryFrame(
  frame: ImageFrame | LogFrame | ResourceFrame,
) {
  switch (frame.type) {
    case 'IMAGE':
      handleImageFrame(frame);
      break;

    case 'LOG':
      handleLogFrame(frame);
      break;

    case 'RESOURCE':
      handleResourceFrame(frame);
      break;
  }
}

/**
 * 示例 3: 处理图传帧
 */
function handleImageFrame(frame: ImageFrame) {
  console.log(`[图传] Frame #${frame.frameId}, FPS_cam: ${frame.fpsCam}, FPS_out: ${frame.fpsOut}`);
  console.log(`  图像大小: ${frame.imageData.length} 字节 (188×120 灰度)`);
  console.log(`  校验和: 0x${frame.checksum.toString(16)}`);

  // 将灰度数据显示到 Canvas
  renderImageToCanvas(frame.imageData);
}

function renderImageToCanvas(imageData: Uint8Array) {
  const canvas = document.getElementById('preview') as HTMLCanvasElement;
  if (!canvas) return;

  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(188, 120);

  // 灰度数据转 RGBA
  for (let i = 0; i < imageData.length; i++) {
    const gray = imageData[i];
    imgData.data[i * 4 + 0] = gray; // R
    imgData.data[i * 4 + 1] = gray; // G
    imgData.data[i * 4 + 2] = gray; // B
    imgData.data[i * 4 + 3] = 255; // A
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * 示例 4: 处理日志帧
 */
function handleLogFrame(frame: LogFrame) {
  if (frame.length === 0) {
    console.log('[日志] (空帧)');
    return;
  }

  console.log(`[日志] (${frame.length} 字节) ${frame.logData}`);

  // 追加到日志窗口
  appendToLogConsole(frame.logData);
}

function appendToLogConsole(text: string) {
  const logElement = document.getElementById('log-console');
  if (!logElement) return;

  const line = document.createElement('div');
  line.textContent = text;
  line.className = 'log-line';
  logElement.appendChild(line);

  // 自动滚到底部
  logElement.scrollTop = logElement.scrollHeight;

  // 限制日志行数 (最多 1000 行)
  const lines = logElement.querySelectorAll('.log-line');
  if (lines.length > 1000) {
    lines[0].remove();
  }
}

/**
 * 示例 5: 处理资源帧
 */
function handleResourceFrame(frame: ResourceFrame) {
  console.log('[资源信息]');
  console.log(`  CPU 占用: ${frame.cpuUsage}%`);
  console.log(`  RAM 占用: ${frame.ramUsage}%`);
  console.log(
    `  Heap 剩余: ${frame.freeHeap} / ${frame.ramTotal} 字节`,
  );
  console.log(
    `  Stack 剩余: ${frame.freeStack} / ${frame.ramTotal} 字节`,
  );
  console.log(`  速度: ${(frame.speed / 1000).toFixed(2)} m/s`);
  console.log(`  舵机角度: ${(frame.servoAngle / 10).toFixed(1)}°`);

  // 更新仪表板
  updateDashboard(frame);
}

interface DashboardState {
  cpuUsage: number;
  ramUsage: number;
  heapUsage: number;
  stackUsage: number;
  speed: number;
  servoAngle: number;
}

const dashboardState: DashboardState = {
  cpuUsage: 0,
  ramUsage: 0,
  heapUsage: 0,
  stackUsage: 0,
  speed: 0,
  servoAngle: 0,
};

function updateDashboard(frame: ResourceFrame) {
  // 计算占用率百分比
  const heapUsage  = frame.ramTotal > 0 ? ((frame.ramTotal - frame.freeHeap)  / frame.ramTotal * 100) : 0;
  const stackUsage = frame.ramTotal > 0 ? ((frame.ramTotal - frame.freeStack) / frame.ramTotal * 100) : 0;

  dashboardState.cpuUsage   = frame.cpuUsage;
  dashboardState.ramUsage   = frame.ramUsage;
  dashboardState.heapUsage  = heapUsage;
  dashboardState.stackUsage = stackUsage;
  dashboardState.speed      = frame.speed;
  dashboardState.servoAngle = frame.servoAngle;

  updateProgressBar('cpu-bar',   frame.cpuUsage);
  updateProgressBar('ram-bar',   frame.ramUsage);
  updateProgressBar('heap-bar',  heapUsage);
  updateProgressBar('stack-bar', stackUsage);

  document.getElementById('speed-value')!.textContent =
    (frame.speed / 1000).toFixed(2) + ' m/s';
  document.getElementById('servo-value')!.textContent =
    (frame.servoAngle / 10).toFixed(1) + '°';
}

function updateProgressBar(elementId: string, percentage: number) {
  const element = document.getElementById(elementId) as HTMLElement;
  if (!element) return;

  element.style.width = `${Math.min(percentage, 100)}%`;
  element.style.backgroundColor = getColorForUsage(percentage);
  element.textContent = `${Math.round(percentage)}%`;
}

function getColorForUsage(percentage: number): string {
  if (percentage > 80) return '#ff4444'; // 红色 - 危险
  if (percentage > 60) return '#ffaa00'; // 橙色 - 警告
  return '#44aa44'; // 绿色 - 正常
}

/**
 * 示例 6: 发送命令到 MCU
 */
export async function sendCommandToMCU(
  manager: TelemetrySerialManager,
  command: string,
) {
  try {
    const data = new TextEncoder().encode(command + '\n');
    await manager.write(data);
    console.log(`已发送命令: ${command}`);
  } catch (error) {
    console.error('发送命令失败:', error);
  }
}

/**
 * 示例 7: 完整的应用流程
 */
export async function example_fullApplication() {
  const manager = new TelemetrySerialManager();

  // 检查支持
  if (!TelemetrySerialManager.isSupported()) {
    alert('当前浏览器不支持 WebSerial API，请使用 Chrome/Edge');
    return;
  }

  // 连接按钮处理
  document.getElementById('connect-btn')?.addEventListener('click', async () => {
    try {
      await manager.selectPort();
      await manager.connect();
      document.getElementById('status')!.textContent = '✓ 已连接';
      document.getElementById('connect-btn')!.disabled = true;
      document.getElementById('disconnect-btn')!.disabled = false;
    } catch (error) {
      console.error('连接失败:', error);
    }
  });

  // 断开按钮处理
  document.getElementById('disconnect-btn')?.addEventListener('click', async () => {
    await manager.disconnect();
    document.getElementById('status')!.textContent = '✗ 已断开';
    document.getElementById('connect-btn')!.disabled = false;
    document.getElementById('disconnect-btn')!.disabled = true;
  });

  // 清空日志按钮
  document.getElementById('clear-log-btn')?.addEventListener('click', () => {
    const logElement = document.getElementById('log-console');
    if (logElement) logElement.innerHTML = '';
  });

  // 事件处理
  manager.on((event) => {
    switch (event.type) {
      case 'CONNECTED':
        console.log('✓ 已连接');
        break;
      case 'DISCONNECTED':
        console.log('✗ 已断开');
        break;
      case 'FRAME':
        handleTelemetryFrame(event.frame);
        break;
      case 'FRAME_ERROR':
        console.warn(`帧错误: ${event.error.code}`);
        break;
      case 'ERROR':
        console.error('通信错误:', event.error);
        break;
    }
  });
}

export default {
  example_basicConnection,
  example_eventHandling,
  example_fullApplication,
  sendCommandToMCU,
};
