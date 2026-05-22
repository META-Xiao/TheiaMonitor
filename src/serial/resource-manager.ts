import { TelemetrySerialManager, SerialEvent } from './manager';
import { ResourceFrame, FRAME_TYPE } from './protocol';
import { ResourceFrameProcessor, ResourceDataStore, ProcessedResourceData, ResourceStats } from './resource-processor';

export class ResourceManager {
  private processor: ResourceFrameProcessor;
  private store: ResourceDataStore;
  private serialManager: TelemetrySerialManager | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(maxBufferSize: number = 300) {
    this.processor = new ResourceFrameProcessor();
    this.store = new ResourceDataStore(maxBufferSize);
  }

  attach(serialManager: TelemetrySerialManager): void {
    if (this.serialManager === serialManager) {
      return;
    }

    if (this.unsubscribe) {
      this.unsubscribe();
    }

    this.serialManager = serialManager;
    this.unsubscribe = serialManager.on((event: SerialEvent) => {
      if (event.type === 'FRAME' && event.frame.type === 'RESOURCE') {
        const resourceFrame = event.frame as ResourceFrame;
        const processed = this.processor.process(resourceFrame);
        this.store.storeData(processed);
      }
    });
  }

  detach(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.serialManager = null;
  }

  getCurrentData(): ProcessedResourceData | null {
    return this.store.getCurrentData();
  }

  getAllData(): ProcessedResourceData[] {
    return this.store.getAllData();
  }

  getDataSince(timestamp: number): ProcessedResourceData[] {
    return this.store.getDataSince(timestamp);
  }

  getStats(): ResourceStats {
    return this.store.getStats();
  }

  getBufferSize(): number {
    return this.store.getBufferSize();
  }

  getBufferUtilization(): number {
    return this.store.getBufferUtilization();
  }

  clear(): void {
    this.processor.clear();
    this.store.clear();
  }
}

export type { ProcessedResourceData, ResourceStats } from './resource-processor';
