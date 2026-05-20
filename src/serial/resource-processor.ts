import { ResourceFrame } from './protocol';

export interface ProcessedResourceData {
  cpuUsage: number;
  ramUsage: number;
  freeXDATA: number;
  freeEDATA: number;
  speed: number;
  servoAngle: number;
  timestamp: number;
}

export interface ResourceStats {
  cpuUsageAvg: number;
  cpuUsageMax: number;
  cpuUsageMin: number;
  ramUsageAvg: number;
  ramUsageMax: number;
  ramUsageMin: number;
  speedAvg: number;
  speedMax: number;
  speedMin: number;
  servoAngleAvg: number;
  servoAngleMax: number;
  servoAngleMin: number;
}

export class ResourceFrameProcessor {
  private lastProcessedFrame: ProcessedResourceData | null = null;

  process(frame: ResourceFrame): ProcessedResourceData {
    if (frame.cpuUsage < 0 || frame.cpuUsage > 100) {
      throw new Error(`Invalid CPU usage: ${frame.cpuUsage}%`);
    }
    if (frame.ramUsage < 0 || frame.ramUsage > 100) {
      throw new Error(`Invalid RAM usage: ${frame.ramUsage}%`);
    }

    const processed: ProcessedResourceData = {
      cpuUsage: frame.cpuUsage,
      ramUsage: frame.ramUsage,
      freeXDATA: frame.freeXDATA,
      freeEDATA: frame.freeEDATA,
      speed: frame.speed,
      servoAngle: frame.servoAngle,
      timestamp: Date.now(),
    };

    this.lastProcessedFrame = processed;
    return processed;
  }

  getLastFrame(): ProcessedResourceData | null {
    return this.lastProcessedFrame;
  }

  clear(): void {
    this.lastProcessedFrame = null;
  }
}

export class ResourceDataStore {
  private dataBuffer: ProcessedResourceData[] = [];
  private readonly maxBufferSize: number;

  private totalFrames: number = 0;
  private cpuUsageSum: number = 0;
  private ramUsageSum: number = 0;
  private speedSum: number = 0;
  private servoAngleSum: number = 0;

  private cpuUsageMax: number = 0;
  private cpuUsageMin: number = 100;
  private ramUsageMax: number = 0;
  private ramUsageMin: number = 100;
  private speedMax: number = -Infinity;
  private speedMin: number = Infinity;
  private servoAngleMax: number = -Infinity;
  private servoAngleMin: number = Infinity;

  constructor(maxBufferSize: number = 300) {
    this.maxBufferSize = maxBufferSize;
  }

  storeData(data: ProcessedResourceData): void {
    this.totalFrames++;

    this.dataBuffer.push(data);
    if (this.dataBuffer.length > this.maxBufferSize) {
      const removed = this.dataBuffer.shift();
      if (removed) {
        this.recalculateStats();
      }
    }

    this.cpuUsageSum += data.cpuUsage;
    this.ramUsageSum += data.ramUsage;
    this.speedSum += data.speed;
    this.servoAngleSum += data.servoAngle;

    this.cpuUsageMax = Math.max(this.cpuUsageMax, data.cpuUsage);
    this.cpuUsageMin = Math.min(this.cpuUsageMin, data.cpuUsage);
    this.ramUsageMax = Math.max(this.ramUsageMax, data.ramUsage);
    this.ramUsageMin = Math.min(this.ramUsageMin, data.ramUsage);
    this.speedMax = Math.max(this.speedMax, data.speed);
    this.speedMin = Math.min(this.speedMin, data.speed);
    this.servoAngleMax = Math.max(this.servoAngleMax, data.servoAngle);
    this.servoAngleMin = Math.min(this.servoAngleMin, data.servoAngle);
  }

  getCurrentData(): ProcessedResourceData | null {
    return this.dataBuffer.length > 0 ? this.dataBuffer[this.dataBuffer.length - 1] : null;
  }

  getAllData(): ProcessedResourceData[] {
    return [...this.dataBuffer];
  }

  getDataSince(timestamp: number): ProcessedResourceData[] {
    return this.dataBuffer.filter((data) => data.timestamp >= timestamp);
  }

  getStats(): ResourceStats {
    if (this.dataBuffer.length === 0) {
      return {
        cpuUsageAvg: 0,
        cpuUsageMax: 0,
        cpuUsageMin: 0,
        ramUsageAvg: 0,
        ramUsageMax: 0,
        ramUsageMin: 0,
        speedAvg: 0,
        speedMax: 0,
        speedMin: 0,
        servoAngleAvg: 0,
        servoAngleMax: 0,
        servoAngleMin: 0,
      };
    }

    const count = this.dataBuffer.length;

    return {
      cpuUsageAvg: Math.round((this.cpuUsageSum / count) * 100) / 100,
      cpuUsageMax: this.cpuUsageMax,
      cpuUsageMin: this.cpuUsageMin,
      ramUsageAvg: Math.round((this.ramUsageSum / count) * 100) / 100,
      ramUsageMax: this.ramUsageMax,
      ramUsageMin: this.ramUsageMin,
      speedAvg: Math.round((this.speedSum / count) * 100) / 100,
      speedMax: this.speedMax,
      speedMin: this.speedMin,
      servoAngleAvg: Math.round((this.servoAngleSum / count) * 100) / 100,
      servoAngleMax: this.servoAngleMax,
      servoAngleMin: this.servoAngleMin,
    };
  }

  clear(): void {
    this.dataBuffer = [];
    this.totalFrames = 0;
    this.cpuUsageSum = 0;
    this.ramUsageSum = 0;
    this.speedSum = 0;
    this.servoAngleSum = 0;
    this.cpuUsageMax = 0;
    this.cpuUsageMin = 100;
    this.ramUsageMax = 0;
    this.ramUsageMin = 100;
    this.speedMax = -Infinity;
    this.speedMin = Infinity;
    this.servoAngleMax = -Infinity;
    this.servoAngleMin = Infinity;
  }

  getBufferSize(): number {
    return this.dataBuffer.length;
  }

  getBufferUtilization(): number {
    return (this.dataBuffer.length / this.maxBufferSize) * 100;
  }

  private recalculateStats(): void {
    if (this.dataBuffer.length === 0) {
      this.cpuUsageSum = 0;
      this.ramUsageSum = 0;
      this.speedSum = 0;
      this.servoAngleSum = 0;
      this.cpuUsageMax = 0;
      this.cpuUsageMin = 100;
      this.ramUsageMax = 0;
      this.ramUsageMin = 100;
      this.speedMax = -Infinity;
      this.speedMin = Infinity;
      this.servoAngleMax = -Infinity;
      this.servoAngleMin = Infinity;
      return;
    }

    this.cpuUsageSum = 0;
    this.ramUsageSum = 0;
    this.speedSum = 0;
    this.servoAngleSum = 0;
    this.cpuUsageMax = 0;
    this.cpuUsageMin = 100;
    this.ramUsageMax = 0;
    this.ramUsageMin = 100;
    this.speedMax = -Infinity;
    this.speedMin = Infinity;
    this.servoAngleMax = -Infinity;
    this.servoAngleMin = Infinity;

    for (const data of this.dataBuffer) {
      this.cpuUsageSum += data.cpuUsage;
      this.ramUsageSum += data.ramUsage;
      this.speedSum += data.speed;
      this.servoAngleSum += data.servoAngle;

      this.cpuUsageMax = Math.max(this.cpuUsageMax, data.cpuUsage);
      this.cpuUsageMin = Math.min(this.cpuUsageMin, data.cpuUsage);
      this.ramUsageMax = Math.max(this.ramUsageMax, data.ramUsage);
      this.ramUsageMin = Math.min(this.ramUsageMin, data.ramUsage);
      this.speedMax = Math.max(this.speedMax, data.speed);
      this.speedMin = Math.min(this.speedMin, data.speed);
      this.servoAngleMax = Math.max(this.servoAngleMax, data.servoAngle);
      this.servoAngleMin = Math.min(this.servoAngleMin, data.servoAngle);
    }
  }
}
