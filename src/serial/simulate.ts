/**
 * 模拟回放工具 — 读取 simulation/out*.bin 文件，循环通过 FrameParser 解析
 *
 * 用法: npm run simulate
 *
 * 特性:
 *  - 自动匹配 simulation/out*.bin 文件
 *  - 跳过 bin 开头的无效前缀（非 0xCC/0xDD/0xEE 字节）
 *  - 状态机容错：上一帧残留数据自动跳过
 *  - 循环回放模式，Ctrl+C 退出
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { FrameParser, FrameParseError } from './parser';
import type { TelemetryFrame } from './protocol';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SIM_DIR = resolve(__dirname, '../../simulation');

const FRAME_HEADERS = new Set([0xCC, 0xDD, 0xEE]);

function findBinFiles(): string[] {
  const files = readdirSync(SIM_DIR)
    .filter((f) => /^out.*\.bin$/i.test(f))
    .map((f) => resolve(SIM_DIR, f))
    .filter((f) => statSync(f).isFile())
    .sort();
  if (files.length === 0) {
    console.error(`[simulate] 未找到 bin 文件，请将 out*.bin 放入 ${SIM_DIR}`);
    process.exit(1);
  }
  return files;
}

function loadAllBinData(files: string[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (const f of files) {
    const buf = readFileSync(f);
    chunks.push(new Uint8Array(buf));
    total += buf.length;
  }
  console.log(`[simulate] 加载 ${files.length} 个文件，总计 ${(total / 1024).toFixed(1)} KB`);
  for (const f of files) {
    console.log(`  - ${f}`);
  }

  // 合并
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return merged;
}

/** 跳过开头不属于任何已知帧头的字节 */
function skipLeadingGarbage(data: Uint8Array): Uint8Array {
  for (let i = 0; i < data.length; i++) {
    if (FRAME_HEADERS.has(data[i])) {
      if (i > 0) {
        console.log(`[simulate] 跳过开头 ${i} 字节无效数据`);
      }
      return data.slice(i);
    }
  }
  console.error('[simulate] bin 文件中未找到有效帧头 (0xCC/0xDD/0xEE)');
  process.exit(1);
}

function printFrame(frame: TelemetryFrame): void {
  if (frame.type === 'IMAGE') {
    process.stdout.write(`\r[simulate] IMAGE frameId=${frame.frameId} ${frame.width}x${frame.height} size=${frame.length}B    `);
  } else if (frame.type === 'LOG') {
    const preview = frame.logData.length > 60 ? frame.logData.slice(0, 60) + '...' : frame.logData;
    console.log(`\n[simulate] LOG len=${frame.length}: ${preview}`);
  } else if (frame.type === 'RESOURCE') {
    // RESOURCE frame parsing details are in the protocol layer
  }
}

async function main() {
  const files = findBinFiles();
  const rawData = loadAllBinData(files);
  const data = skipLeadingGarbage(rawData);

  const parser = new FrameParser();

  console.log('[simulate] 开始循环回放，Ctrl+C 退出\n');

  let totalFrames = 0;
  let okFrames = 0;
  let failFrames = 0;
  let loops = 0;

  // 按块大小分块送入解析器，模拟串口流式接收
  const CHUNK_SIZE = 4096;
  let pos = 0;

  const startTime = Date.now();

  while (true) {
    const end = Math.min(pos + CHUNK_SIZE, data.length);
    const chunk = data.slice(pos, end);
    const results = parser.parse(chunk);

    for (const r of results) {
      totalFrames++;
      if (r instanceof FrameParseError) {
        failFrames++;
      } else {
        okFrames++;
        printFrame(r);
      }
    }

    pos = end;
    if (pos >= data.length) {
      loops++;
      pos = 0;

      const elapsed = (Date.now() - startTime) / 1000;
      const rate = totalFrames / elapsed;
      const pct = totalFrames > 0 ? ((okFrames / totalFrames) * 100).toFixed(1) : '0';

      console.log(`\n[simulate] 第 ${loops} 轮完成 | 总帧=${totalFrames} 成功=${okFrames} 失败=${failFrames} 成功率=${pct}% | ${rate.toFixed(0)} fps | ${elapsed.toFixed(0)}s`);

      // 避免 CPU 100% 空转
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}

main().catch((e) => {
  console.error('[simulate] 错误:', e);
  process.exit(1);
});
