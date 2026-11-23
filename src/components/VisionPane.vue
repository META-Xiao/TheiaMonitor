<template>
  <div class="vision-pane" :class="{ embedded, fill }">
    <div class="pane-head">
      <span>{{ title }}</span>
      <div v-if="showFps" class="pane-actions"><b>{{ fps > 0 ? fps.toFixed(1) + ' FPS' : '-- FPS' }}</b></div>
    </div>
    <div class="canvas-wrap">
      <canvas ref="canvasEl" width="188" height="120" />
      <div v-if="!hasSignal" class="no-signal">NO SIGNAL</div>
    </div>
    <div class="vision-foot">
      <span>{{ imageSize.w > 0 ? `Source ${imageSize.w}×${imageSize.h}` : 'Source --×--' }}</span>
      <div class="vision-controls">
        <button class="ctrl-btn" @click="feedPaused = !feedPaused" :title="feedPaused ? 'Resume feed' : 'Pause feed'">
          <Icon :icon="feedPaused ? 'lucide:play' : 'lucide:pause-circle'" />
        </button>
        <button class="ctrl-btn" @click="takeScreenshot" title="Screenshot">
          <Icon icon="lucide:camera" />
        </button>
        <VideoRecordControls v-if="showRecording" :has-signal="hasSignal" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Icon } from '@iconify/vue';
import VideoRecordControls from './VideoRecordControls.vue';

withDefaults(defineProps<{
  fps: number;
  imageSize: { w: number; h: number };
  title?: string;
  embedded?: boolean;
  fill?: boolean;
  hasSignal?: boolean;
  showFps?: boolean;
  showRecording?: boolean;
}>(), { title: 'Vision stream', embedded: false, fill: false, hasSignal: true, showFps: true, showRecording: true });

const canvasEl = ref<HTMLCanvasElement>();
const feedPaused = ref(false);

function takeScreenshot() {
  const c = canvasEl.value;
  if (!c) return;
  const a = document.createElement('a');
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  a.download = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.png`;
  a.href = c.toDataURL('image/png');
  a.click();
}

defineExpose({
  canvas: canvasEl,
  isPaused: feedPaused,
});
</script>

<style scoped>
.vision-pane {
  position: relative;
  min-width: 0;
  height: 720px;
  border-radius: 26px;
  overflow: hidden;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  box-shadow: var(--card-shadow);
  backdrop-filter: blur(22px);
}

.pane-head,
.vision-foot {
  position: absolute;
  z-index: 2;
  left: 16px;
  right: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 900;
}
.pane-head { top: 14px; }
.vision-foot { bottom: 12px; }

.canvas-wrap {
  position: absolute;
  inset: 58px 42px 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    linear-gradient(rgba(36, 36, 36, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(36, 36, 36, 0.04) 1px, transparent 1px);
  background-size: 24px 24px;
  border-radius: 32px;
  overflow: hidden;
}
.canvas-wrap canvas {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
  border-radius: 20px;
  filter: saturate(0.95);
}

.vision-controls {
  display: flex;
  gap: 8px;
}
.vision-controls :deep(.ctrl-btn) {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: 1px solid var(--card-border);
  background: var(--card-bg);
  backdrop-filter: blur(12px);
  color: var(--text);
  display: grid;
  place-items: center;
  cursor: pointer;
  font-size: 16px;
  transition: background 150ms, color 150ms;
}
.vision-controls :deep(.ctrl-btn:hover) { background: var(--surface); }
.vision-controls :deep(.ctrl-btn.recording) { color: #f59e0b; }
.vision-controls :deep(.ctrl-btn.stop) { color: #ef4444; }

.pane-actions { display: flex; align-items: center; gap: 10px; }
.no-signal { position: absolute; inset: 0; display: grid; place-items: center; color: var(--text-dim); font: 700 13px "JetBrains Mono", monospace; letter-spacing: .15em; }
.vision-pane.embedded { height: auto; min-height: 420px; border: 0; border-radius: 0; background: transparent; box-shadow: none; backdrop-filter: none; }
.embedded .canvas-wrap { inset: 58px 12px 64px; border-radius: 12px; }
.embedded canvas { border-radius: 0; }
.fill .canvas-wrap canvas { object-fit: fill; }
.fill.embedded .canvas-wrap { inset: 42px 4px 48px; }
.embedded .vision-foot { flex-wrap: wrap; gap: 8px; font-size: 10px; }
.embedded .vision-controls :deep(.ctrl-btn) { width: 28px; height: 28px; font-size: 14px; }
.embedded .vision-controls { gap: 5px; }

@media (max-width: 1280px) {
  .vision-pane { height: 420px; }
}
@media (max-width: 760px) {
  .vision-pane { height: 320px; }
}
@media (max-width: 640px) {
  .vision-pane { height: 280px; }
}
</style>
