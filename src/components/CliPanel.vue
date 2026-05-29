<template>
  <Transition name="cli">
    <div v-if="open" class="cli-panel" :style="{ height: height + 'px' }">
      <div class="cli-resize-bar" @pointerdown="startResize" />
      <div class="cli-header">
        <span class="cli-title"><Icon icon="lucide:terminal" /> CLI</span>
        <button class="cli-btn" @click="clear" title="Clear"><Icon icon="lucide:trash-2" /></button>
        <button class="cli-btn" @click="$emit('update:open', false)"><Icon icon="lucide:x" /></button>
      </div>
      <!-- 整个终端区域可点击聚焦 -->
      <div class="cli-body" @click="focusInput">
        <div class="cli-output" ref="outputEl">
          <!-- 历史输出块 -->
          <div v-for="(block, i) in blocks" :key="i" :class="['cli-block', block.kind]">
            <template v-if="block.kind === 'cmd'"><span class="prompt">❯ </span>{{ block.text }}</template>
            <template v-else>{{ block.text }}</template>
          </div>
          <!-- 当前输入行：命令执行中时隐藏 -->
          <div v-if="!cliRunning" class="cli-block cmd cli-current-line">
            <span class="prompt">❯ </span>
            <span>{{ draft }}</span><span class="cursor" :class="{ blink: conn.connected }">█</span>
          </div>
        </div>
        <!-- 隐藏的真实 input，接收键盘事件 -->
        <input
          ref="inputEl"
          v-model="draft"
          class="cli-hidden-input"
          :disabled="!conn.connected"
          @keydown.enter.prevent="send"
          @keydown.up.prevent="histNav(-1)"
          @keydown.down.prevent="histNav(1)"
        />
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { Icon } from '@iconify/vue';
import { serialManager, useTelemetry } from '../composables/useTelemetry';
import { conn } from '../stores/connection';

defineProps<{ open: boolean }>();
defineEmits<{ 'update:open': [boolean] }>();

const { cliOutput, cliRunning } = useTelemetry();

const height = ref(parseInt(localStorage.getItem('cliHeight') ?? '260'));
const outputEl = ref<HTMLElement>();
const inputEl = ref<HTMLInputElement>();
const draft = ref('');

type Block = { kind: 'cmd' | 'out'; text: string };
const blocks = ref<Block[]>([]);

const history: string[] = [];
let histIdx = -1;

watch(cliOutput, (val, old) => {
  const chunk = val.slice(old.length);
  if (!chunk) return;
  const last = blocks.value[blocks.value.length - 1];
  if (last?.kind === 'out') {
    last.text += chunk;
  } else {
    blocks.value.push({ kind: 'out', text: chunk });
  }
  scrollBottom();
});

function scrollBottom() {
  nextTick(() => { if (outputEl.value) outputEl.value.scrollTop = outputEl.value.scrollHeight; });
}

function focusInput() {
  inputEl.value?.focus();
}

async function send() {
  const cmd = draft.value.trim();
  if (!cmd) return;
  if (cmd === 'clear') { draft.value = ''; clear(); return; }
  if (!conn.connected) return;
  blocks.value.push({ kind: 'cmd', text: cmd });
  if (blocks.value.length > 2000) blocks.value.splice(0, blocks.value.length - 2000);
  history.unshift(cmd);
  if (history.length > 100) history.pop();
  histIdx = -1;
  draft.value = '';
  scrollBottom();
  await serialManager.write(new TextEncoder().encode(cmd + '\n'));
}

function histNav(dir: -1 | 1) {
  if (!history.length) return;
  histIdx = Math.max(-1, Math.min(history.length - 1, histIdx - dir));
  draft.value = histIdx === -1 ? '' : history[histIdx];
}

function clear() {
  blocks.value = [];
}

function startResize(e: PointerEvent) {
  e.preventDefault();
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  const startY = e.clientY, startH = height.value;
  const onMove = (ev: PointerEvent) => {
    ev.preventDefault();
    height.value = Math.max(120, Math.min(window.innerHeight - 80, startH - (ev.clientY - startY)));
  };
  const onUp = () => {
    localStorage.setItem('cliHeight', String(height.value));
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
}
</script>

<style scoped>
.cli-panel {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  z-index: 400;
  display: flex;
  flex-direction: column;
  background: var(--card-bg);
  border-top: 1px solid var(--card-border);
  backdrop-filter: blur(24px);
  box-shadow: 0 -8px 40px rgba(0,0,0,.15);
}
.cli-resize-bar {
  height: 5px; cursor: ns-resize; flex-shrink: 0;
  background: transparent; transition: background 150ms; touch-action: none; position: relative;
}
.cli-resize-bar::before { content: ''; position: absolute; inset: -10px 0; }
.cli-resize-bar:hover { background: var(--surface); }
.cli-header {
  display: flex; align-items: center; gap: 4px;
  padding: 0 12px; height: 36px;
  border-bottom: 1px solid var(--card-border); flex-shrink: 0;
}
.cli-title {
  display: flex; align-items: center; gap: 6px; flex: 1;
  font-size: 12px; font-weight: 700; color: var(--text-muted); letter-spacing: 0.05em;
}
.cli-btn {
  background: none; border: none; cursor: pointer; color: var(--text-muted);
  display: grid; place-items: center; padding: 4px; border-radius: 6px;
  transition: background 150ms, color 150ms;
}
.cli-btn:hover { background: var(--surface); color: var(--text); }
.cli-body {
  flex: 1; overflow: hidden; cursor: text;
  font-family: "JetBrains Mono", "Fira Code", monospace; font-size: 12px;
}
.cli-output {
  height: 100%; overflow-y: auto; padding: 6px 14px 6px;
  display: flex; flex-direction: column;
}
.cli-block {
  line-height: 1.6; white-space: pre-wrap; word-break: break-all;
}
.cli-block.cmd { color: var(--text); }
.cli-block.out { color: #20b8a6; }
.prompt { color: #a78bfa; }
.cursor { color: #a78bfa; font-size: 10px; vertical-align: middle; }
.cursor.blink { animation: blink 1s step-end infinite; }
@keyframes blink { 50% { opacity: 0; } }
.cli-hidden-input {
  position: absolute; opacity: 0; pointer-events: none; width: 0; height: 0;
}
.cli-enter-active, .cli-leave-active { transition: transform 220ms cubic-bezier(0.4,0,0.2,1); }
.cli-enter-from, .cli-leave-to { transform: translateY(100%); }
@media (max-width: 640px) { .cli-panel { bottom: 64px; } }
</style>
