import { describe, expect, it } from 'vitest';
import {
  expandedPerspectiveView,
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


describe('expandedPerspectiveView', () => {
  it('crops empty top rows and keeps the original window at bottom center', () => {
    const view = expandedPerspectiveView([[1, 0, 0], [0, 1, 0], [0, 0, 1]], 3, 2, 3, 2)!;
    expect(view).toEqual({ width: 15, height: 2, matrix: [[1, 0, 6], [0, 1, 0], [0, 0, 1]] });
    const pixels = warpPerspectiveWithHomography(rgba([10, 20, 30, 40, 50, 60]),
      3, 2, view.matrix, view.width, view.height, false);
    expect(redValues(pixels).slice(6, 9)).toEqual([10, 20, 30]);
    expect(redValues(pixels).slice(21, 24)).toEqual([40, 50, 60]);
  });

  it('matches the expanded Trace-Vector calibration preview (crop 374 of 600 rows)', () => {
    const view = expandedPerspectiveView([
      [2.4459226219741015, 2.6554207223001196, -174.30282296892608],
      [-0.07917299420578985, 7.103378765410719, -101.26149331737273],
      [0.0008512381275615477, 0.0391843035530464, 1],
    ], 188, 120, 188, 120)!;
    expect([view.width, view.height]).toEqual([940, 226]);
    expect(view.matrix[0][2]).toBeCloseTo(-174.30282296892608 + 376);
    expect(view.matrix[1][2]).toBeCloseTo(-101.26149331737273 + 106);
  });

  it('rejects a singular calibration', () => {
    expect(expandedPerspectiveView([[0, 0, 0], [0, 0, 0], [0, 0, 0]],
      188, 120, 188, 120)).toBeNull();
  });
});
