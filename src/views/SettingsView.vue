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
          v-for="(section, i) in sections"
          :key="section.id"
          :class="{ active: activeSection === i }"
          @click="handleNavClick(i)"
          @pointerdown="startLongPress(i)"
          @pointerup="endLongPress"
          @pointerleave="endLongPress"
        >
          <span class="nav-icon">{{ section.icon }}</span>
          <span class="nav-label">{{ section.label }}</span>
        </button>
      </nav>

      <!-- 右侧内容 -->
      <div class="settings-content">
        <!-- Serial Connection -->
        <section v-show="activeSection === 0" class="section-card">
          <h2>Serial Connection</h2>

          <!-- Channel selector -->
          <div class="channel-tabs">
            <button
              v-for="ch in serialChannels"
              :key="ch.id"
              :class="{ active: serial.channel === ch.id }"
              @click="serial.channel = ch.id"
            >
              {{ ch.label }}
            </button>
          </div>

          <!-- USB-CDC: no config needed -->
          <div v-if="serial.channel === 'usb_cdc'" class="field-group">
            <p class="section-desc" style="margin: 0">
              USB Virtual COM — no port configuration required. Connect the MCU
              via USB and click Connect.
            </p>
          </div>

          <!-- UART -->
          <div v-else-if="serial.channel === 'uart'" class="field-group">
            <div class="field">
              <label>Port</label>
              <div style="display:flex;gap:8px;align-items:center">
                <span style="font-size:13px;color:var(--text-muted)">{{ serial.portLabel || 'Not selected' }}</span>
                <button class="action-btn" @click="selectPort">Select Port</button>
              </div>
            </div>
            <div class="field">
              <label>Baud Rate</label>
              <AppSelect v-model="serial.baud" :options="baudOptions" />
            </div>
            <p class="section-desc" style="margin-top: 4px">
              Frame format fixed at 8N1 (set by MCU library).
            </p>
          </div>

          <!-- WIFI -->
          <div v-else-if="serial.channel === 'wifi'" class="field-group">
            <div class="field">
              <label>Host IP</label>
              <input
                class="text-input"
                v-model="serial.wifiHost"
                placeholder="192.168.4.1"
              />
            </div>
            <div class="field">
              <label>Port</label>
              <input
                class="text-input"
                v-model.number="serial.wifiPort"
                type="number"
                placeholder="8080"
              />
            </div>
            <p class="section-desc" style="margin-top: 4px">
              WIFI channel shares the same frame protocol (0xCC/0xDD/0xEE).
            </p>
          </div>

          <div class="status-bar" :class="serial.connected ? 'ok' : 'idle'">
            <span class="dot" />
            <span>{{ serial.connected ? "Connected" : "Disconnected" }}</span>
            <button class="action-btn" @click="toggleConnect">
              {{ serial.connected ? "Disconnect" : "Connect" }}
            </button>
          </div>
        </section>

        <!-- Display -->
        <section v-show="activeSection === 1" class="section-card">
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
              <AppSelect v-model="display.lang" :options="langOptions" />
            </div>
          </div>
        </section>

        <!-- Channels -->
        <section v-show="activeSection === 2" class="section-card">
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
        <section v-show="activeSection === 3" class="section-card">
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
                v-for="(section, i) in sections"
                :key="section.id"
                :class="{ active: activeSection === i }"
                @click="selectSection(i)"
              >
                <span class="sheet-icon">{{ section.icon }}</span>
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
import { reactive, ref, watch, onMounted, onUnmounted } from "vue";
import AppSelect from "../components/AppSelect.vue";
import { conn } from "../stores/connection";

const sections = [
  { id: "serial", icon: "⌁", label: "Serial" },
  { id: "display", icon: "◫", label: "Display" },
  { id: "channels", icon: "≋", label: "Channels" },
  { id: "about", icon: "◎", label: "About" },
];
const activeSection = ref(0);
const sheetOpen = ref(false);
const sheetY = ref(0);

let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let isDragging = false;
let dragStartY = 0;
let activeDragPointerId: number | null = null;
let sheetHandleEl: HTMLElement | null = null;

const isNarrowScreen = () => window.innerWidth <= 900;

const handleNavClick = (i: number) => {
  // 清除长按计时器，因为已经点击了
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  activeSection.value = i;
};

const startLongPress = (i: number) => {
  if (!isNarrowScreen()) return;

  longPressTimer = setTimeout(() => {
    activeSection.value = i;
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

const selectSection = (i: number) => {
  activeSection.value = i;
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

const serialChannels = [
  { id: "usb_cdc", label: "USB-CDC" },
  { id: "uart", label: "UART" },
  { id: "wifi", label: "WIFI" },
];
const baudRates = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];

const USB_VENDORS: Record<number, string> = {
  0x1a86: "CH340", 0x0403: "FTDI", 0x10c4: "CP210x", 0x2341: "Arduino",
  0x0483: "STM32", 0x2e8a: "RP2040",
};

async function selectPort() {
  if (!("serial" in navigator)) return;
  try {
    const port = await (navigator as any).serial.requestPort();
    const all = await (navigator as any).serial.getPorts();
    const info = port.getInfo?.() ?? {};
    const vid: number | undefined = info.usbVendorId;
    const pid: number | undefined = info.usbProductId;
    const name = vid ? (USB_VENDORS[vid] ?? "USB") : "Serial Port";
    const id = vid ? ` (${vid.toString(16).padStart(4,"0")}:${pid?.toString(16).padStart(4,"0") ?? "???"})` : "";
    const sameVid = all.filter((p: any) => p.getInfo?.()?.usbVendorId === vid);
    const idx = sameVid.findIndex((p: any) => p === port);
    const suffix = sameVid.length > 1 ? ` #${idx + 1}` : "";
    serial.portLabel = `${name}${suffix}${id}`;
    serial.portHandle = port;
  } catch {
    // user cancelled
  }
}
const baudOptions = [
  9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600,
].map((b) => ({ value: b, label: String(b) }));
const langOptions = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
];

const serial = reactive({
  channel: "usb_cdc",
  port: "",
  portLabel: "",
  portHandle: null as any,
  baud: 115200,
  wifiHost: "192.168.4.1",
  wifiPort: 8080,
  connected: false,
});
const display = reactive({
  theme: "system",
  fpsCap: 30,
  canvasScale: 1,
  lang: "zh",
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
    desc: "0xEE · 18 B/frame · 5 FPS",
    enabled: true,
  },
]);

const toggleConnect = () => {
  serial.connected = !serial.connected;
  conn.connected = serial.connected;
  if (serial.connected) {
    conn.portLabel = serial.portLabel || serial.channel.toUpperCase();
    conn.mcuName = "MCU";
    conn.connectedAt = Date.now();
  } else {
    conn.connectedAt = null;
  }
};
</script>

<style scoped>
.settings {
  padding: 0 28px 72px;
  min-height: calc(100vh - 58px);
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
  font-size: 18px;
  width: 22px;
  text-align: center;
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
  margin: 0 0 22px;
  font-size: 20px;
  font-weight: 900;
  letter-spacing: -0.03em;
}

.section-desc {
  margin: -14px 0 20px;
  color: var(--text-muted);
  font-size: 13px;
}

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
  font-size: 20px;
  width: 28px;
  text-align: center;
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
