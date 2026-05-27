<template>
  <Transition name="cli">
    <div v-if="open" class="cli-panel" :style="{ height: height + 'px' }">
      <div class="cli-resize-bar" @pointerdown="startResize" />
      <div class="cli-header">
        <span class="cli-title"><Icon icon="lucide:terminal" /> CLI</span>
        <button class="cli-close" @click="$emit('update:open', false)"><Icon icon="lucide:x" /></button>
      </div>
      <div class="cli-body">
        <span class="cli-placeholder">CLI — Coming Soon</span>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Icon } from '@iconify/vue';

defineProps<{ open: boolean }>();
defineEmits<{ 'update:open': [boolean] }>();

const height = ref(parseInt(localStorage.getItem('cliHeight') ?? '260'));

function startResize(e: PointerEvent) {
  e.preventDefault();
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  const startY = e.clientY;
  const startH = height.value;
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
  bottom: 0;
  left: 0;
  right: 0;
  height: 260px;
  z-index: 400;
  display: flex;
  flex-direction: column;
  background: var(--card-bg);
  border-top: 1px solid var(--card-border);
  backdrop-filter: blur(24px);
  box-shadow: 0 -8px 40px rgba(0,0,0,.15);
}
.cli-resize-bar {
  height: 5px;
  cursor: ns-resize;
  flex-shrink: 0;
  background: transparent;
  transition: background 150ms;
  touch-action: none;
  position: relative;
}
.cli-resize-bar::before {
  content: '';
  position: absolute;
  inset: -10px 0;
}
.cli-resize-bar:hover { background: var(--surface); }
.cli-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 36px;
  border-bottom: 1px solid var(--card-border);
  flex-shrink: 0;
}
.cli-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
  letter-spacing: 0.05em;
}
.cli-close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  display: grid;
  place-items: center;
  padding: 4px;
  border-radius: 6px;
  transition: background 150ms, color 150ms;
}
.cli-close:hover { background: var(--surface); color: var(--text); }
.cli-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--text-dim);
  font-family: "JetBrains Mono", "Fira Code", monospace;
}
.cli-enter-active, .cli-leave-active { transition: transform 220ms cubic-bezier(0.4,0,0.2,1); }
.cli-enter-from, .cli-leave-to { transform: translateY(100%); }

@media (max-width: 640px) {
  .cli-panel { bottom: 64px; }
}
</style>
