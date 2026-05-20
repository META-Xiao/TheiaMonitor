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
          @click="activeSection = i"
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
              v-for="ch in serialChannels" :key="ch.id"
              :class="{ active: serial.channel === ch.id }"
              @click="serial.channel = ch.id"
            >{{ ch.label }}</button>
          </div>

          <!-- USB-CDC: no config needed -->
          <div v-if="serial.channel === 'usb_cdc'" class="field-group">
            <p class="section-desc" style="margin:0">USB Virtual COM — no port configuration required. Connect the MCU via USB and click Connect.</p>
          </div>

          <!-- UART -->
          <div v-else-if="serial.channel === 'uart'" class="field-group">
            <div class="field">
              <label>Port</label>
              <AppSelect v-model="serial.port" :options="portOptions" />
            </div>
            <div class="field">
              <label>Baud Rate</label>
              <AppSelect v-model="serial.baud" :options="baudOptions" />
            </div>
            <p class="section-desc" style="margin-top:4px">Frame format fixed at 8N1 (set by MCU library).</p>
          </div>

          <!-- WIFI -->
          <div v-else-if="serial.channel === 'wifi'" class="field-group">
            <div class="field">
              <label>Host IP</label>
              <input class="text-input" v-model="serial.wifiHost" placeholder="192.168.4.1" />
            </div>
            <div class="field">
              <label>Port</label>
              <input class="text-input" v-model.number="serial.wifiPort" type="number" placeholder="8080" />
            </div>
            <p class="section-desc" style="margin-top:4px">WIFI channel shares the same frame protocol (0xCC/0xDD/0xEE).</p>
          </div>

          <div class="status-bar" :class="serial.connected ? 'ok' : 'idle'">
            <span class="dot" />
            <span>{{ serial.connected ? 'Connected' : 'Disconnected' }}</span>
            <button class="action-btn" @click="toggleConnect">
              {{ serial.connected ? 'Disconnect' : 'Connect' }}
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
                <label class="radio"><input type="radio" v-model="display.theme" value="light" /> Light</label>
                <label class="radio"><input type="radio" v-model="display.theme" value="dark" /> Dark</label>
                <label class="radio"><input type="radio" v-model="display.theme" value="system" /> System</label>
              </div>
            </div>
            <div class="field">
              <label>FPS Cap <b>{{ display.fpsCap }}</b></label>
              <input type="range" min="10" max="60" step="5" v-model.number="display.fpsCap" />
            </div>
            <div class="field">
              <label>Canvas Scale <b>{{ display.canvasScale }}×</b></label>
              <input type="range" min="1" max="4" step="0.5" v-model.number="display.canvasScale" />
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
          <p class="section-desc">Enable or disable individual data streams from the MCU.</p>
          <div class="channel-list">
            <label v-for="ch in channels" :key="ch.id" class="channel-item">
              <div class="channel-info">
                <span class="channel-name">{{ ch.name }}</span>
                <span class="channel-meta">{{ ch.desc }}</span>
              </div>
              <div class="toggle" :class="{ on: ch.enabled }" @click="ch.enabled = !ch.enabled">
                <div class="thumb" />
              </div>
            </label>
          </div>
        </section>

        <!-- About -->
        <section v-show="activeSection === 3" class="section-card">
          <h2>About</h2>
          <div class="about-grid">
            <div class="about-row"><span>Application</span><b>Trace Vector PC Host</b></div>
            <div class="about-row"><span>Version</span><b>v0.1.0</b></div>
            <div class="about-row"><span>Build</span><b>2026-05-20</b></div>
            <div class="about-row"><span>Protocol</span><b>Hybrid 0xCC/0xDD/0xEE</b></div>
            <div class="about-row"><span>Target MCU</span><b>STC32G144K256</b></div>
            <div class="about-row"><span>Serial Layer</span><b>1776 LOC · 100+ tests</b></div>
          </div>
        </section>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import AppSelect from '../components/AppSelect.vue'

const sections = [
  { id: 'serial',   icon: '⌁', label: 'Serial' },
  { id: 'display',  icon: '◫', label: 'Display' },
  { id: 'channels', icon: '≋', label: 'Channels' },
  { id: 'about',    icon: '◎', label: 'About' },
]
const activeSection = ref(0)

const serialChannels = [
  { id: 'usb_cdc', label: 'USB-CDC' },
  { id: 'uart',    label: 'UART' },
  { id: 'wifi',    label: 'WIFI' },
]
const availablePorts = ['COM3', 'COM4', 'COM5', '/dev/ttyUSB0', '/dev/ttyACM0']
const baudRates = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]

const portOptions = [
  { value: '', label: 'Auto detect' },
  ...['COM3','COM4','COM5','/dev/ttyUSB0','/dev/ttyACM0'].map(p => ({ value: p, label: p })),
]
const baudOptions = [9600,19200,38400,57600,115200,230400,460800,921600].map(b => ({ value: b, label: String(b) }))
const langOptions = [{ value: 'zh', label: '中文' }, { value: 'en', label: 'English' }]

const serial = reactive({ channel: 'usb_cdc', port: '', baud: 115200, wifiHost: '192.168.4.1', wifiPort: 8080, connected: false })
const display = reactive({ theme: 'light', fpsCap: 30, canvasScale: 1, lang: 'zh' })
const channels = reactive([
  { id: 'image',    name: 'Image Stream',      desc: '0xCC · 22566 B/frame · 25 FPS', enabled: true },
  { id: 'log',      name: 'Log Stream',        desc: '0xDD · variable length · 5 FPS', enabled: true },
  { id: 'resource', name: 'Resource Monitor',  desc: '0xEE · 18 B/frame · 5 FPS',    enabled: true },
])

const toggleConnect = () => { serial.connected = !serial.connected }
</script>

<style scoped>
.settings {
  padding: 0 28px 72px;
  min-height: calc(100vh - 58px);
}

.settings-header { margin-bottom: 22px; }
.hello { margin: 0 0 8px; color: rgba(36,36,36,.52); font-size: 14px; font-weight: 800; }
h1 { margin: 0; font-size: clamp(32px, 4vw, 48px); line-height: 1.04; letter-spacing: -.045em; }

.settings-body {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 18px;
  align-items: start;
}

/* Nav */
.settings-nav {
  background: rgba(255,255,255,.92);
  border: 1px solid rgba(255,255,255,.62);
  box-shadow: 0 28px 80px rgba(68,92,110,.18);
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
  color: rgba(36,36,36,.5);
  font-weight: 800;
  font-size: 14px;
  cursor: pointer;
  text-align: left;
  transition: background 150ms, color 150ms;
}

.settings-nav button:hover { background: rgba(36,36,36,.06); color: #242424; }
.settings-nav button.active { background: rgba(255,255,255,.92); color: #242424; box-shadow: 0 4px 16px rgba(68,92,110,.14); }

.nav-icon { font-size: 18px; width: 22px; text-align: center; }

/* Content */
.settings-content { min-width: 0; max-width: 640px; }

.section-card {
  background: rgba(255,255,255,.92);
  border: 1px solid rgba(255,255,255,.62);
  box-shadow: 0 28px 80px rgba(68,92,110,.18);
  backdrop-filter: blur(22px);
  border-radius: 26px;
  padding: 28px 32px;
}

.section-card h2 {
  margin: 0 0 22px;
  font-size: 20px;
  font-weight: 900;
  letter-spacing: -.03em;
}

.section-desc { margin: -14px 0 20px; color: rgba(36,36,36,.5); font-size: 13px; }

/* Fields */
.field-group { display: grid; gap: 18px; }

.field {
  display: grid;
  grid-template-columns: 140px 1fr;
  align-items: center;
  gap: 12px;
}

.field label {
  font-size: 13px;
  font-weight: 800;
  color: rgba(36,36,36,.55);
  display: flex;
  align-items: center;
  gap: 6px;
}

.field label b { color: #242424; font-size: 15px; }

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
  background: rgba(246,246,241,.82);
  width: fit-content;
}
.channel-tabs button {
  border: 0;
  border-radius: 10px;
  padding: 7px 18px;
  background: transparent;
  color: rgba(36,36,36,.5);
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition: background 150ms, color 150ms;
}
.channel-tabs button.active {
  background: #fff;
  color: #242424;
  box-shadow: 0 2px 8px rgba(68,92,110,.14);
}

/* Text input */
.text-input {
  width: 100%;
  padding: 9px 12px;
  border: 1.5px solid rgba(36,36,36,.12);
  border-radius: 10px;
  background: rgba(246,246,241,.82);
  font-size: 14px;
  font-weight: 700;
  color: #242424;
  font-family: 'JetBrains Mono', Consolas, monospace;
}
.text-input:focus { outline: none; border-color: #20b8a6; }

/* Radio */
.radio-group { display: flex; gap: 18px; }
.radio { display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 700; cursor: pointer; }
.radio input { accent-color: #20b8a6; width: 16px; height: 16px; }

/* Status bar */
.status-bar {
  margin-top: 22px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 14px;
  background: rgba(246,246,241,.82);
  font-size: 13px;
  font-weight: 800;
}

.status-bar.ok { background: rgba(32,184,166,.1); color: #0e8a7e; }
.status-bar.idle { color: rgba(36,36,36,.5); }

.dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

.action-btn {
  margin-left: auto;
  padding: 7px 20px;
  border: 0;
  border-radius: 999px;
  background: #242424;
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition: opacity 150ms;
}
.action-btn:hover { opacity: .8; }

/* Channels */
.channel-list { display: grid; gap: 12px; }

.channel-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(246,246,241,.82);
  cursor: pointer;
}

.channel-info { display: flex; flex-direction: column; gap: 3px; }
.channel-name { font-size: 14px; font-weight: 800; }
.channel-meta { font-size: 11px; font-weight: 700; color: rgba(36,36,36,.45); font-family: 'JetBrains Mono', Consolas, monospace; }

/* Toggle */
.toggle {
  width: 44px; height: 24px;
  border-radius: 999px;
  background: rgba(36,36,36,.15);
  position: relative;
  transition: background 200ms;
  flex-shrink: 0;
}
.toggle.on { background: #20b8a6; }
.thumb {
  position: absolute;
  top: 3px; left: 3px;
  width: 18px; height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 6px rgba(0,0,0,.2);
  transition: transform 200ms;
}
.toggle.on .thumb { transform: translateX(20px); }

/* About */
.about-grid { display: grid; gap: 12px; }
.about-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-radius: 12px;
  background: rgba(246,246,241,.82);
  font-size: 13px;
}
.about-row span { color: rgba(36,36,36,.5); font-weight: 700; }
.about-row b { font-weight: 900; font-family: 'JetBrains Mono', Consolas, monospace; font-size: 13px; }

/* Responsive */
@media (max-width: 900px) {
  .settings-body { grid-template-columns: 1fr; }
  .settings-nav {
    flex-direction: row;
    flex-wrap: wrap;
    position: static;
  }
  .settings-nav button { width: auto; flex: 1; justify-content: center; }
  .nav-label { display: none; }
  .settings-nav button.active .nav-label { display: inline; }
}

@media (max-width: 600px) {
  .settings { padding: 0 14px 32px; }
  .section-card { padding: 18px; }
  .field { grid-template-columns: 1fr; gap: 6px; }
  .field label { font-size: 12px; }
}
</style>
