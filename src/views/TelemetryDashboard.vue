<template>
  <div class="page" @click="avatarOpen = false; mobileAvatarOpen = false">
    <nav class="nav">
      <b class="logo" @click="cliOpen = !cliOpen" title="Toggle CLI (Ctrl+J)"><img src="/img/Simple_logo.svg" class="logo-img" alt="logo" /></b>
      <div class="tabs">
        <button
          v-for="(tab, i) in tabs"
          :key="tab"
          :class="{ on: activeTab === i }"
          @click="activeTab = i"
        >
          {{ tab }}
        </button>
      </div>
      <div
        class="avatar"
        :class="conn.connected ? 'online' : 'offline'"
        @mouseenter="avatarOpen = true"
        @mouseleave="avatarOpen = false"
        @click="avatarOpen = !avatarOpen"
      >
        {{ conn.connected ? conn.mcuName.slice(0, 2) + '.' : 'TV' }}
        <Transition name="popup">
          <div v-if="avatarOpen" class="avatar-popup">
            <div class="popup-status" :class="conn.connected ? 'online' : 'offline'">
              {{ conn.connected ? 'Online' : 'Offline' }}
            </div>
            <div v-if="conn.connected">
              <div class="popup-row"><span>Device</span><b>{{ conn.mcuName }}</b></div>
              <div class="popup-row"><span>Port</span><b>{{ conn.portLabel }}</b></div>
              <div class="popup-row"><span>Uptime</span><b>{{ uptime }}</b></div>
            </div>
            <div v-else class="popup-hint">No MCU connected</div>
          </div>
        </Transition>
      </div>
    </nav>

    <main v-show="activeTab === 0" class="main">
      <p class="hello">Good morning, Trace Vector!</p>
      <h1>Trace Vector Host Dashboard</h1>

      <section class="content-layout">
        <div class="left-column">
          <section class="telemetry-card">
            <section class="telemetry-zone">
              <aside class="resource-column">
                <div
                  v-for="item in resourceCards"
                  :key="item.name"
                  class="mini-card resource-card"
                >
                  <SensorCard
                    :label="item.name"
                    :value="item.value !== null ? item.value + item.unit : 'No Signal'"
                    :color="item.color"
                    :points="item.points"
                  />
                </div>
              </aside>

              <aside class="motion-column">
                <div class="mini-card resource-card">
                  <SensorCard label="Network RX" :value="networkRxLabel" color="#6366f1" :points="networkPoints" :max="500" />
                </div>

                <div class="mini-card speed-card">
                  <SensorCard label="Speed" :value="speedMs !== null ? speedMs + ' m/s' : 'No Signal'" color="#20b8a6" :points="speedPoints" :max="2000" :view-w="240" :view-h="150" />
                </div>

                <div class="mini-card attitude-card">
                  <ServoCard :deg="servoDeg ?? '--'" :visual-deg="servoVisualDeg" />
                </div>
              </aside>
            </section>

            <aside class="mcu-card">
              <LogCard title="MCU output" :logs="mcuLogs" :connected="conn.connected" />
            </aside>
          </section>

          <section class="pc-log-card">
            <LogCard title="Host RX / Boot Log" :logs="hostLogs" :connected="conn.connected" />
          </section>
        </div>

        <section class="vision-pane">
          <div class="pane-head">
            <span>Vision stream</span><b>{{ imageFps > 0 ? imageFps.toFixed(1) + ' FPS' : '-- FPS' }}</b>
          </div>
          <div class="canvas-wrap">
            <canvas ref="imageCanvas" width="188" height="120" />
          </div>
          <div class="vision-foot">
            <span>Source 188×120</span><span>--</span>
          </div>
        </section>
      </section>
    </main>

    <SettingsView ref="settingsView" v-show="activeTab === 2" />
    <VisionView
      v-show="activeTab === 1"
      :canvas-ref="imageCanvas"
    />

    <!-- 移动端底部导航 -->
    <nav class="bottom-nav">
      <b class="logo-m" @click="cliOpen = !cliOpen"><img src="/img/Simple_logo.svg" class="logo-img" alt="logo" /></b>
      <div class="bottom-tabs">
        <button
          v-for="(tab, i) in tabs"
          :key="tab"
          :class="{ on: activeTab === i }"
          @click="onBottomTab(i)"
          @mouseenter="i === 2 ? onSettingsHover() : undefined"
        >
          <span class="tab-icon"><Icon :icon="tabIcons[i]" /></span>
          <span class="tab-label">{{ tab }}</span>
        </button>
      </div>
      <div
        class="avatar-m"
        :class="conn.connected ? 'online' : 'offline'"
        @click.stop="mobileAvatarOpen = !mobileAvatarOpen"
      >
        {{ conn.connected ? conn.mcuName.slice(0, 2) + '.' : 'TV' }}
      </div>

      <!-- Mobile avatar popup — fixed above bottom-nav -->
      <Teleport to="body">
        <Transition name="popup">
          <div v-if="mobileAvatarOpen" class="avatar-popup-m-fixed" @click.stop>
            <div class="popup-status" :class="conn.connected ? 'online' : 'offline'">
              {{ conn.connected ? 'Online' : 'Offline' }}
            </div>
            <div v-if="conn.connected">
              <div class="popup-row"><span>Device</span><b>{{ conn.mcuName }}</b></div>
              <div class="popup-row"><span>Port</span><b>{{ conn.portLabel }}</b></div>
              <div class="popup-row"><span>Uptime</span><b>{{ uptime }}</b></div>
            </div>
            <div v-else class="popup-hint">No MCU connected</div>
          </div>
        </Transition>
      </Teleport>
    </nav>

    <!-- CLI Panel -->
    <Transition name="cli">
      <div v-if="cliOpen" class="cli-panel" :style="{ height: cliHeight + 'px' }">
        <div class="cli-resize-bar" @pointerdown="startCliResize" />
        <div class="cli-header">
          <span class="cli-title"><Icon icon="lucide:terminal" /> CLI</span>
          <button class="cli-close" @click="cliOpen = false"><Icon icon="lucide:x" /></button>
        </div>
        <div class="cli-body">
          <span class="cli-placeholder">CLI — Coming Soon</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { Icon } from "@iconify/vue";
import SettingsView from "./SettingsView.vue";
import VisionView from "./VisionView.vue";
import LogCard from "../components/LogCard.vue";
import SensorCard from "../components/SensorCard.vue";
import ServoCard from "../components/ServoCard.vue";
import { useCanvasAnimation } from "../composables/useCanvasAnimation";
import { useTelemetry } from "../composables/useTelemetry";
import { conn } from "../stores/connection";

const {
  current, mcuLogs, imageFps, imageManager,
  cpuPoints, ramPoints, romPoints, speedPoints, networkPoints,
  networkRxKbps, networkRxLabel,
  cpuVal, ramVal, romVal, speedMs, servoDeg, servoVisualDeg,
} = useTelemetry();

const tabs = ["Overview", "Vision", "Settings"];
const tabIcons = ["lucide:layout-dashboard", "lucide:video", "lucide:settings"];
const activeTab = ref(0);
const settingsView = ref<InstanceType<typeof SettingsView>>();

const cliOpen = ref(false);
const cliHeight = ref(parseInt(localStorage.getItem("cliHeight") ?? "260"));

function startCliResize(e: PointerEvent) {
  e.preventDefault();
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  const startY = e.clientY, startH = cliHeight.value;
  const onMove = (ev: PointerEvent) => {
    ev.preventDefault();
    cliHeight.value = Math.max(120, Math.min(window.innerHeight - 80, startH - (ev.clientY - startY)));
  };
  const onUp = () => {
    localStorage.setItem("cliHeight", String(cliHeight.value));
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };
  window.addEventListener("pointermove", onMove, { passive: false });
  window.addEventListener("pointerup", onUp);
}
const onKey = (e: KeyboardEvent) => {
  if (e.ctrlKey && e.key === "j") { e.preventDefault(); cliOpen.value = !cliOpen.value; }
};

const avatarOpen = ref(false);
const mobileAvatarOpen = ref(false);
const now = ref(Date.now());
const uptime = computed(() => {
  if (!conn.connectedAt) return "";
  const s = Math.floor((now.value - conn.connectedAt) / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${sec}s` : `${sec}s`;
});

const onSettingsHover = () => {
  activeTab.value = 2;
  settingsView.value?.openSheet();
};
const onBottomTab = (i: number) => {
  if (i === 2 && window.innerWidth <= 640) {
    activeTab.value = 2;
    settingsView.value?.openSheet();
  } else {
    activeTab.value = i;
  }
};

const imageCanvas = ref<HTMLCanvasElement>();
const { start: startAnim, stop: stopAnim } = useCanvasAnimation(imageCanvas);
let unsubImage: (() => void) | null = null;

function drawNoSignal() {
  const c = imageCanvas.value;
  const ctx = c?.getContext('2d');
  if (!c || !ctx) return;
  ctx.fillStyle = '#0a0e1a';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = 'bold 14px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('No Signal', c.width / 2, c.height / 2);
}

const resourceCards = computed(() => [
  { name: "CPU", value: cpuVal.value, unit: "%",  color: "#242424", points: cpuPoints.value },
  { name: "RAM", value: ramVal.value, unit: "%",  color: "#20b8a6", points: ramPoints.value },
  { name: "ROM", value: romVal.value, unit: "%",  color: "#c7d54f", points: romPoints.value },
]);

const hostLogs = ref([
  "[HOST 00:00:00] Trace Vector PC Host started",
  "[HOST 00:00:01] serial manager ready",
  "[HOST 00:00:02] protocol parser initialized",
  "[HOST 00:00:03] resource monitor mounted",
  "[HOST 00:00:04] image stream waiting for frame",
]);

onMounted(() => {
  window.addEventListener("keydown", onKey);
  drawNoSignal();
  unsubImage = imageManager.on((event) => {
    if (event.type !== 'IMAGE_RECEIVED') return;
    stopAnim();
    const c = imageCanvas.value;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const { width, height, pixelData } = event.data;
    c.width = width;
    c.height = height;
    ctx.putImageData(new ImageData(pixelData, width, height), 0, 0);
  });
});
onUnmounted(() => {
  window.removeEventListener("keydown", onKey);
  stopAnim();
  unsubImage?.();
});
</script>

<style scoped>
.page {
  height: 100vh;
  overflow-y: auto;
  overflow-x: hidden;
  color: var(--text);
  font-family: Inter, "Segoe UI", "Microsoft YaHei", sans-serif;
  background: var(--bg);
}
/* ── 顶部导航过渡 ── */
.nav {
  height: 58px;
  padding: 10px 28px;
  display: flex;
  align-items: center;
  gap: 22px;
  transition:
    transform 300ms cubic-bezier(0.4, 0, 0.2, 1),
    opacity 300ms ease;
}
.logo {
  font-size: 24px;
}
.logo-img {
  width: 28px;
  height: 28px;
  object-fit: contain;
  display: block;
}
.tabs {
  display: flex;
  gap: 6px;
  padding: 5px;
  border-radius: 999px;
  background: var(--nav-tab-bg);
  backdrop-filter: blur(18px);
  transition: background 200ms;
}
.tabs button {
  border: 0;
  border-radius: 999px;
  padding: 10px 22px;
  background: transparent;
  color: var(--text-muted);
  font-weight: 800;
  cursor: pointer;
  transition:
    background 200ms,
    color 200ms,
    box-shadow 200ms;
}
.tabs button.on {
  color: var(--text);
  background: var(--nav-tab-active);
  box-shadow: 0 10px 28px rgba(142, 155, 70, 0.18);
}
.avatar {
  margin-left: auto;
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--nav-tab-active);
  font-weight: 900;
  box-shadow: 0 12px 34px rgba(33, 58, 75, 0.12);
  position: relative;
  cursor: pointer;
  transition: box-shadow 200ms;
}
.avatar.online  { box-shadow: 0 0 0 2.5px #22c55e, 0 12px 34px rgba(33,58,75,.12); }
.avatar.offline { box-shadow: 0 0 0 2.5px #ef4444, 0 12px 34px rgba(33,58,75,.12); }
[data-theme="dark"] .avatar.online  { box-shadow: 0 0 0 2.5px #4ade80, 0 12px 34px rgba(0,0,0,.25); }
[data-theme="dark"] .avatar.offline { box-shadow: 0 0 0 2.5px #f87171, 0 12px 34px rgba(0,0,0,.25); }

/* ── 底部导航（移动端） ── */
.bottom-nav {
  display: none;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 200;
  height: 64px;
  padding: 0 20px;
  align-items: center;
  background: var(--card-bg);
  border-top: 1px solid var(--card-border);
  backdrop-filter: blur(24px);
  transform: translateY(100%);
  transition: transform 350ms cubic-bezier(0.4, 0, 0.2, 1);
}
.logo-m {
  font-size: 22px;
  flex-shrink: 0;
}
.bottom-tabs {
  display: flex;
  flex: 1;
  justify-content: center;
  gap: 4px;
}
.bottom-tabs button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 18px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 800;
  cursor: pointer;
  transition:
    background 200ms,
    color 200ms,
    transform 150ms;
}
.bottom-tabs button.on {
  color: #20b8a6;
  background: rgba(32, 184, 166, 0.12);
}
.bottom-tabs button:active {
  transform: scale(0.92);
}
.tab-icon {
  font-size: 18px;
  line-height: 1;
}
.tab-label {
  font-size: 10px;
}
.avatar-m {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--nav-tab-active);
  font-weight: 900;
  font-size: 12px;
  flex-shrink: 0;
  position: relative;
  cursor: pointer;
}
.avatar-m.online  { box-shadow: 0 0 0 2.5px #22c55e; }
.avatar-m.offline { box-shadow: 0 0 0 2.5px #ef4444; }
[data-theme="dark"] .avatar-m.online  { box-shadow: 0 0 0 2.5px #4ade80; }
[data-theme="dark"] .avatar-m.offline { box-shadow: 0 0 0 2.5px #f87171; }

.avatar-popup {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  min-width: 180px;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 14px;
  box-shadow: var(--card-shadow);
  backdrop-filter: blur(20px);
  padding: 12px 14px;
  z-index: 300;
  font-size: 13px;
  color: var(--text);
  white-space: nowrap;
}
.avatar-popup-m {
  right: 0;
  bottom: calc(100% + 10px);
  top: auto;
}
.avatar-popup-m-fixed {
  position: fixed;
  bottom: 74px;
  right: 16px;
  min-width: 180px;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 14px;
  box-shadow: var(--card-shadow);
  backdrop-filter: blur(20px);
  padding: 12px 14px;
  z-index: 500;
  font-size: 13px;
  color: var(--text);
  white-space: nowrap;
}
.popup-status {
  font-weight: 800;
  font-size: 12px;
  margin-bottom: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  display: inline-block;
}
.popup-status.online  { background: rgba(34,197,94,.15); color: #16a34a; }
.popup-status.offline { background: rgba(239,68,68,.15);  color: #dc2626; }
[data-theme="dark"] .popup-status.online  { background: rgba(74,222,128,.15); color: #4ade80; }
[data-theme="dark"] .popup-status.offline { background: rgba(248,113,113,.15); color: #f87171; }
.popup-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 3px 0;
  color: var(--text-muted);
}
.popup-row b { color: var(--text); font-weight: 600; }
.popup-hint { color: var(--text-muted); font-size: 12px; }
.popup-enter-active, .popup-leave-active { transition: opacity 150ms, transform 150ms; }
.popup-enter-from, .popup-leave-to { opacity: 0; transform: translateY(-4px) scale(0.97); }
.main {
  padding: 0 28px 72px;
}
.hello {
  margin: 0 0 8px;
  color: var(--text-muted);
  font-size: 14px;
  font-weight: 800;
}
h1 {
  margin: 0 0 22px;
  font-size: clamp(32px, 4vw, 48px);
  line-height: 1.04;
  letter-spacing: -0.045em;
}
.content-layout {
  display: grid;
  grid-template-columns: minmax(620px, 48%) minmax(560px, 1fr);
  gap: 18px;
  align-items: start;
}
.left-column {
  display: grid;
  gap: 24px;
}
.telemetry-card,
.pc-log-card,
.vision-pane {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  box-shadow: var(--card-shadow);
  backdrop-filter: blur(22px);
}
.telemetry-card {
  height: auto;
  min-height: 400px;
  border-radius: 26px;
  padding: 18px;
  display: grid;
  grid-template-columns: minmax(300px, 38%) minmax(0, 1fr);
  gap: 16px;
  overflow: hidden;
}
.telemetry-zone {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  align-content: start;
  min-width: 0;
}
.resource-column {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.motion-column {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.resource-card,
.speed-card,
.attitude-card,
.network-card {
  height: 150px;
  max-height: 150px;
}
.mini-card,
.mcu-card {
  min-height: 0;
  border-radius: 16px;
  background: var(--surface);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.resource-card {
  padding: 12px;
}
.mini-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text-dim);
  font-size: 11px;
  font-weight: 900;
}
.mini-head b {
  color: var(--text);
  font-size: 15px;
}
.speed-card {
  height: 204px;
  padding: 14px;
  display: flex;
  flex-direction: column;
}
.attitude-card {
  aspect-ratio: 1/1;
  margin-top: auto;
  padding: 14px;
}
.mcu-card {
  padding: 14px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: 524px;
}
.vision-pane {
  position: relative;
  min-width: 0;
  height: 720px;
  border-radius: 26px;
  overflow: hidden;
}
.pane-head,
.vision-foot {
  position: absolute;
  z-index: 2;
  left: 16px;
  right: 16px;
  display: flex;
  justify-content: space-between;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 900;
}
.pane-head {
  top: 14px;
}
.vision-foot {
  bottom: 12px;
}
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
.pc-log-card {
  border-radius: 24px;
  padding: 18px;
  max-height: 220px;
  display: flex;
  flex-direction: column;
  margin-bottom: 24px;
}
.pc-logs {
  max-height: 170px;
}
.empty {
  min-height: calc(100vh - 68px);
  display: grid;
  place-items: center;
  font-size: 28px;
  font-weight: 900;
}
@media (max-width: 1280px) {
  .content-layout {
    grid-template-columns: 1fr;
    transition: grid-template-columns 300ms ease;
  }
  .telemetry-card {
    height: auto;
    grid-template-columns: 340px 1fr;
  }
  .telemetry-zone {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto auto;
    gap: 8px;
    align-content: start;
  }
  .resource-column {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .motion-column {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .resource-card {
    height: 150px;
    max-height: 150px;
    flex-shrink: 0;
  }
  .resource-card .mini-chart {
    min-height: 48px;
  }
  .speed-card,
  .attitude-card,
  .network-card {
    height: 150px;
    max-height: 150px;
    max-width: none;
    flex-shrink: 0;
  }
  .speed-chart {
    height: 80px;
  }
  .mcu-card {
    height: auto;
  }
  .vision-pane {
    height: 420px;
  }
  .pc-log-card {
    width: auto;
  }
}

@media (max-width: 760px) {
  .nav {
    padding: 12px;
  }
  .tabs {
    overflow: auto;
  }
  .main {
    padding: 6px 14px 22px;
  }
  .telemetry-zone {
    grid-template-columns: 1fr;
  }
  .motion-stack {
    padding-top: 0;
  }
  .telemetry-card {
    padding: 12px;
  }
  .vision-pane {
    height: 320px;
  }
  .pc-log-card {
    width: auto;
  }
}

/* ── 移动端：底部导航接管 ── */
@media (max-width: 640px) {
  /* 顶部 nav 滑出 */
  .nav {
    transform: translateY(-100%);
    opacity: 0;
    pointer-events: none;
    position: absolute;
  }

  /* 底部 nav 滑入 */
  .bottom-nav {
    display: flex;
    transform: translateY(0);
  }

  /* 页面内容留出底部空间 */
  .page {
    padding-bottom: 64px;
  }
  .main {
    padding: 16px 14px 8px;
  }
  .empty {
    min-height: calc(100vh - 64px);
  }

  /* 卡片适配 */
  .telemetry-card {
    height: auto;
    grid-template-columns: 1fr;
    padding: 12px;
  }
  /* telemetry-zone 变两列 */
  .telemetry-zone {
    grid-template-columns: 1fr 1fr;
    display: grid;
    gap: 10px;
  }
  /* 第一列：CPU RAM ROM 三行 */
  .resource-column {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .resource-card {
    height: 120px;
    max-height: 120px;
  }
  .resource-card .mini-chart {
    min-height: 48px;
  }
  /* 第二列：Network Speed Servo 三行 */
  .motion-column {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .network-card {
    height: 120px;
    max-height: 120px;
  }
  .speed-card {
    height: 120px;
    max-height: 120px;
  }
  .speed-chart {
    height: 60px;
  }
  .attitude-card {
    height: 120px;
    max-height: 120px;
    margin-top: 0;
  }
  .vision-pane,
  .mcu-card {
    height: 280px;
  }
  h1 {
    font-size: clamp(24px, 7vw, 36px);
  }
}

/* ── CLI Panel ── */
.logo {
  cursor: pointer;
  user-select: none;
}
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
  .cli-panel { height: 220px; bottom: 64px; }
}
</style>
