<template>
  <main class="vision-page">
    <header class="vision-header"><p>Perspective image workspace</p><h1>Vision</h1></header>
    <section class="workbench">
      <article class="stream-card">
        <header class="stream-toolbar">
          <button class="config-button" :class="{ active: ipmEnabled }" title="IPM matrix"
            :disabled="videoRecording?.recording.value" @click="openConfig"><Icon icon="lucide:sliders-horizontal" /></button>
          <b>{{ fps > 0 ? fps.toFixed(1) + ' FPS' : '-- FPS' }}</b>
        </header>
        <VisionPane ref="sourcePane" embedded :show-fps="false" :fps="fps" :image-size="sourceSize" :has-signal="!!frame" />
        <VisionPane ref="outputPane" class="ipm-pane" embedded fill title="IPM" :show-fps="false" :show-recording="false"
          :fps="fps" :image-size="outputSize" :has-signal="!!frame && !!ipmView" />
      </article>
      <aside class="resource-card" aria-label="Vision resources" />
    </section>

    <div v-if="showConfig" class="config-backdrop" @click.self="showConfig = false" @keydown.esc="showConfig = false">
      <section class="config-dialog" role="dialog" aria-modal="true" aria-labelledby="ipm-config-title">
        <header>
          <h2 id="ipm-config-title">IPM matrix</h2>
          <button class="config-button" title="Close" @click="showConfig = false"><Icon icon="lucide:x" /></button>
        </header>
        <p class="matrix-hint">Image → IPM · 3 × 3</p>
        <div class="matrix-input">
          <input v-for="(_, index) in draftMatrix" :key="index" v-model.number="draftMatrix[index]"
            type="number" step="any" :aria-label="`Matrix row ${Math.floor(index / 3) + 1} column ${index % 3 + 1}`" />
        </div>
        <label class="sampling-option"><input v-model="draftEnabled" type="checkbox" /> Enable IPM</label>
        <label class="sampling-option"><input v-model="draftSmoothing" type="checkbox" /> Linear sampling</label>
        <p v-if="configError" class="config-error" role="alert">{{ configError }}</p>
        <footer>
          <button class="secondary-button" @click="resetMatrix">Reset default</button>
          <button class="primary-button" @click="applyConfig">Apply matrix</button>
        </footer>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { visionRecordingKey } from '../composables/useVisionRecording';
import VisionPane from '../components/VisionPane.vue';
import type { ProcessedImageData } from '../serial/image-processor';
import { fittedPerspectiveView, type HomographyMatrix } from '../utils/inversePerspective';
import { DEFAULT_IPM_MATRIX, ipmMatrix, ipmEnabled, ipmSmoothing } from '../stores/vision';
import { renderVisionFrame } from '../utils/visionFrame';

const props = withDefaults(defineProps<{ frame: ProcessedImageData | null; fps?: number }>(), { fps: 0 });
const sourcePane = ref<InstanceType<typeof VisionPane>>();
const outputPane = ref<InstanceType<typeof VisionPane>>();
const ipmView = shallowRef<ReturnType<typeof fittedPerspectiveView>>(null);
const videoRecording = inject(visionRecordingKey);
videoRecording?.setSources(() => ({ source: sourcePane.value?.canvas,
  ipm: ipmView.value ? outputPane.value?.canvas : undefined }));
const draftSmoothing = ref(true);
const showConfig = ref(false);
const draftMatrix = ref<number[]>(ipmMatrix.value.flat());
const draftEnabled = ref(true);
const configError = ref('');
const sourceSize = computed(() => ({ w: props.frame?.width ?? 188, h: props.frame?.height ?? 120 }));
const outputSize = computed(() => ({ w: ipmView.value?.width ?? 0, h: ipmView.value?.height ?? 0 }));
let renderFrameId = 0;

function openConfig() {
  draftMatrix.value = ipmMatrix.value.flat();
  draftEnabled.value = ipmEnabled.value;
  draftSmoothing.value = ipmSmoothing.value;
  configError.value = '';
  showConfig.value = true;
}

function resetMatrix() {
  draftMatrix.value = DEFAULT_IPM_MATRIX.flat();
  draftEnabled.value = true;
  configError.value = '';
}

function applyConfig() {
  const values = draftMatrix.value;
  if (values.length !== 9 || !values.every(value => typeof value === 'number' && Number.isFinite(value))) {
    configError.value = 'Enter nine finite numbers.';
    return;
  }
  const next = [values.slice(0, 3), values.slice(3, 6), values.slice(6, 9)] as HomographyMatrix;
  if (!fittedPerspectiveView(next, sourceSize.value.w, sourceSize.value.h)) {
    configError.value = 'Matrix must be invertible with a finite image footprint (up to 4096 × 4096).';
    return;
  }
  ipmMatrix.value = next;
  ipmEnabled.value = draftEnabled.value;
  ipmSmoothing.value = draftSmoothing.value;
  showConfig.value = false;
}

watch([ipmMatrix, ipmEnabled, sourceSize], () => {
  ipmView.value = ipmEnabled.value ? fittedPerspectiveView(ipmMatrix.value, sourceSize.value.w, sourceSize.value.h) : null;
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
    draw(sourcePane.value?.canvas, frame ? renderVisionFrame(frame, ipmMatrix.value) : null, sourceSize.value.w, sourceSize.value.h);
  }
  const view = ipmView.value;
  if (frame && view) {
    if (outputPane.value?.isPaused) return;
    const pixels = renderVisionFrame(frame, ipmMatrix.value, view, ipmSmoothing.value);
    draw(outputPane.value?.canvas, pixels, view.width, view.height);
  } else draw(outputPane.value?.canvas, null);
}

function queueRender() {
  cancelAnimationFrame(renderFrameId);
  renderFrameId = requestAnimationFrame(render);
}

watch([() => props.frame, ipmView, ipmMatrix, ipmSmoothing, () => sourcePane.value?.isPaused,
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
.stream-card { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); padding: 8px; grid-template-rows: auto minmax(0, 1fr); }
.stream-toolbar { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; padding: 6px 16px 0; color: var(--text-muted); font-size: 12px; }
.config-button:disabled { opacity: .4; cursor: default; }
.ipm-pane { border-left: 1px solid var(--card-border); }
.config-button { display: grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 1px solid var(--card-border); border-radius: 9px; background: var(--surface); color: var(--text-muted); cursor: pointer; }
.config-button:hover, .config-button.active { color: #20b8a6; border-color: #20b8a6; }
.config-backdrop { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; padding: 20px; background: #0b10197a; backdrop-filter: blur(8px); }
.config-dialog { width: min(560px, 100%); max-height: 90vh; overflow: auto; box-sizing: border-box; padding: 22px; border: 1px solid var(--card-border); border-radius: 24px; background: var(--card-bg); box-shadow: var(--card-shadow); }
.config-dialog header, .config-dialog footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.config-dialog h2 { margin: 0; font-size: 20px; }
.secondary-button, .primary-button { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 11px 14px; border: 1px solid var(--card-border); border-radius: 11px; background: var(--surface); color: var(--text); cursor: pointer; font-weight: 700; }
.matrix-hint { color: var(--text-muted); font-size: 12px; margin-top: 20px; }
.matrix-input { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.matrix-input input { box-sizing: border-box; width: 100%; min-width: 0; padding: 10px 8px; border: 1px solid var(--card-border); border-radius: 8px; background: var(--surface); color: var(--text); font: 11px "JetBrains Mono", monospace; }
.sampling-option { display: flex; gap: 8px; align-items: center; margin: 14px 0; font-size: 12px; color: var(--text-muted); }
.sampling-option input { accent-color: #20b8a6; }
.primary-button { background: #20b8a6; border-color: #20b8a6; color: white; }
.config-error { color: #d65a66; font-size: 12px; }
@media (max-width: 1100px) { .workbench { grid-template-columns: minmax(0, 1fr) 180px; } }
@media (max-width: 800px) { .vision-page { height: auto; min-height: calc(100vh - 58px); padding: 0 14px 72px; } .workbench { grid-template-columns: minmax(0, 1fr); } .stream-card { grid-template-columns: minmax(0, 1fr); } .ipm-pane { border-left: 0; border-top: 1px solid var(--card-border); } .resource-card { min-height: 180px; } }
</style>
