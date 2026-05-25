import { reactive, ref, watch } from 'vue';
import { envContext } from './envVars';

export type SlotType = 'u8' | 'u16' | 'i16' | 'u32' | 'i32' | 'u64' | 'i64';

export interface ResourceSlot {
  id: number;
  label: string;
  type: SlotType;
  expr: string;
  unit: string;
  chart: 'line' | 'delta';
  enabled: boolean;
}

export const SLOT_BYTES: Record<SlotType, number> = {
  u8: 1, u16: 2, i16: 2, u32: 4, i32: 4, u64: 8, i64: 8,
};

const DEFAULT_SLOTS: ResourceSlot[] = [
  { id: 0, label: 'CPU',      type: 'u8',  expr: 'res[0]',                              unit: '%',   chart: 'line',  enabled: true  },
  { id: 1, label: 'RAM', type: 'u16', expr: '(RAM_TOTAL-res[1])/RAM_TOTAL*100',    unit: '%',   chart: 'line',  enabled: true  },
  { id: 2, label: 'ROM', type: 'u16', expr: '(ROM_TOTAL-res[2])/ROM_TOTAL*100',    unit: '%',   chart: 'line',  enabled: true  },
  { id: 3, label: 'Speed',    type: 'i16', expr: 'res[3]/1000.0',                       unit: 'm/s', chart: 'line',  enabled: true  },
  { id: 4, label: 'Servo',    type: 'i16', expr: 'res[4]/10.0',                         unit: '°',   chart: 'delta', enabled: true  },
];

const DEFAULT_FRAME_DATA_LENGTH = 9; // CPU(u8) + RAM(u16) + ROM(u16) + Speed(i16) + Servo(i16)

// bump version to force localStorage reset
const STORAGE_KEY = 'tv_resource_slots';
const STORAGE_VERSION = 9;
const VERSION_KEY = 'tv_resource_slots_ver';
const LENGTH_KEY = 'tv_resource_frame_data_length';

function load(): ResourceSlot[] {
  try {
    if (localStorage.getItem(VERSION_KEY) !== String(STORAGE_VERSION)) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LENGTH_KEY);
      localStorage.setItem(VERSION_KEY, String(STORAGE_VERSION));
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_SLOTS.map(s => ({ ...s }));
}

function loadFrameDataLength(): number {
  try {
    const raw = localStorage.getItem(LENGTH_KEY);
    if (raw) return parseInt(raw, 10);
  } catch {}
  return DEFAULT_FRAME_DATA_LENGTH;
}

export const resourceSlots = reactive<ResourceSlot[]>(load());

export const frameDataLength = ref<number>(loadFrameDataLength());

watch(resourceSlots, () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(resourceSlots));
}, { deep: true });

watch(frameDataLength, (v) => {
  localStorage.setItem(LENGTH_KEY, String(v));
});

/** Reassign sequential ids and update res[N] references in expressions. */
export function reindexSlots(): void {
  const oldToNew = new Map<number, number>();
  resourceSlots.forEach((slot, i) => {
    oldToNew.set(slot.id, i);
    slot.id = i;
  });
  for (const slot of resourceSlots) {
    slot.expr = slot.expr.replace(/res\[(\d+)\]/g, (_m, n: string) => {
      const oldId = parseInt(n, 10);
      const newId = oldToNew.get(oldId);
      return newId !== undefined ? `res[${newId}]` : _m;
    });
  }
}

export function totalBytes(): number {
  return resourceSlots.reduce((s, slot) => s + SLOT_BYTES[slot.type], 0);
}

export function evalExpr(expr: string, res: number[]): number {
  try {
    const env = envContext();
    const keys = Object.keys(env);
    const vals = Object.values(env);
    return new Function('res', ...keys, `"use strict"; return (${expr});`)(res, ...vals) as number;
  } catch {
    return NaN;
  }
}

export function resetToDefault() {
  resourceSlots.splice(0, resourceSlots.length, ...DEFAULT_SLOTS.map(s => ({ ...s })));
  frameDataLength.value = DEFAULT_FRAME_DATA_LENGTH;
  localStorage.setItem(VERSION_KEY, String(STORAGE_VERSION));
}
