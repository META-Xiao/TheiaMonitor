import { reactive, watch } from 'vue';

export interface EnvVar { key: string; value: number; desc: string; }

const STORAGE_KEY = 'tv_env_vars';
const STORAGE_VERSION = 2;
const VERSION_KEY = 'tv_env_vars_ver';

const DEFAULT: EnvVar[] = [
  { key: 'ROM_TOTAL', value: 131072, desc: 'STC32G144K Flash bytes (128KB)' },
  { key: 'RAM_TOTAL', value: 24576,  desc: 'STC32G144K SRAM bytes (24KB)' },
];

function load(): EnvVar[] {
  try {
    if (localStorage.getItem(VERSION_KEY) !== String(STORAGE_VERSION)) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(VERSION_KEY, String(STORAGE_VERSION));
    }
    const r = localStorage.getItem(STORAGE_KEY);
    if (r) return JSON.parse(r);
  } catch {}
  return DEFAULT.map(v => ({ ...v }));
}

export const envVars = reactive<EnvVar[]>(load());

watch(envVars, () => localStorage.setItem(STORAGE_KEY, JSON.stringify(envVars)), { deep: true });

export function envContext(): Record<string, number> {
  return Object.fromEntries(envVars.map(v => [v.key, v.value]));
}
