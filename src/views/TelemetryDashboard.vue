<template>
  <div class="page">
    <nav class="nav">
      <b class="logo">✦</b>
      <div class="tabs">
        <button v-for="(tab, i) in tabs" :key="tab" :class="{ on: activeTab === i }" @click="activeTab = i">{{ tab }}</button>
      </div>
      <div class="avatar">TV</div>
    </nav>

    <main v-show="activeTab === 0" class="main">
      <p class="hello">Good morning, Trace Vector!</p>
      <h1>Check your telemetry insights!</h1>

      <section class="hero-card">
        <aside class="resource-stack">
          <div v-for="item in resourceCards" :key="item.name" class="mini-card">
            <div class="mini-head"><span>{{ item.name }}</span><b>{{ item.value }}%</b></div>
            <svg viewBox="0 0 220 86" preserveAspectRatio="none" class="mini-chart">
              <path class="mini-area" :d="areaPath(item.points, 220, 86)" />
              <path class="mini-line" :d="linePath(item.points, 220, 86)" :style="{ stroke: item.color }" />
            </svg>
          </div>
        </aside>

        <aside class="motion-stack">
          <div class="speed-card">
            <div class="mini-head"><span>Speed curve</span><b>{{ speedMs }} m/s</b></div>
            <svg viewBox="0 0 240 132" preserveAspectRatio="none" class="speed-chart">
              <path class="speed-area" :d="areaPath(speedPoints, 240, 132)" />
              <path class="speed-line" :d="linePath(speedPoints, 240, 132)" />
            </svg>
          </div>
          <div class="attitude-card">
            <div class="mini-head"><span>Servo attitude</span><b>{{ servoDeg }}°</b></div>
            <div class="attitude">
              <div class="sky" :style="{ transform: `rotate(${servoVisualDeg}deg)` }"><i /></div>
              <div class="aircraft">⌃</div>
              <div class="ticks"><span>-45</span><span>0</span><span>45</span></div>
            </div>
          </div>
        </aside>

        <section class="vision-pane">
          <div class="pane-head"><span>Vision stream</span><b>{{ imageStats.fps.toFixed(1) }} FPS</b></div>
          <div class="canvas-wrap"><canvas ref="imageCanvas" width="188" height="120" /></div>
          <div class="vision-foot"><span>Source 188×120</span><span>Drop {{ imageStats.droppedFrames }}</span></div>
        </section>

        <aside class="mcu-card">
          <div class="log-title">MCU output <em>LIVE</em></div>
          <div class="mcu-logs">
            <div v-for="(log, i) in mcuLogs.slice(-9)" :key="i" :class="['log', { warn: log.includes('WARN'), err: log.includes('ERROR') }]">{{ log }}</div>
          </div>
        </aside>
      </section>

      <section class="pc-log-card">
        <div class="log-title">上位机接收日志 / 启动日志 <em>HOST</em></div>
        <div class="pc-logs">
          <div v-for="(log, i) in hostLogs" :key="i" class="log">{{ log }}</div>
        </div>
      </section>
    </main>

    <main v-show="activeTab !== 0" class="empty">{{ tabs[activeTab] }} 页面建设中</main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'

const tabs = ['总览', '图传', '设置']
const activeTab = ref(0)
const imageCanvas = ref<HTMLCanvasElement>()
let timerId: number | undefined

const data = reactive({ cpu: 45, ram: 60, rom: 65, speed: 150, servo: 250 })
const imageStats = reactive({ fps: 25, droppedFrames: 0 })
const cpuPoints = ref([58, 62, 54, 48, 50, 45, 52, 68, 63, 59, 66, 45])
const ramPoints = ref([42, 48, 46, 51, 55, 58, 60, 64, 61, 63, 66, 60])
const romPoints = ref([64, 65, 64, 66, 65, 65, 67, 66, 65, 65, 66, 65])
const speedPoints = ref([22, 28, 25, 36, 42, 38, 52, 48, 62, 58, 68, 64])

const mcuLogs = ref([
  '[00:00:01] MCU 启动完成',
  '[00:00:02] 图像传感器初始化',
  '[00:00:03] 舵机控制系统就绪',
  '[00:00:04] 电机驱动激活',
  '[00:00:05] 所有外设准备完毕',
  '[00:01:00] [INFO] CPU 占用: 45%',
  '[00:01:01] [INFO] RAM 占用: 60%',
  '[00:01:02] [INFO] 速度: 150 mm/s',
])

const hostLogs = ref([
  '[HOST 00:00:00] Trace Vector PC Host started',
  '[HOST 00:00:01] serial manager ready',
  '[HOST 00:00:02] protocol parser initialized',
  '[HOST 00:00:03] resource monitor mounted',
  '[HOST 00:00:04] image stream waiting for frame',
])

const resourceCards = computed(() => [
  { name: 'CPU', value: data.cpu, color: '#222', points: cpuPoints.value },
  { name: 'RAM', value: data.ram, color: '#20b8a6', points: ramPoints.value },
  { name: 'ROM', value: data.rom, color: '#c7d54f', points: romPoints.value },
])
const speedMs = computed(() => (data.speed / 1000).toFixed(2))
const servoDeg = computed(() => (data.servo / 10).toFixed(1))
const servoVisualDeg = computed(() => Math.max(-42, Math.min(42, data.servo / 10 - 45)))

const linePath = (points: number[], w: number, h: number) => points.map((p, i) => {
  const x = (i / (points.length - 1)) * w
  const y = h - (p / 100) * (h - 18) - 9
  return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
}).join(' ')
const areaPath = (points: number[], w: number, h: number) => `${linePath(points, w, h)} L${w} ${h} L0 ${h} Z`
const pushPoint = (arr: typeof cpuPoints, value: number) => { arr.value = [...arr.value.slice(1), value] }

const drawFrame = () => {
  const canvas = imageCanvas.value
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx) return
  const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  g.addColorStop(0, '#f9f5df')
  g.addColorStop(1, '#d9f7ee')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = 'rgba(36,36,36,.13)'
  for (let x = 0; x < canvas.width; x += 14) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke() }
  for (let y = 0; y < canvas.height; y += 14) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke() }
  ctx.fillStyle = '#242424'
  ctx.font = '12px sans-serif'
  ctx.fillText('No image data', 56, 64)
}

onMounted(() => {
  drawFrame()
  timerId = window.setInterval(() => {
    data.cpu = Math.floor(30 + Math.random() * 55)
    data.ram = Math.floor(42 + Math.random() * 38)
    data.speed = Math.floor(90 + Math.random() * 390)
    data.servo = Math.floor(80 + Math.random() * 820)
    imageStats.fps = 22 + Math.random() * 8
    pushPoint(cpuPoints, data.cpu)
    pushPoint(ramPoints, data.ram)
    pushPoint(speedPoints, Math.min(90, Math.round(data.speed / 6)))
  }, 1000)
})

onUnmounted(() => { if (timerId !== undefined) window.clearInterval(timerId) })
</script>

<style scoped>
.page{min-height:100vh;overflow:auto;color:#242424;font-family:Inter,'Segoe UI','Microsoft YaHei',sans-serif;background:radial-gradient(circle at 12% 8%,rgba(255,226,105,.95),transparent 30%),radial-gradient(circle at 78% 0%,rgba(35,172,232,.9),transparent 34%),radial-gradient(circle at 96% 46%,rgba(35,197,150,.78),transparent 25%),linear-gradient(135deg,#ffe56d 0%,#f5d7df 35%,#22ace3 73%,#2bc79f 100%)}
.nav{height:68px;padding:14px 28px;display:flex;align-items:center;gap:22px}.logo{font-size:24px}.tabs{display:flex;gap:6px;padding:5px;border-radius:999px;background:rgba(255,255,255,.18);backdrop-filter:blur(18px)}.tabs button{border:0;border-radius:999px;padding:10px 22px;background:transparent;color:rgba(36,36,36,.42);font-weight:800;cursor:pointer}.tabs button.on{color:#242424;background:rgba(255,255,255,.92);box-shadow:0 10px 28px rgba(142,155,70,.18)}.avatar{margin-left:auto;width:38px;height:38px;display:grid;place-items:center;border-radius:999px;background:rgba(255,255,255,.9);font-weight:900;box-shadow:0 12px 34px rgba(33,58,75,.12)}
.main{padding:6px 28px 32px}.hello{margin:0 0 8px;color:rgba(36,36,36,.52);font-size:14px;font-weight:800}h1{margin:0 0 22px;font-size:clamp(32px,4vw,48px);line-height:1.04;letter-spacing:-.045em}.hero-card,.pc-log-card{background:rgba(255,255,255,.92);border:1px solid rgba(255,255,255,.62);box-shadow:0 28px 80px rgba(68,92,110,.18);backdrop-filter:blur(22px)}.hero-card{height:390px;border-radius:26px;padding:14px;display:grid;grid-template-columns:180px 180px minmax(420px,1fr) 310px;gap:12px}.resource-stack,.motion-stack{display:grid;gap:10px;min-height:0}.mini-card,.speed-card,.attitude-card,.mcu-card{min-height:0;border-radius:16px;background:rgba(246,246,241,.82);overflow:hidden}.mini-card{padding:10px}.mini-head{display:flex;align-items:center;justify-content:space-between;color:rgba(36,36,36,.48);font-size:11px;font-weight:900}.mini-head b{color:#242424;font-size:15px}.mini-chart{width:100%;height:78px;margin-top:5px}.mini-area{fill:rgba(214,232,115,.28)}.mini-line{fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}.speed-card,.attitude-card{padding:12px}.speed-chart{width:100%;height:118px;margin-top:8px}.speed-area{fill:rgba(32,184,166,.16)}.speed-line{fill:none;stroke:#20b8a6;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.attitude{position:relative;height:126px;margin-top:8px;border-radius:16px;overflow:hidden;background:#edf1ec}.sky{position:absolute;inset:-32%;background:linear-gradient(#88c7ef 0 49%,#fff 49% 51%,#d9b06a 51%);transition:transform .45s ease}.sky i{position:absolute;left:50%;top:50%;width:160%;height:1px;background:rgba(255,255,255,.9);transform:translate(-50%,-50%)}.aircraft{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:38px;font-weight:900;color:#242424;text-shadow:0 1px 0 #fff}.ticks{position:absolute;left:12px;right:12px;bottom:8px;display:flex;justify-content:space-between;color:rgba(36,36,36,.54);font-size:10px;font-weight:900}.vision-pane{position:relative;min-width:0;border-radius:18px;background:linear-gradient(180deg,rgba(255,255,255,.72),rgba(247,247,242,.58));overflow:hidden}.pane-head,.vision-foot{position:absolute;z-index:2;left:16px;right:16px;display:flex;justify-content:space-between;color:rgba(36,36,36,.55);font-size:12px;font-weight:900}.pane-head{top:14px}.vision-foot{bottom:12px}.canvas-wrap{position:absolute;inset:36px 4px 30px;display:flex;align-items:center;justify-content:center;background:linear-gradient(rgba(36,36,36,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(36,36,36,.04) 1px,transparent 1px);background-size:24px 24px;border-radius:16px;overflow:hidden}.canvas-wrap canvas{width:100%;height:100%;object-fit:contain;image-rendering:pixelated;border-radius:12px;filter:saturate(.95)}.mcu-card{padding:14px;display:flex;flex-direction:column}.log-title{display:flex;justify-content:space-between;margin-bottom:10px;color:rgba(36,36,36,.58);font-size:12px;font-weight:900;letter-spacing:.08em}.log-title em{font-style:normal}.mcu-logs,.pc-logs{display:grid;gap:8px;overflow:auto}.mcu-logs{flex:1;min-height:0}.log{padding:9px 12px;border-radius:10px;background:#f6f6f1;color:rgba(36,36,36,.58);font-family:Consolas,'JetBrains Mono',monospace;font-size:11px}.log.warn{color:#9b7a16;background:#fff8dd}.log.err{color:#b44848;background:#fff0f0}.pc-log-card{margin-top:18px;border-radius:24px;padding:18px;width:min(760px,100%)}.pc-logs{max-height:170px}.empty{min-height:calc(100vh - 68px);display:grid;place-items:center;font-size:28px;font-weight:900}
@media(max-width:1280px){.hero-card{height:auto;grid-template-columns:1fr 1fr}.vision-pane{height:360px}.mcu-card{height:360px}}@media(max-width:760px){.nav{padding:12px}.tabs{overflow:auto}.main{padding:6px 14px 22px}.hero-card{grid-template-columns:1fr;padding:12px}.vision-pane,.mcu-card{height:300px}.pc-log-card{width:auto}}
</style>
