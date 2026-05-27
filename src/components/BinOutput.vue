<template>
  <div class="bin-output">
    <div class="bin-head">
      <span>MCU Binout</span>
      <span class="bin-legend">
        <span class="legend-dot cc" />0xCC Image
        <span class="legend-dot dd" />0xDD Log
        <span class="legend-dot ee" />0xEE Resource
      </span>
      <em :class="status">{{ statusText }}</em>
    </div>
    <div class="bin-body">
      <div v-if="!chunks.length" class="bin-empty">Waiting for data...</div>
      <div
        v-for="(chunk, ci) in visibleChunks"
        :key="ci"
        class="bin-chunk"
      >
        <div class="chunk-header" :class="chunkHeaderClass(chunk)">
          <span>{{ chunkLabel(chunk) }}</span>
          <span>{{ chunk.bytes.length }} bytes</span>
        </div>
        <div
          v-for="line in chunk.lines"
          :key="line.offset"
          class="bin-line"
          :class="lineClass(line.offset, chunk)"
          @mouseenter="hoveredLine = line"
          @mouseleave="hoveredLine = null"
        >
          <span class="bin-offset">{{ hex(line.offset, 6) }}</span>
          <span class="bin-hex">
            <span
              v-for="b in line.bytes"
              :key="b.offset"
              class="bin-byte"
              :class="byteClass(b.offset, chunk)"
              :title="byteTitle(b.offset, chunk)"
            >{{ hex(b.value, 2) }}</span>
          </span>
          <span class="bin-ascii">{{ line.ascii }}</span>
        </div>
      </div>
    </div>
    <div v-if="hoveredLine" class="bin-tooltip">
      <div v-for="info in hoveredLine.tooltips" :key="info.offset">{{ info.label }}: {{ info.value }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, shallowRef } from 'vue';

interface Chunk {
  bytes: Uint8Array;
  type: number; // 0xCC, 0xDD, 0xEE, or 0 for unrecognized
}

interface LineInfo {
  offset: number;
  bytes: { offset: number; value: number }[];
  ascii: string;
  tooltips: { offset: number; label: string; value: string }[];
}

const props = defineProps<{
  status: 'offline' | 'live' | 'replay';
}>();

const statusText = computed(() => {
  if (props.status === 'replay') return 'REPLAY';
  if (props.status === 'live') return 'LIVE';
  return 'OFFLINE';
});

// ── Chunk buffer (batched via rAF to avoid blocking vision stream) ──
const chunks = shallowRef<Chunk[]>([]);
const displays = shallowRef<ChunkDisplay[]>([]);
const MAX_CHUNKS = 32;

let pending: Uint8Array[] = [];
let rafId = 0;

function flush() {
  rafId = 0;
  if (!pending.length) return;

  // Merge pending data into chunks in one batch
  const batch = pending;
  pending = [];
  const newChunks = batch.map(data => {
    const type = classifyFrame(data);
    return { bytes: data, type } as Chunk;
  });

  const cur = chunks.value;
  const merged = [...cur, ...newChunks].slice(-MAX_CHUNKS);
  chunks.value = merged;

  // Only rebuild displays for chunks that are actually new or changed
  const startIdx = Math.max(0, merged.length - newChunks.length);
  const rebuilt = displays.value.slice(0, startIdx);
  for (let i = startIdx; i < merged.length; i++) {
    rebuilt.push(buildChunkDisplay(merged[i]));
  }
  displays.value = rebuilt;
}

function pushRawData(data: Uint8Array) {
  pending.push(data);
  if (!rafId) {
    rafId = requestAnimationFrame(flush);
  }
}

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId);
});

function classifyFrame(data: Uint8Array): number {
  for (let i = 0; i < Math.min(data.length, 32); i++) {
    const b = data[i];
    if (b === 0xCC || b === 0xDD || b === 0xEE) return b;
  }
  return 0;
}

// ── Build lines for each chunk ──
interface ChunkDisplay {
  bytes: Uint8Array;
  type: number;
  frameNum: number;
  lines: LineInfo[];
  headerOffset: number;
  dataStart: number;
  dataEnd: number;
  checksumOffset: number;
}

function buildChunkDisplay(c: Chunk): ChunkDisplay {
  const bytes = c.bytes;
  const lines: LineInfo[] = [];
  let headerEnd = 0;

  // Simple frame structure guess:
  // Byte 0: sync (0xCC/0xDD/0xEE)
  // Byte 1-3: frame length (LE)
  // Byte 4-5: frame number (LE)
  // Remaining bytes: data + optional checksum at end
  const sync = bytes[0];
  let frameLen = 0;
  let frameNum = 0;
  let checksumOffset = -1;

  if (bytes.length >= 6 && (sync === 0xCC || sync === 0xDD || sync === 0xEE)) {
    frameLen = bytes[1] | (bytes[2] << 8) | (bytes[3] << 16);
    frameNum = bytes[4] | (bytes[5] << 8);
    headerEnd = 6;
    if (bytes.length >= frameLen + 1 && frameLen > 0) {
      checksumOffset = frameLen; // checksum at end of frame data
    }
  }

  const dataStart = headerEnd;
  const dataEnd = checksumOffset >= 0 ? checksumOffset : bytes.length;

  const BYTES_PER_LINE = 16;
  for (let off = 0; off < bytes.length; off += BYTES_PER_LINE) {
    const lineBytes: LineInfo['bytes'] = [];
    const tooltips: LineInfo['tooltips'] = [];
    let ascii = '';

    for (let i = 0; i < BYTES_PER_LINE && off + i < bytes.length; i++) {
      const absOff = off + i;
      const val = bytes[absOff];
      lineBytes.push({ offset: absOff, value: val });
      ascii += (val >= 0x20 && val < 0x7f) ? String.fromCharCode(val) : '.';

      // Tooltip for known fields
      if (absOff === 0 && (val === 0xCC || val === 0xDD || val === 0xEE)) {
        tooltips.push({ offset: absOff, label: 'Sync', value: `0x${val.toString(16).toUpperCase()} (${syncLabel(val)})` });
      } else if (absOff >= 1 && absOff <= 3 && sync !== 0) {
        tooltips.push({ offset: absOff, label: `FrameLen[${absOff - 1}]`, value: `0x${val.toString(16).toUpperCase().padStart(2, '0')}` });
      } else if (absOff >= 4 && absOff <= 5 && sync !== 0) {
        tooltips.push({ offset: absOff, label: `FrameNum[${absOff - 4}]`, value: `0x${val.toString(16).toUpperCase().padStart(2, '0')}` });
      } else if (absOff === checksumOffset) {
        tooltips.push({ offset: absOff, label: 'Checksum', value: `0x${val.toString(16).toUpperCase().padStart(2, '0')}` });
      }
    }

    lines.push({ offset: off, bytes: lineBytes, ascii, tooltips });
  }

  return {
    bytes,
    type: sync,
    frameNum,
    lines,
    headerOffset: 0,
    dataStart,
    dataEnd,
    checksumOffset,
  };
}

function syncLabel(b: number): string {
  if (b === 0xCC) return 'Image';
  if (b === 0xDD) return 'Log';
  if (b === 0xEE) return 'Resource';
  return 'Unknown';
}

// ── Display: show last N chunks ──
const VISIBLE_WINDOW = 6;

const visibleChunks = computed(() => {
  return displays.value.slice(-VISIBLE_WINDOW);
});

// ── Styling helpers ──
function chunkHeaderClass(c: ChunkDisplay): string {
  if (c.type === 0xCC) return 'type-cc';
  if (c.type === 0xDD) return 'type-dd';
  if (c.type === 0xEE) return 'type-ee';
  return '';
}

function chunkLabel(c: ChunkDisplay): string {
  const num = c.frameNum > 0 ? ` #${c.frameNum}` : '';
  if (c.type === 0xCC) return `FRAME 0xCC${num} — Image`;
  if (c.type === 0xDD) return `FRAME 0xDD${num} — Log`;
  if (c.type === 0xEE) return `FRAME 0xEE${num} — Resource`;
  return `RAW — ${c.bytes.length}B`;
}

function lineClass(offset: number, c: ChunkDisplay): string {
  if (offset < c.dataStart) return 'field-header';
  if (c.checksumOffset >= 0 && offset <= c.checksumOffset && offset + 16 > c.checksumOffset) return 'field-checksum';
  if (offset >= c.dataStart && offset < c.dataEnd) return 'field-data';
  return '';
}

function byteClass(offset: number, c: ChunkDisplay): string {
  if (offset === c.checksumOffset) return 'is-checksum';
  if (offset < c.dataStart) return 'is-header';
  if (offset >= c.dataStart && offset < c.dataEnd) return 'is-data';
  return '';
}

function byteTitle(offset: number, c: ChunkDisplay): string {
  if (offset === 0) return `Sync: 0x${c.bytes[0]?.toString(16).toUpperCase()}`;
  if (offset === c.checksumOffset) return 'Checksum';
  if (offset < c.dataStart) return `Header byte ${offset}`;
  if (offset >= c.dataStart && offset < c.dataEnd) return `Data byte ${offset - c.dataStart}`;
  return `Byte ${offset}`;
}

function hex(n: number, w: number): string {
  return n.toString(16).toUpperCase().padStart(w, '0');
}

// ── Tooltip ──
const hoveredLine = ref<LineInfo | null>(null);

defineExpose({ pushRawData });
</script>

<style scoped>
.bin-output {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  box-shadow: var(--card-shadow);
  backdrop-filter: blur(22px);
  border-radius: 24px;
  padding: 18px;
  max-height: 220px;
  position: relative;
}
.bin-head {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-bottom: 8px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.08em;
  flex-shrink: 0;
}
.bin-head em {
  font-style: normal;
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 999px;
  margin-left: auto;
}
.bin-head em.live    { background: rgba(32,184,166,.15); color: #20b8a6; }
.bin-head em.offline { background: rgba(239,68,68,.12);  color: #ef4444; }
.bin-head em.replay  { background: rgba(59,130,246,.15); color: #2563eb; }
[data-theme="dark"] .bin-head em.live    { background: rgba(74,222,128,.15); color: #4ade80; }
[data-theme="dark"] .bin-head em.offline { background: rgba(248,113,113,.15); color: #f87171; }
[data-theme="dark"] .bin-head em.replay  { background: rgba(96,165,250,.15); color: #60a5fa; }

.bin-legend {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  font-size: 10px;
}
.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  display: inline-block;
  margin-right: 3px;
}
.legend-dot.cc { background: #6366f1; }
.legend-dot.dd { background: #f59e0b; }
.legend-dot.ee { background: #22c55e; }

.bin-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 11px;
  line-height: 1.6;
}
.bin-empty {
  color: var(--text-dim);
  padding: 16px;
  text-align: center;
}

.bin-chunk {
  margin-bottom: 4px;
}
.chunk-header {
  display: flex;
  justify-content: space-between;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 700;
  font-size: 10px;
  margin-bottom: 2px;
}
.chunk-header.type-cc { background: rgba(99,102,241,.12);  color: #6366f1; }
.chunk-header.type-dd { background: rgba(245,158,11,.12);  color: #f59e0b; }
.chunk-header.type-ee { background: rgba(34,197,94,.12);  color: #16a34a; }
[data-theme="dark"] .chunk-header.type-cc { color: #818cf8; }
[data-theme="dark"] .chunk-header.type-dd { color: #fbbf24; }
[data-theme="dark"] .chunk-header.type-ee { color: #4ade80; }

.bin-line {
  display: flex;
  gap: 12px;
  padding: 0 6px;
  border-radius: 2px;
  white-space: nowrap;
}
.bin-line.field-header  { background: rgba(99,102,241,.06); }
.bin-line.field-data    { background: transparent; }
.bin-line.field-checksum { background: rgba(239,68,68,.06); }

.bin-offset { color: var(--text-dim); min-width: 54px; }
.bin-hex { display: flex; gap: 2px; flex: 1; }
.bin-byte { cursor: default; min-width: 16px; text-align: center; }
.bin-byte.is-header   { color: #6366f1; font-weight: 700; }
.bin-byte.is-data     { color: var(--text); }
.bin-byte.is-checksum { color: #ef4444; font-weight: 700; }
[data-theme="dark"] .bin-byte.is-header { color: #818cf8; }
.bin-ascii { color: var(--text-dim); min-width: 120px; letter-spacing: 0.5px; }

.bin-tooltip {
  position: absolute;
  bottom: 8px;
  left: 8px;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 10px;
  font-family: "JetBrains Mono", Consolas, monospace;
  color: var(--text);
  box-shadow: var(--card-shadow);
  z-index: 10;
  pointer-events: none;
}
.bin-tooltip > div { padding: 1px 0; }
</style>
