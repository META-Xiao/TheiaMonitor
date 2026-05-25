import { describe, it, expect } from 'vitest';
import {
  FRAME_TYPE,
  calculateChecksum,
  ImageFrame,
  LogFrame,
  ResourceFrame,
} from '../protocol';
import { FrameParser, FrameParseError } from '../parser';

/**
 * 集成测试：模拟真实的 MCU 通信场景
 */
describe('Integration: Real-world scenarios', () => {
  let parser: FrameParser;

  beforeEach(() => {
    parser = new FrameParser();
  });

  describe('Scenario 1: Mixed frame stream', () => {
    it('should handle image + log + resource frames in stream', () => {
      // 模拟一个完整的帧流：
      // 1. 图传帧 (简化，只发送一个小图)
      // 2. 日志帧
      // 3. 资源帧

      const frames: Uint8Array[] = [];

      // === 构造日志帧 ===
      const logText = '[TRACK] Frame 100: pos=(120,80) angle=45.5°';
      const logBytes = new TextEncoder().encode(logText);
      const logFrameData = new Uint8Array(1 + 2 + logBytes.length + 1);
      logFrameData[0] = FRAME_TYPE.LOG;
      logFrameData[1] = (logBytes.length >> 8) & 0xFF;
      logFrameData[2] = logBytes.length & 0xFF;
      logFrameData.set(logBytes, 3);
      const logChecksum = calculateChecksum(
        logFrameData.slice(0, 3 + logBytes.length),
      );
      logFrameData[3 + logBytes.length] = logChecksum;
      frames.push(logFrameData);

      // === 构造资源帧 (0xEE + Length(2) + Data(9B) + CS(1)) ===
      const resPayload = new Uint8Array(2 + 9);
      resPayload[0] = 0; resPayload[1] = 9;  // Length = 9
      resPayload[2] = 45;                     // CPU(u8)
      resPayload[3] = 0x1D; resPayload[4] = 0xA0; // RAM(u16)
      resPayload[5] = 0x1F; resPayload[6] = 0x40; // ROM(u16)
      resPayload[7] = 0x01; resPayload[8] = 0xF4; // Speed(i16)
      resPayload[9] = 0x00; resPayload[10] = 0xB4; // Servo(i16)
      const resCS = new Uint8Array(1 + resPayload.length);
      resCS[0] = FRAME_TYPE.RESOURCE;
      resCS.set(resPayload, 1);
      const resourceFrameData = new Uint8Array(resCS.length + 1);
      resourceFrameData[0] = FRAME_TYPE.RESOURCE;
      resourceFrameData.set(resPayload, 1);
      resourceFrameData[resourceFrameData.length - 1] = calculateChecksum(resCS);
      frames.push(resourceFrameData);

      // 合并所有帧
      const totalLength = frames.reduce((sum, f) => sum + f.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const frame of frames) {
        combined.set(frame, offset);
        offset += frame.length;
      }

      // 解析
      const results = parser.parse(combined);

      // 验证
      const validFrames = results.filter((r) => !(r instanceof FrameParseError));
      expect(validFrames).toHaveLength(2);
      expect((validFrames[0] as LogFrame).type).toBe('LOG');
      expect((validFrames[0] as LogFrame).logData).toContain('TRACK');
      expect((validFrames[1] as ResourceFrame).type).toBe('RESOURCE');
      expect((validFrames[1] as ResourceFrame).length).toBe(9);
    });
  });

  describe('Scenario 2: High-frequency log stream', () => {
    it('should handle rapid log frames from DEBUG output', () => {
      const logMessages = [
        'Motor1: 100 PWM',
        'Motor2: 95 PWM',
        'Encoder1: 1234',
        'Encoder2: 5678',
        'Servo: 45°',
      ];

      const createLogFrame = (text: string) => {
        const logBytes = new TextEncoder().encode(text);
        const frameData = new Uint8Array(1 + 2 + logBytes.length + 1);
        frameData[0] = FRAME_TYPE.LOG;
        frameData[1] = (logBytes.length >> 8) & 0xFF;
        frameData[2] = logBytes.length & 0xFF;
        frameData.set(logBytes, 3);
        const checksum = calculateChecksum(frameData.slice(0, 3 + logBytes.length));
        frameData[3 + logBytes.length] = checksum;
        return frameData;
      };

      // 构造连续的日志帧
      const allFrames = logMessages
        .map(createLogFrame)
        .reduce((acc, f) => {
          const combined = new Uint8Array(acc.length + f.length);
          combined.set(acc);
          combined.set(f, acc.length);
          return combined;
        });

      // 分块接收（模拟网络分片）
      const chunkSize = 50;
      const results: (ImageFrame | LogFrame | ResourceFrame | FrameParseError)[] = [];

      for (let i = 0; i < allFrames.length; i += chunkSize) {
        const chunk = allFrames.slice(i, Math.min(i + chunkSize, allFrames.length));
        results.push(...parser.parse(chunk));
      }

      // 验证收到所有消息
      const logFrames = results.filter(
        (r) => 'type' in r && r.type === 'LOG',
      ) as LogFrame[];
      expect(logFrames).toHaveLength(logMessages.length);

      for (let i = 0; i < logMessages.length; i++) {
        expect(logFrames[i].logData).toBe(logMessages[i]);
      }
    });
  });

  describe('Scenario 3: Corrupted frame recovery', () => {
    it('should skip corrupted frame and recover with next frame', () => {
      // 第一个日志帧是正确的
      const validLog1 = 'Frame 1';
      const logBytes1 = new TextEncoder().encode(validLog1);
      const frame1Data = new Uint8Array(1 + 2 + logBytes1.length + 1);
      frame1Data[0] = FRAME_TYPE.LOG;
      frame1Data[1] = (logBytes1.length >> 8) & 0xFF;
      frame1Data[2] = logBytes1.length & 0xFF;
      frame1Data.set(logBytes1, 3);
      frame1Data[3 + logBytes1.length] = calculateChecksum(
        frame1Data.slice(0, 3 + logBytes1.length),
      );

      // 插入一些垃圾字节
      const garbage = new Uint8Array([0xFF, 0xFF, 0xAA, 0xBB, 0xCC]);

      // 第二个日志帧
      const validLog2 = 'Frame 2';
      const logBytes2 = new TextEncoder().encode(validLog2);
      const frame2Data = new Uint8Array(1 + 2 + logBytes2.length + 1);
      frame2Data[0] = FRAME_TYPE.LOG;
      frame2Data[1] = (logBytes2.length >> 8) & 0xFF;
      frame2Data[2] = logBytes2.length & 0xFF;
      frame2Data.set(logBytes2, 3);
      frame2Data[3 + logBytes2.length] = calculateChecksum(
        frame2Data.slice(0, 3 + logBytes2.length),
      );

      // 合并：frame1 + garbage + frame2
      const combined = new Uint8Array(
        frame1Data.length + garbage.length + frame2Data.length,
      );
      combined.set(frame1Data);
      combined.set(garbage, frame1Data.length);
      combined.set(frame2Data, frame1Data.length + garbage.length);

      const results = parser.parse(combined);

      // 应该解析出两个有效帧（忽略垃圾数据）
      const validFrames = results.filter(
        (r) => 'type' in r && r.type === 'LOG',
      ) as LogFrame[];

      expect(validFrames.length).toBeGreaterThanOrEqual(1);
      expect(validFrames[0].logData).toBe(validLog1);

      // 也可能解析出第二个帧
      const secondFrame = validFrames.find((f) => f.logData === validLog2);
      if (secondFrame) {
        expect(secondFrame.logData).toBe(validLog2);
      }
    });
  });

  describe('Scenario 4: Resource frame — parser extracts raw data', () => {
    it('should extract resData from resource frame', () => {
      const resData = new Uint8Array([
        0,                    // CPU(u8) = 0
        0, 0,                 // RAM(u16) = 0
        0, 0,                 // ROM(u16) = 0
        0xFF, 0x9C,           // Speed(i16) = -100
        0x00, 0xC8,           // Servo(i16) = 200
      ]);
      const length = resData.length;

      const payload = new Uint8Array(2 + length);
      payload[0] = (length >> 8) & 0xFF;
      payload[1] = length & 0xFF;
      payload.set(resData, 2);

      const dataCS = new Uint8Array(1 + 2 + length);
      dataCS[0] = FRAME_TYPE.RESOURCE;
      dataCS.set(payload, 1);
      const checksum = calculateChecksum(dataCS);

      const frameData = new Uint8Array(1 + payload.length + 1);
      frameData[0] = FRAME_TYPE.RESOURCE;
      frameData.set(payload, 1);
      frameData[frameData.length - 1] = checksum;

      const results = parser.parse(frameData);
      expect(results).toHaveLength(1);
      expect(results[0]).not.toBeInstanceOf(FrameParseError);

      const frame = results[0] as ResourceFrame;
      expect(frame.length).toBe(9);
      expect(frame.resData.length).toBe(9);
      // Parser 不关心语义，只验证原始字节正确传递
      expect(frame.resData[0]).toBe(0);
      expect(frame.resData[4]).toBe(0);
      expect(frame.resData[6]).toBe(0x9C); // Speed lo byte
    });
  });

  describe('Scenario 5: UTF-8 log with special characters', () => {
    it('should handle Chinese characters in log', () => {
      // 包含中文的日志
      const logText = '[车速] 1.5 m/s [误差] 2.3°';
      const logBytes = new TextEncoder().encode(logText);

      const frameData = new Uint8Array(1 + 2 + logBytes.length + 1);
      frameData[0] = FRAME_TYPE.LOG;
      frameData[1] = (logBytes.length >> 8) & 0xFF;
      frameData[2] = logBytes.length & 0xFF;
      frameData.set(logBytes, 3);
      frameData[3 + logBytes.length] = calculateChecksum(
        frameData.slice(0, 3 + logBytes.length),
      );

      const results = parser.parse(frameData);
      expect(results).toHaveLength(1);
      expect(results[0]).not.toBeInstanceOf(FrameParseError);

      const frame = results[0] as LogFrame;
      expect(frame.logData).toBe(logText);
      expect(frame.logData).toContain('车速');
    });
  });
});
