import {
  FRAME_TYPE,
  FRAME_SIZE,
  TelemetryFrame,
  ImageFrame,
  LogFrame,
  ResourceFrame,
  CliFrame,
  CliFlags,
  FrameParseState,
  verifyChecksum,
  parseFormat,
  PixelFormat,
  Codec,
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

/** 计算给定 PixelFormat 的 RAW 帧预期数据大小，非 RAW codec 返回 0 表示不校验 */
function expectedPayloadSize(pixelFormat: PixelFormat, width: number, height: number): number {
  switch (pixelFormat) {
    case PixelFormat.Binary1: return Math.ceil((width * height) / 8);
    case PixelFormat.Gray8:   return width * height;
    case PixelFormat.RGB565:  return width * height * 2;
    case PixelFormat.RGB888:  return width * height * 3;
    case PixelFormat.YUV422:  return width * height * 2;
    case PixelFormat.JPEG:
    case PixelFormat.PNG:
    case PixelFormat.UserDefined:
    default:
      return 0; // 变长，不校验
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

      case FrameParseState.READ_CLI_DATA:
        return this.handleCliData(byte);

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
        this.targetSize = 0;
        return null;

      case FRAME_TYPE.CLI:
        this.currentFrameType = FRAME_TYPE.CLI;
        this.state = FrameParseState.READ_CLI_DATA;
        this.bufferPos = 0;
        this.targetSize = 0;
        return null;

      default:
        // 忽略非法帧头，继续等待
        return null;
    }
  }

  /**
   * 读图传帧数据：Length(2) + Frame(2) + Width(1) + Height(1) + Format(1) + Payload(N) + Checksum(1)
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
    const format = this.buffer[6];
    const payloadSize = length - 5; // 减去 Frame(2)+Width(1)+Height(1)+Format(1)
    const payload = this.buffer.slice(7, 7 + payloadSize);
    const checksum = this.buffer[this.bufferPos - 1];

    // 验证 Payload 尺寸：仅 RAW codec 校验（压缩/编码 codec 不适用）
    const { pixelFormat, codec } = parseFormat(format);
    if (codec === Codec.RAW) {
      const expectedSize = expectedPayloadSize(pixelFormat, width, height);
      if (expectedSize > 0 && payloadSize !== expectedSize) {
        throw new FrameParseError(
          'IMAGE_SIZE_MISMATCH',
          `Image size mismatch: expected ${expectedSize} bytes for ${PixelFormat[pixelFormat]}, ` +
          `got ${payloadSize} bytes (${width}×${height})`,
        );
      }
    }

    const dataToCheck = new Uint8Array(1 + this.bufferPos - 1);
    dataToCheck[0] = FRAME_TYPE.IMAGE;
    dataToCheck.set(this.buffer.slice(0, this.bufferPos - 1), 1);
    if (!verifyChecksum(dataToCheck, checksum)) {
      throw new FrameParseError(
        'IMAGE_CHECKSUM_ERROR',
        `Image frame checksum mismatch`,
      );
    }

    this.resetState();

    const frame: ImageFrame = {
      type: 'IMAGE',
      length,
      frameId,
      width,
      height,
      format,
      pixelFormat,
      codec,
      payload: new Uint8Array(payload),
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
   * 读CLI输出帧数据：Length(2) + Flags(1) + Text(Length-1 B) + Checksum(1)
   * Length 包含 Flags 字节，最小 Length=1
   */
  private handleCliData(byte: number): TelemetryFrame | null {
    if (this.bufferPos < 2) {
      this.buffer[this.bufferPos++] = byte;
      return null;
    }

    if (this.bufferPos === 2) {
      const length = (this.buffer[0] << 8) | this.buffer[1];
      if (length < 1 || length > 257) {
        throw new FrameParseError('CLI_LENGTH_ERROR', `CLI frame length ${length} out of range`);
      }
      this.targetSize = 2 + length + 1;
    }

    this.buffer[this.bufferPos++] = byte;

    if (this.bufferPos < this.targetSize) return null;

    const length = (this.buffer[0] << 8) | this.buffer[1];
    const flags: CliFlags = this.buffer[2];
    const textBytes = this.buffer.slice(3, 2 + length);
    const checksum = this.buffer[this.bufferPos - 1];

    const dataToCheck = new Uint8Array(1 + this.bufferPos - 1);
    dataToCheck[0] = FRAME_TYPE.CLI;
    dataToCheck.set(this.buffer.slice(0, this.bufferPos - 1), 1);
    if (!verifyChecksum(dataToCheck, checksum)) {
      throw new FrameParseError('CLI_CHECKSUM_ERROR', 'CLI frame checksum mismatch');
    }

    this.resetState();
    return { type: 'CLI', length, flags, text: new TextDecoder('utf-8').decode(textBytes), checksum };
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
