import { describe, it, expect, beforeEach } from 'vitest';
import { LogFrameProcessor, LogDataStore, LogEntry } from '../log-processor';
import { LogFrame } from '../protocol';

describe('LogFrameProcessor', () => {
  let processor: LogFrameProcessor;

  beforeEach(() => {
    processor = new LogFrameProcessor();
  });

  it('should process a valid log frame', () => {
    const frame: LogFrame = {
      type: 'LOG',
      length: 13,
      logData: 'Hello, World!',
      checksum: 0,
    };

    const entry = processor.process(frame);

    expect(entry.text).toBe('Hello, World!');
    expect(entry.lineCount).toBe(1);
    expect(entry.timestamp).toBeGreaterThan(0);
    expect(entry.id).toBe(0);
  });

  it('should handle empty log frame', () => {
    const frame: LogFrame = {
      type: 'LOG',
      length: 0,
      logData: '',
      checksum: 0,
    };

    const entry = processor.process(frame);

    expect(entry.text).toBe('');
    expect(entry.lineCount).toBe(0);
  });

  it('should count lines correctly', () => {
    const frame: LogFrame = {
      type: 'LOG',
      length: 20,
      logData: 'Line 1\nLine 2\nLine 3',
      checksum: 0,
    };

    const entry = processor.process(frame);

    expect(entry.lineCount).toBe(3);
  });

  it('should increment entry ID', () => {
    const frame1: LogFrame = {
      type: 'LOG',
      length: 5,
      logData: 'Log 1',
      checksum: 0,
    };

    const frame2: LogFrame = {
      type: 'LOG',
      length: 5,
      logData: 'Log 2',
      checksum: 0,
    };

    const entry1 = processor.process(frame1);
    const entry2 = processor.process(frame2);

    expect(entry1.id).toBe(0);
    expect(entry2.id).toBe(1);
  });

  it('should cache last processed entry', () => {
    const frame: LogFrame = {
      type: 'LOG',
      length: 4,
      logData: 'Test',
      checksum: 0,
    };

    const entry = processor.process(frame);

    expect(processor.getLastEntry()).toEqual(entry);
  });

  it('should clear cache', () => {
    const frame: LogFrame = {
      type: 'LOG',
      length: 4,
      logData: 'Test',
      checksum: 0,
    };

    processor.process(frame);
    expect(processor.getLastEntry()).not.toBeNull();

    processor.clear();

    expect(processor.getLastEntry()).toBeNull();
  });
});

describe('LogDataStore', () => {
  let store: LogDataStore;

  beforeEach(() => {
    store = new LogDataStore(100);
  });

  const createLogEntry = (id: number, text: string): LogEntry => {
    return {
      id,
      text,
      timestamp: Date.now(),
      lineCount: text.split('\n').length,
    };
  };

  it('should store and retrieve logs', () => {
    const entry = createLogEntry(0, 'Test log');
    store.storeLog(entry);

    const allLogs = store.getAllLogs();
    expect(allLogs).toHaveLength(1);
    expect(allLogs[0]).toEqual(entry);
  });

  it('should maintain buffer size limit', () => {
    const smallStore = new LogDataStore(3);

    for (let i = 0; i < 5; i++) {
      const entry = createLogEntry(i, `Log ${i}`);
      smallStore.storeLog(entry);
    }

    const logs = smallStore.getAllLogs();
    expect(logs.length).toBe(3);
    // 应该保留最新的3条
    expect(logs[0].id).toBe(2);
    expect(logs[1].id).toBe(3);
    expect(logs[2].id).toBe(4);
  });

  it('should get last N logs', () => {
    for (let i = 0; i < 5; i++) {
      store.storeLog(createLogEntry(i, `Log ${i}`));
    }

    const lastThree = store.getLastLogs(3);
    expect(lastThree).toHaveLength(3);
    expect(lastThree[0].id).toBe(2);
    expect(lastThree[2].id).toBe(4);
  });

  it('should find log by ID', () => {
    const entry = createLogEntry(0, 'Test log');
    store.storeLog(entry);

    const found = store.getLogById(0);
    expect(found).toEqual(entry);

    const notFound = store.getLogById(999);
    expect(notFound).toBeNull();
  });

  it('should search logs by text', () => {
    store.storeLog(createLogEntry(0, 'ERROR: something failed'));
    store.storeLog(createLogEntry(1, 'INFO: processing'));
    store.storeLog(createLogEntry(2, 'ERROR: another issue'));

    const errors = store.searchLogs('ERROR');
    expect(errors).toHaveLength(2);
    expect(errors[0].id).toBe(0);
    expect(errors[1].id).toBe(2);
  });

  it('should search with case sensitivity', () => {
    store.storeLog(createLogEntry(0, 'Error occurred'));
    store.storeLog(createLogEntry(1, 'error in code'));

    const caseInsensitive = store.searchLogs('error', false);
    expect(caseInsensitive).toHaveLength(2);

    const caseSensitive = store.searchLogs('error', true);
    expect(caseSensitive).toHaveLength(1);
  });

  it('should track statistics', () => {
    store.storeLog(createLogEntry(0, 'Line 1\nLine 2'));
    store.storeLog(createLogEntry(1, 'Single line'));

    const stats = store.getStats();
    expect(stats.totalFrames).toBe(2);
    expect(stats.bufferSize).toBe(2);
    expect(stats.totalLines).toBe(3); // 2 + 1
    // 'Line 1\nLine 2' = 13 bytes, 'Single line' = 11 bytes = 24 total
    expect(stats.totalBytes).toBe(24);
    expect(stats.averageBytesPerFrame).toBe(12); // 24 / 2 = 12
  });

  it('should calculate buffer utilization', () => {
    const store3 = new LogDataStore(10);

    expect(store3.getBufferUtilization()).toBe(0);

    for (let i = 0; i < 5; i++) {
      store3.storeLog(createLogEntry(i, `Log ${i}`));
    }

    expect(store3.getBufferUtilization()).toBe(50);
  });

  it('should clear all logs', () => {
    store.storeLog(createLogEntry(0, 'Test'));
    store.storeLog(createLogEntry(1, 'Another'));

    let stats = store.getStats();
    expect(stats.totalFrames).toBe(2);

    store.clear();

    stats = store.getStats();
    expect(stats.totalFrames).toBe(0);
    expect(store.getAllLogs()).toHaveLength(0);
  });

  it('should reset stats while keeping logs', () => {
    store.storeLog(createLogEntry(0, 'Log 1\nLine2'));
    store.storeLog(createLogEntry(1, 'Log 2'));

    let stats = store.getStats();
    expect(stats.totalFrames).toBe(2);

    store.resetStats();

    stats = store.getStats();
    expect(stats.totalFrames).toBe(0);
    expect(stats.totalLines).toBe(3); // 保留日志统计
    expect(store.getAllLogs()).toHaveLength(2); // 日志保留
  });

  it('should handle multiline logs', () => {
    const multilineText = 'Line 1\nLine 2\nLine 3\n';
    store.storeLog(createLogEntry(0, multilineText));

    const stats = store.getStats();
    expect(stats.totalLines).toBe(4); // 包括最后的空行
  });
});
