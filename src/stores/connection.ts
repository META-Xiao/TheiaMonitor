import { reactive } from "vue";

export const conn = reactive({
  connected: false,
  mcuName: "",
  portLabel: "",
  connectedAt: null as number | null,
});
