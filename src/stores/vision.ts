import { ref, shallowRef } from 'vue';
import type { HomographyMatrix } from '../utils/inversePerspective';

// Trace-Vector visiontest/img/ipm/out/2/calibration.json，原图 -> MCU IPM坐标。
export const DEFAULT_IPM_MATRIX: HomographyMatrix = [
  [2.720928518776746, 3.2917630468134007, -186.28544392101963],
  [-0.05581284033162609, 7.376092034599543, -163.26889439276314],
  [0.0004695697592351547, 0.045766626879301754, 1.0]
];
export const ipmMatrix = shallowRef<HomographyMatrix>(DEFAULT_IPM_MATRIX);
export const ipmEnabled = ref(true);
export const ipmSmoothing = ref(true);
