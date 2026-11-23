import { describe, expect, it } from 'vitest';
import { ImageFrameProcessor } from '../image-processor';
import { Codec, PixelFormat, type ImageFrame } from '../protocol';
import { fittedPerspectiveView, type HomographyMatrix } from '../../utils/inversePerspective';
import { renderVisionFrame } from '../../utils/visionFrame';
import { DEFAULT_IPM_MATRIX, ipmEnabled } from '../../stores/vision';

const matrix: HomographyMatrix = [[1, 0, -10], [0, 1, -20], [0, 0, 1]];
const processor = new ImageFrameProcessor({ imageWidth: 4, imageHeight: 3, fps: 25 });
const section = [2, 0, 0xf8, 0, 1, 0, 1, 0, 1, 1, 7, 0xe0, 1, 0xff, 0xf8, 0xff, 0xed];
function frame(boundaries = section): ImageFrame {
  const payload = new Uint8Array([...Array(12).fill(60), ...boundaries]);
  return { type: 'IMAGE', frameId: 0, width: 4, height: 3, pixelFormat: PixelFormat.Gray8,
    codec: Codec.CoordinateBoundary, format: 0x18, payload, length: payload.length + 5, checksum: 0 };
}
const pixel = (data: Uint8ClampedArray, x: number, y: number, width = 4) =>
  Array.from(data.slice((y * width + x) * 4, (y * width + x) * 4 + 4));

describe('MOD2 coordinate boundaries', () => {
  it('decodes signed coordinates and keeps the image free of baked overlays', () => {
    const result = processor.process(frame());
    expect(result.boundaries).toEqual([
      { space: 'image', color: 0xf800, points: [{ x: 1, y: 1 }] },
      { space: 'ipm', color: 0x07e0, points: [{ x: -8, y: -19 }] },
    ]);
    expect(pixel(result.pixelData, 1, 1)).toEqual([60, 60, 60, 255]);
  });

  it('renders selected edge and inverse-projected center in the source view', () => {
    const result = processor.process(frame());
    const pixels = renderVisionFrame(result, matrix);
    expect(pixel(pixels, 1, 1)).toEqual([248, 0, 0, 255]);
    expect(pixel(pixels, 2, 1)).toEqual([0, 252, 0, 255]);
    expect(pixel(result.pixelData, 2, 1)).toEqual([60, 60, 60, 255]);
    const changed: HomographyMatrix = [[1, 0, -9], [0, 1, -20], [0, 0, 1]];
    expect(pixel(renderVisionFrame(result, changed), 1, 1)).toEqual([0, 252, 0, 255]);
    expect(pixel(renderVisionFrame(result, changed), 2, 1)).toEqual([60, 60, 60, 255]);
  });

  it('draws IPM points directly with the same display translation as the image', () => {
    const result = processor.process(frame());
    const view = fittedPerspectiveView(matrix, 4, 3)!;
    expect([view.width, view.height, view.offsetX, view.offsetY]).toEqual([4, 3, 10, 20]);
    const pixels = renderVisionFrame(result, matrix, view, false);
    expect(pixel(pixels, 1, 1)).toEqual([248, 0, 0, 255]);
    expect(pixel(pixels, 2, 1)).toEqual([0, 252, 0, 255]);
  });

  it('clears old lines on empty and RAW frames', () => {
    processor.process(frame());
    const empty = processor.process(frame([2, 0, 0xf8, 0, 0, 1, 7, 0xe0, 0]));
    expect(renderVisionFrame(empty, matrix)).toEqual(empty.pixelData);
    const raw = frame(); raw.codec = Codec.RAW; raw.payload = raw.payload.slice(0, 12);
    expect(processor.process(raw).boundaries).toBeUndefined();
  });

  it.each([[], [1], [1, 0, 0, 0], [1, 0, 0, 0, 1], [1, 2, 0, 0, 0], [0, 1]])(
    'rejects truncated, unknown-space or trailing data: %j', (...data) => {
      expect(() => processor.process(frame(data))).toThrow();
    });

  it('defaults to the MCU calibration and a tightly fitted image footprint', () => {
    expect(ipmEnabled.value).toBe(true);
    const view = fittedPerspectiveView(DEFAULT_IPM_MATRIX, 188, 120)!;
    expect(view.width).toBeLessThan(450);
    expect(view.height).toBeLessThan(250);
    expect(view.offsetX).toBeGreaterThan(0);
    expect(view.offsetY).toBeGreaterThan(0);
  });

  it('rejects singular matrices, a horizon inside the image and oversized output', () => {
    expect(fittedPerspectiveView([[0, 0, 0], [0, 0, 0], [0, 0, 0]], 4, 3)).toBeNull();
    expect(fittedPerspectiveView([[1, 0, 0], [0, 1, 0], [1, 0, -1]], 4, 3)).toBeNull();
    expect(fittedPerspectiveView([[1e6, 0, 0], [0, 1, 0], [0, 0, 1]], 4, 3)).toBeNull();
  });
});
