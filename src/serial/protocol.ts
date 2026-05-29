/**
 * 遥测协议帧类型定义
 */
export const FRAME_TYPE = {
  IMAGE: 0xCC,      // 图传帧
  LOG: 0xDD,        // 日志帧
  RESOURCE: 0xEE,   // 资源帧
  CLI: 0xFF,        // CLI输出帧
} as const;

export const FRAME_SIZE = {
  // 0xCC(1)+Len(2)+Frame(2)+W(1)+H(1)+Fmt(1)+Payload(max)+CS(1)
  IMAGE_MAX: 65539, // Length u16 max = 65535, Payload max = 65535-5 = 65530
  LOG_MAX: 260,     // 0xDD: 1 + 2 + 256 + 1 = 260
} as const;

export const BAUDRATE = 115200;

/**
 * 像素格式 (Format 高4位)
 */
export enum PixelFormat {
  Binary1   = 0, // 二值化图 (1bpp)
  Gray8     = 1, // 灰度图 (8bpp)
  RGB565    = 2, // 彩色图 (16bpp) 大端序
  RGB888    = 3, // 真彩色图 (24bpp)
  YUV422    = 4, // 色度抽样 (16bpp)
  JPEG      = 5, // JPEG 数据流
  PNG       = 6, // PNG 数据流
  UserDefined = 7, // 用户自定义
}

/**
 * 编码方式 (Format 低4位)
 */
export enum Codec {
  RAW             = 0, // 无压缩，按 PixelFormat 输出
  RLE             = 1, // 游程编码
  HEATSHRINK      = 2, // 面向MCU的LZ压缩，全帧压缩
  Tile            = 3, // 变化检测：分块传输 (P帧，无熵编码)
  Patch           = 4, // 变化检测：最小矩形传输 (P帧，无熵编码)
  TileHEATSHRINK  = 5, // Tile + HEATSHRINK 复合 (P帧)
  PatchHEATSHRINK = 6, // Patch + HEATSHRINK 复合 (P帧)
}

/**
 * 解析 Format 字节
 */
export function parseFormat(formatByte: number): { pixelFormat: PixelFormat; codec: Codec } {
  return {
    pixelFormat: ((formatByte >> 4) & 0x0F) as PixelFormat,
    codec: (formatByte & 0x0F) as Codec,
  };
}

/**
 * 构造 Format 字节
 */
export function makeFormat(pixelFormat: PixelFormat, codec: Codec): number {
  return ((pixelFormat & 0x0F) << 4) | (codec & 0x0F);
}

/**
 * 图传帧 (0xCC)
 * 帧结构: ID(1) + Length(2) + Frame(2) + Width(1) + Height(1) + Format(1) + Payload(N) + Checksum(1)
 * Length = Frame(2) + Width(1) + Height(1) + Format(1) + Payload(N) = 5 + N
 */
export interface ImageFrame {
  type: 'IMAGE';
  length: number;           // 2字节 uint16 大端，帧头后+校验和前总字节数
  frameId: number;          // 2字节 uint16 大端
  width: number;            // 1字节 图像宽度（像素）
  height: number;           // 1字节 图像高度（像素）
  format: number;           // 1字节 Format: 高4位=PixelFormat，低4位=Codec
  pixelFormat: PixelFormat; // 像素格式（从 format 解析）
  codec: Codec;             // 编码方式（从 format 解析）
  payload: Uint8Array;      // N字节 编码后的数据
  checksum: number;         // 1字节
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
 * 资源帧 (0xEE)
 * 帧结构: ID(1) + Length(2) + Data(Length B) + Checksum(1)
 * Data 为不透明数据块，由 resourceSlots 配置决定内部 Cell 划分
 */
export interface ResourceFrame {
  type: 'RESOURCE';
  length: number;         // 2字节 uint16 大端，Data 字节数
  resData: Uint8Array;    // Length 字节原始数据
  checksum: number;       // 1字节
}

/**
 * CLI 帧 flags (0xFF 帧第一个数据字节)
 */
export enum CliFlags {
  CONT = 0x00,  // 命令仍在执行，后续还有输出
  END  = 0x01,  // 命令执行完毕
  ERR  = 0x02,  // 命令执行出错（可与 END 组合：0x03）
}

/**
 * CLI输出帧 (0xFF)
 * 帧结构: ID(1) + Length(2) + Flags(1) + Text(Length-1 B) + Checksum(1)
 * Length 包含 Flags 字节，最小 Length=1（仅 Flags，无文本）
 */
export interface CliFrame {
  type: 'CLI';
  length: number;
  flags: CliFlags;        // 执行状态
  text: string;           // UTF-8 文本块（可为空）
  checksum: number;
}

export type TelemetryFrame = ImageFrame | LogFrame | ResourceFrame | CliFrame;

/**
 * 帧解析状态机
 */
export enum FrameParseState {
  WAIT_HEADER = 0,       // 等待帧头
  READ_IMAGE_DATA = 1,   // 读图传帧数据
  READ_LOG_DATA = 2,     // 读日志帧数据
  READ_RESOURCE_DATA = 3,// 读资源帧数据
  READ_CLI_DATA = 4,     // 读CLI输出帧数据
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
