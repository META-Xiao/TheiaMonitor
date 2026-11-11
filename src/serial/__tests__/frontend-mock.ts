import { TelemetrySerialManager } from '../manager';
import { PixelFormat, Codec, makeFormat } from '../protocol';

/**
 * 前端开发用 mock：通过真实的 TelemetrySerialManager.emit() 注入帧，
 * 驱动 ResourceManager / LogProcessManager，与硬件接入时数据流完全一致。
 */
const MOCK_WIDTH = 188;
const MOCK_HEIGHT = 120;
const GRAY_PAYLOAD = createRoadTestPattern();
let mockFrameId = 0;
const DEFAULT_FORMAT = makeFormat(PixelFormat.Gray8, Codec.RAW);

/** Perspective road pattern used to verify the Vision homography in front mode. */
function createRoadTestPattern(): Uint8Array {
  const pixels = new Uint8Array(MOCK_WIDTH * MOCK_HEIGHT);
  const horizon = 45;
  const centerX = MOCK_WIDTH / 2;

  for (let y = 0; y < MOCK_HEIGHT; y++) {
    const depth = Math.max(0, (y - horizon) / (MOCK_HEIGHT - 1 - horizon));
    const roadHalfWidth = 26 + depth * 58;
    const leftEdge = centerX - roadHalfWidth;
    const rightEdge = centerX + roadHalfWidth;
    const laneHalfWidth = 2 + depth * 2;
    const edgeThickness = 1 + depth * 2;

    for (let x = 0; x < MOCK_WIDTH; x++) {
      let value: number;
      if (y < horizon) {
        value = 72 + Math.floor((y / horizon) * 34);
      } else if (x < leftEdge || x > rightEdge) {
        value = 48 + (((x >> 3) + (y >> 3)) & 1) * 12;
      } else {
        value = 28 + Math.floor(depth * 16);
        const edgeDistance = Math.min(Math.abs(x - leftEdge), Math.abs(x - rightEdge));
        if (edgeDistance < edgeThickness) value = 220;

        const dashBand = Math.floor((y - horizon) / Math.max(4, 11 - depth * 6));
        if (Math.abs(x - centerX) < laneHalfWidth && dashBand % 2 === 0) value = 238;
      }
      pixels[y * MOCK_WIDTH + x] = value;
    }
  }

  return pixels;
}

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

  // IMAGE 帧 @25fps (灰度透视道路测试图, RAW codec)
  const imageTimer = setInterval(() => {
    serialManager.emit({
      type: 'FRAME',
      frame: {
        type: 'IMAGE',
        frameId: mockFrameId++ & 0xFFFF,
        length: 5 + GRAY_PAYLOAD.length,  // Frame(2)+W(1)+H(1)+Fmt(1)+Payload
        width: MOCK_WIDTH,
        height: MOCK_HEIGHT,
        format: DEFAULT_FORMAT,
        pixelFormat: PixelFormat.Gray8,
        codec: Codec.RAW,
        payload: GRAY_PAYLOAD,
        checksum: 0,
      },
    });
  }, 40);

  const timer = setInterval(() => {
    t++;
    const cpu      = Math.floor(30 + Math.random() * 55);
    const romFree  = Math.floor(32768 * (0.85 + Math.random() * 0.1));
    const ramFree  = Math.floor(2560  * (0.3  + Math.random() * 0.5));
    const speed    = Math.floor(90  + Math.random() * 390);
    const servo    = Math.floor(80  + Math.random() * 820);

    // resData = CPU(u8) + RAM(u16) + ROM(u16) + Speed(i16) + Servo(i16) = 9B
    const resData = new Uint8Array(9);
    resData[0] = cpu;
    resData[1] = (ramFree >> 8) & 0xFF; resData[2] = ramFree & 0xFF;
    resData[3] = (romFree >> 8) & 0xFF; resData[4] = romFree & 0xFF;
    resData[5] = (speed >> 8) & 0xFF;   resData[6] = speed & 0xFF;
    resData[7] = (servo >> 8) & 0xFF;   resData[8] = servo & 0xFF;
    serialManager.emit({
      type: 'FRAME',
      frame: {
        type: 'RESOURCE',
        length: 9,
        resData,
        checksum: 0,
      },
    });

    // LOG 帧 (0xDD)
    const tpl = logMessages[Math.floor(Math.random() * logMessages.length)]()
      .replace('{cpu}', String(cpu))
      .replace('{ram}', String(ramFree))
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
