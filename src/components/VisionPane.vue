<template>
  <div class="vision-pane">
    <div class="pane-head">
      <span>Vision stream</span>
      <b>{{ fps > 0 ? fps.toFixed(1) + ' FPS' : '-- FPS' }}</b>
    </div>
    <div class="canvas-wrap">
      <canvas ref="canvasEl" width="188" height="120" />
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
        <template v-if="!recording">
          <button class="ctrl-btn" @click="startRecord" title="Record">
            <Icon icon="lucide:video" />
          </button>
        </template>
        <template v-else>
          <button class="ctrl-btn recording" @click="pauseRecord" :title="paused ? 'Resume' : 'Pause'">
            <Icon :icon="paused ? 'lucide:play' : 'lucide:pause'" />
          </button>
          <button class="ctrl-btn stop" @click="stopRecord" title="Stop & Save">
            <Icon icon="lucide:square" />
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Icon } from '@iconify/vue';

const props = defineProps<{
  fps: number;
  imageSize: { w: number; h: number };
}>();

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

const recording = ref(false);
const paused = ref(false);
let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];

function startRecord() {
  const c = canvasEl.value;
  if (!c) return;
  const stream = c.captureStream(25);
  const mime = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm';
  recorder = new MediaRecorder(stream, { mimeType: mime });
  chunks = [];
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: mime });
    const a = document.createElement('a');
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    a.download = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.${mime.includes('mp4') ? 'mp4' : 'webm'}`;
    a.href = URL.createObjectURL(blob);
    a.click();
    URL.revokeObjectURL(a.href);
  };
  recorder.start(100);
  recording.value = true;
  paused.value = false;
}

function pauseRecord() {
  if (!recorder) return;
  if (paused.value) { recorder.resume(); paused.value = false; }
  else { recorder.pause(); paused.value = true; }
}

function stopRecord() {
  recorder?.stop();
  recording.value = false;
  paused.value = false;
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
.ctrl-btn {
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
.ctrl-btn:hover { background: var(--surface); }
.ctrl-btn.recording { color: #f59e0b; }
.ctrl-btn.stop { color: #ef4444; }

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
