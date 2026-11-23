import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { warpPerspective, type PerspectiveQuad } from '../src/utils/inversePerspective';

const sourceWidth = 188;
const sourceHeight = 120;
const outputWidth = 188;
const outputHeight = 180;
const horizon = 45;
const source = createRoadFrame();
const roadQuad: PerspectiveQuad = [
  { x: 0.36 * (sourceWidth - 1), y: 0.38 * (sourceHeight - 1) },
  { x: 0.64 * (sourceWidth - 1), y: 0.38 * (sourceHeight - 1) },
  { x: 0.94 * (sourceWidth - 1), y: 0.96 * (sourceHeight - 1) },
  { x: 0.06 * (sourceWidth - 1), y: 0.96 * (sourceHeight - 1) },
];
const output = warpPerspective(source, sourceWidth, sourceHeight, roadQuad, outputWidth, outputHeight, true);

const scale = 3;
const gap = 24;
const padding = 18;
const canvasWidth = padding * 2 + (sourceWidth + outputWidth) * scale + gap;
const canvasHeight = padding * 2 + Math.max(sourceHeight, outputHeight) * scale;
const canvas = new Uint8ClampedArray(canvasWidth * canvasHeight * 4);
fill(canvas, canvasWidth, canvasHeight, 20, 25, 34);
blitScaled(source, sourceWidth, sourceHeight, canvas, canvasWidth, padding, padding, scale);
blitScaled(output, outputWidth, outputHeight, canvas, canvasWidth, padding + sourceWidth * scale + gap, padding, scale);

const artifactPath = resolve('validation/vision-road-ipm.bmp');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, encodeBmp(canvas, canvasWidth, canvasHeight));

const sampleRows = [0, Math.floor(outputHeight / 2), outputHeight - 1];
const edgeSpans = sampleRows.map((y) => brightEdgeSpan(output, outputWidth, y));
const validSpans = edgeSpans.filter((span): span is number => span !== null);
const spanVariation = validSpans.length ? Math.max(...validSpans) - Math.min(...validSpans) : Infinity;

console.log(JSON.stringify({
  artifactPath,
  inputRoadWidths: [roadWidthAt(46), roadWidthAt(80), roadWidthAt(114)],
  outputEdgeSpans: edgeSpans,
  outputSpanVariation: spanVariation,
  passed: validSpans.length === sampleRows.length && spanVariation <= 4,
}, null, 2));

function createRoadFrame(): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(sourceWidth * sourceHeight * 4);
  const centerX = sourceWidth / 2;
  for (let y = 0; y < sourceHeight; y++) {
    const depth = Math.max(0, (y - horizon) / (sourceHeight - 1 - horizon));
    const roadHalfWidth = 26 + depth * 58;
    const leftEdge = centerX - roadHalfWidth;
    const rightEdge = centerX + roadHalfWidth;
    const laneHalfWidth = 2 + depth * 2;
    const edgeThickness = 1 + depth * 2;
    for (let x = 0; x < sourceWidth; x++) {
      let value: number;
      if (y < horizon) value = 72 + Math.floor((y / horizon) * 34);
      else if (x < leftEdge || x > rightEdge) value = 48 + (((x >> 3) + (y >> 3)) & 1) * 12;
      else {
        value = 28 + Math.floor(depth * 16);
        if (Math.min(Math.abs(x - leftEdge), Math.abs(x - rightEdge)) < edgeThickness) value = 220;
        const dashBand = Math.floor((y - horizon) / Math.max(4, 11 - depth * 6));
        if (Math.abs(x - centerX) < laneHalfWidth && dashBand % 2 === 0) value = 238;
      }
      const index = (y * sourceWidth + x) * 4;
      pixels[index] = value;
      pixels[index + 1] = value;
      pixels[index + 2] = value;
      pixels[index + 3] = 255;
    }
  }
  return pixels;
}

function roadWidthAt(y: number): number {
  const depth = Math.max(0, (y - horizon) / (sourceHeight - 1 - horizon));
  return Math.round((26 + depth * 58) * 2);
}

function brightEdgeSpan(pixels: Uint8ClampedArray, width: number, y: number): number | null {
  let left = -1;
  let right = -1;
  for (let x = 0; x < Math.floor(width * 0.35); x++) {
    if (pixels[(y * width + x) * 4] > 150) { left = x; break; }
  }
  for (let x = width - 1; x > Math.ceil(width * 0.65); x--) {
    if (pixels[(y * width + x) * 4] > 150) { right = x; break; }
  }
  return left >= 0 && right >= 0 ? right - left : null;
}

function fill(pixels: Uint8ClampedArray, width: number, height: number, r: number, g: number, b: number) {
  for (let i = 0; i < width * height; i++) {
    const index = i * 4;
    pixels[index] = r; pixels[index + 1] = g; pixels[index + 2] = b; pixels[index + 3] = 255;
  }
}

function blitScaled(
  sourcePixels: Uint8ClampedArray,
  width: number,
  height: number,
  target: Uint8ClampedArray,
  targetWidth: number,
  offsetX: number,
  offsetY: number,
  factor: number,
) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sourceIndex = (y * width + x) * 4;
      for (let sy = 0; sy < factor; sy++) {
        for (let sx = 0; sx < factor; sx++) {
          const targetIndex = ((offsetY + y * factor + sy) * targetWidth + offsetX + x * factor + sx) * 4;
          target.set(sourcePixels.subarray(sourceIndex, sourceIndex + 4), targetIndex);
        }
      }
    }
  }
}

function encodeBmp(pixels: Uint8ClampedArray, width: number, height: number): Buffer {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelSize = rowSize * height;
  const buffer = Buffer.alloc(54 + pixelSize);
  buffer.write('BM', 0, 2, 'ascii');
  buffer.writeUInt32LE(buffer.length, 2);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(pixelSize, 34);
  for (let y = 0; y < height; y++) {
    const bmpY = height - 1 - y;
    for (let x = 0; x < width; x++) {
      const sourceIndex = (y * width + x) * 4;
      const targetIndex = 54 + bmpY * rowSize + x * 3;
      buffer[targetIndex] = pixels[sourceIndex + 2];
      buffer[targetIndex + 1] = pixels[sourceIndex + 1];
      buffer[targetIndex + 2] = pixels[sourceIndex];
    }
  }
  return buffer;
}
