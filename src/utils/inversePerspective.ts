export interface PerspectivePoint {
  x: number;
  y: number;
}

export type PerspectiveQuad = [
  PerspectivePoint,
  PerspectivePoint,
  PerspectivePoint,
  PerspectivePoint,
];

export type HomographyMatrix = [
  [number, number, number],
  [number, number, number],
  [number, number, number],
];

/**
 * Builds a homography that maps destination pixels to source pixels.
 * Point order is top-left, top-right, bottom-right, bottom-left.
 */
export function computeHomography(
  destination: PerspectiveQuad,
  source: PerspectiveQuad,
): number[] | null {
  const matrix: number[][] = [];

  for (let i = 0; i < 4; i++) {
    const { x, y } = destination[i];
    const { x: u, y: v } = source[i];
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }

  return solveLinearSystem(matrix);
}

function solveLinearSystem(matrix: number[][]): number[] | null {
  const size = 8;

  for (let column = 0; column < size; column++) {
    let pivotRow = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivotRow][column])) {
        pivotRow = row;
      }
    }

    if (Math.abs(matrix[pivotRow][column]) < 1e-10) return null;
    [matrix[column], matrix[pivotRow]] = [matrix[pivotRow], matrix[column]];

    const pivot = matrix[column][column];
    for (let index = column; index <= size; index++) matrix[column][index] /= pivot;

    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const factor = matrix[row][column];
      if (factor === 0) continue;
      for (let index = column; index <= size; index++) {
        matrix[row][index] -= factor * matrix[column][index];
      }
    }
  }

  return matrix.map((row) => row[size]);
}

export function warpPerspective(
  sourcePixels: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  sourceQuad: PerspectiveQuad,
  outputWidth: number,
  outputHeight: number,
  bilinear = true,
): Uint8ClampedArray {
  const safeWidth = Math.max(2, Math.round(outputWidth));
  const safeHeight = Math.max(2, Math.round(outputHeight));
  const destination: PerspectiveQuad = [
    { x: 0, y: 0 },
    { x: safeWidth - 1, y: 0 },
    { x: safeWidth - 1, y: safeHeight - 1 },
    { x: 0, y: safeHeight - 1 },
  ];
  const homography = computeHomography(destination, sourceQuad);
  const output = new Uint8ClampedArray(safeWidth * safeHeight * 4);
  if (!homography) return output;

  return warpWithDestinationToSource(
    sourcePixels,
    sourceWidth,
    sourceHeight,
    [...homography, 1],
    safeWidth,
    safeHeight,
    bilinear,
  );
}

/** Applies a calibration matrix that maps image pixels to output pixels. */
export function warpPerspectiveWithHomography(
  sourcePixels: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  imageToOutput: HomographyMatrix,
  outputWidth: number,
  outputHeight: number,
  bilinear = true,
): Uint8ClampedArray {
  const safeWidth = Math.max(2, Math.round(outputWidth));
  const safeHeight = Math.max(2, Math.round(outputHeight));
  const outputToImage = invertMatrix3(imageToOutput);
  if (!outputToImage) return new Uint8ClampedArray(safeWidth * safeHeight * 4);
  return warpWithDestinationToSource(
    sourcePixels,
    sourceWidth,
    sourceHeight,
    outputToImage,
    safeWidth,
    safeHeight,
    bilinear,
  );
}

/** 与 Trace-Vector 测试一致：五倍视野，原窗口底部居中，裁掉相机顶行之外的空行。 */
export function expandedPerspectiveView(
  matrix: HomographyMatrix,
  sourceWidth: number,
  sourceHeight: number,
  outputWidth: number,
  outputHeight: number,
) {
  const factor = Math.min(5, 4096 / outputWidth, 4096 / outputHeight);
  const width = Math.round(outputWidth * factor);
  const fullHeight = Math.round(outputHeight * factor);
  const offsetX = (width - outputWidth) / 2;
  const offsetY = fullHeight - outputHeight;
  const translated = (top: number): HomographyMatrix => [
    matrix[0].map((v, i) => v + offsetX * matrix[2][i]) as HomographyMatrix[0],
    matrix[1].map((v, i) => v + (offsetY - top) * matrix[2][i]) as HomographyMatrix[0],
    [...matrix[2]],
  ];
  const inverse = invertMatrix3(translated(0));
  if (!inverse) return null;
  let top = 0;
  // 只在标定或分辨率变化时检测覆盖；最近邻边界与 cv2.warpPerspective 一致。
  coverage: for (let y = 0; y <= offsetY; y++) {
    for (let x = 0; x < width; x++) {
      const d = inverse[6] * x + inverse[7] * y + inverse[8];
      if (Math.abs(d) < 1e-10) continue;
      const sx = (inverse[0] * x + inverse[1] * y + inverse[2]) / d;
      const sy = (inverse[3] * x + inverse[4] * y + inverse[5]) / d;
      if (sx >= -0.5 && sx < sourceWidth - 0.5 && sy >= -0.5 && sy < sourceHeight - 0.5) {
        top = y;
        break coverage;
      }
    }
  }
  return { width, height: fullHeight - top, matrix: translated(top) };
}

function invertMatrix3(matrix: HomographyMatrix): number[] | null {
  const [a, b, c] = matrix[0];
  const [d, e, f] = matrix[1];
  const [g, h, i] = matrix[2];
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(determinant) < 1e-12) return null;
  return [
    (e * i - f * h) / determinant,
    (c * h - b * i) / determinant,
    (b * f - c * e) / determinant,
    (f * g - d * i) / determinant,
    (a * i - c * g) / determinant,
    (c * d - a * f) / determinant,
    (d * h - e * g) / determinant,
    (b * g - a * h) / determinant,
    (a * e - b * d) / determinant,
  ];
}

function warpWithDestinationToSource(
  sourcePixels: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  homography: number[],
  outputWidth: number,
  outputHeight: number,
  bilinear: boolean,
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(outputWidth * outputHeight * 4);
  const [h0, h1, h2, h3, h4, h5, h6, h7, h8] = homography;
  for (let y = 0; y < outputHeight; y++) {
    for (let x = 0; x < outputWidth; x++) {
      const denominator = h6 * x + h7 * y + h8;
      if (Math.abs(denominator) < 1e-10) continue;
      const sourceX = (h0 * x + h1 * y + h2) / denominator;
      const sourceY = (h3 * x + h4 * y + h5) / denominator;
      const outputIndex = (y * outputWidth + x) * 4;

      if (bilinear) {
        sampleBilinear(sourcePixels, sourceWidth, sourceHeight, sourceX, sourceY, output, outputIndex);
      } else {
        sampleNearest(sourcePixels, sourceWidth, sourceHeight, sourceX, sourceY, output, outputIndex);
      }
    }
  }

  return output;
}

function sampleNearest(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  output: Uint8ClampedArray,
  outputIndex: number,
) {
  const sourceX = Math.round(x);
  const sourceY = Math.round(y);
  if (sourceX < 0 || sourceX >= width || sourceY < 0 || sourceY >= height) return;
  const sourceIndex = (sourceY * width + sourceX) * 4;
  output.set(source.subarray(sourceIndex, sourceIndex + 4), outputIndex);
}

function sampleBilinear(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  output: Uint8ClampedArray,
  outputIndex: number,
) {
  if (x < 0 || x > width - 1 || y < 0 || y > height - 1) return;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const xWeight = x - x0;
  const yWeight = y - y0;
  const topLeft = (y0 * width + x0) * 4;
  const topRight = (y0 * width + x1) * 4;
  const bottomLeft = (y1 * width + x0) * 4;
  const bottomRight = (y1 * width + x1) * 4;

  for (let channel = 0; channel < 4; channel++) {
    const top = source[topLeft + channel] * (1 - xWeight) + source[topRight + channel] * xWeight;
    const bottom = source[bottomLeft + channel] * (1 - xWeight) + source[bottomRight + channel] * xWeight;
    output[outputIndex + channel] = top * (1 - yWeight) + bottom * yWeight;
  }
}
