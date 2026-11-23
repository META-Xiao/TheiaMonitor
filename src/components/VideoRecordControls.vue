<template>
  <template v-if="video">
    <button v-if="!video.recording.value" class="ctrl-btn" title="Record" :disabled="!hasSignal" @click="video.start">
      <Icon icon="lucide:video" />
    </button>
    <template v-else>
      <button class="ctrl-btn recording" :title="video.paused.value ? 'Resume recording' : 'Pause recording'"
        :disabled="video.stopping.value" @click="video.togglePause">
        <Icon :icon="video.paused.value ? 'lucide:play' : 'lucide:pause'" />
      </button>
      <button class="ctrl-btn stop" title="Stop & Save" :disabled="video.stopping.value" @click="video.stop">
        <Icon icon="lucide:square" />
      </button>
    </template>
    <span v-if="video.error.value" class="record-error" role="alert">{{ video.error.value }}</span>
  </template>
</template>

<script setup lang="ts">
import { inject } from 'vue';
import { Icon } from '@iconify/vue';
import { visionRecordingKey } from '../composables/useVisionRecording';
defineProps<{ hasSignal: boolean }>();
const video = inject(visionRecordingKey);
</script>

<style scoped>
.record-error { max-width: 240px; color: #d65a66; font-size: 11px; font-weight: 500; }
button:disabled { opacity: .4; cursor: default; }
</style>
