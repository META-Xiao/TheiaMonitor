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
  private buffer: Uint8Array = new Uint8Array(FRAME_SIZE.IMAGE);
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
        this.targetSize = FRAME_SIZE.IMAGE - 1; // 不含帧头本身
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
        this.targetSize = FRAME_SIZE.RESOURCE - 1; // 不含帧头
        return null;

      default:
        // 忽略非法帧头，继续等待
        return null;
    }
  }

  /**
   * 读图传帧数据：frameId(2) + fpsCam(1) + fpsOut(1) + width(1) + height(1) + imageData(W×H) + checksum(1)
   * 注意：帧头读到时 targetSize 已设为 FRAME_SIZE.IMAGE-1，但 width/height 在前6字节里，
   * 实际 imageData 大小 = width × height，需动态确定。
   * 为简化状态机，先读前6字节确定尺寸，再读剩余数据。
   */
  private handleImageData(byte: number): TelemetryFrame | null {
    this.buffer[this.bufferPos++] = byte;

    // 前6字节：frameId(2) + fpsCam(1) + fpsOut(1) + width(1) + height(1)
    if (this.bufferPos === 6) {
      const w = this.buffer[4];
      const h = this.buffer[5];
      this.targetSize = 6 + w * h + 1; // +1 for checksum
    }

    if (this.bufferPos < this.targetSize || this.targetSize === 0) {
      return null;
    }

    const frameId = (this.buffer[0] << 8) | this.buffer[1];
    const fpsCam = this.buffer[2];
    const fpsOut = this.buffer[3];
    const width = this.buffer[4];
    const height = this.buffer[5];
    const imageData = this.buffer.slice(6, 6 + width * height);
    const checksum = this.buffer[this.bufferPos - 1];

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
      frameId,
      fpsCam,
      fpsOut,
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
   * 读资源帧数据：cpu(1) + ram(1) + xdata(2) + edata(2) + speed(2) + servo(2) + reserved(6) + checksum(1)
   */
  private handleResourceData(byte: number): TelemetryFrame | null {
    this.buffer[this.bufferPos++] = byte;

    if (this.bufferPos < this.targetSize) {
      return null; // 继续读取
    }

    const cpuUsage = this.buffer[0];
    const ramUsage = this.buffer[1];
    const freeHeap  = (this.buffer[2] << 8) | this.buffer[3];
    const freeStack = (this.buffer[4] << 8) | this.buffer[5];
    const ramTotal  = (this.buffer[6] << 8) | this.buffer[7];
    const speed = ((this.buffer[8] & 0x80) ? -(0x10000 - ((this.buffer[8] << 8) | this.buffer[9])) : ((this.buffer[8] << 8) | this.buffer[9]));
    const servoAngle = ((this.buffer[10] & 0x80) ? -(0x10000 - ((this.buffer[10] << 8) | this.buffer[11])) : ((this.buffer[10] << 8) | this.buffer[11]));
    const reserved = this.buffer.slice(12, 16);
    const checksum = this.buffer[16];

    // 校验：MCU 的 checksum 包含帧头字节 0xEE
    const dataToCheck = new Uint8Array(1 + 16);
    dataToCheck[0] = FRAME_TYPE.RESOURCE;
    dataToCheck.set(this.buffer.slice(0, 16), 1);
    if (!verifyChecksum(dataToCheck, checksum)) {
      throw new FrameParseError(
        'RESOURCE_CHECKSUM_ERROR',
        `Resource frame checksum mismatch`,
      );
    }

    this.resetState();

    const frame: ResourceFrame = {
      type: 'RESOURCE',
      cpuUsage,
      ramUsage,
      freeHeap,
      freeStack,
      ramTotal,
      speed,
      servoAngle,
      reserved,
      checksum,
    };

    return frame;
  }

  /**
   * 重置状态机
   */
  private resetState(): void {
    this.state = FrameParseState.WAIT_HEADER;
    this.bufferPos = 0;
    this.targetSize = 0;
    this.currentFrameType = null;
  }
}
