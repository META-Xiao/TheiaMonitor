import { describe, expect, it } from 'vitest';
import {
  warpPerspective,
  warpPerspectiveWithHomography,
  type PerspectiveQuad,
} from '../../utils/inversePerspective';

function rgba(values: number[]): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(values.length * 4);
  values.forEach((value, index) => {
    pixels.set([value, value, value, 255], index * 4);
  });
  return pixels;
}

function redValues(pixels: Uint8ClampedArray): number[] {
  return Array.from({ length: pixels.length / 4 }, (_, index) => pixels[index * 4]);
}

describe('warpPerspective', () => {
  it('keeps an image unchanged for an identity quad', () => {
    const quad: PerspectiveQuad = [
      { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 1 },
    ];
    const output = warpPerspective(rgba([10, 20, 30, 40, 50, 60]), 3, 2, quad, 3, 2, false);
    expect(redValues(output)).toEqual([10, 20, 30, 40, 50, 60]);
  });

  it('expands the selected source rectangle to the full output', () => {
    const quad: PerspectiveQuad = [
      { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 1, y: 2 },
    ];
    const output = warpPerspective(
      rgba([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]),
      4,
      4,
      quad,
      2,
      2,
      false,
    );
    expect(redValues(output)).toEqual([5, 6, 9, 10]);
  });

  it('accepts an image-to-output calibration matrix', () => {
    const output = warpPerspectiveWithHomography(
      rgba([10, 20, 30, 40, 50, 60]),
      3,
      2,
      [[1, 0, 1], [0, 1, 0], [0, 0, 1]],
      3,
      2,
      false,
    );
    expect(redValues(output)).toEqual([0, 10, 20, 0, 40, 50]);
  });
});
