<template>
  <div class="app-select" :class="{ open }" ref="root">
    <button class="trigger" @click="open = !open" type="button">
      <span>{{ selectedLabel }}</span>
      <svg class="chevron" width="12" height="8" viewBox="0 0 12 8" fill="none">
        <path d="M1 1l5 5 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </button>
    <Transition name="drop">
      <ul v-if="open" class="dropdown">
        <li
          v-for="opt in options"
          :key="opt.value"
          :class="{ selected: opt.value === modelValue }"
          @click="select(opt.value)"
        >{{ opt.label }}</li>
      </ul>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

interface Option { value: string | number; label: string }
const props = defineProps<{ modelValue: string | number; options: Option[] }>()
const emit = defineEmits<{ 'update:modelValue': [v: string | number] }>()

const open = ref(false)
const root = ref<HTMLElement>()

const selectedLabel = computed(
  () => props.options.find(o => o.value === props.modelValue)?.label ?? ''
)

const select = (v: string | number) => { emit('update:modelValue', v); open.value = false }

const onOutside = (e: MouseEvent) => {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false
}
onMounted(() => document.addEventListener('mousedown', onOutside))
onBeforeUnmount(() => document.removeEventListener('mousedown', onOutside))
</script>

<style scoped>
.app-select { position: relative; width: 100%; }

.trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  border: 1.5px solid rgba(36,36,36,.12);
  border-radius: 10px;
  background: rgba(246,246,241,.82);
  font-size: 14px;
  font-weight: 700;
  color: #242424;
  cursor: pointer;
  text-align: left;
  transition: border-color 150ms, box-shadow 150ms;
}
.trigger:hover { border-color: rgba(36,36,36,.25); }
.app-select.open .trigger {
  border-color: #20b8a6;
  box-shadow: 0 0 0 3px rgba(32,184,166,.15);
}

.chevron {
  flex-shrink: 0;
  color: rgba(36,36,36,.45);
  transition: transform 200ms;
}
.app-select.open .chevron { transform: rotate(180deg); }

.dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0; right: 0;
  z-index: 100;
  list-style: none;
  margin: 0; padding: 6px;
  background: rgba(255,255,255,.96);
  border: 1px solid rgba(255,255,255,.62);
  border-radius: 14px;
  box-shadow: 0 16px 48px rgba(68,92,110,.18);
  backdrop-filter: blur(22px);
  max-height: 240px;
  overflow-y: auto;
}

.dropdown li {
  padding: 9px 12px;
  border-radius: 9px;
  font-size: 14px;
  font-weight: 700;
  color: rgba(36,36,36,.7);
  cursor: pointer;
  transition: background 100ms, color 100ms;
}
.dropdown li:hover { background: rgba(32,184,166,.1); color: #242424; }
.dropdown li.selected { background: rgba(32,184,166,.15); color: #0e8a7e; }

/* 动画 */
.drop-enter-active { transition: opacity 150ms, transform 150ms; }
.drop-leave-active { transition: opacity 100ms, transform 100ms; }
.drop-enter-from, .drop-leave-to { opacity: 0; transform: translateY(-6px); }
</style>
