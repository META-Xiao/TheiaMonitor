<template>
  <main class="vision-page">
    <header class="vision-header"><p>Perspective image workspace</p><h1>Vision</h1></header>
    <section class="workbench">
      <article class="stream-card">
        <VisionPane ref="sourcePane" embedded :fps="fps" :image-size="sourceSize" :has-signal="!!frame">
          <template #header-actions>
            <button class="config-button" :class="{ active: calibration }" title="Import calibration JSON" @click="openConfig">
              <Icon icon="lucide:sliders-horizontal" />
            </button>
          </template>
        </VisionPane>
        <VisionPane ref="outputPane" class="ipm-pane" embedded title="IPM" :fps="fps"
          :image-size="outputSize" :has-signal="!!frame && !!ipmView" />
      </article>
      <aside class="resource-card" aria-label="Vision resources" />
    </section>

    <div v-if="showConfig" class="config-backdrop" @click.self="showConfig = false" @keydown.esc="showConfig = false">
      <section class="config-dialog" role="dialog" aria-modal="true" aria-labelledby="ipm-config-title">
        <header>
          <h2 id="ipm-config-title">Calibration JSON</h2>
          <button class="config-button" title="Close" @click="showConfig = false"><Icon icon="lucide:x" /></button>
        </header>
        <input ref="fileInput" hidden type="file" accept=".json,application/json" @change="loadCalibrationFile" />
        <button class="file-picker" @click="fileInput?.click()"><Icon icon="lucide:file-json-2" /> {{ fileName || 'Select calibration.json' }}</button>
        <label class="json-input">
          <span>Or paste calibration JSON</span>
          <textarea v-model="calibrationText" spellcheck="false"
            placeholder='{ "homography_image_to_output_px": [[...], [...], [...]], "warp_output_px": [188, 120] }' />
        </label>
        <label class="sampling-option"><input v-model="draftSmoothing" type="checkbox" /> Linear sampling</label>
        <p v-if="configError" class="config-error" role="alert">{{ configError }}</p>
        <footer>
          <button class="secondary-button" @click="clearCalibration">Clear calibration</button>
          <button class="primary-button" @click="applyConfig">Apply calibration</button>
        </footer>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { Icon } from '@iconify/vue';
import VisionPane from '../components/VisionPane.vue';
import type { ProcessedImageData } from '../serial/image-processor';
import { expandedPerspectiveView, warpPerspectiveWithHomography, type HomographyMatrix } from '../utils/inversePerspective';

interface CalibrationConfig {
  homography_image_to_output_px: HomographyMatrix;
  warp_output_px: [number, number];
}

const props = withDefaults(defineProps<{ frame: ProcessedImageData | null; fps?: number }>(), { fps: 0 });
const sourcePane = ref<InstanceType<typeof VisionPane>>();
const outputPane = ref<InstanceType<typeof VisionPane>>();
const calibration = shallowRef<CalibrationConfig | null>(null);
const ipmView = shallowRef<ReturnType<typeof expandedPerspectiveView>>(null);
const smoothing = ref(true);
const draftSmoothing = ref(true);
const showConfig = ref(false);
const fileInput = ref<HTMLInputElement>();
const fileName = ref('');
const calibrationText = ref('');
const configError = ref('');
const sourceSize = computed(() => ({ w: props.frame?.width ?? 188, h: props.frame?.height ?? 120 }));
const outputSize = computed(() => ({ w: ipmView.value?.width ?? 0, h: ipmView.value?.height ?? 0 }));
let renderFrameId = 0;

function openConfig() {
  draftSmoothing.value = smoothing.value;
  configError.value = '';
  showConfig.value = true;
}

async function loadCalibrationFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    calibrationText.value = await file.text();
    fileName.value = file.name;
    configError.value = '';
  } catch {
    configError.value = 'Could not read calibration file.';
  }
}

function makeView(config: CalibrationConfig) {
  return expandedPerspectiveView(config.homography_image_to_output_px, sourceSize.value.w,
    sourceSize.value.h, ...config.warp_output_px);
}

function applyConfig() {
  try {
    const parsed = JSON.parse(calibrationText.value);
    const matrix = parsed?.homography_image_to_output_px;
    const size = parsed?.warp_output_px;
    if (!Array.isArray(matrix) || matrix.length !== 3 || matrix.some(row =>
      !Array.isArray(row) || row.length !== 3 || row.some(value => typeof value !== 'number' || !Number.isFinite(value)))) {
      throw new Error('homography_image_to_output_px must be a finite 3×3 matrix.');
    }
    if (!Array.isArray(size) || size.length !== 2 || size.some(value =>
      !Number.isInteger(value) || value < 2 || value > 4096)) {
      throw new Error('warp_output_px must be [width, height], between 2 and 4096.');
    }
    const next: CalibrationConfig = { homography_image_to_output_px: matrix as HomographyMatrix, warp_output_px: size as [number, number] };
    if (!makeView(next)) throw new Error('The calibration matrix is singular.');
    calibration.value = next;
    smoothing.value = draftSmoothing.value;
    showConfig.value = false;
  } catch (error) {
    configError.value = error instanceof SyntaxError ? 'Select or paste valid calibration JSON.' : (error as Error).message;
  }
}

function clearCalibration() {
  calibration.value = null;
  calibrationText.value = '';
  fileName.value = '';
  if (fileInput.value) fileInput.value.value = '';
  showConfig.value = false;
}

// 同一标定与分辨率只算一次覆盖范围，不随每帧重新裁切。
watch([calibration, () => props.frame?.width, () => props.frame?.height], () => {
  ipmView.value = calibration.value ? makeView(calibration.value) : null;
}, { immediate: true });

function draw(canvas: HTMLCanvasElement | undefined, pixels: Uint8ClampedArray | null, width = 188, height = 120) {
  if (!canvas) return;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return;
  if (pixels) context.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
  else context.clearRect(0, 0, width, height);
}

function render() {
  const frame = props.frame;
  if (!sourcePane.value?.isPaused || !frame) {
    draw(sourcePane.value?.canvas, frame?.pixelData ?? null, sourceSize.value.w, sourceSize.value.h);
  }
  const view = ipmView.value;
  if (frame && view) {
    if (outputPane.value?.isPaused) return;
    const pixels = warpPerspectiveWithHomography(frame.pixelData, frame.width, frame.height,
      view.matrix, view.width, view.height, smoothing.value);
    draw(outputPane.value?.canvas, pixels, view.width, view.height);
  } else draw(outputPane.value?.canvas, null);
}

function queueRender() {
  cancelAnimationFrame(renderFrameId);
  renderFrameId = requestAnimationFrame(render);
}

watch([() => props.frame, ipmView, smoothing, () => sourcePane.value?.isPaused,
  () => outputPane.value?.isPaused], queueRender, { flush: 'post' });
onMounted(queueRender);
onBeforeUnmount(() => cancelAnimationFrame(renderFrameId));
</script>

<style scoped>
.vision-page { display: flex; flex-direction: column; gap: 18px; height: calc(100vh - 58px); padding: 0 28px 72px; color: var(--text); }
.vision-header { flex-shrink: 0; }
.vision-header p { margin: 0 0 8px; color: var(--text-muted); font-size: 14px; font-weight: 800; }
.vision-header h1 { margin: 0; font-size: clamp(32px, 4vw, 48px); line-height: 1.04; letter-spacing: -.045em; }
.workbench { flex: 1; min-height: 420px; display: grid; grid-template-columns: minmax(0, 1fr) clamp(200px, 18vw, 280px); gap: 18px; }
.stream-card, .resource-card { min-width: 0; overflow: hidden; border: 1px solid var(--card-border); border-radius: 26px; background: var(--card-bg); box-shadow: var(--card-shadow); backdrop-filter: blur(22px); }
.stream-card { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); padding: 8px; }
.ipm-pane { border-left: 1px solid var(--card-border); }
.config-button { display: grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 1px solid var(--card-border); border-radius: 9px; background: var(--surface); color: var(--text-muted); cursor: pointer; }
.config-button:hover, .config-button.active { color: #20b8a6; border-color: #20b8a6; }
.config-backdrop { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; padding: 20px; background: #0b10197a; backdrop-filter: blur(8px); }
.config-dialog { width: min(560px, 100%); max-height: 90vh; overflow: auto; box-sizing: border-box; padding: 22px; border: 1px solid var(--card-border); border-radius: 24px; background: var(--card-bg); box-shadow: var(--card-shadow); }
.config-dialog header, .config-dialog footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.config-dialog h2 { margin: 0; font-size: 20px; }
.file-picker, .secondary-button, .primary-button { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 11px 14px; border: 1px solid var(--card-border); border-radius: 11px; background: var(--surface); color: var(--text); cursor: pointer; font-weight: 700; }
.file-picker { width: 100%; margin-top: 20px; }
.json-input { display: grid; gap: 8px; margin-top: 14px; color: var(--text-muted); font-size: 12px; }
.json-input textarea { box-sizing: border-box; width: 100%; min-height: 160px; padding: 12px; resize: vertical; border: 1px solid var(--card-border); border-radius: 12px; background: var(--surface); color: var(--text); font: 11px/1.6 "JetBrains Mono", monospace; }
.sampling-option { display: flex; gap: 8px; align-items: center; margin: 14px 0; font-size: 12px; color: var(--text-muted); }
.sampling-option input { accent-color: #20b8a6; }
.primary-button { background: #20b8a6; border-color: #20b8a6; color: white; }
.config-error { color: #d65a66; font-size: 12px; }
@media (max-width: 1100px) { .workbench { grid-template-columns: minmax(0, 1fr) 180px; } }
@media (max-width: 800px) { .vision-page { height: auto; min-height: calc(100vh - 58px); padding: 0 14px 72px; } .workbench { grid-template-columns: minmax(0, 1fr); } .stream-card { grid-template-columns: minmax(0, 1fr); } .ipm-pane { border-left: 0; border-top: 1px solid var(--card-border); } .resource-card { min-height: 180px; } }
</style>
