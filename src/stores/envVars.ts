import { reactive, watch } from 'vue';

export interface EnvVar { key: string; value: number; desc: string; }

const STORAGE_KEY = 'tv_env_vars';

const DEFAULT: EnvVar[] = [
  { key: 'ROM_TOTAL', value: 32768, desc: 'ATmega32U4 Flash bytes' },
  { key: 'RAM_TOTAL', value: 2560,  desc: 'ATmega32U4 SRAM bytes' },
];

function load(): EnvVar[] {
  try { const r = localStorage.getItem(STORAGE_KEY); if (r) return JSON.parse(r); } catch {}
  return DEFAULT.map(v => ({ ...v }));
}

export const envVars = reactive<EnvVar[]>(load());

watch(envVars, () => localStorage.setItem(STORAGE_KEY, JSON.stringify(envVars)), { deep: true });

export function envContext(): Record<string, number> {
  return Object.fromEntries(envVars.map(v => [v.key, v.value]));
}
