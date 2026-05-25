<template>
  <div class="settings">
    <div class="settings-header">
      <p class="hello">Configure your environment</p>
      <h1>Settings</h1>
    </div>

    <div class="settings-body">
      <!-- 左侧导航 -->
      <nav class="settings-nav">
        <button
          v-for="section in sections"
          :key="section.id"
          :class="{ active: activeSection === section.id }"
          @click="handleNavClick(section.id)"
          @pointerdown="startLongPress(section.id)"
          @pointerup="endLongPress"
          @pointerleave="endLongPress"
        >
          <span class="nav-icon"><Icon :icon="section.icon" /></span>
          <span class="nav-label">{{ section.label }}</span>
        </button>
      </nav>

      <!-- 右侧内容 -->
      <div class="settings-content">
        <!-- Resource Frame -->
        <section v-show="activeSection === 'resources'" class="section-card">
          <div class="section-card-head">
            <h2>Resource Frame</h2>
            <span class="rf-status" :class="isDataValid ? 'ac' : 'wa'">
              {{ isDataValid ? 'AC' : 'WA' }}
            </span>
          </div>
          <p class="section-desc">
            Each cell maps to consecutive bytes in the 0xEE frame Data section.
            Use <code>res[id]</code> in expressions. All cells must fill the Data space exactly.
          </p>

          <!-- Byte map: 0xEE + Length(2B) + Cells + Rsv(remainder) + CHK(1B) -->
          <div class="rf-bytemap">
            <div class="rf-bytemap-label">0xEE</div>
            <div class="rf-bytemap-seg rf-bytemap-length">
              <span class="rf-bytemap-name">Length</span>
              <span class="rf-bytemap-sz">2B</span>
            </div>
            <template v-for="slot in resourceSlots" :key="slot.id">
              <div
                class="rf-bytemap-seg"
                :class="{ active: selectedSlot === slot.id }"
                :style="{ flex: SLOT_BYTES[slot.type] }"
                @click.stop="selectedSlot = selectedSlot === slot.id ? -1 : slot.id"
                :title="`res[${getCellIndex(slot.id)}] · ${slot.label}`"
              >
                <button
                  class="rf-seg-close"
                  @click.stop="removeSlot(slot.id); if (selectedSlot === slot.id) selectedSlot = -1"
                ><Icon icon="lucide:x" /></button>
                <span class="rf-bytemap-name">{{ slot.label }}</span>
                <span class="rf-bytemap-sz">{{ slot.type }}</span>
              </div>
            </template>
            <div
              v-if="reservedBytes > 0"
              class="rf-bytemap-seg rf-bytemap-reserved"
              :style="{ flex: reservedBytes }"
            >
              <button class="rf-seg-add" @click.stop="addSlot"><Icon icon="lucide:plus" /></button>
              <span class="rf-bytemap-name">Rsv</span>
              <span class="rf-bytemap-sz">{{ reservedBytes }}B</span>
            </div>
            <div class="rf-bytemap-seg chk"><span class="rf-bytemap-name">CHK</span><span class="rf-bytemap-sz">1B</span></div>
          </div>

          <!-- Slot editor -->
          <Transition name="resource-panel">
            <div v-if="selectedSlot >= 0" class="rf-dropdown">
              <template v-for="slot in resourceSlots" :key="slot.id">
                <template v-if="slot.id === selectedSlot">
                  <div class="rf-dd-header">
                    <code class="rf-dd-id">cell[{{ String(getCellIndex(slot.id)).padStart(2, '0') }}]</code>
                    <span class="rf-dd-type-group">
                      <button v-for="t in SLOT_TYPES" :key="t" class="rf-size-btn" :class="{ active: slot.type === t }" @click="slot.type = t">{{ t }}</button>
                    </span>
                    <button class="rf-dd-remove" @click="removeSlot(slot.id); selectedSlot = -1"><Icon icon="lucide:trash-2" /></button>
                  </div>

                  <div class="rf-dd-row">
                    <span class="rf-dd-key">Label</span>
                    <input class="rf-inline-input" v-model="slot.label" placeholder="e.g. CPU" />
                    <span class="rf-dd-key" style="margin-left:12px">Unit</span>
                    <input class="rf-inline-input rf-unit-input" v-model="slot.unit" placeholder="%" />
                  </div>

                  <div class="rf-dd-row rf-dd-expr-row">
                    <span class="rf-dd-key">Expr</span>
                    <div class="rf-expr-wrap">
                      <input
                        class="rf-inline-input rf-expr-input"
                        v-model="slot.expr"
                        placeholder="res[0]"
                        spellcheck="false"
                      />
                      <div class="rf-expr-hints">
                        <button v-for="v in envVars" :key="v.key" class="rf-hint-chip" @click="slot.expr += v.key" :title="v.desc">{{ v.key }}</button>
                      </div>
                    </div>
                  </div>

                  <div class="rf-dd-row rf-dd-chart-row">
                    <span class="rf-dd-key">Chart</span>
                    <div class="chart-choice-grid">
                      <button v-for="mode in chartModes" :key="mode.id" :class="{ active: slot.chart === mode.id }" @click="slot.chart = mode.id">
                        <Icon :icon="mode.icon" /><span>{{ mode.label }}</span>
                      </button>
                    </div>
                  </div>

                  <svg class="resource-preview-svg" viewBox="0 0 200 60" preserveAspectRatio="none">
                    <path class="preview-area" :d="previewAreaPath(slot.id, slot.chart)" />
                    <path class="preview-line" :d="previewLinePath(slot.id, slot.chart)" />
                  </svg>
                </template>
              </template>
            </div>
          </Transition>

          <!-- Formula tips -->
          <Transition name="resource-panel">
            <div v-if="showTips" class="rf-tips">
              <div class="rf-tips-header">
                <span>Expression Reference</span>
                <button class="rf-tips-close" @click="showTips = false"><Icon icon="lucide:x" /></button>
              </div>
              <div class="rf-tips-grid">
                <code>res[0]</code><span>raw value of slot 0</span>
                <code>res[5] / 1000.0</code><span>Speed mm/s → m/s</span>
                <code>res[6] / 10.0</code><span>Servo angle ×0.1°</span>
                <code>res[2] / RAM_TOTAL * 100</code><span>FreeHeap as % of total</span>
                <code>(ROM_TOTAL - res[2]) / ROM_TOTAL * 100</code><span>ROM used %</span>
                <code>res[3] - 273</code><span>Kelvin → Celsius</span>
                <code>(res[4] &lt;&lt; 8) | res[5]</code><span>combine two u8 slots</span>
              </div>
            </div>
          </Transition>

          <!-- Frame Data Length control -->
          <div class="rf-length-row">
            <span class="rf-length-label">Frame Data Length</span>
            <button class="rf-length-btn" @click="adjustLength(-1)" :disabled="frameDataLength <= 1">-</button>
            <input
              class="rf-length-input"
              type="number"
              :value="frameDataLength"
              @change="frameDataLength = Math.max(1, Math.min(256, Number(($event.target as HTMLInputElement).value) || 1))"
              min="1" max="256"
            />
            <button class="rf-length-btn" @click="adjustLength(1)" :disabled="frameDataLength >= 256">+</button>
            <span class="rf-length-hint">B</span>
          </div>

          <div class="rf-footer">
            <span class="rf-footer-info">Data: {{ totalBytes }}B / {{ frameDataLength }}B</span>
            <button class="rf-reset-btn" style="margin-right:auto;margin-left:8px" @click="showTips = !showTips">
              <Icon icon="lucide:book-open" /> Tips
            </button>
            <button class="rf-reset-btn" @click="resetToDefault">Reset to default</button>
          </div>
        </section>

        <!-- Env Variables -->
        <section v-show="activeSection === 'env'" class="section-card">
          <h2>Environment Variables</h2>
          <p class="section-desc">Named constants available in resource frame expressions.</p>
          <div class="env-list">
            <div v-for="(v, i) in envVars" :key="i" class="env-row">
              <input class="rf-inline-input env-key" v-model="v.key" placeholder="KEY" spellcheck="false" />
              <span class="env-eq">=</span>
              <input class="rf-inline-input env-val" v-model.number="v.value" type="number" />
              <input class="rf-inline-input env-desc" v-model="v.desc" placeholder="description" />
              <button class="rf-dd-remove" @click="envVars.splice(i, 1)"><Icon icon="lucide:trash-2" /></button>
            </div>
            <button class="rf-reset-btn" @click="envVars.push({ key: 'NEW_VAR', value: 0, desc: '' })">
              <Icon icon="lucide:plus" /> Add variable
            </button>
          </div>
        </section>

        <!-- Display -->
        <section v-show="activeSection === 'display'" class="section-card">
          <h2>Display</h2>
          <div class="field-group">
            <div class="field">
              <label>Theme</label>
              <div class="radio-group">
                <label class="radio"
                  ><input type="radio" v-model="display.theme" value="light" />
                  Light</label
                >
                <label class="radio"
                  ><input type="radio" v-model="display.theme" value="dark" />
                  Dark</label
                >
                <label class="radio"
                  ><input type="radio" v-model="display.theme" value="system" />
                  System</label
                >
              </div>
            </div>
            <div class="field">
              <label
                >FPS Cap <b>{{ display.fpsCap }}</b></label
              >
              <input
                type="range"
                min="10"
                max="60"
                step="5"
                v-model.number="display.fpsCap"
              />
            </div>
            <div class="field">
              <label
                >Canvas Scale <b>{{ display.canvasScale }}×</b></label
              >
              <input
                type="range"
                min="1"
                max="4"
                step="0.5"
                v-model.number="display.canvasScale"
              />
            </div>
            <div class="field">
              <label>Language</label>
              <AppSelect :model-value="display.lang" :options="langOptions" @update:model-value="onLangChange" />
            </div>
          </div>
        </section>

        <!-- Channels -->
        <section v-show="activeSection === 'channels'" class="section-card">
          <h2>Telemetry Channels</h2>
          <p class="section-desc">
            Enable or disable individual data streams from the MCU.
          </p>
          <div class="channel-list">
            <label v-for="ch in channels" :key="ch.id" class="channel-item">
              <div class="channel-info">
                <span class="channel-name">{{ ch.name }}</span>
                <span class="channel-meta">{{ ch.desc }}</span>
              </div>
              <div
                class="toggle"
                :class="{ on: ch.enabled }"
                @click="ch.enabled = !ch.enabled"
              >
                <div class="thumb" />
              </div>
            </label>
          </div>
        </section>

        <!-- About -->
        <section v-show="activeSection === 'about'" class="section-card">
          <h2>About</h2>
          <div class="about-grid">
            <div class="about-row">
              <span>Application</span><b>Trace Vector PC Host</b>
            </div>
            <div class="about-row"><span>Version</span><b>v0.1.0</b></div>
            <div class="about-row"><span>Build</span><b>2026-05-20</b></div>
            <div class="about-row">
              <span>Protocol</span><b>Hybrid 0xCC/0xDD/0xEE</b>
            </div>
            <div class="about-row">
              <span>Target MCU</span><b>STC32G144K256</b>
            </div>
            <div class="about-row">
              <span>Serial Layer</span><b>1776 LOC · 100+ tests</b>
            </div>
          </div>
        </section>
      </div>
    </div>

    <!-- 移动端 bottom sheet 导航 -->
    <Teleport to="body">
      <Transition name="sheet">
        <div v-if="sheetOpen" class="sheet-backdrop" @click="sheetOpen = false">
          <div
            class="sheet"
            @click.stop
            :style="{ transform: `translateY(${sheetY}px)` }"
          >
            <div
              class="sheet-handle"
              @pointerdown="startBarDrag"
            >
              <span class="sheet-handle-bar" />
            </div>
            <p class="sheet-title">Settings</p>
            <div class="sheet-list">
              <button
                v-for="section in sections"
                :key="section.id"
                :class="{ active: activeSection === section.id }"
                @click="selectSection(section.id)"
              >
                <span class="sheet-icon"><Icon :icon="section.icon" /></span>
                <span>{{ section.label }}</span>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed, watch, onMounted, onUnmounted } from "vue";
import { Icon } from "@iconify/vue";
import AppSelect from "../components/AppSelect.vue";
import { resourceSlots, SLOT_BYTES, frameDataLength, reindexSlots, resetToDefault, type SlotType } from "../stores/resourceSlots";
import { envVars } from "../stores/envVars";

const sections = [
  { id: "resources", icon: "lucide:activity",  label: "Resources" },
  { id: "env",       icon: "lucide:variable",   label: "Env" },
  { id: "display",   icon: "lucide:monitor",    label: "Display" },
  { id: "channels",  icon: "lucide:layers",     label: "Channels" },
  { id: "about",     icon: "lucide:info",       label: "About" },
] as const;
type SectionId = typeof sections[number]["id"];
const activeSection = ref<SectionId>("resources");
const sheetOpen = ref(false);
const sheetY = ref(0);

let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let isDragging = false;
let dragStartY = 0;
let activeDragPointerId: number | null = null;
let sheetHandleEl: HTMLElement | null = null;

const isNarrowScreen = () => window.innerWidth <= 900;

const handleNavClick = (id: SectionId) => {
  // 清除长按计时器，因为已经点击了
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  activeSection.value = id;
};

const startLongPress = (id: SectionId) => {
  if (!isNarrowScreen()) return;

  longPressTimer = setTimeout(() => {
    activeSection.value = id;
    openSheet();
  }, 500);
};

const endLongPress = () => {
  if (longPressTimer) clearTimeout(longPressTimer);
  longPressTimer = null;
};

const openSheet = () => {
  sheetOpen.value = true;
  sheetY.value = 0;
};

const selectSection = (id: SectionId) => {
  activeSection.value = id;
  sheetOpen.value = false;
};

defineExpose({ openSheet });

const startBarDrag = (e: PointerEvent) => {
  if (e.button !== 0 || !sheetOpen.value) return;

  isDragging = true;
  dragStartY = e.clientY;
  activeDragPointerId = e.pointerId;
  sheetHandleEl = e.currentTarget as HTMLElement;
  sheetHandleEl.setPointerCapture?.(e.pointerId);
  e.preventDefault();
};

const handleBarDrag = (e: PointerEvent) => {
  if (
    !isDragging ||
    !sheetOpen.value ||
    activeDragPointerId !== e.pointerId
  ) {
    return;
  }

  const delta = e.clientY - dragStartY;
  sheetY.value = Math.max(0, delta);
  e.preventDefault();
};

const endBarDrag = (e?: PointerEvent) => {
  if (!isDragging) return;

  if (e && activeDragPointerId !== e.pointerId) return;

  if (e && sheetHandleEl?.hasPointerCapture?.(e.pointerId)) {
    sheetHandleEl.releasePointerCapture(e.pointerId);
  }

  isDragging = false;
  activeDragPointerId = null;
  sheetHandleEl = null;

  if (sheetY.value > 60) {
    sheetOpen.value = false;
  }
  sheetY.value = 0;
};

onMounted(() => {
  document.addEventListener("pointermove", handleBarDrag, { passive: false });
  document.addEventListener("pointerup", endBarDrag);
  document.addEventListener("pointercancel", endBarDrag);
});

onUnmounted(() => {
  document.removeEventListener("pointermove", handleBarDrag);
  document.removeEventListener("pointerup", endBarDrag);
  document.removeEventListener("pointercancel", endBarDrag);
  systemMq?.removeEventListener("change", onSystemChange);
});

const langOptions = [
  { value: "en", label: "English" },
  { value: "zh", label: "Simplified Chinese" },
];

type ChartModeId = "line" | "delta";

const chartModes: { id: ChartModeId; label: string; icon: string }[] = [
  { id: "line",  label: "Line",   icon: "lucide:chart-no-axes-combined" },
  { id: "delta", label: "Smooth", icon: "lucide:activity" },
];

const SLOT_TYPES: SlotType[] = ["u8", "u16", "i16", "u32", "i32", "u64", "i64"];

const totalBytes = computed(() => resourceSlots.reduce((s, sl) => s + SLOT_BYTES[sl.type], 0));
const reservedBytes = computed(() => Math.max(0, frameDataLength.value - totalBytes.value));
const isDataValid = computed(() => totalBytes.value === frameDataLength.value);

const selectedSlot = ref(-1);
const showTips = ref(false);

function getCellIndex(id: number): number {
  return resourceSlots.findIndex(s => s.id === id);
}

const addSlot = () => {
  const rem = reservedBytes.value;
  if (rem <= 0) return;
  // pick smallest type that fits in remaining space
  const type: SlotType = rem >= 8 ? "u64" : rem >= 4 ? "u32" : rem >= 2 ? "u16" : "u8";
  const id = resourceSlots.length > 0 ? Math.max(...resourceSlots.map(s => s.id)) + 1 : 0;
  resourceSlots.push({ id, label: `Cell${id}`, type, expr: `res[${id}]`, unit: "", chart: "line", enabled: true });
};

const removeSlot = (id: number) => {
  const idx = resourceSlots.findIndex(s => s.id === id);
  if (idx < 0) return;
  resourceSlots.splice(idx, 1);
  reindexSlots();
};

const adjustLength = (delta: number) => {
  frameDataLength.value = Math.max(1, Math.min(256, frameDataLength.value + delta));
};

import { useChartPath } from '../composables/useChartPath';
const { linePath: _lp, smoothPath: _sp, areaPath: _ap } = useChartPath(4);

function makePreviewPts(id: number): number[] {
  return Array.from({ length: 20 }, (_, n) => {
    const base = 50 + Math.sin((n / 19) * Math.PI * 4 + id) * 35;
    const spike = n % 3 === 1 ? (id % 2 === 0 ? 38 : -38) : 0;
    const noise = Math.sin(n * 7.3 + id * 3.1) * 14;
    return Math.max(3, Math.min(97, base + spike + noise));
  });
}

const previewLinePath = (id: number, chart: ChartModeId) => {
  const pts = makePreviewPts(id);
  return chart === 'delta' ? _sp(pts, 200, 60) : _lp(pts, 200, 60);
};

const previewAreaPath = (id: number, chart: ChartModeId) => {
  const pts = makePreviewPts(id);
  return _ap(pts, 200, 60, 100, chart === 'delta');
};

const display = reactive({
  theme: "system",
  fpsCap: 30,
  canvasScale: 1,
  lang: "en",
});

let systemMq: MediaQueryList | null = null;

function applyTheme(t: string) {
  const el = document.documentElement;
  if (t === "system") {
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    el.dataset.theme = dark ? "dark" : "light";
  } else {
    el.dataset.theme = t;
  }
}

watch(() => display.theme, (t) => {
  systemMq?.removeEventListener("change", onSystemChange);
  if (t === "system") {
    systemMq = window.matchMedia("(prefers-color-scheme: dark)");
    systemMq.addEventListener("change", onSystemChange);
  }
  applyTheme(t);
}, { immediate: true });

function onSystemChange() { applyTheme("system"); }
const channels = reactive([
  {
    id: "image",
    name: "Image Stream",
    desc: "0xCC · 22566 B/frame · 25 FPS",
    enabled: true,
  },
  {
    id: "log",
    name: "Log Stream",
    desc: "0xDD · variable length · 5 FPS",
    enabled: true,
  },
  {
    id: "resource",
    name: "Resource Monitor",
    desc: "0xEE · variable length · 1 FPS",
    enabled: true,
  },
]);

const onLangChange = (v: string | number) => {
  if (v === "zh") { alert("Chinese localization is not yet available."); return; }
  display.lang = String(v);
};
</script>

<style scoped>
.settings {
  padding: 0 28px 72px;
  min-height: calc(100vh - 58px);
  font-family: Inter, "Segoe UI", sans-serif;
}

.settings-header {
  margin-bottom: 22px;
}
.hello {
  margin: 0 0 8px;
  color: var(--text-muted);
  font-size: 14px;
  font-weight: 800;
}
h1 {
  margin: 0;
  font-size: clamp(32px, 4vw, 48px);
  line-height: 1.04;
  letter-spacing: -0.045em;
}

.settings-body {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 18px;
  align-items: start;
}

/* Nav */
.settings-nav {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  box-shadow: var(--card-shadow);
  backdrop-filter: blur(22px);
  border-radius: 22px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: sticky;
  top: 18px;
}

.settings-nav button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 11px 14px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: var(--text-muted);
  font-weight: 800;
  font-size: 14px;
  cursor: pointer;
  text-align: left;
  transition:
    background 150ms,
    color 150ms;
}

.settings-nav button:hover {
  background: var(--surface);
  color: var(--text);
}
.settings-nav button.active {
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 4px 16px rgba(68, 92, 110, 0.14);
}

.nav-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Content */
.settings-content {
  min-width: 0;
  max-width: 640px;
}

.section-card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  box-shadow: var(--card-shadow);
  backdrop-filter: blur(22px);
  border-radius: 26px;
  padding: 28px 32px;
}

.section-card h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 900;
  letter-spacing: -0.03em;
}

.section-card-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 22px;
}

.rf-status {
  font-size: 12px;
  font-weight: 900;
  font-family: "JetBrains Mono", Consolas, monospace;
  padding: 3px 10px;
  border-radius: 8px;
  letter-spacing: 0.06em;
}

.rf-status.ac {
  background: rgba(32, 184, 166, 0.15);
  color: #0e8a7e;
}

.rf-status.wa {
  background: rgba(239, 68, 68, 0.15);
  color: #dc2626;
}

.section-desc {
  margin: -14px 0 20px;
  color: var(--text-muted);
  font-size: 13px;
}

/* ── Resource frame redesign ── */
.rf-bytemap {
  display: flex;
  align-items: stretch;
  gap: 3px;
  margin-bottom: 10px;
  height: 52px;
  font-family: "JetBrains Mono", Consolas, monospace;
}

.rf-bytemap-label {
  display: flex;
  align-items: center;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 900;
  color: #20b8a6;
  background: rgba(32, 184, 166, 0.1);
  border-radius: 8px;
  flex-shrink: 0;
  letter-spacing: 0.04em;
}

.rf-bytemap-seg {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border-radius: 8px;
  background: var(--surface);
  border: 1.5px solid transparent;
  cursor: pointer;
  transition: border-color 150ms, background 150ms, opacity 150ms;
  min-width: 0;
  overflow: hidden;
}

.rf-bytemap-seg.active {
  border-color: #20b8a6;
  background: rgba(32, 184, 166, 0.1);
}

.rf-bytemap-seg.disabled {
  opacity: 0.32;
  background: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 4px,
    rgba(128,128,128,0.06) 4px,
    rgba(128,128,128,0.06) 8px
  );
}

.rf-bytemap-seg.rf-bytemap-reserved {
  cursor: default;
  opacity: 0.5;
  border-style: dashed;
  border-color: var(--card-border);
}

.rf-bytemap-seg.rf-bytemap-reserved .rf-seg-add {
  position: static;
  opacity: 1;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  background: rgba(32, 184, 166, 0.15);
  color: #20b8a6;
  border: 1px solid rgba(32, 184, 166, 0.4);
  font-size: 12px;
}

.rf-bytemap-seg.rf-bytemap-reserved .rf-seg-add:hover {
  background: rgba(32, 184, 166, 0.3);
}

.rf-bytemap-seg.chk {
  cursor: default;
  opacity: 0.4;
  flex: 1;
}

.rf-bytemap-seg.rf-bytemap-length {
  cursor: default;
  opacity: 0.55;
  background: rgba(99, 102, 241, 0.08);
  border: 1px dashed rgba(99, 102, 241, 0.3);
  flex: 2;
  min-width: 28px;
}

.rf-seg-close,
.rf-seg-add {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 14px;
  height: 14px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-dim);
  font-size: 9px;
  cursor: pointer;
  padding: 0;
  opacity: 0;
  transition: opacity 120ms, background 120ms;
}

.rf-bytemap-seg:hover .rf-seg-close,
.rf-bytemap-seg:hover .rf-seg-add {
  opacity: 1;
}

.rf-seg-close:hover { background: rgba(239,68,68,0.2); color: #ef4444; }
.rf-seg-add:hover   { background: rgba(32,184,166,0.2); color: #20b8a6; }

.rf-bytemap-name {
  font-size: 9px;
  font-weight: 900;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  padding: 0 4px;
}

.rf-bytemap-sz {
  font-size: 8px;
  font-weight: 700;
  color: var(--text-dim);
}

/* Dropdown panel */
.rf-dropdown {
  padding: 14px 16px;
  border-radius: 14px;
  background: var(--surface);
  border: 1.5px solid rgba(32, 184, 166, 0.25);
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 4px;
}

.rf-dd-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.rf-dd-chart-row {
  align-items: start;
}

.rf-dd-key {
  font-size: 11px;
  font-weight: 900;
  font-family: "JetBrains Mono", Consolas, monospace;
  color: var(--text-dim);
  width: 40px;
  flex-shrink: 0;
}

.rf-dd-hint {
  font-size: 11px;
  color: var(--text-dim);
  font-family: "JetBrains Mono", Consolas, monospace;
  margin-left: auto;
}

.rf-label-wrap { min-width: 0; }

.rf-label {
  display: block;
  font-size: 13px;
  font-weight: 800;
  color: var(--text);
  padding: 3px 7px;
  border-radius: 6px;
  cursor: text;
  outline: none;
  border: 1.5px solid transparent;
  transition: border-color 120ms, background 120ms;
}

.rf-label:hover,
.rf-label:focus {
  border-color: var(--card-border);
  background: var(--card-bg);
}

.rf-label-input {
  font-size: 13px;
  font-weight: 800;
  font-family: inherit;
  color: var(--text);
  background: var(--card-bg);
  border: 1.5px solid #20b8a6;
  border-radius: 6px;
  padding: 3px 7px;
  outline: none;
  width: 140px;
}

.rf-size-group {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.rf-size-btn {
  font-size: 10px;
  font-weight: 900;
  font-family: "JetBrains Mono", Consolas, monospace;
  padding: 4px 8px;
  border: 1px solid var(--card-border);
  border-radius: 6px;
  background: var(--card-bg);
  color: var(--text-dim);
  cursor: pointer;
  transition: background 120ms, color 120ms, border-color 120ms;
  white-space: nowrap;
}

.rf-size-btn.active {
  background: rgba(32, 184, 166, 0.15);
  border-color: rgba(32, 184, 166, 0.5);
  color: #20b8a6;
}

.resource-panel { padding: 0; }

.chart-choice-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

.chart-choice-grid button {
  min-height: 58px;
  display: grid;
  place-items: center;
  gap: 4px;
  border: 1px solid var(--card-border);
  border-radius: 12px;
  background: var(--card-bg);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 900;
  cursor: pointer;
}

.chart-choice-grid button svg {
  font-size: 18px;
}

.chart-choice-grid button.active {
  border-color: rgba(32, 184, 166, 0.55);
  color: #0e8a7e;
  background: rgba(32, 184, 166, 0.1);
}

.resource-preview {
  height: 86px;
  display: flex;
  align-items: end;
  gap: 5px;
  padding: 12px;
  border-radius: 14px;
  background:
    linear-gradient(rgba(32, 184, 166, 0.08) 1px, transparent 1px),
    var(--card-bg);
  background-size: 100% 22px;
}

.resource-preview span {
  flex: 1;
  min-width: 4px;
  border-radius: 999px 999px 2px 2px;
  background: #20b8a6;
  opacity: 0.72;
}

/* line: thin bars with wave shape */
.resource-preview[data-chart="line"] span {
  border-radius: 2px;
  opacity: 0.6;
}

/* delta: alternating positive/negative, accent color shift */
.resource-preview[data-chart="delta"] span {
  background: #6366f1;
  border-radius: 2px;
  opacity: 0.65;
}

/* number: single full-height bar */
.resource-preview[data-chart="number"] span {
  border-radius: 4px;
  opacity: 0.18;
}
.resource-preview[data-chart="number"] span:nth-child(10) {
  opacity: 1;
  background: #20b8a6;
}

.resource-preview-svg {
  width: 100%;
  height: 70px;
  border-radius: 10px;
  background:
    linear-gradient(rgba(32, 184, 166, 0.06) 1px, transparent 1px),
    var(--card-bg);
  background-size: 100% 20px;
  display: block;
}
.preview-area { fill: rgba(32, 184, 166, 0.18); }
.preview-line { fill: none; stroke: #20b8a6; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

.resource-panel-enter-active,
.resource-panel-leave-active {
  transition: opacity 170ms ease, transform 170ms ease;
}

.resource-panel-enter-from,
.resource-panel-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* ── Slot editor ── */
.rf-dd-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.rf-dd-id {
  font-size: 13px;
  font-weight: 900;
  font-family: "JetBrains Mono", Consolas, monospace;
  color: #20b8a6;
  background: rgba(32,184,166,0.1);
  padding: 2px 8px;
  border-radius: 6px;
}
.rf-dd-type-group {
  display: flex;
  gap: 3px;
  flex: 1;
}
.rf-dd-remove {
  border: none;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  font-size: 14px;
  transition: background 120ms, color 120ms;
}
.rf-dd-remove:hover { background: rgba(239,68,68,0.15); color: #ef4444; }

.rf-inline-input {
  font-size: 13px;
  font-weight: 700;
  font-family: inherit;
  color: var(--text);
  background: var(--card-bg);
  border: 1.5px solid var(--card-border);
  border-radius: 6px;
  padding: 4px 8px;
  outline: none;
  transition: border-color 120ms;
}
.rf-inline-input:focus { border-color: #20b8a6; }
.rf-unit-input { width: 52px; text-align: center; }

.rf-dd-expr-row { align-items: start; }
.rf-expr-wrap { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.rf-expr-input {
  width: 100%;
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 12px;
}
.rf-expr-hints { display: flex; flex-wrap: wrap; gap: 4px; }
.rf-hint-chip {
  font-size: 10px;
  font-weight: 900;
  font-family: "JetBrains Mono", Consolas, monospace;
  padding: 2px 7px;
  border: 1px solid rgba(32,184,166,0.4);
  border-radius: 999px;
  background: rgba(32,184,166,0.08);
  color: #20b8a6;
  cursor: pointer;
  transition: background 120ms;
}
.rf-hint-chip:hover { background: rgba(32,184,166,0.2); }

/* Frame Data Length control */
.rf-length-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0;
}

.rf-length-label {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-dim);
  font-family: "JetBrains Mono", Consolas, monospace;
}

.rf-length-btn {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 1px solid var(--card-border);
  border-radius: 6px;
  background: var(--card-bg);
  color: var(--text);
  font-size: 14px;
  font-weight: 900;
  cursor: pointer;
  transition: background 120ms;
}

.rf-length-btn:hover:not(:disabled) {
  background: var(--surface);
  border-color: #20b8a6;
}

.rf-length-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.rf-length-input {
  width: 52px;
  text-align: center;
  font-size: 12px;
  font-weight: 900;
  font-family: "JetBrains Mono", Consolas, monospace;
  color: var(--text);
  background: var(--card-bg);
  border: 1.5px solid var(--card-border);
  border-radius: 6px;
  padding: 4px 6px;
  outline: none;
  transition: border-color 120ms;
}

.rf-length-input:focus {
  border-color: #20b8a6;
}

.rf-length-hint {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-dim);
}

/* Footer */
.rf-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}
.rf-footer-info {
  font-size: 11px;
  font-weight: 900;
  font-family: "JetBrains Mono", Consolas, monospace;
  color: var(--text-dim);
}
.rf-reset-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 900;
  font-family: inherit;
  padding: 5px 12px;
  border: 1px solid var(--card-border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-muted);
  cursor: pointer;
  transition: background 120ms, color 120ms;
}
.rf-reset-btn:hover { background: var(--card-bg); color: var(--text); }

/* Tips */
.rf-tips {
  margin-top: 8px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--card-border);
}
.rf-tips-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  font-weight: 900;
  color: var(--text-muted);
  margin-bottom: 10px;
  letter-spacing: 0.06em;
}
.rf-tips-close {
  border: none;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  padding: 2px;
  display: grid;
  place-items: center;
  font-size: 12px;
}
.rf-tips-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  align-items: baseline;
}
.rf-tips-grid code {
  font-size: 11px;
  font-family: "JetBrains Mono", Consolas, monospace;
  color: #20b8a6;
  white-space: nowrap;
}
.rf-tips-grid span {
  font-size: 11px;
  color: var(--text-dim);
}

/* Env vars */
.env-list { display: flex; flex-direction: column; gap: 8px; }
.env-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.env-key { width: 110px; font-family: "JetBrains Mono", Consolas, monospace; font-weight: 900; }
.env-eq { font-size: 13px; color: var(--text-dim); font-weight: 900; }
.env-val { width: 80px; }
.env-desc { flex: 1; }

/* Fields */
.field-group {
  display: grid;
  gap: 18px;
}

.field {
  display: grid;
  grid-template-columns: 140px 1fr;
  align-items: center;
  gap: 12px;
}

.field label {
  font-size: 13px;
  font-weight: 800;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 6px;
}

.field label b {
  color: var(--text);
  font-size: 15px;
}

.field select,
.field input[type="range"] {
  width: 100%;
}

.field input[type="range"] {
  accent-color: #20b8a6;
  height: 4px;
}

/* Channel tabs */
.channel-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 20px;
  padding: 5px;
  border-radius: 14px;
  background: var(--surface);
  width: fit-content;
}
.channel-tabs button {
  border: 0;
  border-radius: 10px;
  padding: 7px 18px;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 800;
  font-family: inherit;
  cursor: pointer;
  transition:
    background 150ms,
    color 150ms;
}
.channel-tabs button.active {
  background: var(--card-bg);
  color: var(--text);
  box-shadow: 0 2px 8px rgba(68, 92, 110, 0.14);
}

/* Text input */
.text-input {
  width: 100%;
  padding: 9px 12px;
  border: 1.5px solid var(--card-border);
  border-radius: 10px;
  background: var(--surface);
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
  font-family: "JetBrains Mono", Consolas, monospace;
}
.text-input:focus {
  outline: none;
  border-color: #20b8a6;
}

/* Radio */
.radio-group {
  display: flex;
  gap: 18px;
}
.radio {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}
.radio input {
  accent-color: #20b8a6;
  width: 16px;
  height: 16px;
}

/* Status bar */
.status-bar {
  margin-top: 22px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 14px;
  background: var(--surface);
  font-size: 13px;
  font-weight: 800;
}

.status-bar.ok {
  background: rgba(32, 184, 166, 0.1);
  color: #0e8a7e;
}
.status-bar.idle {
  color: var(--text-muted);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

.action-btn {
  margin-left: auto;
  padding: 7px 20px;
  border: 0;
  border-radius: 999px;
  background: var(--text);
  color: var(--card-bg);
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition: opacity 150ms;
}
.action-btn:hover {
  opacity: 0.8;
}

/* Channels */
.channel-list {
  display: grid;
  gap: 12px;
}

.channel-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-radius: 16px;
  background: var(--surface);
  cursor: pointer;
}

.channel-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.channel-name {
  font-size: 14px;
  font-weight: 800;
}
.channel-meta {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-dim);
  font-family: "JetBrains Mono", Consolas, monospace;
}

/* Toggle */
.toggle {
  width: 44px;
  height: 24px;
  border-radius: 999px;
  background: var(--surface);
  position: relative;
  transition: background 200ms;
  flex-shrink: 0;
}
.toggle.on {
  background: #20b8a6;
}
.thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  transition: transform 200ms;
}
.toggle.on .thumb {
  transform: translateX(20px);
}

/* About */
.about-grid {
  display: grid;
  gap: 12px;
}
.about-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-radius: 12px;
  background: var(--surface);
  font-size: 13px;
}
.about-row span {
  color: var(--text-muted);
  font-weight: 700;
}
.about-row b {
  font-weight: 900;
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 13px;
}

/* Responsive */
/* ── Bottom sheet ── */
.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
}

.sheet {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--card-bg);
  border-radius: 24px 24px 0 0;
  padding: 12px 20px 40px;
  backdrop-filter: blur(24px);
}

.sheet-handle {
  width: 56px;
  height: 32px;
  margin: 0 auto 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.sheet-handle:active {
  cursor: grabbing;
}

.sheet-handle-bar {
  width: 40px;
  height: 4px;
  border-radius: 999px;
  background: var(--text-dim);
  pointer-events: none;
}

.sheet-title {
  font-size: 13px;
  font-weight: 900;
  color: var(--text-muted);
  letter-spacing: 0.08em;
  margin: 0 0 12px;
}

.sheet-list {
  display: grid;
  gap: 6px;
}

.sheet-list button {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 14px 16px;
  border: 0;
  border-radius: 16px;
  background: transparent;
  color: var(--text-muted);
  font-size: 16px;
  font-weight: 800;
  cursor: pointer;
  text-align: left;
  transition: background 150ms, color 150ms;
}

.sheet-list button:hover,
.sheet-list button.active {
  background: var(--surface);
  color: var(--text);
}

.sheet-list button.active {
  color: #20b8a6;
}

.sheet-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* sheet 动画 */
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 250ms ease;
}
.sheet-enter-active .sheet,
.sheet-leave-active .sheet {
  transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1);
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}
.sheet-enter-from .sheet,
.sheet-leave-to .sheet {
  transform: translateY(100%);
}

@media (max-width: 640px) {
  .settings-nav {
    display: none;
  }
  .settings-body {
    grid-template-columns: 1fr;
  }
  .settings {
    padding: 0 14px 32px;
  }
  .section-card {
    padding: 18px;
  }
  .field {
    grid-template-columns: 1fr;
    gap: 6px;
  }
}

@media (max-width: 900px) {
  .settings-body {
    grid-template-columns: 1fr;
  }
  .settings-nav {
    flex-direction: row;
    flex-wrap: wrap;
    position: static;
  }
  .settings-nav button {
    width: auto;
    flex: 1;
    justify-content: center;
  }
  .nav-label {
    display: none;
  }
  .settings-nav button.active .nav-label {
    display: inline;
  }
}

@media (max-width: 600px) {
  .settings {
    padding: 0 14px 32px;
  }
  .section-card {
    padding: 18px;
  }
  .field {
    grid-template-columns: 1fr;
    gap: 6px;
  }
  .field label {
    font-size: 12px;
  }
}
</style>
