<template>
  <svg class="circle-gauge" :viewBox="`0 0 ${size} ${size}`">
    <!-- 背景圆 -->
    <circle
      :cx="size / 2"
      :cy="size / 2"
      :r="radius"
      fill="none"
      :stroke="backgroundColor"
      :stroke-width="strokeWidth"
    />

    <!-- 进度圆 -->
    <circle
      :cx="size / 2"
      :cy="size / 2"
      :r="radius"
      fill="none"
      :stroke="color"
      :stroke-width="strokeWidth"
      :stroke-dasharray="circumference"
      :stroke-dashoffset="strokeOffset"
      stroke-linecap="round"
      class="progress-circle"
      :style="{ filter: `drop-shadow(0 0 8px ${color}44)` }"
    />

    <!-- 中心百分比显示 -->
    <text
      :x="size / 2"
      :y="size / 2"
      text-anchor="middle"
      dominant-baseline="central"
      class="gauge-text"
      :style="{ fill: color, fontSize: size * 0.3 }"
    >
      {{ displayValue }}
    </text>
  </svg>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

interface Props {
  value: number
  color?: string
  size?: number
  strokeWidth?: number
}

const props = withDefaults(defineProps<Props>(), {
  color: '#FF6B35',
  size: 100,
  strokeWidth: 4,
})

const radius = computed(() => (props.size - props.strokeWidth) / 2)
const circumference = computed(() => 2 * Math.PI * radius.value)
const displayValue = ref(0)

// 计算当前进度的 stroke-dashoffset
const strokeOffset = computed(() => {
  const progress = displayValue.value / 100
  return circumference.value * (1 - progress)
})

const backgroundColor = '#edf0e8'

// 动画更新值 - 使用 requestAnimationFrame
const animateValue = (newVal: number) => {
  const startValue = displayValue.value
  const duration = 600
  const startTime = Date.now()

  const updateValue = () => {
    const elapsed = Date.now() - startTime
    const progress = Math.min(elapsed / duration, 1)

    // easeOutQuad
    const easeProgress = 1 - Math.pow(1 - progress, 2)
    displayValue.value = Math.round(startValue + (newVal - startValue) * easeProgress)

    if (progress < 1) {
      requestAnimationFrame(updateValue)
    }
  }

  requestAnimationFrame(updateValue)
}

watch(
  () => props.value,
  (newVal) => {
    animateValue(newVal)
  },
  { immediate: true }
)
</script>

<style scoped>
.circle-gauge {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
  filter: drop-shadow(0 0 4px rgba(255, 107, 53, 0.2));
}

.progress-circle {
  transition: stroke-width 200ms ease-out;
  animation: gaugeGlow 2s ease-in-out infinite;
}

@keyframes gaugeGlow {
  0%, 100% {
    filter: drop-shadow(0 0 8px rgba(255, 107, 53, 0.4));
  }
  50% {
    filter: drop-shadow(0 0 16px rgba(255, 107, 53, 0.8));
  }
}

.gauge-text {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 700;
  letter-spacing: 1px;
  text-shadow: 0 0 8px rgba(255, 107, 53, 0.3);
}
</style>
