import { TelemetrySerialManager } from './manager';
import { ResourceManager } from './resource-manager';

export async function example1_basicResourceUsage() {
  const serialManager = new TelemetrySerialManager();
  const resourceManager = new ResourceManager();

  resourceManager.attach(serialManager);

  resourceManager.getStats();
}

export async function example2_realtimeMonitoring() {
  const serialManager = new TelemetrySerialManager();
  const resourceManager = new ResourceManager();

  resourceManager.attach(serialManager);

  const currentData = resourceManager.getCurrentData();
  if (currentData) {
    console.log(`CPU: ${currentData.cpuUsage}%`);
    console.log(`RAM: ${currentData.ramUsage}%`);
    console.log(`Speed: ${currentData.speed} mm/s`);
    console.log(`Servo: ${(currentData.servoAngle / 10).toFixed(1)} degrees`);
  }
}

export async function example3_dataAnalysis() {
  const serialManager = new TelemetrySerialManager();
  const resourceManager = new ResourceManager(300);

  resourceManager.attach(serialManager);

  const allData = resourceManager.getAllData();
  const stats = resourceManager.getStats();

  console.log(`Total samples: ${allData.length}`);
  console.log(`CPU Average: ${stats.cpuUsageAvg}%`);
  console.log(`CPU Max: ${stats.cpuUsageMax}%`);
  console.log(`CPU Min: ${stats.cpuUsageMin}%`);
  console.log(`RAM Average: ${stats.ramUsageAvg}%`);
  console.log(`Speed Average: ${stats.speedAvg} mm/s`);
  console.log(`Servo Average: ${(stats.servoAngleAvg / 10).toFixed(1)} degrees`);
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
    console.log(`[${index}] T+${data.timestamp - fiveSecondsAgo}ms: CPU=${data.cpuUsage}%`);
  });
}
