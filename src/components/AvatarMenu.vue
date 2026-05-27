<template>
  <!-- Desktop: avatar-wrap in top nav -->
  <div v-if="!mobile" class="avatar-wrap">
    <Transition name="slide-left">
      <div v-if="conn.connected && !isReplayActive" class="rec-float">
        <template v-if="recordState === 'idle'">
          <button class="rec-circle" @click.stop="recordStart" title="Record"><Icon icon="lucide:circle" /></button>
        </template>
        <template v-else-if="recordState === 'recording'">
          <button class="rec-icon" @click.stop="recordPause" title="Pause"><Icon icon="lucide:pause" /></button>
          <button class="rec-icon stop" @click.stop="recordStop" title="Stop"><Icon icon="lucide:square" /></button>
        </template>
        <template v-else-if="recordState === 'paused'">
          <button class="rec-icon" @click.stop="recordResume" title="Resume"><Icon icon="lucide:play" /></button>
          <button class="rec-icon stop" @click.stop="recordStop" title="Stop"><Icon icon="lucide:square" /></button>
        </template>
      </div>
    </Transition>

    <div class="avatar" :class="avatarRingClass" @click.stop="open = !open">
      {{ avatarText }}
      <Transition name="popup">
        <PopupContent
          v-if="open"
          :replay-ctrl="replayCtrl"
          :replay-state="replayState"
          :replay-current="replayCurrent"
          :replay-total="replayTotal"
          :record-state="recordState"
          :uptime="uptime"
          :is-replay-active="isReplayActive"
          :all-channels="allChannels"
          :active-channel="activeChannel"
          :serial-draft="serialDraft"
          class="avatar-popup"
          @select-channel="activeChannel = $event"
          @connect="onConnect"
          @disconnect="$emit('disconnect')"
          @replay-choose-file="replayChooseFile"
          @replay-run="replayRun"
          @replay-pause="replayPause"
          @replay-step-fwd="replayStepFwd"
          @replay-step-back="replayStepBack"
          @replay-restart="replayRestart"
          @replay-exit="replayExit"
          @replay-start-from-panel="replayStartFromPanel"
        />
      </Transition>
    </div>
  </div>

  <!-- Mobile: avatar-m in bottom nav -->
  <template v-else>
    <div class="avatar-m" :class="avatarRingClass" @click.stop="open = !open">
      {{ avatarText }}
    </div>
    <Teleport to="body">
      <Transition name="popup">
        <PopupContent
          v-if="open"
          :replay-ctrl="replayCtrl"
          :replay-state="replayState"
          :replay-current="replayCurrent"
          :replay-total="replayTotal"
          :record-state="recordState"
          :uptime="uptime"
          :is-replay-active="isReplayActive"
          :all-channels="allChannels"
          :active-channel="activeChannel"
          :serial-draft="serialDraft"
          class="avatar-popup-m-fixed"
          @select-channel="activeChannel = $event"
          @connect="onConnect"
          @disconnect="$emit('disconnect')"
          @replay-choose-file="replayChooseFile"
          @replay-run="replayRun"
          @replay-pause="replayPause"
          @replay-step-fwd="replayStepFwd"
          @replay-step-back="replayStepBack"
          @replay-restart="replayRestart"
          @replay-exit="replayExit"
          @replay-start-from-panel="replayStartFromPanel"
        />
      </Transition>
    </Teleport>
  </template>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { conn } from '../stores/connection';
import { ReplayController } from '../serial/replay';
import type { ReplayState } from '../serial/replay';
import { RecordController } from '../serial/record';
import type { RecordState } from '../serial/record';
import PopupContent from './PopupContent.vue';

const props = withDefaults(defineProps<{
  replayCtrl: ReplayController;
  recordCtrl: RecordController;
  replayState: ReplayState;
  replayCurrent: number;
  replayTotal: number;
  recordState: RecordState;
  uptime: string;
  mobile?: boolean;
}>(), { mobile: false });

const emit = defineEmits<{
  connect: [channel: ChannelId, baud: number, wifiEndpoint: string];
  disconnect: [];
}>();

const open = ref(false);

const isReplayActive = computed(() => props.replayState !== 'idle' && props.replayState !== 'loading');

const avatarRingClass = computed(() => {
  if (isReplayActive.value) return 'replay';
  if (conn.connected) return 'online';
  return 'offline';
});

const avatarText = computed(() => {
  if (isReplayActive.value) return '▶';
  if (conn.connected) return (conn.mcuName || 'MC').slice(0, 2).toUpperCase() + '.';
  return 'TV';
});

type ChannelId = 'usb_cdc' | 'uart' | 'wifi' | 'replay';
const allChannels: { id: ChannelId; label: string; icon: string }[] = [
  { id: 'usb_cdc', label: 'USB-CDC', icon: 'lucide:usb' },
  { id: 'uart', label: 'UART', icon: 'lucide:cable' },
  { id: 'wifi', label: 'WIFI', icon: 'lucide:wifi' },
  { id: 'replay', label: 'Replay', icon: 'lucide:film' },
];
const activeChannel = ref<ChannelId>('usb_cdc');

const serialDraft = reactive({
  baud: 115200,
  wifiEndpoint: '192.168.4.1:8080',
});

function onConnect() {
  open.value = false;
  emit('connect', activeChannel.value, serialDraft.baud, serialDraft.wifiEndpoint);
}

function recordStart() { props.recordCtrl.start(); }
function recordPause() { props.recordCtrl.pause(); }
function recordResume() { props.recordCtrl.resume(); }
function recordStop() { props.recordCtrl.stop(); }

let _replayFileInput: HTMLInputElement | null = null;
function replayChooseFile() {
  if (!_replayFileInput) {
    _replayFileInput = document.createElement('input');
    _replayFileInput.type = 'file';
    _replayFileInput.accept = '.bin';
    _replayFileInput.addEventListener('change', () => {
      const f = _replayFileInput?.files?.[0];
      if (f) props.replayCtrl.loadFile(f);
    });
  }
  _replayFileInput.click();
}

function replayRun() { props.replayCtrl.play(); }
function replayPause() { props.replayCtrl.pause(); }
function replayStepFwd() { props.replayCtrl.stepForward(); }
function replayStepBack() { props.replayCtrl.stepBackward(); }
function replayRestart() { props.replayCtrl.replay(); }
function replayExit() { props.replayCtrl.exit(); }
function replayStartFromPanel() {
  if (props.replayState === 'ready') props.replayCtrl.play();
}

defineExpose({
  closePopups() { open.value = false; },
});
</script>

<style scoped>
.avatar-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  position: relative;
}

.rec-float {
  display: flex;
  align-items: center;
  gap: 4px;
}
.rec-circle {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
  cursor: pointer;
  transition: background 150ms, transform 120ms;
}
.rec-circle:hover { background: rgba(239, 68, 68, 0.22); }
.rec-circle:active { transform: scale(0.93); }
.rec-circle svg { width: 14px; height: 14px; }
.rec-icon {
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
.rec-icon svg { width: 16px; height: 16px; }
.rec-icon:hover { background: var(--nav-tab-active); }
.rec-icon:active { transform: scale(0.93); }
.rec-icon.stop { color: #ef4444; }
.rec-icon.stop:hover { background: rgba(239, 68, 68, 0.12); }

.slide-left-enter-active,
.slide-left-leave-active { transition: all 220ms cubic-bezier(0.4, 0, 0.2, 1); }
.slide-left-enter-from,
.slide-left-leave-to { opacity: 0; transform: translateX(12px); }

.avatar {
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
.avatar.replay  { box-shadow: 0 0 0 2.5px #3b82f6, 0 12px 34px rgba(33,58,75,.12); }
[data-theme="dark"] .avatar.online  { box-shadow: 0 0 0 2.5px #4ade80, 0 12px 34px rgba(0,0,0,.25); }
[data-theme="dark"] .avatar.offline { box-shadow: 0 0 0 2.5px #f87171, 0 12px 34px rgba(0,0,0,.25); }
[data-theme="dark"] .avatar.replay  { box-shadow: 0 0 0 2.5px #60a5fa, 0 12px 34px rgba(0,0,0,.25); }

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
.avatar-m.replay  { box-shadow: 0 0 0 2.5px #3b82f6; }
[data-theme="dark"] .avatar-m.online  { box-shadow: 0 0 0 2.5px #4ade80; }
[data-theme="dark"] .avatar-m.offline { box-shadow: 0 0 0 2.5px #f87171; }
[data-theme="dark"] .avatar-m.replay  { box-shadow: 0 0 0 2.5px #60a5fa; }
</style>
