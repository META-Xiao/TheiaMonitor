import { describe, it, expect } from 'vitest';
import {
  FRAME_TYPE,
  FRAME_SIZE,
  calculateChecksum,
  verifyChecksum,
  ImageFrame,
  LogFrame,
  ResourceFrame,
  CliFrame,
  CliFlags,
  TelemetryFrame,
  PixelFormat,
  Codec,
  makeFormat,
} from '../protocol';
import { FrameParser, FrameParseError } from '../parser';

describe('Protocol', () => {
  describe('Checksum', () => {
    it('should calculate checksum correctly', () => {
      const data = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
      const checksum = calculateChecksum(data);
      expect(checksum).toBe((0x01 + 0x02 + 0x03 + 0x04) & 0xFF);
    });

    it('should handle overflow', () => {
      const data = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF]);
      const checksum = calculateChecksum(data);
      expect(checksum).toBe((0xFF + 0xFF + 0xFF + 0xFF) & 0xFF);
    });

    it('should verify checksum correctly', () => {
      const data = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
      const checksum = calculateChecksum(data);
      expect(verifyChecksum(data, checksum)).toBe(true);
      expect(verifyChecksum(data, (checksum + 1) & 0xFF)).toBe(false);
    });
  });
});

describe('FrameParser', () => {
  let parser: FrameParser;

  beforeEach(() => {
    parser = new FrameParser();
  });

  describe('Log Frame (0xDD)', () => {
    it('should parse valid log frame', () => {
      // 构造日志帧：0xDD + length(2) + data + checksum
      const logText = 'Hello World';
      const logBytes = new TextEncoder().encode(logText);
      const length = logBytes.length;

      // 构造帧数据（不含帧头）
      const frameData = new Uint8Array(2 + length + 1);
      frameData[0] = (length >> 8) & 0xFF;
      frameData[1] = length & 0xFF;
      frameData.set(logBytes, 2);

      // 计算校验和（含帧头）
      const dataToCheck = new Uint8Array(1 + 2 + length);
      dataToCheck[0] = FRAME_TYPE.LOG;
      dataToCheck.set(frameData.slice(0, 2 + length), 1);
      const checksum = calculateChecksum(dataToCheck);
      frameData[2 + length] = checksum;

      // 构造完整帧
      const frame = new Uint8Array(1 + frameData.length);
      frame[0] = FRAME_TYPE.LOG;
      frame.set(frameData, 1);

      // 解析
      const results = parser.parse(frame);
      expect(results).toHaveLength(1);
      expect(results[0]).not.toBeInstanceOf(FrameParseError);

      const logFrame = results[0] as LogFrame;
      expect(logFrame.type).toBe('LOG');
      expect(logFrame.length).toBe(length);
      expect(logFrame.logData).toBe(logText);
      expect(logFrame.checksum).toBe(checksum);
    });

    it('should handle empty log frame', () => {
      // 空日志：length = 0
      const frameData = new Uint8Array([0x00, 0x00, 0x00]);
      const emptyCheck = new Uint8Array([FRAME_TYPE.LOG, 0x00, 0x00]);
      frameData[2] = calculateChecksum(emptyCheck);

      const frame = new Uint8Array(1 + frameData.length);
      frame[0] = FRAME_TYPE.LOG;
      frame.set(frameData, 1);

      const results = parser.parse(frame);
      expect(results).toHaveLength(1);
      expect(results[0]).not.toBeInstanceOf(FrameParseError);

      const logFrame = results[0] as LogFrame;
      expect(logFrame.length).toBe(0);
      expect(logFrame.logData).toBe('');
    });

    it('should handle max length log frame', () => {
      // 最大长度日志 (256 字节)
      const logBytes = new Uint8Array(256);
      logBytes.fill(0x41); // 'A'

      const frameData = new Uint8Array(2 + 256 + 1);
      frameData[0] = 0x01;
      frameData[1] = 0x00; // 256 in big-endian
      frameData.set(logBytes, 2);

      const maxCheck = new Uint8Array(1 + 2 + 256);
      maxCheck[0] = FRAME_TYPE.LOG;
      maxCheck.set(frameData.slice(0, 2 + 256), 1);
      frameData[2 + 256] = calculateChecksum(maxCheck);

      const frame = new Uint8Array(1 + frameData.length);
      frame[0] = FRAME_TYPE.LOG;
      frame.set(frameData, 1);

      const results = parser.parse(frame);
      expect(results).toHaveLength(1);
      expect(results[0]).not.toBeInstanceOf(FrameParseError);

      const logFrame = results[0] as LogFrame;
      expect(logFrame.length).toBe(256);
    });

    it('should reject invalid checksum', () => {
      const logText = 'Test';
      const logBytes = new TextEncoder().encode(logText);
      const length = logBytes.length;

      const frameData = new Uint8Array(2 + length + 1);
      frameData[0] = (length >> 8) & 0xFF;
      frameData[1] = length & 0xFF;
      frameData.set(logBytes, 2);
      frameData[2 + length] = 0xFF; // 错误的校验和

      const frame = new Uint8Array(1 + frameData.length);
      frame[0] = FRAME_TYPE.LOG;
      frame.set(frameData, 1);

      const results = parser.parse(frame);
      expect(results).toHaveLength(1);
      expect(results[0]).toBeInstanceOf(FrameParseError);
      expect((results[0] as FrameParseError).code).toBe('LOG_CHECKSUM_ERROR');
    });

    it('should reject length > 256', () => {
      const frameData = new Uint8Array(2 + 1);
      frameData[0] = 0x01;
      frameData[1] = 0x01; // 257 in big-endian

      const frame = new Uint8Array(1 + frameData.length);
      frame[0] = FRAME_TYPE.LOG;
      frame.set(frameData, 1);

      const results = parser.parse(frame);
      expect(results.length).toBeGreaterThan(0);
      const hasError = results.some(
        (r) =>
          r instanceof FrameParseError && r.code === 'LOG_LENGTH_ERROR',
      );
      expect(hasError).toBe(true);
    });
  });

  describe('Resource Frame (0xEE)', () => {
    // 默认预设: CPU(u8)+RAM(u16)+ROM(u16)+Speed(i16)+Servo(i16) = 9B
    it('should parse resource frame — parser only extracts raw resData', () => {
      const resData = new Uint8Array([
        50,           // CPU = 50% (u8)
        0x56, 0x78,   // RAM = 0x5678 (u16)
        0x12, 0x34,   // ROM = 0x1234 (u16)
        0x00, 0x64,   // Speed = 100 (i16)
        0x00, 0xC8,   // Servo = 200 (i16)
      ]);
      const length = resData.length; // 9

      const frameData = new Uint8Array(2 + length + 1);
      frameData[0] = (length >> 8) & 0xFF;
      frameData[1] = length & 0xFF;
      frameData.set(resData, 2);

      const dataToCheck = new Uint8Array(1 + 2 + length);
      dataToCheck[0] = FRAME_TYPE.RESOURCE;
      dataToCheck.set(frameData.slice(0, 2 + length), 1);
      frameData[2 + length] = calculateChecksum(dataToCheck);

      const frame = new Uint8Array(1 + frameData.length);
      frame[0] = FRAME_TYPE.RESOURCE;
      frame.set(frameData, 1);

      const results = parser.parse(frame);
      expect(results).toHaveLength(1);
      expect(results[0]).not.toBeInstanceOf(FrameParseError);

      const resourceFrame = results[0] as ResourceFrame;
      expect(resourceFrame.type).toBe('RESOURCE');
      expect(resourceFrame.length).toBe(length);
      expect(resourceFrame.resData.length).toBe(length);
      expect(resourceFrame.resData[0]).toBe(50);  // CPU
      expect(resourceFrame.resData[4]).toBe(0x34); // ROM lo byte
    });

    it('should reject invalid checksum on resource frame', () => {
      const resData = new Uint8Array([50, 0x12, 0x34, 0x56, 0x78, 0x00, 0x64, 0x00, 0xC8]);
      const length = resData.length;

      const frameData = new Uint8Array(2 + length + 1);
      frameData[0] = (length >> 8) & 0xFF;
      frameData[1] = length & 0xFF;
      frameData.set(resData, 2);
      frameData[2 + length] = 0xFF; // 错误校验和

      const frame = new Uint8Array(1 + frameData.length);
      frame[0] = FRAME_TYPE.RESOURCE;
      frame.set(frameData, 1);

      const results = parser.parse(frame);
      expect(results).toHaveLength(1);
      expect(results[0]).toBeInstanceOf(FrameParseError);
      expect((results[0] as FrameParseError).code).toBe('RESOURCE_CHECKSUM_ERROR');
    });
  });

  describe('Image Frame (0xCC)', () => {
    const W = 10;
    const H = 10;

    it('should parse valid grayscale RAW image frame', () => {
      const payload = new Uint8Array(W * H);
      for (let i = 0; i < payload.length; i++) payload[i] = i % 256;

      const format = makeFormat(PixelFormat.Gray8, Codec.RAW);
      const length = 5 + payload.length; // Frame(2)+W(1)+H(1)+Fmt(1)+Payload
      const frameData = new Uint8Array(2 + length + 1);
      frameData[0] = (length >> 8) & 0xFF;
      frameData[1] = length & 0xFF;
      frameData[2] = 0; frameData[3] = 1;    // frameId = 1
      frameData[4] = W;                        // width
      frameData[5] = H;                        // height
      frameData[6] = format;                   // Format byte
      frameData.set(payload, 7);

      const dataToCheck = new Uint8Array(1 + 2 + length);
      dataToCheck[0] = FRAME_TYPE.IMAGE;
      dataToCheck.set(frameData.slice(0, 2 + length), 1);
      frameData[2 + length] = calculateChecksum(dataToCheck);

      const frame = new Uint8Array(1 + frameData.length);
      frame[0] = FRAME_TYPE.IMAGE;
      frame.set(frameData, 1);

      const results = parser.parse(frame);
      expect(results).toHaveLength(1);
      expect(results[0]).not.toBeInstanceOf(FrameParseError);

      const imgFrame = results[0] as ImageFrame;
      expect(imgFrame.type).toBe('IMAGE');
      expect(imgFrame.frameId).toBe(1);
      expect(imgFrame.width).toBe(W);
      expect(imgFrame.height).toBe(H);
      expect(imgFrame.pixelFormat).toBe(PixelFormat.Gray8);
      expect(imgFrame.codec).toBe(Codec.RAW);
      expect(imgFrame.format).toBe(format);
      expect(imgFrame.payload.length).toBe(W * H);
    });

    it('should parse valid RGB565 RAW image frame', () => {
      const payload = new Uint8Array(W * H * 2);
      const format = makeFormat(PixelFormat.RGB565, Codec.RAW);
      const length = 5 + payload.length;
      const frameData = new Uint8Array(2 + length + 1);
      frameData[0] = (length >> 8) & 0xFF;
      frameData[1] = length & 0xFF;
      frameData[2] = 0; frameData[3] = 0; // frameId
      frameData[4] = W;
      frameData[5] = H;
      frameData[6] = format;
      frameData.set(payload, 7);

      const dataToCheck = new Uint8Array(1 + 2 + length);
      dataToCheck[0] = FRAME_TYPE.IMAGE;
      dataToCheck.set(frameData.slice(0, 2 + length), 1);
      frameData[2 + length] = calculateChecksum(dataToCheck);

      const frame = new Uint8Array(1 + frameData.length);
      frame[0] = FRAME_TYPE.IMAGE;
      frame.set(frameData, 1);

      const results = parser.parse(frame);
      expect(results).toHaveLength(1);
      expect(results[0]).not.toBeInstanceOf(FrameParseError);

      const imgFrame = results[0] as ImageFrame;
      expect(imgFrame.pixelFormat).toBe(PixelFormat.RGB565);
      expect(imgFrame.codec).toBe(Codec.RAW);
      expect(imgFrame.payload.length).toBe(W * H * 2);
    });

    it('should parse image frame with HEATSHRINK codec (no size validation)', () => {
      const payload = new Uint8Array([0xAA, 0xBB, 0xCC]);
      const format = makeFormat(PixelFormat.RGB565, Codec.HEATSHRINK);
      const length = 5 + payload.length;
      const frameData = new Uint8Array(2 + length + 1);
      frameData[0] = (length >> 8) & 0xFF;
      frameData[1] = length & 0xFF;
      frameData[2] = 0; frameData[3] = 1;
      frameData[4] = W;
      frameData[5] = H;
      frameData[6] = format;
      frameData.set(payload, 7);

      const dataToCheck = new Uint8Array(1 + 2 + length);
      dataToCheck[0] = FRAME_TYPE.IMAGE;
      dataToCheck.set(frameData.slice(0, 2 + length), 1);
      frameData[2 + length] = calculateChecksum(dataToCheck);

      const frame = new Uint8Array(1 + frameData.length);
      frame[0] = FRAME_TYPE.IMAGE;
      frame.set(frameData, 1);

      const results = parser.parse(frame);
      expect(results).toHaveLength(1);
      expect(results[0]).not.toBeInstanceOf(FrameParseError);

      const imgFrame = results[0] as ImageFrame;
      expect(imgFrame.pixelFormat).toBe(PixelFormat.RGB565);
      expect(imgFrame.codec).toBe(Codec.HEATSHRINK);
      expect(imgFrame.payload.length).toBe(3);
    });

    it('should reject image frame with wrong payload size for fixed format', () => {
      const payload = new Uint8Array(W * H + 5); // should be W*H for Gray8
      const format = makeFormat(PixelFormat.Gray8, Codec.RAW);
      const length = 5 + payload.length;
      const frameData = new Uint8Array(2 + length + 1);
      frameData[0] = (length >> 8) & 0xFF;
      frameData[1] = length & 0xFF;
      frameData[2] = 0; frameData[3] = 0;
      frameData[4] = W;
      frameData[5] = H;
      frameData[6] = format;
      frameData.set(payload, 7);

      const dataToCheck = new Uint8Array(1 + 2 + length);
      dataToCheck[0] = FRAME_TYPE.IMAGE;
      dataToCheck.set(frameData.slice(0, 2 + length), 1);
      frameData[2 + length] = calculateChecksum(dataToCheck);

      const frame = new Uint8Array(1 + frameData.length);
      frame[0] = FRAME_TYPE.IMAGE;
      frame.set(frameData, 1);

      const results = parser.parse(frame);
      expect(results).toHaveLength(1);
      expect(results[0]).toBeInstanceOf(FrameParseError);
      expect((results[0] as FrameParseError).code).toBe('IMAGE_SIZE_MISMATCH');
    });

    it('should reject image frame with bad checksum', () => {
      const payload = new Uint8Array(W * H);
      const format = makeFormat(PixelFormat.Gray8, Codec.RAW);
      const length = 5 + payload.length;
      const frameData = new Uint8Array(2 + length + 1);
      frameData[0] = (length >> 8) & 0xFF;
      frameData[1] = length & 0xFF;
      frameData[2] = 0; frameData[3] = 0;
      frameData[4] = W;
      frameData[5] = H;
      frameData[6] = format;
      frameData.set(payload, 7);
      frameData[2 + length] = 0xFF; // wrong checksum

      const frame = new Uint8Array(1 + frameData.length);
      frame[0] = FRAME_TYPE.IMAGE;
      frame.set(frameData, 1);

      const results = parser.parse(frame);
      expect(results).toHaveLength(1);
      expect(results[0]).toBeInstanceOf(FrameParseError);
      expect((results[0] as FrameParseError).code).toBe('IMAGE_CHECKSUM_ERROR');
    });

    it('should handle fragmented image frame reception', () => {
      const payload = new Uint8Array(W * H);
      for (let i = 0; i < payload.length; i++) payload[i] = 128;
      const format = makeFormat(PixelFormat.Gray8, Codec.RAW);
      const length = 5 + payload.length;
      const frameData = new Uint8Array(2 + length + 1);
      frameData[0] = (length >> 8) & 0xFF;
      frameData[1] = length & 0xFF;
      frameData[2] = 0; frameData[3] = 1;
      frameData[4] = W;
      frameData[5] = H;
      frameData[6] = format;
      frameData.set(payload, 7);

      const dataToCheck = new Uint8Array(1 + 2 + length);
      dataToCheck[0] = FRAME_TYPE.IMAGE;
      dataToCheck.set(frameData.slice(0, 2 + length), 1);
      frameData[2 + length] = calculateChecksum(dataToCheck);

      const fullFrame = new Uint8Array(1 + frameData.length);
      fullFrame[0] = FRAME_TYPE.IMAGE;
      fullFrame.set(frameData, 1);

      // byte-by-byte feed
      let results: (TelemetryFrame | FrameParseError)[] = [];
      for (let i = 0; i < fullFrame.length; i++) {
        results = results.concat(parser.parse(new Uint8Array([fullFrame[i]])));
      }

      expect(results).toHaveLength(1);
      const imgFrame = results[0] as ImageFrame;
      expect(imgFrame.frameId).toBe(1);
      expect(imgFrame.pixelFormat).toBe(PixelFormat.Gray8);
      expect(imgFrame.payload.length).toBe(W * H);
    });
  });

  describe('Multiple frames', () => {
    it('should parse multiple frames in one chunk', () => {
      // 构造两个日志帧
      const createLogFrame = (text: string) => {
        const logBytes = new TextEncoder().encode(text);
        const length = logBytes.length;

        const frameData = new Uint8Array(2 + length + 1);
        frameData[0] = (length >> 8) & 0xFF;
        frameData[1] = length & 0xFF;
        frameData.set(logBytes, 2);

        const dataToCheck = new Uint8Array(1 + 2 + length);
        dataToCheck[0] = FRAME_TYPE.LOG;
        dataToCheck.set(frameData.slice(0, 2 + length), 1);
        frameData[2 + length] = calculateChecksum(dataToCheck);

        const frame = new Uint8Array(1 + frameData.length);
        frame[0] = FRAME_TYPE.LOG;
        frame.set(frameData, 1);

        return frame;
      };

      const frame1 = createLogFrame('First');
      const frame2 = createLogFrame('Second');

      // 合并两个帧
      const combined = new Uint8Array(frame1.length + frame2.length);
      combined.set(frame1);
      combined.set(frame2, frame1.length);

      const results = parser.parse(combined);
      expect(results).toHaveLength(2);
      expect((results[0] as LogFrame).logData).toBe('First');
      expect((results[1] as LogFrame).logData).toBe('Second');
    });

    it('should handle fragmented frame reception', () => {
      const logText = 'Test';
      const logBytes = new TextEncoder().encode(logText);
      const length = logBytes.length;

      const frameData = new Uint8Array(2 + length + 1);
      frameData[0] = (length >> 8) & 0xFF;
      frameData[1] = length & 0xFF;
      frameData.set(logBytes, 2);

      const dataToCheck = new Uint8Array(1 + 2 + length);
      dataToCheck[0] = FRAME_TYPE.LOG;
      dataToCheck.set(frameData.slice(0, 2 + length), 1);
      frameData[2 + length] = calculateChecksum(dataToCheck);

      const fullFrame = new Uint8Array(1 + frameData.length);
      fullFrame[0] = FRAME_TYPE.LOG;
      fullFrame.set(frameData, 1);

      // 将帧分成多个小块接收
      let results: (TelemetryFrame | FrameParseError)[] = [];
      for (let i = 0; i < fullFrame.length; i++) {
        results = results.concat(
          parser.parse(new Uint8Array([fullFrame[i]])),
        );
      }

      expect(results).toHaveLength(1);
      expect((results[0] as LogFrame).logData).toBe('Test');
    });
  });

  describe('CLI Frame (0xFF)', () => {
    function buildCliFrame(text: string, flags: CliFlags = CliFlags.END): Uint8Array {
      const data = new TextEncoder().encode(text);
      const length = 1 + data.length; // Flags(1) + Text
      const frameData = new Uint8Array(2 + length + 1);
      frameData[0] = (length >> 8) & 0xFF;
      frameData[1] = length & 0xFF;
      frameData[2] = flags;
      frameData.set(data, 3);
      const toCheck = new Uint8Array(1 + 2 + length);
      toCheck[0] = FRAME_TYPE.CLI;
      toCheck.set(frameData.slice(0, 2 + length), 1);
      frameData[2 + length] = calculateChecksum(toCheck);
      const frame = new Uint8Array(1 + frameData.length);
      frame[0] = FRAME_TYPE.CLI;
      frame.set(frameData, 1);
      return frame;
    }

    it('should parse CLI frame with END flag', () => {
      const results = parser.parse(buildCliFrame('OK\r\n', CliFlags.END));
      expect(results).toHaveLength(1);
      expect(results[0]).not.toBeInstanceOf(FrameParseError);
      const f = results[0] as CliFrame;
      expect(f.type).toBe('CLI');
      expect(f.flags).toBe(CliFlags.END);
      expect(f.text).toBe('OK\r\n');
    });

    it('should parse CLI frame with CONT flag', () => {
      const results = parser.parse(buildCliFrame('1\r\n', CliFlags.CONT));
      expect(results).toHaveLength(1);
      const f = results[0] as CliFrame;
      expect(f.flags).toBe(CliFlags.CONT);
      expect(f.text).toBe('1\r\n');
    });

    it('should parse flags-only END frame (no text)', () => {
      // Length=1, only Flags byte, no text
      const frameData = new Uint8Array(2 + 1 + 1);
      frameData[0] = 0x00; frameData[1] = 0x01; // length=1
      frameData[2] = CliFlags.END;
      const toCheck = new Uint8Array([FRAME_TYPE.CLI, 0x00, 0x01, CliFlags.END]);
      frameData[3] = calculateChecksum(toCheck);
      const frame = new Uint8Array([FRAME_TYPE.CLI, ...frameData]);
      const results = parser.parse(frame);
      expect(results).toHaveLength(1);
      const f = results[0] as CliFrame;
      expect(f.flags).toBe(CliFlags.END);
      expect(f.text).toBe('');
    });

    it('should parse multi-chunk CONT frames followed by END', () => {
      const f1 = buildCliFrame('line1\n', CliFlags.CONT);
      const f2 = buildCliFrame('line2\n', CliFlags.END);
      const combined = new Uint8Array(f1.length + f2.length);
      combined.set(f1); combined.set(f2, f1.length);
      const results = parser.parse(combined);
      expect(results).toHaveLength(2);
      expect((results[0] as CliFrame).flags).toBe(CliFlags.CONT);
      expect((results[1] as CliFrame).flags).toBe(CliFlags.END);
    });

    it('should handle fragmented CLI frame byte-by-byte', () => {
      const frame = buildCliFrame('hello', CliFlags.END);
      let results: (TelemetryFrame | FrameParseError)[] = [];
      for (const b of frame) results = results.concat(parser.parse(new Uint8Array([b])));
      expect(results).toHaveLength(1);
      const f = results[0] as CliFrame;
      expect(f.text).toBe('hello');
      expect(f.flags).toBe(CliFlags.END);
    });

    it('should reject invalid checksum', () => {
      const frame = buildCliFrame('test', CliFlags.END);
      frame[frame.length - 1] ^= 0xFF;
      const results = parser.parse(frame);
      expect(results[0]).toBeInstanceOf(FrameParseError);
      expect((results[0] as FrameParseError).code).toBe('CLI_CHECKSUM_ERROR');
    });

    it('should reject length=0 (must be >= 1 for Flags byte)', () => {
      const frame = new Uint8Array([FRAME_TYPE.CLI, 0x00, 0x00, 0x00]);
      const results = parser.parse(frame);
      expect(results.some(r => r instanceof FrameParseError && (r as FrameParseError).code === 'CLI_LENGTH_ERROR')).toBe(true);
    });
  });

  describe('Error recovery', () => {
    it('should recover from invalid frame header', () => {
      // 发送无效帧头，然后发送有效帧
      const invalidByte = 0xAA;

      const logText = 'Valid';
      const logBytes = new TextEncoder().encode(logText);
      const length = logBytes.length;

      const frameData = new Uint8Array(2 + length + 1);
      frameData[0] = (length >> 8) & 0xFF;
      frameData[1] = length & 0xFF;
      frameData.set(logBytes, 2);

      const dataToCheck2 = new Uint8Array(1 + 2 + length);
      dataToCheck2[0] = FRAME_TYPE.LOG;
      dataToCheck2.set(frameData.slice(0, 2 + length), 1);
      frameData[2 + length] = calculateChecksum(dataToCheck2);

      const validFrame = new Uint8Array(1 + frameData.length);
      validFrame[0] = FRAME_TYPE.LOG;
      validFrame.set(frameData, 1);

      // 先发无效字节，后发有效帧
      const combined = new Uint8Array(1 + validFrame.length);
      combined[0] = invalidByte;
      combined.set(validFrame, 1);

      const results = parser.parse(combined);
      // 应该忽略无效字节，成功解析有效帧
      const validFrames = results.filter(
        (r) => 'type' in r && r.type === 'LOG' && (r as LogFrame).logData === 'Valid',
      );
      expect(validFrames).toHaveLength(1);
    });
  });
});
