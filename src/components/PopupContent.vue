<template>
  <div class="connection-popup" @click.stop>
    <!-- State 1: 通道选择 -->
    <template v-if="!conn.connected && !isReplayActive">
      <div class="connect-panel">
        <button
          v-for="ch in allChannels"
          :key="ch.id"
          class="connect-channel"
          :class="{ active: activeChannel === ch.id }"
          @click="$emit('selectChannel', ch.id)"
        >
          <Icon :icon="ch.icon" />
          <span>{{ ch.label }}</span>
        </button>

        <template v-if="activeChannel !== 'replay'">
          <div v-if="activeChannel === 'uart'" class="connect-detail">
            <input v-model.number="serialDraft.baud" class="popup-input" placeholder="115200" type="number" min="1200" max="4000000" />
          </div>
          <div v-else-if="activeChannel === 'wifi'" class="connect-detail">
            <input v-model="serialDraft.wifiEndpoint" class="popup-input" placeholder="192.168.4.1:8080" />
          </div>
          <div v-else class="connect-detail">
            <span>USB Virtual COM</span>
          </div>
          <button class="popup-action" @click="$emit('connect')">Connect</button>
        </template>
        <template v-else>
          <div class="replay-config">
            <div class="replay-file-row" :class="replayState === 'idle' ? 'dim' : 'active'">
              <Icon icon="lucide:file-video" class="replay-file-icon" />
              <span class="replay-file-name">{{ replayState === 'idle' ? 'Choose .bin' : replayCtrl.fileName }}</span>
              <button class="icon-btn mute" @click="$emit('replayChooseFile')" title="Choose File"><Icon icon="lucide:folder-open" /></button>
            </div>
          </div>
          <button class="popup-action" :disabled="replayState === 'loading'" @click="$emit('replayStartFromPanel')">
            <template v-if="replayState === 'loading'">Parsing...</template>
            <template v-else>Replay</template>
          </button>
        </template>
      </div>
    </template>

    <!-- State 2: Online -->
    <template v-else-if="conn.connected && !isReplayActive">
      <div class="popup-status online">Online</div>
      <div class="connected-panel">
        <div class="popup-row"><span>Device</span><b>{{ conn.mcuName }}</b></div>
        <div class="popup-row"><span>Link</span><b>{{ conn.portLabel }}</b></div>
        <div class="popup-row"><span>Uptime</span><b>{{ uptime }}</b></div>
        <button class="popup-action danger" @click="$emit('disconnect')">Disconnect</button>
      </div>
    </template>

    <!-- State 3: 回放中 -->
    <template v-else>
      <div class="popup-status replay">Replay</div>
      <div class="connected-panel">
        <div class="popup-row"><span>File</span><b>{{ replayCtrl.fileName }}</b></div>
        <div class="popup-row"><span>Frames</span><b>{{ replayCurrent }} / {{ replayTotal }}</b></div>
        <div class="popup-row">
          <span>Speed</span>
          <input
            class="replay-speed"
            type="number"
            :value="replayCtrl.speed.toFixed(2)"
            @input="replayCtrl.speed = parseFloat(($event.target as HTMLInputElement).value) || 1.0"
            min="0.01" max="10.0" step="0.01"
          />
        </div>

        <template v-if="replayState === 'ready'">
          <button class="popup-action" @click="$emit('replayRun')">Run</button>
        </template>
        <template v-else-if="replayState === 'playing'">
          <div class="replay-transport">
            <button class="icon-btn mute" @click="$emit('replayStepBack')"><Icon icon="lucide:skip-back" /></button>
            <button class="icon-btn" @click="$emit('replayPause')"><Icon icon="lucide:pause" /></button>
            <button class="icon-btn mute" @click="$emit('replayStepFwd')"><Icon icon="lucide:skip-forward" /></button>
          </div>
        </template>
        <template v-else-if="replayState === 'paused'">
          <div class="replay-transport">
            <button class="icon-btn mute" @click="$emit('replayStepBack')"><Icon icon="lucide:skip-back" /></button>
            <button class="icon-btn" @click="$emit('replayRun')"><Icon icon="lucide:play" /></button>
            <button class="icon-btn mute" @click="$emit('replayStepFwd')"><Icon icon="lucide:skip-forward" /></button>
          </div>
        </template>
        <template v-else-if="replayState === 'finished'">
          <div class="replay-transport">
            <button class="icon-btn mute" @click="$emit('replayStepBack')"><Icon icon="lucide:skip-back" /></button>
            <button class="icon-btn" @click="$emit('replayRestart')"><Icon icon="lucide:rotate-cw" /></button>
            <button class="icon-btn danger" @click="$emit('replayExit')"><Icon icon="lucide:x" /></button>
          </div>
        </template>

        <button class="popup-action danger" @click="$emit('replayExit')">Cancel</button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { conn } from '../stores/connection';
import { ReplayController } from '../serial/replay';
import type { ReplayState } from '../serial/replay';
import type { RecordState } from '../serial/record';

type ChannelId = 'usb_cdc' | 'uart' | 'wifi' | 'replay';

defineProps<{
  replayCtrl: ReplayController;
  replayState: ReplayState;
  replayCurrent: number;
  replayTotal: number;
  recordState: RecordState;
  uptime: string;
  isReplayActive: boolean;
  allChannels: { id: ChannelId; label: string; icon: string }[];
  activeChannel: ChannelId;
  serialDraft: { baud: number; wifiEndpoint: string };
}>();

defineEmits<{
  selectChannel: [id: ChannelId];
  connect: [];
  disconnect: [];
  replayChooseFile: [];
  replayRun: [];
  replayPause: [];
  replayStepFwd: [];
  replayStepBack: [];
  replayRestart: [];
  replayExit: [];
  replayStartFromPanel: [];
}>();
</script>

<style scoped>
.connection-popup {
  min-width: 280px;
  white-space: normal;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 14px;
  box-shadow: var(--card-shadow);
  backdrop-filter: blur(20px);
  padding: 12px 14px;
  font-size: 13px;
  color: var(--text);
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
.popup-status.replay  { background: rgba(59,130,246,.15); color: #2563eb; }
[data-theme="dark"] .popup-status.online  { background: rgba(74,222,128,.15); color: #4ade80; }
[data-theme="dark"] .popup-status.offline { background: rgba(248,113,113,.15); color: #f87171; }
[data-theme="dark"] .popup-status.replay  { background: rgba(96,165,250,.15); color: #60a5fa; }

.popup-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 3px 0;
  color: var(--text-muted);
}
.popup-row b { color: var(--text); font-weight: 600; }
.popup-hint { color: var(--text-muted); font-size: 12px; }

.connect-panel,
.connected-panel {
  display: grid;
  gap: 10px;
}
.connect-panel {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.connect-channel {
  min-height: 58px;
  display: grid;
  place-items: center;
  gap: 4px;
  border: 1px solid var(--card-border);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text-muted);
  font: inherit;
  font-size: 11px;
  font-weight: 900;
  cursor: pointer;
}
.connect-channel svg { font-size: 18px; }
.connect-channel.active {
  border-color: rgba(32, 184, 166, 0.55);
  color: #0e8a7e;
  background: rgba(32, 184, 166, 0.1);
}
.connect-detail {
  grid-column: 1 / -1;
  min-height: 38px;
  display: flex;
  align-items: center;
  padding: 8px 10px;
  border-radius: 12px;
  background: var(--surface);
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 800;
}
.popup-input {
  width: 100%;
  border: 1px solid var(--card-border);
  border-radius: 10px;
  padding: 8px 10px;
  background: var(--card-bg);
  color: var(--text);
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 12px;
  font-weight: 800;
}
.popup-input:focus { outline: none; border-color: #20b8a6; }
.popup-action {
  grid-column: 1 / -1;
  border: 0;
  border-radius: 12px;
  min-height: 36px;
  background: var(--text);
  color: var(--card-bg);
  font-weight: 900;
  cursor: pointer;
}
.popup-action.danger {
  margin-top: 4px;
  background: #ef4444;
  color: #fff;
}

.popup-enter-active, .popup-leave-active { transition: opacity 150ms, transform 150ms; }
.popup-enter-from, .popup-leave-to { opacity: 0; transform: translateY(-4px) scale(0.97); }

.icon-btn {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  transition: background 150ms, color 150ms, transform 120ms;
}
.icon-btn svg { width: 16px; height: 16px; }
.icon-btn:hover { background: var(--nav-tab-active); }
.icon-btn:active { transform: scale(0.93); }
.icon-btn.mute { color: var(--text-muted); background: transparent; }
.icon-btn.mute:hover { background: var(--surface); }
.icon-btn.danger { color: #ef4444; }
.icon-btn.danger:hover { background: rgba(239,68,68,.12); }
.icon-btn:disabled { opacity: 0.5; cursor: default; }

.replay-file-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  padding-bottom: 4px;
}
.replay-file-row.dim    { color: var(--text-muted); }
.replay-file-row.active { color: #22c55e; }
[data-theme="dark"] .replay-file-row.active { color: #4ade80; }
.replay-file-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.replay-file-icon { width: 16px; height: 16px; flex-shrink: 0; }
.replay-config {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.replay-transport {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  grid-column: 1 / -1;
}
.replay-speed {
  width: 46px;
  flex-shrink: 0;
  border: 1px solid var(--card-border);
  border-radius: 6px;
  padding: 3px 3px;
  background: var(--surface);
  color: var(--text);
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 10px;
  font-weight: 700;
  text-align: right;
}
.replay-speed:focus { outline: none; border-color: #20b8a6; }
.replay-speed::-webkit-outer-spin-button,
.replay-speed::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.replay-speed[type=number] { -moz-appearance: textfield; }
</style>
