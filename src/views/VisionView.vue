<template>
  <div class="vision-page" @click="addPickerOpen = false">
    <!-- Page header -->
    <div class="vision-header">
      <p class="vision-hello">Live camera feed</p>
      <h1>Vision</h1>
    </div>

    <!-- Left: feed card -->
    <div class="feed-card">
      <div class="feed-head">
        <span class="feed-label">Vision Stream</span>
        <span class="feed-fps">{{ fps.toFixed(1) }} FPS</span>
      </div>
      <div class="feed-canvas-wrap">
        <canvas ref="canvasEl" class="feed-canvas" />
      </div>
      <!-- bottom-right controls -->
      <div class="feed-controls">
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

    <!-- Right panel -->
    <div class="right-panel">
      <!-- Metric cards grid -->
      <div class="metrics-section">
        <div class="metrics-grid">
          <div
            v-for="card in activeCards"
            :key="card.id"
            class="metric-card"
          >
            <div class="metric-head">
              <span>{{ card.label }}</span>
              <b>{{ card.value }}</b>
            </div>
            <svg viewBox="0 0 200 80" preserveAspectRatio="none" class="metric-chart">
              <path class="metric-area" :d="areaPath(card.points, 200, 80, card.max)" />
              <path class="metric-line" :d="linePath(card.points, 200, 80, card.max)" :style="{ stroke: card.color }" />
            </svg>
            <button class="remove-btn" @click="removeCard(card.id)"><Icon icon="lucide:x" /></button>
          </div>

          <!-- Add slot -->
          <button
            v-if="activeCards.length < 4 && availableCards.length"
            ref="addBtnEl"
            class="add-card-btn"
            @click.stop="togglePicker"
          >
            <Icon icon="lucide:plus" />
            <span>Add metric</span>
          </button>
          <Teleport to="body">
            <div v-if="addPickerOpen" class="add-picker-fixed" :style="pickerStyle" @click.stop>
              <button v-for="c in availableCards" :key="c.id" @click="addCard(c.id)">{{ c.label }}</button>
            </div>
          </Teleport>
        </div>
      </div>

      <!-- MCU log -->
      <div class="vision-log">
        <LogCard title="MCU Output" :logs="logs" :connected="conn.connected" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { Icon } from '@iconify/vue';
import { conn } from '../stores/connection';
import LogCard from '../components/LogCard.vue';

const props = defineProps<{
  canvasRef?: HTMLCanvasElement | null;
  mcuLogs: string[];
  data: { cpu: number; ram: number; rom: number; speed: number; servo: number };
  cpuPoints: number[];
  ramPoints: number[];
  romPoints: number[];
  speedPoints: number[];
  fps: number;
}>();

const canvasEl = ref<HTMLCanvasElement>();
const logs = computed(() => props.mcuLogs.slice(-20));

// ── Card catalogue ──────────────────────────────────────────
const ALL_CARDS = computed(() => [
  { id: 'cpu',   label: 'CPU',   value: `${props.data.cpu}%`,              color: '#242424', points: props.cpuPoints,   max: 100  },
  { id: 'ram',   label: 'RAM',   value: `${props.data.ram}%`,              color: '#20b8a6', points: props.ramPoints,   max: 100  },
  { id: 'rom',   label: 'ROM',   value: `${props.data.rom}%`,              color: '#c7d54f', points: props.romPoints,   max: 100  },
  { id: 'speed', label: 'Speed', value: `${(props.data.speed/1000).toFixed(2)} m/s`, color: '#f59e0b', points: props.speedPoints, max: 2000 },
  { id: 'servo', label: 'Servo', value: `${(props.data.servo/10).toFixed(1)}°`,      color: '#a78bfa', points: Array(12).fill(props.data.servo), max: 9000 },
]);

const addBtnEl = ref<HTMLElement>();
const pickerStyle = ref({});

function togglePicker() {
  addPickerOpen.value = !addPickerOpen.value;
  if (addPickerOpen.value && addBtnEl.value) {
    const r = addBtnEl.value.getBoundingClientRect();
    pickerStyle.value = { top: `${r.bottom + 6}px`, left: `${r.left}px`, width: `${r.width}px` };
  }
}

const shownIds = ref<string[]>([]);
const addPickerOpen = ref(false);

const activeCards = computed(() => ALL_CARDS.value.filter(c => shownIds.value.includes(c.id)));
const availableCards = computed(() => ALL_CARDS.value.filter(c => !shownIds.value.includes(c.id)));

function addCard(id: string) { shownIds.value = [...shownIds.value, id]; addPickerOpen.value = false; }
function removeCard(id: string) { shownIds.value = shownIds.value.filter(x => x !== id); }

// ── Chart helpers ────────────────────────────────────────────
const linePath = (pts: number[], w: number, h: number, max: number) =>
  pts.map((p, i) => {
    const x = (i / (pts.length - 1)) * w;
    const y = h - (Math.min(p, max) / max) * (h - 10) - 5;
    return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
const areaPath = (pts: number[], w: number, h: number, max: number) =>
  `${linePath(pts, w, h, max)} L${w} ${h} L0 ${h} Z`;

// ── Screenshot ───────────────────────────────────────────────
function takeScreenshot() {
  const c = canvasEl.value;
  if (!c) return;
  const a = document.createElement('a');
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  a.download = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.png`;
  a.href = c.toDataURL('image/png');
  a.click();
}

// ── Recording ────────────────────────────────────────────────
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
    a.download = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.${mime.includes('mp4') ? 'mp4' : 'webm'}`;
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

// ── Mirror parent canvas ─────────────────────────────────────
const feedPaused = ref(false);
let animId: number;
function mirrorCanvas() {
  const dst = canvasEl.value;
  const src = props.canvasRef;
  if (dst && src && !feedPaused.value) {
    dst.width = src.width;
    dst.height = src.height;
    dst.getContext('2d')?.drawImage(src, 0, 0);
  }
  animId = requestAnimationFrame(mirrorCanvas);
}

onMounted(() => {
  window.addEventListener('click', () => { addPickerOpen.value = false; });
  animId = requestAnimationFrame(mirrorCanvas);
});
onUnmounted(() => { cancelAnimationFrame(animId); recorder?.stop(); });
</script>

<style scoped>
.vision-page {
  display: grid;
  grid-template-columns: 60% 1fr;
  grid-template-rows: auto 1fr;
  gap: 18px;
  padding: 0 28px 72px;
  min-height: calc(100vh - 58px);
  color: var(--text);
  font-family: Inter, "Segoe UI", sans-serif;
  align-items: start;
}
.vision-header {
  grid-column: 1 / -1;
  margin-bottom: 4px;
}
.vision-hello {
  margin: 0 0 8px;
  color: var(--text-muted);
  font-size: 14px;
  font-weight: 800;
}
.vision-header h1 {
  margin: 0;
  font-size: clamp(32px, 4vw, 48px);
  line-height: 1.04;
  letter-spacing: -0.045em;
}

/* ── Feed card ── */
.feed-card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  box-shadow: var(--card-shadow);
  backdrop-filter: blur(22px);
  border-radius: 26px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: relative;
}
.feed-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  font-weight: 800;
  color: var(--text-muted);
}
.feed-fps { color: #20b8a6; }
.feed-canvas-wrap {
  width: 100%;
  aspect-ratio: 188 / 120;
  background: var(--surface);
  border-radius: 14px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.feed-canvas {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
.feed-controls {
  position: absolute;
  bottom: 28px;
  right: 28px;
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

/* ── Right panel ── */
.right-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
}

/* ── Metrics grid ── */
.metrics-section {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  box-shadow: var(--card-shadow);
  backdrop-filter: blur(22px);
  border-radius: 26px;
  padding: 16px;
}
.metrics-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.metric-card {
  background: var(--surface);
  border-radius: 14px;
  padding: 12px;
  position: relative;
  overflow: hidden;
  min-height: 100px;
}
.metric-head {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  font-weight: 900;
  color: var(--text-dim);
}
.metric-head b { color: var(--text); font-size: 14px; }
.metric-chart {
  width: 100%;
  height: 60px;
  margin-top: 6px;
}
.metric-area { fill: rgba(214,232,115,.2); }
.metric-line { fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.remove-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: var(--text-dim);
  display: grid;
  place-items: center;
  cursor: pointer;
  font-size: 12px;
  opacity: 0;
  transition: opacity 150ms;
}
.metric-card:hover .remove-btn { opacity: 1; }

.add-card-btn {
  min-height: 100px;
  border-radius: 14px;
  border: 1.5px dashed var(--card-border);
  background: transparent;
  color: var(--text-muted);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  position: relative;
  transition: background 150ms;
}
.add-card-btn:hover { background: var(--surface); }
.add-picker-fixed {
  position: fixed;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 12px;
  box-shadow: var(--card-shadow);
  backdrop-filter: blur(20px);
  z-index: 500;
  overflow: hidden;
}
.add-picker-fixed button {
  display: block;
  width: 100%;
  padding: 10px 14px;
  text-align: left;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 150ms;
}
.add-picker-fixed button:hover { background: var(--surface); }

/* ── MCU log ── */
.vision-log {
  flex: 1;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  box-shadow: var(--card-shadow);
  backdrop-filter: blur(22px);
  border-radius: 26px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 160px;
}
.log-title {
  font-size: 11px;
  font-weight: 900;
  color: var(--text-muted);
  display: flex;
  gap: 8px;
  align-items: center;
}
.log-title em {
  font-style: normal;
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 999px;
}
.log-title em.live    { background: rgba(32,184,166,.15); color: #20b8a6; }
.log-title em.offline { background: rgba(239,68,68,.12);  color: #ef4444; }
[data-theme="dark"] .log-title em.live    { background: rgba(74,222,128,.15); color: #4ade80; }
[data-theme="dark"] .log-title em.offline { background: rgba(248,113,113,.15); color: #f87171; }
.log-body {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.log {
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 11px;
  color: var(--text-muted);
  padding: 2px 0;
}
.log.warn { color: var(--log-warn-text); background: var(--log-warn-bg); padding: 2px 6px; border-radius: 4px; }
.log.err  { color: var(--log-err-text);  background: var(--log-err-bg);  padding: 2px 6px; border-radius: 4px; }

/* ── Responsive ── */
@media (max-width: 900px) {
  .vision-page {
    grid-template-columns: 1fr;
  }
  .right-panel { flex-direction: row; flex-wrap: wrap; }
  .metrics-section { flex: 1; min-width: 280px; }
  .vision-log { flex: 1; min-width: 280px; }
}
@media (max-width: 640px) {
  .vision-page { padding: 16px 14px 80px; }
  .right-panel { flex-direction: column; }
  .metrics-grid { grid-template-columns: 1fr; }
}
</style>
