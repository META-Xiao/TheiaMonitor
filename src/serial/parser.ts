import {
  FRAME_TYPE,
  FRAME_SIZE,
  TelemetryFrame,
  ImageFrame,
  LogFrame,
  ResourceFrame,
  FrameParseState,
  calculateChecksum,
  verifyChecksum,
} from './protocol';

/**
 * 帧解析错误
 */
export class FrameParseError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FrameParseError';
  }
}

/**
 * 遥测帧解析器（状态机）
 *
 * 状态转移：
 *   WAIT_HEADER
 *     → 读到 0xCC → READ_IMAGE_DATA (读22569字节)
 *     → 读到 0xDD → READ_LOG_DATA (读长度，然后读日志+校验)
 *     → 读到 0xEE → READ_RESOURCE_DATA (读17字节)
 *     → 其他字节 → 丢弃，继续等待
 */
export class FrameParser {
  private state: FrameParseState = FrameParseState.WAIT_HEADER;
  private buffer: Uint8Array = new Uint8Array(FRAME_SIZE.LOG_MAX);
  private bufferPos: number = 0;
  private targetSize: number = 0;
  private currentFrameType: number | null = null;

  /**
   * 解析接收到的字节数组
   * @param bytes 新接收的字节
   * @returns 解析成功的帧数组，失败的帧返回 null
   */
  parse(bytes: Uint8Array): (TelemetryFrame | FrameParseError)[] {
    const results: (TelemetryFrame | FrameParseError)[] = [];

    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i];

      try {
        const frame = this.processByte(byte);
        if (frame !== null) {
          results.push(frame);
        }
      } catch (error) {
        if (error instanceof FrameParseError) {
          results.push(error);
        } else {
          results.push(
            new FrameParseError('UNKNOWN_ERROR', `Unknown error: ${error}`),
          );
        }
        // 重置状态，继续解析下一个字节
        this.resetState();
      }
    }

    return results;
  }

  /**
   * 处理单个字节
   */
  private processByte(byte: number): TelemetryFrame | null {
    switch (this.state) {
      case FrameParseState.WAIT_HEADER:
        return this.handleWaitHeader(byte);

      case FrameParseState.READ_IMAGE_DATA:
        return this.handleImageData(byte);

      case FrameParseState.READ_LOG_DATA:
        return this.handleLogData(byte);

      case FrameParseState.READ_RESOURCE_DATA:
        return this.handleResourceData(byte);

      default:
        throw new Error(`Unknown state: ${this.state}`);
    }
  }

  /**
   * 等待帧头
   */
  private handleWaitHeader(byte: number): TelemetryFrame | null {
    switch (byte) {
      case FRAME_TYPE.IMAGE:
        this.currentFrameType = FRAME_TYPE.IMAGE;
        this.state = FrameParseState.READ_IMAGE_DATA;
        this.bufferPos = 0;
        this.targetSize = 0; // 先读 Length 字段动态确定大小
        return null;

      case FRAME_TYPE.LOG:
        this.currentFrameType = FRAME_TYPE.LOG;
        this.state = FrameParseState.READ_LOG_DATA;
        this.bufferPos = 0;
        this.targetSize = 0; // 先读长度
        return null;

      case FRAME_TYPE.RESOURCE:
        this.currentFrameType = FRAME_TYPE.RESOURCE;
        this.state = FrameParseState.READ_RESOURCE_DATA;
        this.bufferPos = 0;
        this.targetSize = 0; // 先读 Length 字段动态确定大小
        return null;

      default:
        // 忽略非法帧头，继续等待
        return null;
    }
  }

  /**
   * 读图传帧数据：Length(2) + Frame(2) + Width(1) + Height(1) + ImageData(W×H) + Checksum(1)
   * 先读前2字节获取 Length，动态确定帧边界，再按 Length 读取剩余数据。
   */
  private handleImageData(byte: number): TelemetryFrame | null {
    this.buffer[this.bufferPos++] = byte;

    // 前2字节为 Length
    if (this.bufferPos === 2) {
      const length = (this.buffer[0] << 8) | this.buffer[1];
      // targetSize = Length字段(2) + 数据体(length) + checksum(1)
      this.targetSize = length + 3;
      if (this.buffer.length < this.targetSize) {
        const grown = new Uint8Array(this.targetSize);
        grown.set(this.buffer.slice(0, 2));
        this.buffer = grown;
      }
      return null;
    }

    if (this.targetSize === 0 || this.bufferPos < this.targetSize) {
      return null;
    }

    const length = (this.buffer[0] << 8) | this.buffer[1];
    const frameId = (this.buffer[2] << 8) | this.buffer[3];
    const width = this.buffer[4];
    const height = this.buffer[5];
    const imageDataSize = length - 4; // 减去 Frame(2)+Width(1)+Height(1)
    const imageData = this.buffer.slice(6, 6 + imageDataSize);
    const checksum = this.buffer[this.bufferPos - 1];

    /* 兼容灰度(旧)和 RGB565(新) 两种格式，按数据大小自动识别 */
    {
      const graySize = width * height;
      const rgbSize  = width * height * 2;
      if (imageDataSize !== graySize && imageDataSize !== rgbSize) {
        throw new FrameParseError(
          'IMAGE_SIZE_MISMATCH',
          `Image size mismatch: Length implies ${imageDataSize} bytes, ` +
          `but ${width}×${height}=${graySize}(gray) or ×2=${rgbSize}(RGB565)`,
        );
      }
    }

    const dataToCheck = new Uint8Array(1 + this.bufferPos - 1);
    dataToCheck[0] = FRAME_TYPE.IMAGE;
    dataToCheck.set(this.buffer.slice(0, this.bufferPos - 1), 1);
    if (!verifyChecksum(dataToCheck, checksum)) {
      throw new FrameParseError(
        'IMAGE_CHECKSUM_ERROR',
        `Image frame checksum mismatch: expected ${checksum}, got ${calculateChecksum(dataToCheck)}`,
      );
    }

    this.resetState();

    const frame: ImageFrame = {
      type: 'IMAGE',
      length,
      frameId,
      width,
      height,
      imageData: new Uint8Array(imageData),
      checksum,
    };

    return frame;
  }

  /**
   * 读日志帧数据：length(2) + logData(0-256) + checksum(1)
   */
  private handleLogData(byte: number): TelemetryFrame | null {
    // 前2字节为长度
    if (this.bufferPos < 2) {
      this.buffer[this.bufferPos++] = byte;
      return null;
    }

    // 读取长度
    if (this.bufferPos === 2) {
      const length = (this.buffer[0] << 8) | this.buffer[1];

      if (length > 256) {
        throw new FrameParseError(
          'LOG_LENGTH_ERROR',
          `Log frame length ${length} exceeds maximum 256`,
        );
      }

      this.targetSize = 2 + length + 1; // length(2) + data(length) + checksum(1)
    }

    // 继续读取日志数据和校验和
    this.buffer[this.bufferPos++] = byte;

    if (this.bufferPos < this.targetSize) {
      return null; // 继续读取
    }

    // 解析完毕
    const length = (this.buffer[0] << 8) | this.buffer[1];
    const logDataBytes = this.buffer.slice(2, 2 + length);
    const checksum = this.buffer[this.bufferPos - 1];

    // 校验：MCU 的 checksum 包含帧头字节 0xDD
    const dataToCheck = new Uint8Array(1 + this.bufferPos - 1);
    dataToCheck[0] = FRAME_TYPE.LOG;
    dataToCheck.set(this.buffer.slice(0, this.bufferPos - 1), 1);
    if (!verifyChecksum(dataToCheck, checksum)) {
      throw new FrameParseError(
        'LOG_CHECKSUM_ERROR',
        `Log frame checksum mismatch`,
      );
    }

    this.resetState();

    // 尝试解码为UTF-8字符串
    let logData = '';
    try {
      logData = new TextDecoder('utf-8').decode(logDataBytes);
    } catch (error) {
      throw new FrameParseError(
        'LOG_DECODE_ERROR',
        `Failed to decode log data as UTF-8`,
      );
    }

    const frame: LogFrame = {
      type: 'LOG',
      length,
      logData,
      checksum,
    };

    return frame;
  }

  /**
   * 读资源帧数据：Length(2) + Data(Length B) + Checksum(1)
   * Parser 不关心 Data 内部划分，仅按 Length 读取原始字节。
   */
  private handleResourceData(byte: number): TelemetryFrame | null {
    this.buffer[this.bufferPos++] = byte;

    // 前2字节为 Length
    if (this.bufferPos === 2) {
      const length = (this.buffer[0] << 8) | this.buffer[1];
      // targetSize = Length字段(2) + Data(length) + Checksum(1)
      this.targetSize = length + 3;
      if (this.buffer.length < this.targetSize) {
        const grown = new Uint8Array(this.targetSize);
        grown.set(this.buffer.slice(0, 2));
        this.buffer = grown;
      }
      return null;
    }

    if (this.targetSize === 0 || this.bufferPos < this.targetSize) {
      return null;
    }

    const length = (this.buffer[0] << 8) | this.buffer[1];
    const resData = this.buffer.slice(2, 2 + length);
    const checksum = this.buffer[this.bufferPos - 1];

    const dataToCheck = new Uint8Array(1 + this.bufferPos - 1);
    dataToCheck[0] = FRAME_TYPE.RESOURCE;
    dataToCheck.set(this.buffer.slice(0, this.bufferPos - 1), 1);
    if (!verifyChecksum(dataToCheck, checksum)) {
      throw new FrameParseError('RESOURCE_CHECKSUM_ERROR', 'Resource frame checksum mismatch');
    }

    this.resetState();
    return { type: 'RESOURCE', length, resData: new Uint8Array(resData), checksum } as ResourceFrame;
  }

  /**
   * 重置状态机
   */
  /** 公开重置方法，清空内部缓冲和状态机 */
  reset(): void {
    this.buffer = new Uint8Array(0);
    this.resetState();
  }

  private resetState(): void {
    this.state = FrameParseState.WAIT_HEADER;
    this.bufferPos = 0;
    this.targetSize = 0;
    this.currentFrameType = null;
  }
}
