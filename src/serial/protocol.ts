/**
 * 遥测协议帧类型定义
 */
export const FRAME_TYPE = {
  IMAGE: 0xCC,      // 图传帧
  LOG: 0xDD,        // 日志帧
  RESOURCE: 0xEE,   // 资源帧
} as const;

export const FRAME_SIZE = {
  IMAGE_MAX: 65033, // 0xCC: 1+2(Length)+2(Frame)+1(W)+1(H)+255*255(data)+1(CS) — 最大分辨率 255×255
  LOG_MAX: 260,     // 0xDD: 1 + 2 + 256 + 1 = 260
  RESOURCE: 15,     // 0xEE: 1(ID)+1(CPU)+2(ROM_free)+2(RAM_free)+2(Speed)+2(Servo)+4(Reserved)+1(Checksum)
} as const;

export const BAUDRATE = 115200;

/**
 * 图传帧 (0xCC)
 * 帧结构: ID(1) + Length(2) + Frame(2) + Width(1) + Height(1) + ImageData(W×H) + Checksum(1)
 * Length = Frame(2) + Width(1) + Height(1) + ImageData(W×H) = 4 + W×H
 */
export interface ImageFrame {
  type: 'IMAGE';
  length: number;         // 2字节 uint16 大端，帧头后+校验和前总字节数
  frameId: number;        // 2字节 uint16 大端
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
 * 资源帧 (0xEE) — 动态槽解析
 * res[i] 对应第 i 个槽的原始整数值，由 resourceSlots 配置决定字节数和符号
 */
export interface ResourceFrame {
  type: 'RESOURCE';
  res: number[];    // 按槽顺序的原始值数组
  checksum: number;
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
