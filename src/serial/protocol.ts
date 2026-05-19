/**
 * 遥测协议帧类型定义
 */
export const FRAME_TYPE = {
  IMAGE: 0xCC,      // 图传帧
  LOG: 0xDD,        // 日志帧
  RESOURCE: 0xEE,   // 资源帧
} as const;

export const FRAME_SIZE = {
  IMAGE: 22570,     // 0xCC: 1 + 2 + 1 + 22560 + 1 = 22565 (+ 5字节头)
  LOG_MAX: 260,     // 0xDD: 1 + 2 + 256 + 1 = 260
  RESOURCE: 18,     // 0xEE: 1 + 1 + 1 + 2 + 2 + 2 + 2 + 6 + 1 = 18
} as const;

export const BAUDRATE = 115200;

/**
 * 图传帧 (0xCC) - 22570 字节
 */
export interface ImageFrame {
  type: 'IMAGE';
  frameId: number;        // 2字节
  fps: number;            // 1字节
  imageData: Uint8Array;  // 22560字节
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
 * 资源帧 (0xEE) - 18 字节
 */
export interface ResourceFrame {
  type: 'RESOURCE';
  cpuUsage: number;       // 1字节 (%)
  ramUsage: number;       // 1字节 (%)
  freeXDATA: number;      // 2字节
  freeEDATA: number;      // 2字节
  speed: number;          // 2字节 (int16, mm/s)
  servoAngle: number;     // 2字节 (int16, 度×10)
  reserved: Uint8Array;   // 6字节
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
