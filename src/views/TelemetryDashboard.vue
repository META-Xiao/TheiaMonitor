<template>
  <div class="telemetry-dashboard">
    <!-- 顶部导航栏 - 液体玻璃特效 -->
    <nav class="navbar">
      <div class="navbar-content">
        <button
          v-for="(tab, index) in tabs"
          :key="tab"
          :class="['nav-item', { active: activeTab === index }]"
          @click="activeTab = index"
        >
          <span class="nav-label">{{ tab }}</span>
          <div v-if="activeTab === index" class="nav-indicator" />
        </button>
      </div>
    </nav>

    <!-- 总览页面 -->
    <div v-show="activeTab === 0" class="overview-page">
      <!-- 左侧面板 30% -->
      <div class="left-panel">
        <!-- 1. CPU/RAM/ROM 仪表盘 Card -->
        <div class="gauges-card">
          <div class="card-title">系统状态</div>
          <div class="gauges-container">
            <div class="gauge-item">
              <div class="gauge-label">CPU</div>
              <CircleGauge :value="resourceData.cpuUsage" color="#FF6B35" />
              <div class="gauge-value">{{ resourceData.cpuUsage }}%</div>
            </div>
            <div class="gauge-item">
              <div class="gauge-label">RAM</div>
              <CircleGauge :value="resourceData.ramUsage" color="#00B4A6" />
              <div class="gauge-value">{{ resourceData.ramUsage }}%</div>
            </div>
            <div class="gauge-item">
              <div class="gauge-label">ROM</div>
              <CircleGauge :value="65" color="#FFD700" />
              <div class="gauge-value">65%</div>
            </div>
          </div>
        </div>

        <!-- 2. 速度和舵机 Card -->
        <div class="motion-card">
          <div class="card-title">运动状态</div>
          <div class="motion-item">
            <svg class="motion-icon" viewBox="0 0 24 24">
              <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8m.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
            </svg>
            <div class="motion-info">
              <div class="motion-label">速度</div>
              <div class="motion-value">{{ (resourceData.speed / 1000).toFixed(2) }} m/s</div>
            </div>
          </div>
          <div class="motion-item">
            <svg class="motion-icon" viewBox="0 0 24 24">
              <path fill="currentColor" d="M7 14c-1.66 0-3 1.34-3 3 0 1.31-1.16 2-2 2s-2-.69-2-2c0-2.52 1.17-4.68 2.85-6.15C2.62 10.29 1 8.3 1 6c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .99-.406 1.921-1.064 2.579.577.585 1.144 1.228 1.664 1.982C9.348 8.667 10 7.9 10 7c0-3.315-2.685-6-6-6S-2 3.685-2 7c0 2.165 1.193 4.049 2.95 5.061C.594 13.33-.5 15.295-.5 17.5c0 3.038 2.463 5.5 5.5 5.5s5.5-2.462 5.5-5.5c0-1.65-.72-3.113-1.854-4.121z" />
            </svg>
            <div class="motion-info">
              <div class="motion-label">舵机</div>
              <div class="motion-value">{{ (resourceData.servoAngle / 10).toFixed(1) }}°</div>
            </div>
          </div>
        </div>

        <!-- 3. 日志 Card -->
        <div class="log-card">
          <div class="card-title">运行日志</div>
          <div class="log-content">
            <div
              v-for="(log, idx) in logHistory.slice(-5)"
              :key="idx"
              class="log-line"
            >
              <span class="log-time">{{ formatTime(log.timestamp) }}</span>
              <span class="log-text">{{ log.text }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 中间面板 50% - 图传显示 -->
      <div class="center-panel">
        <div class="image-display">
          <div class="image-placeholder">
            <div class="floating-border" />
            <div class="image-label">图传 - 188×120</div>
            <canvas ref="imageCanvas" class="image-canvas" />
          </div>
          <div class="image-stats">
            <span>帧率: {{ imageStats.fps.toFixed(1) }} FPS</span>
            <span>丢帧: {{ imageStats.droppedFrames }}</span>
          </div>
        </div>
      </div>

      <!-- 右侧面板 20% - MCU Log -->
      <div class="right-panel">
        <div class="mcu-log-card">
          <div class="card-title">单片机输出</div>
          <div class="mcu-log-content">
            <div
              v-for="(log, idx) in mcuLogs.slice(-10)"
              :key="idx"
              class="mcu-log-line"
              :class="{ error: log.includes('ERROR'), warn: log.includes('WARN') }"
            >
              {{ log }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 图传页面 -->
    <div v-show="activeTab === 1" class="image-page">
      <div class="page-placeholder">图传页面 - 建设中</div>
    </div>

    <!-- 设置页面 -->
    <div v-show="activeTab === 2" class="settings-page">
      <div class="page-placeholder">设置页面 - 建设中</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue'
import CircleGauge from '../components/CircleGauge.vue'

interface ResourceData {
  cpuUsage: number
  ramUsage: number
  speed: number
  servoAngle: number
  timestamp: number
}

interface LogEntry {
  text: string
  timestamp: number
}

const tabs = ['总览', '图传', '设置']
const activeTab = ref(0)

const resourceData = reactive<ResourceData>({
  cpuUsage: 45,
  ramUsage: 60,
  speed: 150,
  servoAngle: 250,
  timestamp: Date.now(),
})

const imageStats = reactive({
  fps: 25,
  droppedFrames: 0,
})

const logHistory = ref<LogEntry[]>([
  { text: '系统启动', timestamp: Date.now() - 5000 },
  { text: '串口已连接', timestamp: Date.now() - 4000 },
  { text: '图传已开启', timestamp: Date.now() - 3000 },
  { text: '资源监控激活', timestamp: Date.now() - 2000 },
  { text: '一切正常', timestamp: Date.now() - 1000 },
])

const mcuLogs = ref<string[]>([
  '[00:00:01] MCU 启动完成',
  '[00:00:02] 图像传感器初始化',
  '[00:00:03] 舵机控制系统就绪',
  '[00:00:04] 电机驱动激活',
  '[00:00:05] 所有外设准备完毕',
  '[00:01:00] [INFO] CPU 占用: 45%',
  '[00:01:01] [INFO] RAM 占用: 60%',
  '[00:01:02] [INFO] 速度: 150 mm/s',
])

const imageCanvas = ref<HTMLCanvasElement>()

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp)
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
}

// 标签页切换动画
const handleTabChange = (index: number) => {
  anime({
    targets: '.overview-page, .image-page, .settings-page',
    opacity: [1, 0],
    duration: 200,
    easing: 'easeOutQuad',
  })

  setTimeout(() => {
    activeTab.value = index
    anime({
      targets: '.overview-page, .image-page, .settings-page',
      opacity: [0, 1],
      duration: 300,
      easing: 'easeInQuad',
    })
  }, 200)
}

// 初始化
onMounted(() => {
  // 模拟数据更新
  setInterval(() => {
    resourceData.cpuUsage = Math.floor(Math.random() * 100)
    resourceData.ramUsage = Math.floor(Math.random() * 100)
    resourceData.speed = Math.floor(Math.random() * 500)
    resourceData.servoAngle = Math.floor(Math.random() * 900)
  }, 1000)

  // 绘制占位图
  if (imageCanvas.value) {
    const ctx = imageCanvas.value.getContext('2d')
    if (ctx) {
      ctx.fillStyle = '#1A1F3A'
      ctx.fillRect(0, 0, 188, 120)
      ctx.fillStyle = '#FF6B35'
      ctx.font = '14px monospace'
      ctx.fillText('No image data', 50, 60)
    }
  }
})

// 响应式顶部导航
watch(activeTab, (newVal) => {
  // 使用 CSS transition 替代 anime.js
  const indicator = document.querySelector('.nav-indicator') as HTMLElement
  if (indicator) {
    indicator.style.left = `calc(${newVal} * 100px)`
  }
})
</script>

<style scoped>
:root {
  --color-primary: #FF6B35;
  --color-secondary: #00B4A6;
  --color-accent: #FFD700;
  --color-bg-primary: #0F172A;
  --color-bg-secondary: #1A1F3A;
  --color-text-primary: #E8E8E8;
  --color-text-secondary: #A0A0A0;
  --color-border: rgba(255, 107, 53, 0.2);
}

.telemetry-dashboard {
  width: 100%;
  height: 100vh;
  background: linear-gradient(135deg, var(--color-bg-primary) 0%, var(--color-bg-secondary) 100%);
  background-attachment: fixed;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: var(--color-text-primary);
}

/* ========== 顶部导航栏 ========== */
.navbar {
  height: 64px;
  background: rgba(15, 23, 42, 0.7);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  position: relative;
  z-index: 100;

  /* 液体玻璃背景 */
  background-image:
    radial-gradient(at 20% 50%, rgba(255, 107, 53, 0.1) 0%, transparent 50%),
    radial-gradient(at 80% 80%, rgba(0, 180, 166, 0.1) 0%, transparent 50%);
}

.navbar::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 50% 0%, rgba(255, 107, 53, 0.05), transparent 50%);
  pointer-events: none;
}

.navbar-content {
  display: flex;
  gap: 0;
  padding: 0 24px;
  position: relative;
}

.nav-item {
  padding: 8px 20px;
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  position: relative;
  transition: color 300ms ease-out;
  font-size: 14px;
  font-weight: 500;
}

.nav-item:hover {
  color: var(--color-text-primary);
}

.nav-item.active {
  color: var(--color-primary);
}

.nav-indicator {
  position: absolute;
  bottom: -1px;
  left: 20px;
  width: calc(100% - 40px);
  height: 3px;
  background: linear-gradient(90deg, var(--color-primary), var(--color-secondary));
  border-radius: 2px 2px 0 0;
  box-shadow: 0 0 12px rgba(255, 107, 53, 0.6);
  animation: indicatorGlow 2s ease-in-out infinite;
  transition: left 400ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes indicatorGlow {
  0%, 100% {
    box-shadow: 0 0 12px rgba(255, 107, 53, 0.6);
  }
  50% {
    box-shadow: 0 0 24px rgba(255, 107, 53, 0.9);
  }
}

/* ========== 总览页面 ========== */
.overview-page {
  flex: 1;
  display: grid;
  grid-template-columns: 30% 50% 20%;
  gap: 20px;
  padding: 20px;
  overflow: hidden;
}

/* ========== 左侧面板 ========== */
.left-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;

  /* 自定义滚动条 */
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

.left-panel::-webkit-scrollbar {
  width: 6px;
}

.left-panel::-webkit-scrollbar-track {
  background: transparent;
}

.left-panel::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 3px;
}

/* ========== Card 通用样式 ========== */
.gauges-card,
.motion-card,
.log-card {
  background: rgba(26, 31, 58, 0.8);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 16px;
  backdrop-filter: blur(8px);
  transition: all 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.gauges-card:hover,
.motion-card:hover,
.log-card:hover {
  border-color: rgba(255, 107, 53, 0.4);
  box-shadow: 0 8px 24px rgba(255, 107, 53, 0.15);
  transform: translateY(-2px);
}

.card-title {
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--color-text-secondary);
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.card-title::before {
  content: '';
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, var(--color-primary), var(--color-secondary));
  border-radius: 2px;
}

/* ========== 仪表盘 ========== */
.gauges-container {
  display: flex;
  justify-content: space-around;
  gap: 12px;
  min-height: 140px;
}

.gauge-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  gap: 8px;
}

.gauge-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-text-secondary);
}

.gauge-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 18px;
  font-weight: 700;
  color: var(--color-primary);
  transition: color 300ms ease-out;
}

/* ========== 运动状态 ========== */
.motion-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  margin-bottom: 8px;
  background: rgba(255, 107, 53, 0.05);
  border-radius: 8px;
  border-left: 3px solid var(--color-primary);
  transition: all 300ms ease-out;
}

.motion-item:hover {
  background: rgba(255, 107, 53, 0.1);
  transform: translateX(4px);
}

.motion-item:last-child {
  margin-bottom: 0;
}

.motion-icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  color: var(--color-primary);
}

.motion-info {
  flex: 1;
}

.motion-label {
  font-size: 12px;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.motion-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-top: 2px;
}

/* ========== 日志 ========== */
.log-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
}

.log-line {
  display: flex;
  gap: 8px;
  padding: 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.2);
  transition: background 200ms ease-out;
  animation: slideIn 300ms ease-out forwards;
  opacity: 0;
}

.log-line:nth-child(1) { animation-delay: 0ms; }
.log-line:nth-child(2) { animation-delay: 50ms; }
.log-line:nth-child(3) { animation-delay: 100ms; }
.log-line:nth-child(4) { animation-delay: 150ms; }
.log-line:nth-child(5) { animation-delay: 200ms; }

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(-8px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.log-line:hover {
  background: rgba(0, 0, 0, 0.4);
}

.log-time {
  color: var(--color-secondary);
  flex-shrink: 0;
}

.log-text {
  color: var(--color-text-secondary);
  word-break: break-all;
}

/* ========== 中间面板 - 图传 ========== */
.center-panel {
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 0;
}

.image-display {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 12px;
}

.image-placeholder {
  position: relative;
  width: 100%;
  height: 80%;
  display: flex;
  justify-content: center;
  align-items: center;
  background: rgba(26, 31, 58, 0.6);
  border-radius: 12px;
  overflow: hidden;
}

/* 浮动边框特效 */
.floating-border {
  position: absolute;
  inset: 0;
  border: 2px solid transparent;
  border-image: linear-gradient(135deg, var(--color-primary), var(--color-secondary), var(--color-primary)) 1;
  border-radius: 12px;
  animation: floatingBorder 4s linear infinite;
  pointer-events: none;
}

@keyframes floatingBorder {
  0% {
    border-image-source: linear-gradient(135deg, var(--color-primary), var(--color-secondary), var(--color-primary));
  }
  50% {
    border-image-source: linear-gradient(135deg, var(--color-secondary), var(--color-primary), var(--color-secondary));
  }
  100% {
    border-image-source: linear-gradient(135deg, var(--color-primary), var(--color-secondary), var(--color-primary));
  }
}

.image-label {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 14px;
  color: var(--color-text-secondary);
  pointer-events: none;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.image-canvas {
  width: 188px;
  height: 120px;
  border-radius: 8px;
  filter: drop-shadow(0 4px 12px rgba(255, 107, 53, 0.2));
}

.image-stats {
  display: flex;
  gap: 20px;
  font-size: 12px;
  color: var(--color-text-secondary);
  justify-content: center;
}

.image-stats span {
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: 'JetBrains Mono', monospace;
}

/* ========== 右侧面板 - MCU Log ========== */
.right-panel {
  display: flex;
  flex-direction: column;
}

.mcu-log-card {
  background: rgba(26, 31, 58, 0.8);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 16px;
  backdrop-filter: blur(8px);
  height: 100%;
  display: flex;
  flex-direction: column;
  transition: all 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.mcu-log-card:hover {
  border-color: rgba(255, 107, 53, 0.4);
  box-shadow: 0 8px 24px rgba(255, 107, 53, 0.15);
}

.mcu-log-content {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
}

.mcu-log-line {
  padding: 6px 8px;
  border-radius: 4px;
  background: rgba(0, 180, 166, 0.05);
  border-left: 2px solid var(--color-secondary);
  color: var(--color-text-secondary);
  word-break: break-all;
  transition: all 200ms ease-out;
  animation: slideInRight 300ms ease-out forwards;
  opacity: 0;
}

.mcu-log-line:nth-child(1) { animation-delay: 0ms; }
.mcu-log-line:nth-child(2) { animation-delay: 30ms; }
.mcu-log-line:nth-child(3) { animation-delay: 60ms; }
.mcu-log-line:nth-child(4) { animation-delay: 90ms; }
.mcu-log-line:nth-child(5) { animation-delay: 120ms; }
.mcu-log-line:nth-child(6) { animation-delay: 150ms; }
.mcu-log-line:nth-child(7) { animation-delay: 180ms; }
.mcu-log-line:nth-child(8) { animation-delay: 210ms; }
.mcu-log-line:nth-child(9) { animation-delay: 240ms; }
.mcu-log-line:nth-child(10) { animation-delay: 270ms; }

@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(12px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.mcu-log-line:hover {
  background: rgba(0, 180, 166, 0.1);
  border-left-color: var(--color-primary);
  transform: translateX(4px);
}

.mcu-log-line.error {
  border-left-color: #FF4444;
  background: rgba(255, 68, 68, 0.05);
  color: #FF8888;
}

.mcu-log-line.warn {
  border-left-color: var(--color-accent);
  background: rgba(255, 215, 0, 0.05);
  color: #FFE066;
}

/* ========== 页面占位符 ========== */
.image-page,
.settings-page,
.page-placeholder {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 24px;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 2px;
}

/* ========== 响应式 ========== */
@media (max-width: 1024px) {
  .overview-page {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto;
  }

  .left-panel,
  .center-panel,
  .right-panel {
    min-height: 300px;
  }
}

@media (max-width: 768px) {
  .navbar {
    height: 48px;
  }

  .overview-page {
    padding: 12px;
    gap: 12px;
  }

  .gauges-container {
    flex-direction: column;
  }

  .image-label {
    font-size: 12px;
  }

  .mcu-log-line {
    font-size: 10px;
  }
}
</style>
