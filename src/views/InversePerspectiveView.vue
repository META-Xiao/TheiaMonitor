<template>
  <main class="vision-page">
    <header class="vision-header">
      <p>Perspective image workspace</p>
      <h1>Vision</h1>
    </header>

    <section class="workbench">
      <article class="vision-card">
        <header>
          <div class="panel-title">
            <Icon icon="lucide:image" />
            <h2>Camera feed</h2>
          </div>
          <div class="header-actions">
            <button class="config-button" :class="{ active: calibration }" title="Import calibration JSON" @click="openConfig">
              <Icon icon="lucide:sliders-horizontal" />
              <span class="sr-only">Import calibration JSON</span>
            </button>
          </div>
        </header>
        <div class="viewport source-viewport">
          <div class="canvas-stage" :style="sourceStageStyle">
            <canvas ref="sourceCanvas" />
            <svg
              v-if="!calibration"
              class="quad-overlay"
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              @pointermove="movePoint"
              @pointerup="stopDragging"
              @pointercancel="stopDragging"
            >
              <polygon :points="quadPath" />
              <line
                v-for="line in guideLines"
                :key="line.key"
                :x1="line.x1"
                :y1="line.y1"
                :x2="line.x2"
                :y2="line.y2"
                class="guide-line"
              />
              <g
                v-for="(point, index) in quad"
                :key="index"
                class="handle"
                :transform="`translate(${point.x * 1000} ${point.y * 1000})`"
                @pointerdown.prevent="startDragging(index, $event)"
              >
                <circle r="25" />
                <text y="7">{{ index + 1 }}</text>
              </g>
            </svg>
            <div v-else class="calibration-badge">
              <Icon icon="lucide:file-check-2" />
              {{ calibration.reference || 'Calibration loaded' }}
            </div>
          </div>
          <div v-if="!frame" class="empty-state">
            <Icon icon="lucide:scan-line" />
            <b>Waiting for vision stream</b>
            <span>Connect the camera stream to start perspective processing.</span>
          </div>
        </div>
      </article>

      <article class="vision-card result-card">
        <header>
          <div class="panel-title">
            <Icon icon="lucide:scan-line" />
            <h2>Bird's-eye output</h2>
          </div>
        </header>
        <div class="viewport result-viewport">
          <div class="result-stage" :style="outputStageStyle">
            <canvas ref="outputCanvas" />
            <div class="center-line" />
          </div>
          <div v-if="!frame" class="empty-state subtle">
            <Icon icon="lucide:route" />
            <b>Output preview</b>
            <span>The transformed road plane will appear here.</span>
          </div>
        </div>
      </article>
    </section>

    <div v-if="showConfig" class="config-backdrop" @click.self="closeConfig">
      <section class="config-dialog" role="dialog" aria-modal="true" aria-labelledby="ipm-config-title">
        <header>
          <div>
            <p>Road mapping</p>
            <h2 id="ipm-config-title">Calibration JSON</h2>
          </div>
          <button class="dialog-close" title="Close" @click="closeConfig">
            <Icon icon="lucide:x" />
          </button>
        </header>

        <input ref="calibrationFileInput" class="file-input" type="file" accept=".json,application/json" @change="loadCalibrationFile" />
        <button class="file-picker" @click="calibrationFileInput?.click()">
          <Icon icon="lucide:file-json-2" />
          <span>
            <b>{{ calibrationFileName || 'Select calibration.json' }}</b>
            <small>Uses homography_image_to_output_px and warp_output_px</small>
          </span>
          <Icon icon="lucide:upload" />
        </button>

        <label class="json-input">
          <span>Or paste calibration output</span>
          <textarea
            v-model="calibrationText"
            spellcheck="false"
            placeholder='{ "homography_image_to_output_px": [[...], [...], [...]], "warp_output_px": [188, 120] }'
          />
        </label>

        <div v-if="calibrationPreview" class="calibration-preview">
          <span><Icon icon="lucide:grid-3x3" /> 3×3 homography</span>
          <b>{{ calibrationPreview.warp_output_px[0] }} × {{ calibrationPreview.warp_output_px[1] }} PX</b>
          <code>{{ calibrationPreview.reference || 'No reference name' }}</code>
        </div>

        <div class="config-options">
          <label class="config-checkbox">
            <input v-model="draftSmoothing" type="checkbox" />
            <span>Linear sampling</span>
          </label>
        </div>

        <p v-if="configError" class="config-error">{{ configError }}</p>
        <footer>
          <button class="secondary-button" @click="clearCalibration">
            <Icon icon="lucide:trash-2" /> Clear calibration
          </button>
          <button class="primary-button" @click="applyConfig">
            <Icon icon="lucide:check" /> Apply calibration
          </button>
        </footer>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import type { ProcessedImageData } from '../serial/image-processor';
import {
  warpPerspective,
  warpPerspectiveWithHomography,
  type HomographyMatrix,
  type PerspectivePoint,
  type PerspectiveQuad,
} from '../utils/inversePerspective';

interface CalibrationConfig {
  reference?: string;
  homography_image_to_output_px: HomographyMatrix;
  warp_output_px: [number, number];
  [key: string]: unknown;
}

const props = defineProps<{
  frame: ProcessedImageData | null;
}>();

const ROAD_QUAD: PerspectiveQuad = [
  { x: 0.36, y: 0.38 },
  { x: 0.64, y: 0.38 },
  { x: 0.94, y: 0.96 },
  { x: 0.06, y: 0.96 },
];

const sourceCanvas = ref<HTMLCanvasElement>();
const outputCanvas = ref<HTMLCanvasElement>();
const quad = ref<PerspectiveQuad>(cloneQuad(ROAD_QUAD));
const outputDepth = ref(1.5);
const smoothing = ref(true);
const showConfig = ref(false);
const calibration = ref<CalibrationConfig | null>(null);
const calibrationFileInput = ref<HTMLInputElement>();
const calibrationFileName = ref('');
const calibrationText = ref('');
const draftSmoothing = ref(smoothing.value);
const configError = ref('');
let draggingIndex = -1;
let renderFrameId = 0;

const outputHeight = computed(() => calibration.value?.warp_output_px[1]
  ?? Math.max(2, Math.round((props.frame?.height ?? 120) * outputDepth.value)));
const outputWidth = computed(() => calibration.value?.warp_output_px[0]
  ?? Math.max(2, props.frame?.width ?? 188));
const sourceStageStyle = computed(() => ({ aspectRatio: `${props.frame?.width ?? 188} / ${props.frame?.height ?? 120}` }));
const outputStageStyle = computed(() => ({ aspectRatio: `${outputWidth.value} / ${outputHeight.value}` }));
const calibrationPreview = computed(() => {
  if (!calibrationText.value.trim()) return null;
  try { return parseCalibration(calibrationText.value); } catch { return null; }
});
const quadPath = computed(() => quad.value.map((point) => `${point.x * 1000},${point.y * 1000}`).join(' '));
const guideLines = computed(() => {
  const [topLeft, topRight, bottomRight, bottomLeft] = quad.value;
  return [0.25, 0.5, 0.75].map((ratio) => ({
    key: ratio,
    x1: (topLeft.x + (bottomLeft.x - topLeft.x) * ratio) * 1000,
    y1: (topLeft.y + (bottomLeft.y - topLeft.y) * ratio) * 1000,
    x2: (topRight.x + (bottomRight.x - topRight.x) * ratio) * 1000,
    y2: (topRight.y + (bottomRight.y - topRight.y) * ratio) * 1000,
  }));
});

function cloneQuad(points: PerspectiveQuad): PerspectiveQuad {
  return points.map((point) => ({ ...point })) as PerspectiveQuad;
}

function openConfig() {
  draftSmoothing.value = smoothing.value;
  configError.value = '';
  showConfig.value = true;
}

function closeConfig() {
  showConfig.value = false;
  configError.value = '';
}

async function loadCalibrationFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  calibrationFileName.value = file.name;
  calibrationText.value = await file.text();
  configError.value = '';
}

function applyConfig() {
  try {
    calibration.value = parseCalibration(calibrationText.value);
    smoothing.value = draftSmoothing.value;
    closeConfig();
  } catch (error) {
    configError.value = error instanceof Error ? error.message : 'Invalid calibration JSON.';
  }
}

function clearCalibration() {
  calibration.value = null;
  calibrationText.value = '';
  calibrationFileName.value = '';
  if (calibrationFileInput.value) calibrationFileInput.value.value = '';
  closeConfig();
}

function parseCalibration(text: string): CalibrationConfig {
  if (!text.trim()) throw new Error('Select calibration.json or paste its contents first.');
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error('The file is not valid JSON.');
  }

  const matrix = parsed.homography_image_to_output_px;
  if (
    !Array.isArray(matrix) || matrix.length !== 3 ||
    matrix.some((row) => !Array.isArray(row) || row.length !== 3 || row.some((value) => !Number.isFinite(Number(value))))
  ) {
    throw new Error('homography_image_to_output_px must be a finite 3×3 matrix.');
  }
  const size = parsed.warp_output_px;
  if (!Array.isArray(size) || size.length !== 2 || size.some((value) => !Number.isFinite(Number(value)))) {
    throw new Error('warp_output_px must be [width, height].');
  }
  const width = Math.round(Number(size[0]));
  const height = Math.round(Number(size[1]));
  if (width < 2 || height < 2 || width > 4096 || height > 4096) {
    throw new Error('warp_output_px must be between 2×2 and 4096×4096.');
  }

  return {
    ...parsed,
    reference: typeof parsed.reference === 'string' ? parsed.reference : undefined,
    homography_image_to_output_px: matrix.map((row) => row.map(Number)) as HomographyMatrix,
    warp_output_px: [width, height],
  };
}

function startDragging(index: number, event: PointerEvent) {
  draggingIndex = index;
  (event.currentTarget?.closest('svg') as SVGSVGElement | null)?.setPointerCapture(event.pointerId);
}

function movePoint(event: PointerEvent) {
  if (draggingIndex < 0) return;
  const svg = event.currentTarget as SVGSVGElement;
  const bounds = svg.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width;
  const y = (event.clientY - bounds.top) / bounds.height;
  updatePoint(draggingIndex, { x, y });
}

function stopDragging() {
  draggingIndex = -1;
}

function updatePoint(index: number, candidate: PerspectivePoint) {
  const next = cloneQuad(quad.value);
  const margin = 0.04;
  let minX = 0.01;
  let maxX = 0.99;
  let minY = 0.01;
  let maxY = 0.99;

  if (index === 0) { maxX = next[1].x - margin; maxY = next[3].y - margin; }
  if (index === 1) { minX = next[0].x + margin; maxY = next[2].y - margin; }
  if (index === 2) { minX = next[3].x + margin; minY = next[1].y + margin; }
  if (index === 3) { maxX = next[2].x - margin; minY = next[0].y + margin; }

  next[index] = {
    x: Math.min(maxX, Math.max(minX, candidate.x)),
    y: Math.min(maxY, Math.max(minY, candidate.y)),
  };
  quad.value = next;
}

function queueRender() {
  cancelAnimationFrame(renderFrameId);
  renderFrameId = requestAnimationFrame(render);
}

function render() {
  const frame = props.frame;
  const source = sourceCanvas.value;
  const output = outputCanvas.value;
  if (!source || !output) return;
  if (!frame) {
    drawEmptyCanvas(source, 188, 120);
    drawEmptyCanvas(output, outputWidth.value, outputHeight.value);
    return;
  }

  source.width = frame.width;
  source.height = frame.height;
  source.getContext('2d')?.putImageData(
    new ImageData(new Uint8ClampedArray(frame.pixelData), frame.width, frame.height),
    0,
    0,
  );

  const sourceQuad = quad.value.map((point) => ({
    x: point.x * (frame.width - 1),
    y: point.y * (frame.height - 1),
  })) as PerspectiveQuad;
  const warped = calibration.value
    ? warpPerspectiveWithHomography(
      frame.pixelData,
      frame.width,
      frame.height,
      calibration.value.homography_image_to_output_px,
      outputWidth.value,
      outputHeight.value,
      smoothing.value,
    )
    : warpPerspective(
      frame.pixelData,
      frame.width,
      frame.height,
      sourceQuad,
      outputWidth.value,
      outputHeight.value,
      smoothing.value,
    );
  output.width = outputWidth.value;
  output.height = outputHeight.value;
  output.getContext('2d')?.putImageData(new ImageData(warped, outputWidth.value, outputHeight.value), 0, 0);
}

function drawEmptyCanvas(canvas: HTMLCanvasElement, width: number, height: number) {
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.fillStyle = '#0a0f19';
  context.fillRect(0, 0, width, height);
}

watch([() => props.frame, quad, outputDepth, smoothing, calibration], queueRender, { deep: true, flush: 'post' });
onMounted(queueRender);
onBeforeUnmount(() => cancelAnimationFrame(renderFrameId));
</script>

<style scoped>
.vision-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
  height: calc(100vh - 58px);
  padding: 0 28px 72px;
  color: var(--text);
  font-family: Inter, "Segoe UI", sans-serif;
}
.vision-header { flex-shrink: 0; }
.vision-header p { margin: 0 0 8px; color: var(--text-muted); font-size: 14px; font-weight: 800; }
.vision-header h1 { margin: 0; font-size: clamp(32px, 4vw, 48px); line-height: 1.04; letter-spacing: -0.045em; }
.vision-card > header,
.panel-title,
.header-actions {
  display: flex;
  align-items: center;
}
.workbench { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.vision-card {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto 1fr;
  padding: 18px;
  overflow: hidden;
  border: 1px solid var(--card-border);
  border-radius: 26px;
  background: var(--card-bg);
  box-shadow: var(--card-shadow);
  backdrop-filter: blur(22px);
}
.vision-card > header { justify-content: space-between; margin-bottom: 12px; }
.panel-title { gap: 8px; }
.panel-title > svg { color: var(--text-muted); font-size: 17px; }
.vision-card h2 { margin: 0; font-size: 17px; font-weight: 900; letter-spacing: -.02em; }
.header-actions { gap: 8px; }
.config-button,
.dialog-close {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--card-border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text-muted);
  cursor: pointer;
  transition: color 150ms, border-color 150ms, background 150ms;
}
.config-button:hover,
.dialog-close:hover { border-color: #20b8a6; color: #20b8a6; }
.config-button.active { border-color: rgba(32,184,166,.45); background: rgba(32,184,166,.14); color: #20b8a6; }
.config-button svg { font-size: 16px; }
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.viewport {
  position: relative;
  min-height: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 16px;
  background: var(--surface);
}
.canvas-stage { position: relative; width: min(100%, 760px); max-height: 100%; }
.canvas-stage canvas,
.result-stage canvas { width: 100%; height: 100%; display: block; image-rendering: pixelated; }
.quad-overlay { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
.quad-overlay polygon { fill: rgba(32,184,166,.10); stroke: #20b8a6; stroke-width: 4; vector-effect: non-scaling-stroke; }
.guide-line { stroke: rgba(32,184,166,.46); stroke-width: 1.5; stroke-dasharray: 7 7; vector-effect: non-scaling-stroke; }
.handle { cursor: grab; }
.handle:active { cursor: grabbing; }
.handle circle { fill: var(--card-bg); stroke: #20b8a6; stroke-width: 5; vector-effect: non-scaling-stroke; }
.handle text { fill: var(--text); text-anchor: middle; font: 800 20px Inter, sans-serif; pointer-events: none; }
.calibration-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: calc(100% - 20px);
  padding: 6px 9px;
  overflow: hidden;
  border: 1px solid rgba(32,184,166,.3);
  border-radius: 9px;
  background: rgba(11, 16, 25, .72);
  color: #5ee0d1;
  font: 700 9px "JetBrains Mono", monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
  backdrop-filter: blur(8px);
}
.result-stage { position: relative; height: min(440px, 90%); max-width: 92%; box-shadow: 0 12px 32px rgba(35,45,58,.18); }
.center-line { position: absolute; top: 0; bottom: 0; left: 50%; border-left: 1px dashed rgba(32,184,166,.4); pointer-events: none; }
.empty-state {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 8px;
  color: var(--text-muted);
  text-align: center;
}
.empty-state svg { font-size: 28px; color: #20b8a6; opacity: .72; }
.empty-state b { font-size: 13px; }
.empty-state span { max-width: 260px; color: var(--text-dim); font-size: 11px; }
.empty-state.subtle svg { color: #4c8fd8; }
.config-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(11, 16, 25, .48);
  backdrop-filter: blur(8px);
}
.config-dialog {
  width: min(620px, 100%);
  padding: 22px;
  border: 1px solid var(--card-border);
  border-radius: 24px;
  background: var(--card-bg);
  box-shadow: 0 24px 70px rgba(5, 10, 18, .28);
}
.config-dialog > header,
.config-dialog > footer,
.config-options,
.config-options label {
  display: flex;
  align-items: center;
}
.config-dialog > header { justify-content: space-between; margin-bottom: 20px; }
.config-dialog > header p { margin: 0 0 5px; color: #20b8a6; font-size: 10px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; }
.config-dialog h2 { margin: 0; font-size: 20px; letter-spacing: -.02em; }
.file-input { display: none; }
.file-picker {
  width: 100%;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 13px 14px;
  border: 1px solid var(--card-border);
  border-radius: 13px;
  background: var(--surface);
  color: var(--text-muted);
  text-align: left;
  cursor: pointer;
}
.file-picker:hover { border-color: #20b8a6; }
.file-picker > svg:first-child { color: #20b8a6; font-size: 22px; }
.file-picker span { display: grid; gap: 3px; }
.file-picker b { color: var(--text); font-size: 11px; }
.file-picker small { color: var(--text-dim); font-size: 9px; }
.json-input { display: grid; gap: 7px; margin-top: 14px; }
.json-input > span { color: var(--text-muted); font-size: 10px; font-weight: 800; }
.json-input textarea {
  width: 100%;
  min-height: 150px;
  resize: vertical;
  box-sizing: border-box;
  padding: 12px;
  border: 1px solid var(--card-border);
  border-radius: 12px;
  outline: none;
  background: var(--surface);
  color: var(--text);
  font: 500 10px/1.55 "JetBrains Mono", monospace;
}
.json-input textarea:focus { border-color: #20b8a6; }
.calibration-preview {
  display: grid;
  grid-template-columns: auto auto 1fr;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 11px;
  background: rgba(32,184,166,.10);
  color: #168f82;
  font-size: 10px;
}
.calibration-preview span { display: flex; align-items: center; gap: 6px; font-weight: 800; }
.calibration-preview b { white-space: nowrap; }
.calibration-preview code { overflow: hidden; color: var(--text-muted); font: 600 9px "JetBrains Mono", monospace; text-align: right; text-overflow: ellipsis; white-space: nowrap; }
.config-options { justify-content: flex-end; gap: 14px; margin-top: 14px; }
.config-checkbox { gap: 8px; padding: 10px 12px; border-radius: 10px; background: var(--surface); }
.config-checkbox span { color: var(--text-muted); font-size: 10px; font-weight: 800; }
.config-checkbox input { accent-color: #20b8a6; }
.config-error { margin: 12px 0 0; color: #d65a66; font-size: 11px; font-weight: 700; }
.config-dialog > footer { justify-content: space-between; gap: 12px; margin-top: 20px; }
.secondary-button,
.primary-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 10px 14px;
  border: 1px solid var(--card-border);
  border-radius: 11px;
  font-size: 11px;
  font-weight: 900;
  cursor: pointer;
}
.secondary-button { background: var(--surface); color: var(--text-muted); }
.primary-button { border-color: #20b8a6; background: #20b8a6; color: #fff; }

@media (max-width: 1100px) {
  .vision-page { height: auto; min-height: calc(100vh - 58px); }
  .workbench { grid-template-columns: 1fr; }
  .vision-card { min-height: 500px; }
}
@media (max-width: 640px) {
  .vision-page { padding: 16px 14px 80px; }
  .vision-card { min-height: 420px; padding: 14px; }
  .config-options { align-items: stretch; flex-direction: column; }
  .calibration-preview { grid-template-columns: 1fr auto; }
  .calibration-preview code { grid-column: 1 / -1; text-align: left; }
  .config-dialog > footer { align-items: stretch; flex-direction: column; }
}
</style>
