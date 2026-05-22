<template>
  <div class="card-head">
    <span>{{ label }}</span><b>{{ value }}</b>
  </div>
  <svg :viewBox="`0 0 ${viewW} ${viewH}`" preserveAspectRatio="none" class="card-chart">
    <template v-if="points.length >= 2">
      <path class="card-area" :d="areaPath(points, viewW, viewH, max)" />
      <path class="card-line" :d="linePath(points, viewW, viewH, max)" :style="color ? { stroke: color } : {}" />
    </template>
  </svg>
</template>

<script setup lang="ts">
import { useChartPath } from '../composables/useChartPath';

const props = withDefaults(defineProps<{
  label: string
  value: string
  color?: string
  points: number[]
  max?: number
  padding?: number
  viewW?: number
  viewH?: number
}>(), { max: 100, padding: 9, viewW: 220, viewH: 88 });

const { linePath, areaPath } = useChartPath(props.padding);
</script>

<style scoped>
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text-dim);
  font-size: 11px;
  font-weight: 900;
}
.card-head b {
  color: var(--text);
  font-size: 15px;
}
.card-chart {
  width: 100%;
  flex: 1;
  min-height: 0;
  margin-top: 8px;
}
.card-area { fill: rgba(214, 232, 115, 0.28); }
.card-line { fill: none; stroke: #c7d54f; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
</style>
