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
      <h1>Trace Vector Host Dashboard</h1>

      <section class="content-layout">
        <div class="left-column">
          <section class="telemetry-card">
            <section class="telemetry-zone">
              <aside class="resource-stack">
                <div v-for="item in resourceCards" :key="item.name" class="mini-card resource-card">
                  <div class="mini-head"><span>{{ item.name }}</span><b>{{ item.value }}%</b></div>
                  <svg viewBox="0 0 220 88" preserveAspectRatio="none" class="mini-chart">
                    <path class="mini-area" :d="areaPath(item.points, 220, 88)" />
                    <path class="mini-line" :d="linePath(item.points, 220, 88)" :style="{ stroke: item.color }" />
                  </svg>
                </div>
              </aside>

              <aside class="motion-stack">
                <div class="mini-card speed-card">
                  <div class="mini-head"><span>Speed curve</span><b>{{ speedMs }} m/s</b></div>
                  <svg viewBox="0 0 240 150" preserveAspectRatio="none" class="speed-chart">
                    <path class="speed-area" :d="areaPath(speedPoints, 240, 150)" />
                    <path class="speed-line" :d="linePath(speedPoints, 240, 150)" />
                  </svg>
                </div>

                <div class="mini-card attitude-card">
                  <div class="mini-head"><span>Servo attitude</span><b>{{ servoDeg }}°</b></div>
                  <div class="attitude">
                    <div class="sky" :style="{ transform: `rotate(${servoVisualDeg}deg)` }"><i /></div>
                    <div class="aircraft">⌃</div>
                    <div class="ticks"><span>-45</span><span>0</span><span>45</span></div>
                  </div>
                </div>
              </aside>
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
        </div>

        <section class="vision-pane">
          <div class="pane-head"><span>Vision stream</span><b>{{ imageStats.fps.toFixed(1) }} FPS</b></div>
          <div class="canvas-wrap"><canvas ref="imageCanvas" width="188" height="120" /></div>
          <div class="vision-foot"><span>Source 188×120</span><span>Drop {{ imageStats.droppedFrames }}</span></div>
        </section>
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
  { name: 'CPU', value: data.cpu, color: '#242424', points: cpuPoints.value },
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
.page{height:100vh;overflow-y:auto;overflow-x:hidden;color:#242424;font-family:Inter,'Segoe UI','Microsoft YaHei',sans-serif;background:radial-gradient(circle at 12% 8%,rgba(255,226,105,.95),transparent 30%),radial-gradient(circle at 78% 0%,rgba(35,172,232,.9),transparent 34%),radial-gradient(circle at 96% 46%,rgba(35,197,150,.78),transparent 25%),linear-gradient(135deg,#ffe56d 0%,#f5d7df 35%,#22ace3 73%,#2bc79f 100%)}
.nav{height:58px;padding:10px 28px;display:flex;align-items:center;gap:22px}.logo{font-size:24px}.tabs{display:flex;gap:6px;padding:5px;border-radius:999px;background:rgba(255,255,255,.18);backdrop-filter:blur(18px)}.tabs button{border:0;border-radius:999px;padding:10px 22px;background:transparent;color:rgba(36,36,36,.42);font-weight:800;cursor:pointer}.tabs button.on{color:#242424;background:rgba(255,255,255,.92);box-shadow:0 10px 28px rgba(142,155,70,.18)}.avatar{margin-left:auto;width:38px;height:38px;display:grid;place-items:center;border-radius:999px;background:rgba(255,255,255,.9);font-weight:900;box-shadow:0 12px 34px rgba(33,58,75,.12)}
.main{padding:0 28px 72px}.hello{margin:0 0 8px;color:rgba(36,36,36,.52);font-size:14px;font-weight:800}h1{margin:0 0 22px;font-size:clamp(32px,4vw,48px);line-height:1.04;letter-spacing:-.045em}.content-layout{display:grid;grid-template-columns:minmax(620px,48%) minmax(560px,1fr);gap:18px;align-items:start}.left-column{display:grid;gap:24px}.telemetry-card,.pc-log-card,.vision-pane{background:rgba(255,255,255,.92);border:1px solid rgba(255,255,255,.62);box-shadow:0 28px 80px rgba(68,92,110,.18);backdrop-filter:blur(22px)}.telemetry-card{height:560px;border-radius:26px;padding:18px;display:grid;grid-template-columns:386px minmax(220px,1fr);gap:16px;overflow:hidden}.telemetry-zone{display:grid;grid-template-columns:172px 200px;gap:12px;min-width:0;min-height:0}.resource-stack{display:grid;grid-template-rows:repeat(3,minmax(0,1fr));gap:10px;min-height:0}.motion-stack{display:flex;flex-direction:column;gap:12px;padding-top:26px;min-height:0}.mini-card,.mcu-card{min-height:0;border-radius:16px;background:rgba(246,246,241,.82);overflow:hidden}.resource-card{padding:12px}.mini-head{display:flex;align-items:center;justify-content:space-between;color:rgba(36,36,36,.48);font-size:11px;font-weight:900}.mini-head b{color:#242424;font-size:15px}.mini-chart{width:100%;height:calc(100% - 32px);min-height:82px;margin-top:8px}.mini-area{fill:rgba(214,232,115,.28)}.mini-line{fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}.speed-card{height:204px;padding:14px}.speed-chart{width:100%;height:150px;margin-top:12px}.speed-area{fill:rgba(32,184,166,.16)}.speed-line{fill:none;stroke:#20b8a6;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.attitude-card{aspect-ratio:1/1;margin-top:auto;padding:14px}.attitude{position:relative;height:calc(100% - 30px);margin-top:10px;border-radius:16px;overflow:hidden;background:#edf1ec}.sky{position:absolute;inset:-32%;background:linear-gradient(#88c7ef 0 49%,#fff 49% 51%,#d9b06a 51%);transition:transform .45s ease}.sky i{position:absolute;left:50%;top:50%;width:160%;height:1px;background:rgba(255,255,255,.9);transform:translate(-50%,-50%)}.aircraft{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:38px;font-weight:900;color:#242424;text-shadow:0 1px 0 #fff}.ticks{position:absolute;left:12px;right:12px;bottom:8px;display:flex;justify-content:space-between;color:rgba(36,36,36,.54);font-size:10px;font-weight:900}.mcu-card{padding:14px;display:flex;flex-direction:column}.log-title{display:flex;justify-content:space-between;margin-bottom:10px;color:rgba(36,36,36,.58);font-size:12px;font-weight:900;letter-spacing:.08em}.log-title em{font-style:normal}.mcu-logs,.pc-logs{display:grid;gap:8px;overflow:auto}.mcu-logs{flex:1;min-height:0}.log{padding:9px 12px;border-radius:10px;background:#f6f6f1;color:rgba(36,36,36,.58);font-family:Consolas,'JetBrains Mono',monospace;font-size:11px}.log.warn{color:#9b7a16;background:#fff8dd}.log.err{color:#b44848;background:#fff0f0}.vision-pane{position:relative;min-width:0;height:720px;border-radius:26px;background:rgba(255,255,255,.92);overflow:hidden}.pane-head,.vision-foot{position:absolute;z-index:2;left:16px;right:16px;display:flex;justify-content:space-between;color:rgba(36,36,36,.55);font-size:12px;font-weight:900}.pane-head{top:14px}.vision-foot{bottom:12px}.canvas-wrap{position:absolute;inset:58px 42px 48px;display:flex;align-items:center;justify-content:center;background:linear-gradient(rgba(36,36,36,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(36,36,36,.04) 1px,transparent 1px);background-size:24px 24px;border-radius:32px;overflow:hidden}.canvas-wrap canvas{width:100%;height:100%;object-fit:contain;image-rendering:pixelated;border-radius:20px;filter:saturate(.95)}.pc-log-card{border-radius:24px;padding:18px;overflow:hidden;margin-bottom:24px}.pc-logs{max-height:170px}.empty{min-height:calc(100vh - 68px);display:grid;place-items:center;font-size:28px;font-weight:900}
@media(max-width:1280px){.content-layout{grid-template-columns:1fr}.telemetry-card{height:auto;grid-template-columns:1fr}.telemetry-zone{grid-template-columns:1fr 1fr}.vision-pane,.mcu-card{height:420px}.pc-log-card{width:auto}}@media(max-width:760px){.nav{padding:12px}.tabs{overflow:auto}.main{padding:6px 14px 22px}.telemetry-zone{grid-template-columns:1fr}.motion-stack{padding-top:0}.telemetry-card{padding:12px}.vision-pane,.mcu-card{height:320px}.pc-log-card{width:auto}}
</style>
