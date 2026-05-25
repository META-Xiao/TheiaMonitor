import { TelemetrySerialManager } from './manager';
import { ResourceManager } from './resource-manager';
import { resourceSlots } from '../stores/resourceSlots';

export async function example1_basicResourceUsage() {
  const serialManager = new TelemetrySerialManager();
  const resourceManager = new ResourceManager();

  resourceManager.attach(serialManager);

  resourceManager.getBufferSize();
}

export async function example2_realtimeMonitoring() {
  const serialManager = new TelemetrySerialManager();
  const resourceManager = new ResourceManager();

  resourceManager.attach(serialManager);

  const currentData = resourceManager.getCurrentData();
  if (currentData) {
    const labels = resourceSlots.map((s) => s.label);
    currentData.values.forEach((v, i) => {
      console.log(`${labels[i] ?? `Slot${i}`}: ${v}`);
    });
  }
}

export async function example3_dataAnalysis() {
  const serialManager = new TelemetrySerialManager();
  const resourceManager = new ResourceManager(300);

  resourceManager.attach(serialManager);

  const allData = resourceManager.getAllData();
  const stats = resourceManager.getStats();

  console.log(`Total samples: ${allData.length}`);
  console.log('Stats:', stats);
}

export async function example4_bufferManagement() {
  const resourceManager = new ResourceManager(100);

  const bufferSize = resourceManager.getBufferSize();
  const utilization = resourceManager.getBufferUtilization();

  console.log(`Buffer size: ${bufferSize}`);
  console.log(`Buffer utilization: ${utilization.toFixed(2)}%`);

  if (utilization > 90) {
    console.warn('Buffer nearly full!');
  }
}

export async function example5_timeSeriesData() {
  const serialManager = new TelemetrySerialManager();
  const resourceManager = new ResourceManager();

  resourceManager.attach(serialManager);

  const fiveSecondsAgo = Date.now() - 5000;
  const recentData = resourceManager.getDataSince(fiveSecondsAgo);

  console.log(`Data points in last 5 seconds: ${recentData.length}`);

  recentData.forEach((data, index) => {
    console.log(`[${index}] T+${data.timestamp - fiveSecondsAgo}ms:`, data.values);
  });
}
