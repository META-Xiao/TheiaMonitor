import type { ProcessedImageData } from '../serial/image-processor';
import { invertMatrix3, warpPerspectiveWithHomography, type fittedPerspectiveView,
  type HomographyMatrix } from './inversePerspective';

type IpmView = NonNullable<ReturnType<typeof fittedPerspectiveView>>;

/** Overview、Vision与录像使用同一坐标层；IPM点不经原图栅格化再投影。 */
export function renderVisionFrame(frame: ProcessedImageData, matrix: HomographyMatrix,
  view?: IpmView, smoothing = true): Uint8ClampedArray {
  const width = view?.width ?? frame.width, height = view?.height ?? frame.height;
  const pixels = view
    ? warpPerspectiveWithHomography(frame.pixelData, frame.width, frame.height,
      view.matrix, width, height, smoothing)
    : new Uint8ClampedArray(frame.pixelData);
  const inverse = invertMatrix3(matrix);
  const imageToView = view?.matrix.flat();
  for (const line of frame.boundaries ?? []) {
    const color = [((line.color >> 11) & 31) << 3, ((line.color >> 5) & 63) << 2, (line.color & 31) << 3, 255];
    const transform = view ? (line.space === 'image' ? imageToView : null)
      : (line.space === 'ipm' ? inverse : null);
    for (const point of line.points) {
      let { x, y } = point;
      if (!view && line.space === 'ipm' && !inverse) continue;
      if (transform) {
        const d = transform[6] * x + transform[7] * y + transform[8];
        if (Math.abs(d) < 1e-10) continue;
        const nx = (transform[0] * x + transform[1] * y + transform[2]) / d;
        y = (transform[3] * x + transform[4] * y + transform[5]) / d;
        x = nx;
      } else if (view) {
        x += view.offsetX;
        y += view.offsetY;
      }
      x = Math.round(x); y = Math.round(y);
      if (Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x < width && y >= 0 && y < height) {
        pixels.set(color, (y * width + x) * 4);
      }
    }
  }
  return pixels;
}
