/**
 * 将 MCU 输出的 out.bin 喂给真实的 FrameParser，验证解析行为
 * 运行: npx vitest src/serial/__tests__/outbin.test.ts
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { FrameParser, FrameParseError } from '../parser';

const OUT_BIN_PATH = 'E:/SkFSTC32G144K256/out.bin';

function loadOutBin(): Uint8Array {
  const buf = readFileSync(OUT_BIN_PATH);
  return new Uint8Array(buf);
}

interface FrameStats {
  total: number;
  ok: number;
  fail: number;
  parseErrors: string[];
  firstOkDetails: string;
  firstFailDetails: string;
}

function analyzeOutBin(): FrameStats {
  const data = loadOutBin();
  const parser = new FrameParser();
  const results = parser.parse(data);

  const stats: FrameStats = {
    total: 0,
    ok: 0,
    fail: 0,
    parseErrors: [],
    firstOkDetails: '',
    firstFailDetails: '',
  };

  for (const r of results) {
    if (r instanceof FrameParseError) {
      stats.fail++;
      stats.parseErrors.push(`${r.code}: ${r.message}`);
      if (!stats.firstFailDetails) {
        stats.firstFailDetails = `${r.code}: ${r.message}`;
      }
    } else {
      stats.ok++;
      if (!stats.firstOkDetails) {
        stats.firstOkDetails = JSON.stringify({
          type: r.type,
          ...(r.type === 'IMAGE'
            ? { frameId: r.frameId, width: r.width, height: r.height, length: r.length }
            : {}),
          ...(r.type === 'LOG' ? { length: r.length, logData: r.logData.slice(0, 80) } : {}),
          ...(r.type === 'RESOURCE' ? { length: r.length } : {}),
        });
      }
    }
    stats.total++;
  }

  return stats;
}

describe('out.bin → FrameParser 真实解析', () => {
  it('应能解析出帧（跳过 SEEKFREE banner）', () => {
    const stats = analyzeOutBin();
    console.log('\n=== out.bin 解析结果 ===');
    console.log(`总帧数: ${stats.total}`);
    console.log(`成功: ${stats.ok}, 失败: ${stats.fail}`);
    console.log(`成功率: ${stats.total > 0 ? ((stats.ok / stats.total) * 100).toFixed(1) : 0}%`);
    if (stats.firstOkDetails) console.log(`首个成功帧: ${stats.firstOkDetails}`);
    if (stats.firstFailDetails) console.log(`首个失败帧: ${stats.firstFailDetails}`);

    // 按错误类型分组
    const errorCounts: Record<string, number> = {};
    for (const e of stats.parseErrors) {
      const code = e.split(':')[0];
      errorCounts[code] = (errorCounts[code] || 0) + 1;
    }
    console.log('\n错误分布:');
    for (const [code, count] of Object.entries(errorCounts)) {
      console.log(`  ${code}: ${count}`);
    }

    expect(stats.total).toBeGreaterThan(0);
  });

  it('IMAGE 帧应全部通过 checksum', () => {
    const stats = analyzeOutBin();
    const imageErrors = stats.parseErrors.filter((e) => e.includes('IMAGE'));
    console.log(`\nIMAGE 帧错误数: ${imageErrors.length}`);
    if (imageErrors.length > 0) {
      console.log('前 5 个 IMAGE 错误:');
      imageErrors.slice(0, 5).forEach((e) => console.log(`  ${e}`));
    }
    expect(imageErrors.length).toBe(0);
  });

  it('LOG 帧应正确解析', () => {
    const stats = analyzeOutBin();
    const logErrors = stats.parseErrors.filter((e) => e.includes('LOG'));
    console.log(`LOG 帧错误数: ${logErrors.length}`);
    expect(logErrors.length).toBe(0);
  });

  it('RESOURCE 帧应正确解析', () => {
    const stats = analyzeOutBin();
    const resErrors = stats.parseErrors.filter((e) => e.includes('RESOURCE'));
    console.log(`RESOURCE 帧错误数: ${resErrors.length}`);
    expect(resErrors.length).toBe(0);
  });
});
