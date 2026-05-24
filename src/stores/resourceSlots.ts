import { reactive, watch } from 'vue';
import { envContext } from './envVars';

export type SlotType = 'u8' | 'u16' | 'i16' | 'u32' | 'i32';

export interface ResourceSlot {
  id: number;
  label: string;
  type: SlotType;
  expr: string;
  unit: string;
  chart: 'line' | 'delta' | 'bar' | 'number';
  enabled: boolean;
}

export const SLOT_BYTES: Record<SlotType, number> = {
  u8: 1, u16: 2, i16: 2, u32: 4, i32: 4,
};

// 新协议 (v3): CPU(1B) + ROM_free(2B) + RAM_free(2B) + Speed(2B i16) + Servo(2B i16) + Reserved(4B) + CHK = 15B
const DEFAULT_SLOTS: ResourceSlot[] = [
  { id: 0, label: 'CPU',      type: 'u8',  expr: 'res[0]',                              unit: '%',   chart: 'line',  enabled: true  },
  { id: 1, label: 'ROM used', type: 'u16', expr: '(ROM_TOTAL-res[1])/ROM_TOTAL*100',    unit: '%',   chart: 'bar',   enabled: true  },
  { id: 2, label: 'RAM used', type: 'u16', expr: '(RAM_TOTAL-res[2])/RAM_TOTAL*100',    unit: '%',   chart: 'bar',   enabled: true  },
  { id: 3, label: 'Speed',    type: 'i16', expr: 'res[3]/1000.0',                       unit: 'm/s', chart: 'line',  enabled: true  },
  { id: 4, label: 'Servo',    type: 'i16', expr: 'res[4]/10.0',                         unit: '°',   chart: 'delta', enabled: true  },
];

// bump version to force localStorage reset
export const FRAME_BODY_BYTES = 13;
const STORAGE_KEY = 'tv_resource_slots';
const STORAGE_VERSION = 4;
const VERSION_KEY = 'tv_resource_slots_ver';

function load(): ResourceSlot[] {
  try {
    if (localStorage.getItem(VERSION_KEY) !== String(STORAGE_VERSION)) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(VERSION_KEY, String(STORAGE_VERSION));
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_SLOTS.map(s => ({ ...s }));
}

export const resourceSlots = reactive<ResourceSlot[]>(load());

watch(resourceSlots, () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(resourceSlots));
}, { deep: true });

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
  localStorage.setItem(VERSION_KEY, String(STORAGE_VERSION));
}
