<template>
  <div class="page">
    <nav class="nav">
      <b class="logo" @click="cliOpen = !cliOpen" title="Toggle CLI (Ctrl+J)"><Icon icon="lucide:sparkles" /></b>
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
              <aside class="resource-stack">
                <div
                  v-for="item in resourceCards"
                  :key="item.name"
                  class="mini-card resource-card"
                >
                  <div class="mini-head">
                    <span>{{ item.name }}</span
                    ><b>{{ item.value }}%</b>
                  </div>
                  <svg
                    viewBox="0 0 220 88"
                    preserveAspectRatio="none"
                    class="mini-chart"
                  >
                    <path
                      class="mini-area"
                      :d="areaPath(item.points, 220, 88)"
                    />
                    <path
                      class="mini-line"
                      :d="linePath(item.points, 220, 88)"
                      :style="{ stroke: item.color }"
                    />
                  </svg>
                </div>
              </aside>

              <aside class="motion-stack">
                <div class="mini-card speed-card">
                  <div class="mini-head">
                    <span>Speed curve</span><b>{{ speedMs }} m/s</b>
                  </div>
                  <svg
                    viewBox="0 0 240 150"
                    preserveAspectRatio="none"
                    class="speed-chart"
                  >
                    <path
                      class="speed-area"
                      :d="areaPath(speedPoints, 240, 150)"
                    />
                    <path
                      class="speed-line"
                      :d="linePath(speedPoints, 240, 150)"
                    />
                  </svg>
                </div>

                <div class="mini-card attitude-card">
                  <div class="mini-head">
                    <span>Servo attitude</span><b>{{ servoDeg }}°</b>
                  </div>
                  <div class="attitude">
                    <div
                      class="sky"
                      :style="{ transform: `rotate(${servoVisualDeg}deg)` }"
                    >
                      <i />
                    </div>
                    <div class="aircraft">⌃</div>
                    <div class="ticks">
                      <span>-45</span><span>0</span><span>45</span>
                    </div>
                  </div>
                </div>
              </aside>
            </section>

            <aside class="mcu-card">
              <div class="log-title">MCU output <em>LIVE</em></div>
              <div class="mcu-logs">
                <div
                  v-for="(log, i) in mcuLogs.slice(-9)"
                  :key="i"
                  :class="[
                    'log',
                    { warn: log.includes('WARN'), err: log.includes('ERROR') },
                  ]"
                >
                  {{ log }}
                </div>
              </div>
            </aside>
          </section>

          <section class="pc-log-card">
            <div class="log-title">Host RX / Boot Log <em>HOST</em></div>
            <div class="pc-logs">
              <div v-for="(log, i) in hostLogs" :key="i" class="log">
                {{ log }}
              </div>
            </div>
          </section>
        </div>

        <section class="vision-pane">
          <div class="pane-head">
            <span>Vision stream</span><b>{{ imageStats.fps.toFixed(1) }} FPS</b>
          </div>
          <div class="canvas-wrap">
            <canvas ref="imageCanvas" width="188" height="120" />
          </div>
          <div class="vision-foot">
            <span>Source 188×120</span
            ><span>Drop {{ imageStats.droppedFrames }}</span>
          </div>
        </section>
      </section>
    </main>

    <SettingsView ref="settingsView" v-show="activeTab === 2" />
    <main v-show="activeTab === 1" class="empty">Vision — Coming Soon</main>

    <!-- 移动端底部导航 -->
    <nav class="bottom-nav">
      <b class="logo-m">✦</b>
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
        @click="avatarOpen = !avatarOpen"
      >
        {{ conn.connected ? conn.mcuName.slice(0, 2) + '.' : 'TV' }}
        <Transition name="popup">
          <div v-if="avatarOpen" class="avatar-popup avatar-popup-m">
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
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { Icon } from "@iconify/vue";
import SettingsView from "./SettingsView.vue";
import { conn } from "../stores/connection";

const tabs = ["Overview", "Vision", "Settings"];
const tabIcons = ["lucide:layout-dashboard", "lucide:video", "lucide:settings"];
const activeTab = ref(0);
const settingsView = ref<InstanceType<typeof SettingsView>>();

const cliOpen = ref(false);
const cliHeight = ref(parseInt(localStorage.getItem("cliHeight") ?? "260"));

function startCliResize(e: PointerEvent) {
  const startY = e.clientY, startH = cliHeight.value;
  const onMove = (ev: PointerEvent) => {
    cliHeight.value = Math.max(120, Math.min(window.innerHeight - 80, startH - (ev.clientY - startY)));
  };
  const onUp = () => {
    localStorage.setItem("cliHeight", String(cliHeight.value));
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}
const onKey = (e: KeyboardEvent) => {
  if (e.ctrlKey && e.key === "j") { e.preventDefault(); cliOpen.value = !cliOpen.value; }
};

const avatarOpen = ref(false);
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
  // 窄屏下点设置 tab：若已在设置页则呼出 sheet，否则先切换再呼出
  if (i === 2 && window.innerWidth <= 640) {
    activeTab.value = 2;
    settingsView.value?.openSheet();
  } else {
    activeTab.value = i;
  }
};
const imageCanvas = ref<HTMLCanvasElement>();
let timerId: number | undefined;

const data = reactive({ cpu: 45, ram: 60, rom: 65, speed: 150, servo: 250 });
const imageStats = reactive({ fps: 25, droppedFrames: 0 });
const cpuPoints = ref([58, 62, 54, 48, 50, 45, 52, 68, 63, 59, 66, 45]);
const ramPoints = ref([42, 48, 46, 51, 55, 58, 60, 64, 61, 63, 66, 60]);
const romPoints = ref([64, 65, 64, 66, 65, 65, 67, 66, 65, 65, 66, 65]);
const speedPoints = ref([22, 28, 25, 36, 42, 38, 52, 48, 62, 58, 68, 64]);

const mcuLogs = ref([
  "[00:00:01] MCU boot complete",
  "[00:00:02] Image sensor init",
  "[00:00:03] Servo control ready",
  "[00:00:04] Motor driver active",
  "[00:00:05] All peripherals ready",
  "[00:01:00] [INFO] CPU usage: 45%",
  "[00:01:01] [INFO] RAM usage: 60%",
  "[00:01:02] [INFO] Speed: 150 mm/s",
]);

const hostLogs = ref([
  "[HOST 00:00:00] Trace Vector PC Host started",
  "[HOST 00:00:01] serial manager ready",
  "[HOST 00:00:02] protocol parser initialized",
  "[HOST 00:00:03] resource monitor mounted",
  "[HOST 00:00:04] image stream waiting for frame",
]);

const resourceCards = computed(() => [
  { name: "CPU", value: data.cpu, color: "#242424", points: cpuPoints.value },
  { name: "RAM", value: data.ram, color: "#20b8a6", points: ramPoints.value },
  { name: "ROM", value: data.rom, color: "#c7d54f", points: romPoints.value },
]);
const speedMs = computed(() => (data.speed / 1000).toFixed(2));
const servoDeg = computed(() => (data.servo / 10).toFixed(1));
const servoVisualDeg = computed(() =>
  Math.max(-42, Math.min(42, data.servo / 10 - 45)),
);

const linePath = (points: number[], w: number, h: number) =>
  points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - (p / 100) * (h - 18) - 9;
      return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
const areaPath = (points: number[], w: number, h: number) =>
  `${linePath(points, w, h)} L${w} ${h} L0 ${h} Z`;
const pushPoint = (arr: typeof cpuPoints, value: number) => {
  arr.value = [...arr.value.slice(1), value];
};

const drawFrame = () => {
  const canvas = imageCanvas.value;
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  g.addColorStop(0, "#f9f5df");
  g.addColorStop(1, "#d9f7ee");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(36,36,36,.13)";
  for (let x = 0; x < canvas.width; x += 14) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 14) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  ctx.fillStyle = "#242424";
  ctx.font = "12px sans-serif";
  ctx.fillText("No image data", 56, 64);
};

onMounted(() => {
  window.addEventListener("keydown", onKey);
  drawFrame();
  timerId = window.setInterval(() => {
    now.value = Date.now();
    data.cpu = Math.floor(30 + Math.random() * 55);
    data.ram = Math.floor(42 + Math.random() * 38);
    data.speed = Math.floor(90 + Math.random() * 390);
    data.servo = Math.floor(80 + Math.random() * 820);
    imageStats.fps = 22 + Math.random() * 8;
    pushPoint(cpuPoints, data.cpu);
    pushPoint(ramPoints, data.ram);
    pushPoint(speedPoints, Math.min(90, Math.round(data.speed / 6)));
  }, 1000);
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKey);
  if (timerId !== undefined) window.clearInterval(timerId);
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
  height: 560px;
  border-radius: 26px;
  padding: 18px;
  display: grid;
  grid-template-columns: 386px minmax(220px, 1fr);
  gap: 16px;
  overflow: hidden;
}
.telemetry-zone {
  display: grid;
  grid-template-columns: 172px 200px;
  gap: 12px;
  min-width: 0;
  min-height: 0;
}
.resource-stack {
  display: grid;
  grid-template-rows: repeat(3, minmax(0, 1fr));
  gap: 10px;
  min-height: 0;
}
.motion-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 26px;
  min-height: 0;
}
.mini-card,
.mcu-card {
  min-height: 0;
  border-radius: 16px;
  background: var(--surface);
  overflow: hidden;
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
.mini-chart {
  width: 100%;
  height: calc(100% - 32px);
  min-height: 82px;
  margin-top: 8px;
}
.mini-area {
  fill: rgba(214, 232, 115, 0.28);
}
.mini-line {
  fill: none;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.speed-card {
  height: 204px;
  padding: 14px;
}
.speed-chart {
  width: 100%;
  height: 150px;
  margin-top: 12px;
}
.speed-area {
  fill: rgba(32, 184, 166, 0.16);
}
.speed-line {
  fill: none;
  stroke: #20b8a6;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.attitude-card {
  aspect-ratio: 1/1;
  margin-top: auto;
  padding: 14px;
}
.attitude {
  position: relative;
  height: calc(100% - 30px);
  margin-top: 10px;
  border-radius: 16px;
  overflow: hidden;
  background: #edf1ec;
}
.sky {
  position: absolute;
  inset: -32%;
  background: linear-gradient(#88c7ef 0 49%, #fff 49% 51%, #d9b06a 51%);
  transition: transform 0.45s ease;
}
.sky i {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 160%;
  height: 1px;
  background: rgba(255, 255, 255, 0.9);
  transform: translate(-50%, -50%);
}
.aircraft {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: 38px;
  font-weight: 900;
  color: #242424;
  text-shadow: 0 1px 0 #fff;
}
.ticks {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 8px;
  display: flex;
  justify-content: space-between;
  color: rgba(36, 36, 36, 0.54);
  font-size: 10px;
  font-weight: 900;
}
.mcu-card {
  padding: 14px;
  display: flex;
  flex-direction: column;
}
.log-title {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.08em;
}
.log-title em {
  font-style: normal;
}
.mcu-logs,
.pc-logs {
  display: grid;
  gap: 8px;
  overflow: auto;
}
.mcu-logs {
  flex: 1;
  min-height: 0;
}
.log {
  padding: 9px 12px;
  border-radius: 10px;
  background: var(--surface-alt);
  color: var(--text-muted);
  font-family: Consolas, "JetBrains Mono", monospace;
  font-size: 11px;
}
.log.warn {
  color: var(--log-warn-text);
  background: var(--log-warn-bg);
}
.log.err {
  color: var(--log-err-text);
  background: var(--log-err-bg);
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
  overflow: hidden;
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
    grid-template-columns: 1fr;
  }
  .telemetry-zone {
    grid-template-columns: 1fr 1fr;
  }
  .vision-pane,
  .mcu-card {
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
  .vision-pane,
  .mcu-card {
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
  /* telemetry-zone 变单列，内部各区块重排 */
  .telemetry-zone {
    grid-template-columns: 1fr;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  /* 第一行：CPU RAM ROM 三列 */
  .resource-stack {
    display: grid;
    grid-template-rows: unset;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .resource-card .mini-chart {
    min-height: 48px;
  }
  /* 第二行：Speed + Servo 两列 */
  .motion-stack {
    display: grid;
    grid-template-columns: 1fr 1fr;
    padding-top: 0;
    gap: 8px;
  }
  .speed-card {
    height: auto;
  }
  .speed-chart {
    height: 80px;
  }
  .attitude-card {
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
