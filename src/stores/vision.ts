import { ref, shallowRef } from 'vue';
import type { HomographyMatrix } from '../utils/inversePerspective';

// Trace-Vector visiontest/img/ipm/out/1/calibration.json，原图 -> MCU IPM坐标。
export const DEFAULT_IPM_MATRIX: HomographyMatrix = [
  [
    2.4459226219741015,
    2.6554207223001196,
    -174.30282296892608
  ],
  [
    -0.07917299420578985,
    7.103378765410719,
    -101.26149331737273
  ],
  [
    0.0008512381275615477,
    0.0391843035530464,
    1.0
  ]
];
export const ipmMatrix = shallowRef<HomographyMatrix>(DEFAULT_IPM_MATRIX);
export const ipmEnabled = ref(true);
export const ipmSmoothing = ref(true);
