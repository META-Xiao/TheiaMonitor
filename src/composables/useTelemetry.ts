import { ref, computed, onMounted, onUnmounted } from 'vue';
import { conn } from '../stores/connection';
import { TelemetrySerialManager } from '../serial/manager';
import { ResourceManager } from '../serial/resource-manager';
import { LogProcessManager } from '../serial/log-manager';
import { ImageProcessManager } from '../serial/image-manager';
import { startFrontendMock } from '../serial/__tests__/frontend-mock';

const HISTORY = 12;

export const serialManager = new TelemetrySerialManager();
const resourceManager = new ResourceManager();
const logManager = new LogProcessManager(serialManager);
const imageManager = new ImageProcessManager(serialManager);
resourceManager.attach(serialManager);

serialManager.on((event) => {
  if (event.type === 'CONNECTED') {
    conn.connected = true;
    conn.connectedAt = Date.now();
  } else if (event.type === 'DISCONNECTED') {
    conn.connected = false;
    conn.mcuName = '';
    conn.portLabel = '';
    conn.connectedAt = null;
  }
});

// 模块级共享响应式状态（所有调用方共享同一份数据）
const current = ref(resourceManager.getCurrentData());
const mcuLogs = ref<string[]>([]);
const imageFps = ref(0);
const cpuPoints = ref<number[]>([]);
const ramPoints = ref<number[]>([]);
const romPoints = ref<number[]>([]);
const speedPoints = ref<number[]>([]);
const networkPoints = ref<number[]>([]);
const networkRxKbps = ref<number | null>(null);

function pushPoint(arr: typeof cpuPoints, v: number) {
  arr.value = [...arr.value.slice(-(HISTORY - 1)), v];
}

let _rxBytes = 0, _rxLastTs = 0;
function trackRxBytes(bytes: number) {
  const now = Date.now();
  if (_rxLastTs === 0) _rxLastTs = now;
  _rxBytes += bytes;
  const dt = (now - _rxLastTs) / 1000;
  if (dt >= 1) {
    networkRxKbps.value = Math.round(_rxBytes / dt * 10) / 10;
    _rxBytes = 0;
    _rxLastTs = now;
    pushPoint(networkPoints, networkRxKbps.value / 1024);
  }
}

// 引用计数：只在第一个消费者挂载时启动，最后一个卸载时停止
let refCount = 0;
let stopMock: (() => void) | undefined;
serialManager.on((event) => {
  if (event.type !== 'FRAME') return;
  const f = event.frame;
  if (f.type === 'IMAGE') {
    trackRxBytes(22566);
  } else if (f.type === 'LOG') {
    trackRxBytes(4 + f.length);
  } else if (f.type === 'RESOURCE') {
    trackRxBytes(18);
    current.value = resourceManager.getCurrentData();
    const d = current.value!;
    pushPoint(cpuPoints, d.cpuUsage);
    pushPoint(ramPoints, d.ramUsage);
    pushPoint(speedPoints, d.speed);
    pushPoint(romPoints, d.ramTotal > 0 ? Math.round((1 - (d.freeHeap + d.freeStack) / d.ramTotal) * 100) : 0);
  }
});
imageManager.on((event) => {
  if (event.type === 'STATS_UPDATED') imageFps.value = Math.round(event.stats.currentFps);
});
logManager.on((event) => {
  if (event.type !== 'LOG_RECEIVED') return;
  mcuLogs.value = [...mcuLogs.value.slice(-19), event.entry.text];
});

export function useTelemetry() {
  const hasSignal = computed(() => current.value !== null);
  const cpuVal = computed(() => hasSignal.value ? current.value!.cpuUsage : null);
  const ramVal = computed(() => hasSignal.value ? current.value!.ramUsage : null);
  const romVal = computed(() => {
    if (!hasSignal.value) return null;
    const d = current.value!;
    return d.ramTotal > 0 ? Math.round((1 - (d.freeHeap + d.freeStack) / d.ramTotal) * 100) : 0;
  });
  const speedMs = computed(() => hasSignal.value ? (current.value!.speed / 1000).toFixed(2) : null);
  const servoDeg = computed(() => hasSignal.value ? (current.value!.servoAngle / 10).toFixed(1) : null);
  const servoVisualDeg = computed(() =>
    hasSignal.value ? Math.max(-42, Math.min(42, current.value!.servoAngle / 10 - 45)) : 0
  );
  const networkRxLabel = computed(() => {
    if (networkRxKbps.value === null) return 'No Signal';
    const bps = networkRxKbps.value;
    return bps >= 1024 ? `${(bps / 1024).toFixed(1)} KB/s` : `${Math.round(bps)} B/s`;
  });

  onMounted(() => {
    if (refCount++ === 0) {
      logManager.start();
      imageManager.start();
      if (import.meta.env.MODE === 'development') {
        stopMock = startFrontendMock(serialManager);
      }
    }
  });

  onUnmounted(() => {
    if (--refCount === 0) {
      logManager.stop();
      imageManager.stop();
      stopMock?.();
      stopMock = undefined;
    }
  });

  return {
    serialManager,
    resourceManager,
    imageManager,
    current,
    mcuLogs,
    imageFps,
    cpuPoints, ramPoints, romPoints, speedPoints, networkPoints,
    networkRxKbps, networkRxLabel,
    hasSignal, cpuVal, ramVal, romVal, speedMs, servoDeg, servoVisualDeg,
  };
}

