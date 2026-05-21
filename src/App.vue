<template>
  <TelemetryDashboard />
</template>

<script setup lang="ts">
import TelemetryDashboard from './views/TelemetryDashboard.vue'
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  font-family: inherit;
}

html, body {
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: Inter, "Segoe UI", sans-serif;
}

#app {
  width: 100%;
  height: 100%;
}

/* ── Light theme (default) ── */
:root {
  --bg: radial-gradient(circle at 12% 8%,rgba(255,226,105,.95),transparent 30%),
        radial-gradient(circle at 78% 0%,rgba(35,172,232,.9),transparent 34%),
        radial-gradient(circle at 96% 46%,rgba(35,197,150,.78),transparent 25%),
        linear-gradient(135deg,#ffe56d 0%,#f5d7df 35%,#22ace3 73%,#2bc79f 100%);
  --card-bg: rgba(255,255,255,.92);
  --card-border: rgba(255,255,255,.62);
  --card-shadow: 0 28px 80px rgba(68,92,110,.18);
  --surface: rgba(246,246,241,.82);
  --surface-alt: #f6f6f1;
  --text: #242424;
  --text-muted: rgba(36,36,36,.52);
  --text-dim: rgba(36,36,36,.48);
  --nav-tab-bg: rgba(255,255,255,.18);
  --nav-tab-active: rgba(255,255,255,.92);
  --log-warn-bg: #fff8dd;
  --log-warn-text: #9b7a16;
  --log-err-bg: #fff0f0;
  --log-err-text: #b44848;
}

/* ── Dark theme ── */
[data-theme="dark"] {
  --bg: radial-gradient(circle at 12% 8%,rgba(255,180,50,.18),transparent 30%),
        radial-gradient(circle at 78% 0%,rgba(35,172,232,.22),transparent 34%),
        radial-gradient(circle at 96% 46%,rgba(35,197,150,.18),transparent 25%),
        linear-gradient(135deg,#1a1d2e 0%,#1e2235 40%,#1a2530 70%,#182820 100%);
  --card-bg: rgba(48,54,72,.92);
  --card-border: rgba(255,255,255,.12);
  --card-shadow: 0 28px 80px rgba(0,0,0,.35);
  --surface: rgba(255,255,255,.10);
  --surface-alt: rgba(255,255,255,.08);
  --text: rgba(255,255,255,.92);
  --text-muted: rgba(255,255,255,.45);
  --text-dim: rgba(255,255,255,.35);
  --nav-tab-bg: rgba(255,255,255,.08);
  --nav-tab-active: rgba(255,255,255,.14);
  --log-warn-bg: rgba(155,122,22,.18);
  --log-warn-text: #f0c84a;
  --log-err-bg: rgba(180,72,72,.18);
  --log-err-text: #f08080;
}

/* ── Scrollbar ── */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: var(--text-dim);
  border-radius: 999px;
}
::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
* { scrollbar-width: thin; scrollbar-color: var(--text-dim) transparent; }
</style>
