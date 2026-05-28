<template>
  <div class="page" @click="closePopups">
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
      <AvatarMenu
        ref="avatarRef"
        :replay-ctrl="replayCtrl"
        :record-ctrl="recordCtrl"
        :replay-state="replayState"
        :replay-current="replayCurrent"
        :replay-total="replayTotal"
        :record-state="recordState"
        :uptime="uptime"
        @connect="connectActive"
        @disconnect="disconnectActive"
      />
    </nav>

    <main v-show="activeTab === 0" class="main">
      <p class="hello">{{ greeting }}, Trace Vector!</p>
      <h1>Theia Monitor</h1>

      <section class="content-layout">
        <div class="left-column">
          <section class="telemetry-card">
            <section class="telemetry-zone" @click="tzPickerOpen = false">
              <div
                v-for="card in visibleOverviewCards"
                :key="card.id"
                class="mini-card resource-card tz-card"
              >
                <ServoCard v-if="card.isServo"
                  :deg="servoDeg ?? '--'"
                  :visual-deg="servoVisualDeg" />
                <SensorCard v-else
                  :label="card.label"
                  :value="card.value"
                  :color="card.color"
                  :points="card.points"
                  :max="card.max"
                  :chart-type="card.chartType"
                />
                <button class="tz-remove" @click.stop="removeOverviewCard(card.id)"><Icon icon="lucide:x" /></button>
              </div>
              <button
                v-if="visibleOverviewCards.length < 6 && hiddenSlotCards.length"
                class="mini-card resource-card tz-add-btn"
                @click.stop="openTzPicker"
                ref="tzAddBtnEl"
              >
                <Icon icon="lucide:plus" /><span>Add</span>
              </button>
              <Teleport to="body">
                <div v-if="tzPickerOpen" class="tz-picker" :style="tzPickerStyle" @click.stop>
                  <button v-for="c in hiddenSlotCards" :key="c.id" @click="addOverviewCard(c.id)">{{ c.label }}</button>
                </div>
              </Teleport>
            </section>

            <aside class="mcu-card">
              <LogCard title="MCU output" :logs="mcuLogs" :status="connectionStatus" @clear="mcuLogs.length = 0" />
            </aside>
          </section>

          <section class="binout-card">
            <BinOutputSimple ref="binOutputRef" :status="connectionStatus" />
          </section>
        </div>

        <VisionPane ref="visionPaneRef" :fps="imageFps" :image-size="imageSize" />
      </section>
    </main>

    <SettingsView ref="settingsView" v-show="activeTab === 2" />
    <HexView v-show="activeTab === 1" />

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
      <AvatarMenu
        ref="avatarMobileRef"
        mobile
        :replay-ctrl="replayCtrl"
        :record-ctrl="recordCtrl"
        :replay-state="replayState"
        :replay-current="replayCurrent"
        :replay-total="replayTotal"
        :record-state="recordState"
        :uptime="uptime"
        @connect="connectActive"
        @disconnect="disconnectActive"
      />
    </nav>

    <CliPanel v-model:open="cliOpen" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { Icon } from "@iconify/vue";
import SettingsView from "./SettingsView.vue";
import HexView from "./HexView.vue";
import LogCard from "../components/LogCard.vue";
import AvatarMenu from "../components/AvatarMenu.vue";
import CliPanel from "../components/CliPanel.vue";
import VisionPane from "../components/VisionPane.vue";
import BinOutputSimple from "../components/BinOutputSimple.vue";
import SensorCard from "../components/SensorCard.vue";
import ServoCard from "../components/ServoCard.vue";
import { useCanvasAnimation } from "../composables/useCanvasAnimation";
import { useTelemetry } from "../composables/useTelemetry";
import { conn } from "../stores/connection";
import { resourceSlots } from "../stores/resourceSlots";
import { ReplayController } from "../serial/replay";
import type { ReplayState } from "../serial/replay";
import { RecordController } from "../serial/record";
import type { RecordState } from "../serial/record";
import { serialManager as _sm } from "../composables/useTelemetry";

const replayCtrl = new ReplayController(_sm);
const replayState = ref<ReplayState>('idle');
const replayCurrent = ref(0);
const replayTotal = ref(0);

replayCtrl.setEvents({
  onStateChange(s) {
    replayState.value = s;
  },
  onProgress(cur, total) {
    replayCurrent.value = cur;
    replayTotal.value = total;
  },
});

// ── Recording ──
const recordCtrl = new RecordController(_sm);
const recordState = ref<RecordState>('idle');
const recordBytes = ref(0);
recordCtrl.setEvents({
  onStateChange(s) {
    recordState.value = s;
  },
  onByteCount(n) {
    recordBytes.value = n;
  },
});

const {
  mcuLogs, imageFps, imageManager, serialManager,
  servoDeg, servoVisualDeg,
  overviewCards,
} = useTelemetry();

// telemetry-zone add/remove — shownIds controls display only, independent of slot.enabled
const NETWORK_ID = 'network';
const shownIds = ref<string[]>(
  resourceSlots.map(s => `slot_${s.id}`).concat([NETWORK_ID])
);

// keep shownIds in sync when slots are deleted
watch(() => resourceSlots.length, () => {
  const existing = new Set(resourceSlots.map(s => `slot_${s.id}`));
  shownIds.value = shownIds.value.filter(id => id === NETWORK_ID || existing.has(id));
});

const hiddenSlotCards = computed(() => {
  const all = [
    ...resourceSlots.map(s => ({ id: `slot_${s.id}`, label: s.label })),
    { id: NETWORK_ID, label: 'Network RX' },
  ];
  return all.filter(c => !shownIds.value.includes(c.id));
});

function removeOverviewCard(id: string) {
  shownIds.value = shownIds.value.filter(x => x !== id);
}

function addOverviewCard(id: string) {
  if (shownIds.value.length >= 6) return;
  shownIds.value = [...shownIds.value, id];
  tzPickerOpen.value = false;
}

const tzPickerOpen = ref(false);
const tzAddBtnEl = ref<HTMLElement>();
const tzPickerStyle = ref({});

const visibleOverviewCards = computed(() =>
  overviewCards.value.filter(c => shownIds.value.includes(c.id))
);

function openTzPicker() {
  tzPickerOpen.value = true;
  if (tzAddBtnEl.value) {
    const r = tzAddBtnEl.value.getBoundingClientRect();
    tzPickerStyle.value = { top: `${r.bottom + 6}px`, left: `${r.left}px`, minWidth: `${r.width}px` };
  }
}

const tabs = ["Overview", "Hex", "Settings"];
const tabIcons = ["lucide:layout-dashboard", "lucide:file-code", "lucide:settings"];
const activeTab = ref(0);
const settingsView = ref<InstanceType<typeof SettingsView>>();

const cliOpen = ref(false);

const onKey = (e: KeyboardEvent) => {
  if (e.ctrlKey && e.key === "j") { e.preventDefault(); cliOpen.value = !cliOpen.value; }
};

const isReplayActive = computed(() => replayState.value !== 'idle' && replayState.value !== 'loading');

const connectionStatus = computed<'offline' | 'live' | 'replay'>(() => {
  if (isReplayActive.value) return 'replay';
  if (conn.connected) return 'live';
  return 'offline';
});

const now = ref(Date.now());
let nowTimer: ReturnType<typeof setInterval> | null = null;
const uptime = computed(() => {
  if (!conn.connectedAt) return "";
  const s = Math.floor((now.value - conn.connectedAt) / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${sec}s` : `${sec}s`;
});

const greeting = computed(() => {
  const h = new Date(now.value).getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
});

const avatarRef = ref<InstanceType<typeof AvatarMenu>>();
const avatarMobileRef = ref<InstanceType<typeof AvatarMenu>>();

function closePopups() {
  avatarRef.value?.closePopups();
  avatarMobileRef.value?.closePopups();
}

async function connectActive(channel: string, baud: number, wifiEndpoint: string) {
  try {
    if (channel === "wifi") {
      conn.connected = true;
      conn.connectedAt = Date.now();
      conn.mcuName = wifiEndpoint;
      conn.portLabel = `WIFI ${wifiEndpoint}`;
    } else {
      await serialManager.selectPort();
      await serialManager.connect(baud);
      conn.portLabel = channel === "usb_cdc"
        ? `USB-CDC ${baud}`
        : `UART ${baud}`;
    }
  } catch (error) {
    console.error("Connect failed:", error);
  }
}

async function disconnectActive() {
  try {
    if (serialManager.isConnected()) {
      await serialManager.disconnect();
    } else {
      conn.connected = false;
      conn.connectedAt = null;
      conn.mcuName = "";
      conn.portLabel = "";
    }
  } catch (error) {
    console.error("Disconnect failed:", error);
  }
}

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

const visionPaneRef = ref<InstanceType<typeof VisionPane>>();
const imageCanvas = ref<HTMLCanvasElement>();
const { stop: stopAnim } = useCanvasAnimation(imageCanvas);
const imageSize = ref({ w: 0, h: 0 });
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

console.log('%c' + [
"████████ ██   ██ ███████ ██  █████                         ",
"   ██    ██   ██ ██      ██ ██   ██                        ",
"   ██    ███████ █████   ██ ███████                        ",
"   ██    ██   ██ ██      ██ ██   ██                        ",
"   ██    ██   ██ ███████ ██ ██   ██                        ",
"                                                            ",
"                                                            ",
"███    ███  ██████  ███    ██ ██ ████████  ██████  ██████  ",
"████  ████ ██    ██ ████   ██ ██    ██    ██    ██ ██   ██ ",
"██ ████ ██ ██    ██ ██ ██  ██ ██    ██    ██    ██ ██████  ",
"██  ██  ██ ██    ██ ██  ██ ██ ██    ██    ██    ██ ██   ██ ",
"██      ██  ██████  ██   ████ ██    ██     ██████  ██   ██ ",
"                                                            ",
].join('\n') + '%c  v0.1.0  |  serial ready', 'color:#20b8a6;font-weight:bold', 'color:#94a3b8');

const binOutputRef = ref<InstanceType<typeof BinOutputSimple>>();
let unsubRaw: (() => void) | null = null;
let unsubReplayFrames: (() => void) | null = null;

onMounted(() => {
  window.addEventListener("keydown", onKey);
  nowTimer = setInterval(() => { now.value = Date.now(); }, 1000);
  imageCanvas.value = visionPaneRef.value?.canvas;
  drawNoSignal();
  unsubImage = imageManager.on((event) => {
    if (event.type !== 'IMAGE_RECEIVED') return;
    if (visionPaneRef.value?.isPaused) return;
    stopAnim();
    const c = imageCanvas.value;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const { width, height, pixelData } = event.data;
    imageSize.value = { w: width, h: height };
    c.width = width;
    c.height = height;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(pixelData.buffer as ArrayBuffer), width, height), 0, 0);
  });
  unsubRaw = serialManager.onRawData((data) => {
    binOutputRef.value?.pushRawData(data);
  });
  // Replay mode: feed parsed frames to BinOutput (live mode uses raw path above)
  unsubReplayFrames = serialManager.on((event) => {
    if (event.type === 'FRAME') {
      binOutputRef.value?.pushFrame(event.frame);
    }
  });
});
onUnmounted(() => {
  window.removeEventListener("keydown", onKey);
  if (nowTimer) clearInterval(nowTimer);
  stopAnim();
  unsubImage?.();
  unsubRaw?.();
  unsubReplayFrames?.();
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
.telemetry-card {
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
.tz-card { position: relative; }
.tz-remove {
  position: absolute;
  top: 5px; right: 5px;
  width: 18px; height: 18px;
  border: none; border-radius: 999px;
  background: transparent; color: var(--text-dim);
  display: grid; place-items: center;
  cursor: pointer; font-size: 11px;
  opacity: 0; transition: opacity 150ms;
}
.tz-card:hover .tz-remove { opacity: 1; }
.tz-add-btn {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 4px; font-size: 12px; font-weight: 700;
  border: 1.5px dashed var(--card-border);
  background: transparent; color: var(--text-muted);
  cursor: pointer; transition: background 150ms;
}
.tz-add-btn:hover { background: var(--surface); }
.tz-picker {
  position: fixed;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 12px;
  box-shadow: var(--card-shadow);
  backdrop-filter: blur(20px);
  z-index: 500; overflow: hidden;
}
.tz-picker button {
  display: block; width: 100%;
  padding: 9px 14px; text-align: left;
  border: none; background: transparent;
  color: var(--text); font-size: 13px; font-weight: 700;
  cursor: pointer; transition: background 150ms;
}
.tz-picker button:hover { background: var(--surface); }
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
  .mcu-card {
    height: 280px;
  }
  h1 {
    font-size: clamp(24px, 7vw, 36px);
  }
}

.logo {
  cursor: pointer;
  user-select: none;
}
</style>
