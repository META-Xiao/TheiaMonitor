/**
 * 遥测协议帧类型定义
 */
export const FRAME_TYPE = {
  IMAGE: 0xCC,      // 图传帧
  LOG: 0xDD,        // 日志帧
  RESOURCE: 0xEE,   // 资源帧
} as const;

export const FRAME_SIZE = {
  IMAGE: 22568,     // 0xCC: 1(ID) + 2(Frame) + 1(FPS_cam) + 1(FPS_out) + 1(width) + 1(height) + 22560(data) + 1(checksum)
  LOG_MAX: 260,     // 0xDD: 1 + 2 + 256 + 1 = 260
  RESOURCE: 18,     // 0xEE: 1(ID)+1(CPU)+1(RAM)+2(freeHeap)+2(freeStack)+2(ramTotal)+2(Speed)+2(ServoAngle)+4(Reserved)+1(Checksum)
} as const;

export const BAUDRATE = 115200;

/**
 * 图传帧 (0xCC) - 22568 字节
 * 帧结构: ID(1) + Frame(2) + FPS_cam(1) + FPS_out(1) + Width(1) + Height(1) + ImageData(W×H) + Checksum(1)
 */
export interface ImageFrame {
  type: 'IMAGE';
  frameId: number;        // 2字节 uint16 大端
  fpsCam: number;         // 1字节 摄像头帧率
  fpsOut: number;         // 1字节 输出帧率
  width: number;          // 1字节 图像宽度（像素）
  height: number;         // 1字节 图像高度（像素）
  imageData: Uint8Array;  // width×height 字节灰度图
  checksum: number;       // 1字节
}

/**
 * 日志帧 (0xDD) - 4 + N 字节
 */
export interface LogFrame {
  type: 'LOG';
  length: number;         // 2字节
  logData: string;        // UTF-8文本
  checksum: number;       // 1字节
}

/**
 * 资源帧 (0xEE) - 20 字节
 * 帧结构: ID(1) + CPUUsage(1) + RAMUsage(1) + freeHeap(2) + freeStack(2) + ramTotal(2) + Speed(2) + ServoAngle(2) + Reserved(4) + Checksum(1)
 */
export interface ResourceFrame {
  type: 'RESOURCE';
  cpuUsage: number;       // 1字节 (%)
  ramUsage: number;       // 1字节 (%)
  freeHeap: number;       // 2字节 剩余堆内存字节数
  freeStack: number;      // 2字节 剩余栈内存字节数
  ramTotal: number;       // 2字节 总内存字节数（MCU自报）
  speed: number;          // 2字节 (int16, mm/s)
  servoAngle: number;     // 2字节 (int16, 度×10)
  reserved: Uint8Array;   // 4字节
  checksum: number;       // 1字节
}

export type TelemetryFrame = ImageFrame | LogFrame | ResourceFrame;

/**
 * 帧解析状态机
 */
export enum FrameParseState {
  WAIT_HEADER = 0,       // 等待帧头
  READ_IMAGE_DATA = 1,   // 读图传帧数据
  READ_LOG_DATA = 2,     // 读日志帧数据
  READ_RESOURCE_DATA = 3,// 读资源帧数据
}

/**
 * 校验和计算
 */
export function calculateChecksum(data: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
  }
  return sum & 0xFF;
}

/**
 * 验证校验和
 */
export function verifyChecksum(data: Uint8Array, checksum: number): boolean {
  return calculateChecksum(data) === checksum;
}
