export function useChartPath(padding = 9) {
  const pts2xy = (pts: number[], w: number, h: number, max = 100) =>
    pts.map((p, i) => ({
      x: (i / (pts.length - 1)) * w,
      y: h - (Math.min(Math.max(p, 0), max) / max) * (h - padding * 2) - padding,
    }));

  const linePath = (pts: number[], w: number, h: number, max = 100) => {
    if (pts.length < 2) return '';
    return pts2xy(pts, w, h, max)
      .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ');
  };

  // Catmull-Rom → cubic bezier smooth curve
  const smoothPath = (pts: number[], w: number, h: number, max = 100) => {
    if (pts.length < 2) return '';
    const xy = pts2xy(pts, w, h, max);
    let d = `M${xy[0].x.toFixed(1)} ${xy[0].y.toFixed(1)}`;
    for (let i = 1; i < xy.length; i++) {
      const p0 = xy[Math.max(i - 2, 0)];
      const p1 = xy[i - 1];
      const p2 = xy[i];
      const p3 = xy[Math.min(i + 1, xy.length - 1)];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C${cp1x.toFixed(1)} ${cp1y.toFixed(1)},${cp2x.toFixed(1)} ${cp2y.toFixed(1)},${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  };

  const areaPath = (pts: number[], w: number, h: number, max = 100, smooth = false) => {
    const line = smooth ? smoothPath(pts, w, h, max) : linePath(pts, w, h, max);
    return line ? `${line} L${w} ${h} L0 ${h} Z` : '';
  };

  return { linePath, smoothPath, areaPath };
}
