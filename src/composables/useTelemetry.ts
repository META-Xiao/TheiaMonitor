import { ref, computed, onMounted, onUnmounted } from 'vue';
import { conn } from '../stores/connection';
import { resourceSlots } from '../stores/resourceSlots';
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
    conn.mcuName = (event.info?.deviceName as string) || 'Serial';
  } else if (event.type === 'DISCONNECTED') {
    conn.connected = false;
    conn.mcuName = '';
    conn.portLabel = '';
    conn.connectedAt = null;
  }
});

const current = ref(resourceManager.getCurrentData());
const mcuLogs = ref<string[]>([]);
const imageFps = ref(0);
// slotPoints[i] = 对应 resourceSlots[i] 的历史数据点
const slotPoints = ref<number[][]>([]);
const romPoints = ref<number[]>([]);
const networkPoints = ref<number[]>([]);
const networkRxKbps = ref<number | null>(null);

function pushPoint(arr: number[][], i: number, v: number) {
  if (!arr[i]) arr[i] = [];
  arr[i] = [...arr[i].slice(-(HISTORY - 1)), v];
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
    networkPoints.value = [...networkPoints.value.slice(-(HISTORY - 1)), networkRxKbps.value / 1024];
  }
}

let refCount = 0;
let stopMock: (() => void) | undefined;

serialManager.on((event) => {
  if (event.type !== 'FRAME') return;
  const f = event.frame;
  if (f.type === 'IMAGE') {
    trackRxBytes(9 + f.payload.length);  // 0xCC(1)+Len(2)+Frame(2)+W(1)+H(1)+Fmt(1)+payload+CS(1)
  } else if (f.type === 'LOG') {
    trackRxBytes(4 + f.length);
  } else if (f.type === 'RESOURCE') {
    trackRxBytes(15);
    current.value = resourceManager.getCurrentData();
    const d = current.value;
    if (d) {
      const pts = [...slotPoints.value];
      d.values.forEach((v, i) => pushPoint(pts, i, v));
      // romPoints: (ROM_TOTAL - res[1]) / ROM_TOTAL * 100
      const romFree = d.res[1] ?? 0;
      romPoints.value = [...romPoints.value.slice(-(HISTORY - 1)), Math.round((32768 - romFree) / 32768 * 100)];
      slotPoints.value = pts;
    }
  }
});

imageManager.on((event) => {
  if (event.type === 'STATS_UPDATED') imageFps.value = event.stats.currentFps;
});
logManager.on((event) => {
  if (event.type !== 'LOG_RECEIVED') return;
  mcuLogs.value = [...mcuLogs.value.slice(-19), event.entry.text];
});

export function useTelemetry() {
  const hasSignal = computed(() => current.value !== null);

  // 按 slot id 取当前值
  const slotValue = (slotIdx: number) =>
    computed(() => hasSignal.value ? (current.value!.values[slotIdx] ?? null) : null);

  // 兼容旧仪表盘：按默认槽顺序取值
  const cpuVal    = slotValue(0);
  const ramVal    = computed(() => {
    const v = current.value?.res[2];
    return v !== undefined ? Math.round((2560 - v) / 2560 * 100) : null;
  });
  const speedMs   = computed(() => {
    const v = slotValue(3).value;
    return v !== null ? v.toFixed(2) : null;
  });
  const servoDeg  = computed(() => {
    const v = slotValue(4).value;
    return v !== null ? v.toFixed(1) : null;
  });
  const servoVisualDeg = computed(() => {
    const v = slotValue(4).value;
    return v !== null ? Math.max(-42, Math.min(42, v - 45)) : 0;
  });
  const romVal = computed(() => {
    if (!hasSignal.value) return null;
    const romFree = current.value!.res[1] ?? 0;
    return Math.round((32768 - romFree) / 32768 * 100);
  });

  const cpuPoints   = computed(() => slotPoints.value[0] ?? []);
  const ramPoints   = computed(() => slotPoints.value[2] ?? []);
  const speedPoints = computed(() => slotPoints.value[3] ?? []);

  const networkRxLabel = computed(() => {
    if (networkRxKbps.value === null) return 'No Signal';
    const bps = networkRxKbps.value;
    return bps >= 1024 ? `${(bps / 1024).toFixed(1)} KB/s` : `${Math.round(bps)} B/s`;
  });

  const SLOT_COLORS = ['#242424', '#20b8a6', '#c7d54f', '#f59e0b', '#a78bfa', '#6366f1', '#ec4899'];

  const overviewCards = computed(() => {
    const NS = 'No Signal';
    type Card = { id: string; label: string; value: string; color: string; points: number[]; max: number; isServo: boolean; chartType: 'line' | 'delta' };
    const cards: Card[] = resourceSlots.map(slot => {
      const raw = current.value?.values[slot.id] ?? null;
      const valid = raw !== null && !isNaN(raw as number);
      const display = valid
        ? `${Number.isInteger(raw) ? raw : (raw as number).toFixed(2)}${slot.unit ? ' ' + slot.unit : ''}`
        : NS;
      return {
        id: `slot_${slot.id}`,
        label: slot.label,
        value: display,
        color: SLOT_COLORS[slot.id % SLOT_COLORS.length],
        points: slotPoints.value[slot.id] ?? [],
        max: 100,
        isServo: slot.label.toLowerCase().includes('servo'),
        chartType: slot.chart === 'delta' ? 'delta' : 'line' as 'line' | 'delta',
      };
    });

    cards.push({
      id: 'network', label: 'Network RX',
      value: networkRxLabel.value,
      color: '#6366f1',
      points: networkPoints.value, max: 500, isServo: false, chartType: 'line',
    });

    return cards;
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
    serialManager, resourceManager, imageManager,
    current, mcuLogs, imageFps,
    slotPoints, networkPoints, networkRxKbps, networkRxLabel,
    resourceSlots, overviewCards,
    hasSignal, cpuVal, ramVal, romVal, speedMs, servoDeg, servoVisualDeg,
    cpuPoints, ramPoints, romPoints, speedPoints,
    slotValue,
  };
}
