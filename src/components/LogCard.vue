<!-- MCU日志帧输出卡片 -->
<template>
  <div class="log-card">
    <div class="log-title">
      {{ title }}
      <button
        class="ctrl-btn"
        :class="{ on: autoScroll }"
        @click="autoScroll = !autoScroll"
        title="Auto-scroll"
      >
        <Icon icon="lucide:arrow-down-to-line" />
      </button>
      <button class="ctrl-btn" @click="$emit('clear')" title="Clear">
        <Icon icon="lucide:trash-2" />
      </button>
      <em :class="status">{{ statusText }}</em>
    </div>
    <div ref="bodyEl" class="log-body">
      <div v-if="!displayLogs.length" class="log-empty">Waiting for data...</div>
      <div
        v-for="item in displayLogs"
        :key="item.id"
        :class="['log', { warn: item.text.includes('WARN'), err: item.text.includes('ERROR') }]"
      >{{ item.text }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';

const props = defineProps<{ title: string; logs: string[]; status: 'offline' | 'live' | 'replay' }>();
defineEmits<{ clear: [] }>();

const statusText = computed(() => {
  if (props.status === 'replay') return 'REPLAY';
  if (props.status === 'live') return 'LIVE';
  return 'OFFLINE';
});

let nextLogId = 0;
interface LogEntry { id: number; text: string }

const displayLogs = ref<LogEntry[]>([]);

watch(
  () => props.logs,
  (logs) => {
    let oldCount = displayLogs.value.length;
    // Detect full reset (clear)
    if (logs.length < oldCount) {
      oldCount = 0;
      displayLogs.value = [];
    }
    for (let i = oldCount; i < logs.length; i++) {
      displayLogs.value.push({ id: nextLogId++, text: logs[i] });
    }
  },
  { deep: false },
);

const autoScroll = ref(true);
const bodyEl = ref<HTMLElement>();

watch(
  () => displayLogs.value.length,
  () => {
    if (autoScroll.value) {
      nextTick(() => {
        const el = bodyEl.value;
        if (el) el.scrollTop = el.scrollHeight;
      });
    }
  },
);
</script>

<style scoped>
.log-card {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.log-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.08em;
  flex-shrink: 0;
}
.log-title em {
  font-style: normal;
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 999px;
  margin-left: auto;
}
.log-title em.live    { background: rgba(32,184,166,.15); color: #20b8a6; }
.log-title em.offline { background: rgba(239,68,68,.12);  color: #ef4444; }
.log-title em.replay  { background: rgba(59,130,246,.15); color: #2563eb; }
[data-theme="dark"] .log-title em.live    { background: rgba(74,222,128,.15); color: #4ade80; }
[data-theme="dark"] .log-title em.offline { background: rgba(248,113,113,.15); color: #f87171; }
[data-theme="dark"] .log-title em.replay  { background: rgba(96,165,250,.15); color: #60a5fa; }

.ctrl-btn {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border: 1px solid var(--card-border);
  border-radius: 6px;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 12px;
  transition: background 150ms, color 150ms, border-color 150ms;
  flex-shrink: 0;
}
.ctrl-btn:hover { background: var(--surface); color: var(--text); }
.ctrl-btn.on { background: rgba(32,184,166,.15); color: #20b8a6; border-color: rgba(32,184,166,.3); }
[data-theme="dark"] .ctrl-btn.on { background: rgba(74,222,128,.15); color: #4ade80; border-color: rgba(74,222,128,.3); }

.log-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.log-empty {
  color: var(--text-dim);
  padding: 16px;
  text-align: center;
}
.log {
  padding: 3px 8px;
  border-radius: 4px;
  color: var(--text-muted);
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 11px;
  line-height: 1.5;
  flex-shrink: 0;
}
.log.warn { color: var(--log-warn-text); background: var(--log-warn-bg); }
.log.err  { color: var(--log-err-text);  background: var(--log-err-bg); }
</style>
