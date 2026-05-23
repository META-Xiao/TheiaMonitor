import { TelemetrySerialManager } from '../manager';

/**
 * 前端开发用 mock：通过真实的 TelemetrySerialManager.emit() 注入帧，
 * 驱动 ResourceManager / LogProcessManager，与硬件接入时数据流完全一致。
 */
const IMAGE_DATA = new Uint8Array(188 * 120); // 灰度全黑占位图
let mockFrameId = 0;

export function startFrontendMock(serialManager: TelemetrySerialManager): () => void {
  let t = 0;
  const pad = (n: number) => String(n).padStart(2, '0');
  const ts = () => `[${pad(Math.floor(t / 60))}:${pad(t % 60)}]`;

  const logMessages = [
    () => `${ts()} [INFO] CPU usage: {cpu}%`,
    () => `${ts()} [INFO] RAM usage: {ram}%`,
    () => `${ts()} [INFO] Speed: {speed} mm/s`,
    () => `${ts()} [INFO] Servo: {servo}°`,
    () => `${ts()} [WARN] Frame drop detected`,
  ];

  // IMAGE 帧 @25fps
  const imageTimer = setInterval(() => {
    serialManager.emit({
      type: 'FRAME',
      frame: {
        type: 'IMAGE',
        frameId: mockFrameId++ & 0xFFFF,
        fpsCam: 100,
        fpsOut: 25,
        width: 188,
        height: 120,
        imageData: IMAGE_DATA,
        checksum: 0,
      },
    });
  }, 40);

  const timer = setInterval(() => {
    t++;
    const cpu  = Math.floor(30 + Math.random() * 55);
    const ram  = Math.floor(42 + Math.random() * 38);
    const speed = Math.floor(90 + Math.random() * 390);
    const servo = Math.floor(80 + Math.random() * 820);
    const ramTotal = 24576;
    const freeHeap  = Math.floor(16384 * (0.3 + Math.random() * 0.5));
    const freeStack = Math.floor(8192  * (0.3 + Math.random() * 0.5));

    serialManager.emit({
      type: 'FRAME',
      frame: {
        type: 'RESOURCE',
        cpuUsage: cpu, ramUsage: ram,
        freeHeap, freeStack, ramTotal,
        speed, servoAngle: servo,
        reserved: new Uint8Array(4),
        checksum: 0,
      },
    });

    // LOG 帧 (0xDD)
    const tpl = logMessages[Math.floor(Math.random() * logMessages.length)]()
      .replace('{cpu}', String(cpu))
      .replace('{ram}', String(ram))
      .replace('{speed}', String(speed))
      .replace('{servo}', (servo / 10).toFixed(1));
    serialManager.emit({
      type: 'FRAME',
      frame: {
        type: 'LOG',
        length: tpl.length,
        logData: tpl,
        checksum: 0,
      },
    });
  }, 1000);

  return () => { clearInterval(imageTimer); clearInterval(timer); };
}
