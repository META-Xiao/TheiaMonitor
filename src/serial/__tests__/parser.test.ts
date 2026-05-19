import { describe, it, expect } from 'vitest';
import {
  FRAME_TYPE,
  FRAME_SIZE,
  calculateChecksum,
  verifyChecksum,
  ImageFrame,
  LogFrame,
  ResourceFrame,
} from '../serial/protocol';
import { FrameParser, FrameParseError } from '../serial/parser';

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

      // 计算校验和（不含帧头）
      const dataToCheck = frameData.slice(0, 2 + length);
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
      const dataToCheck = frameData.slice(0, 2);
      frameData[2] = calculateChecksum(dataToCheck);

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

      const dataToCheck = frameData.slice(0, 2 + 256);
      frameData[2 + 256] = calculateChecksum(dataToCheck);

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
    it('should parse valid resource frame', () => {
      const frameData = new Uint8Array(17);
      frameData[0] = 50; // cpuUsage: 50%
      frameData[1] = 75; // ramUsage: 75%
      frameData[2] = 0x34; // freeXDATA: 0x1234 (little-endian)
      frameData[3] = 0x12;
      frameData[4] = 0x78; // freeEDATA: 0x5678 (little-endian)
      frameData[5] = 0x56;
      frameData[6] = 0x64; // speed: 0x0064 = 100 mm/s (little-endian)
      frameData[7] = 0x00;
      frameData[8] = 0xC8; // servoAngle: 0x00C8 = 200 (×10 = 20°) (little-endian)
      frameData[9] = 0x00;
      frameData.set(new Uint8Array(6), 10); // reserved

      const dataToCheck = frameData.slice(0, 16);
      const checksum = calculateChecksum(dataToCheck);
      frameData[16] = checksum;

      const frame = new Uint8Array(1 + frameData.length);
      frame[0] = FRAME_TYPE.RESOURCE;
      frame.set(frameData, 1);

      const results = parser.parse(frame);
      expect(results).toHaveLength(1);
      expect(results[0]).not.toBeInstanceOf(FrameParseError);

      const resourceFrame = results[0] as ResourceFrame;
      expect(resourceFrame.type).toBe('RESOURCE');
      expect(resourceFrame.cpuUsage).toBe(50);
      expect(resourceFrame.ramUsage).toBe(75);
      expect(resourceFrame.freeXDATA).toBe(0x1234);
      expect(resourceFrame.freeEDATA).toBe(0x5678);
      expect(resourceFrame.speed).toBe(100);
      expect(resourceFrame.servoAngle).toBe(200);
    });

    it('should handle negative speed (int16)', () => {
      const frameData = new Uint8Array(17);
      frameData[0] = 50; // cpuUsage
      frameData[1] = 75; // ramUsage
      frameData[2] = 0x34;
      frameData[3] = 0x12;
      frameData[4] = 0x78;
      frameData[5] = 0x56;
      // speed: -100 as int16 = 0xFF9C (little-endian)
      frameData[6] = 0x9C;
      frameData[7] = 0xFF;
      frameData[8] = 0xC8;
      frameData[9] = 0x00;
      frameData.set(new Uint8Array(6), 10);

      const dataToCheck = frameData.slice(0, 16);
      frameData[16] = calculateChecksum(dataToCheck);

      const frame = new Uint8Array(1 + frameData.length);
      frame[0] = FRAME_TYPE.RESOURCE;
      frame.set(frameData, 1);

      const results = parser.parse(frame);
      const resourceFrame = results[0] as ResourceFrame;
      expect(resourceFrame.speed).toBe(-100);
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

        const dataToCheck = frameData.slice(0, 2 + length);
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

      const dataToCheck = frameData.slice(0, 2 + length);
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

      const dataToCheck = frameData.slice(0, 2 + length);
      frameData[2 + length] = calculateChecksum(dataToCheck);

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
        (r) => r instanceof LogFrame && r.logData === 'Valid',
      );
      expect(validFrames).toHaveLength(1);
    });
  });
});
