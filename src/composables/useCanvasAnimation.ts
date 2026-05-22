import { type Ref } from 'vue';

function kochPoints(x1: number, y1: number, x2: number, y2: number, depth: number): [number, number][] {
  if (depth === 0) return [[x2, y2]];
  const dx = x2 - x1, dy = y2 - y1;
  const ax = x1 + dx / 3, ay = y1 + dy / 3;
  const bx = x1 + dx * 2 / 3, by = y1 + dy * 2 / 3;
  const mx = (x1 + x2) / 2 - dy * Math.sqrt(3) / 6, my = (y1 + y2) / 2 + dx * Math.sqrt(3) / 6;
  return [
    ...kochPoints(x1, y1, ax, ay, depth - 1),
    ...kochPoints(ax, ay, mx, my, depth - 1),
    ...kochPoints(mx, my, bx, by, depth - 1),
    ...kochPoints(bx, by, x2, y2, depth - 1),
  ];
}

export function useCanvasAnimation(canvasRef: Ref<HTMLCanvasElement | undefined>) {
  let animId: number;
  let angle = 0;

  function draw() {
    const canvas = canvasRef.value;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) { animId = requestAnimationFrame(draw); return; }

    const { width: w, height: h } = canvas;
    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, w, h);

    const r = Math.min(w, h) * 0.38;
    angle += 0.008;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(angle);
    ctx.strokeStyle = 'rgba(32,184,166,0.85)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let s = 0; s < 3; s++) {
      const a = (s * 2 * Math.PI) / 3;
      const x1 = Math.cos(a) * r, y1 = Math.sin(a) * r;
      const x2 = Math.cos(a + 2 * Math.PI / 3) * r, y2 = Math.sin(a + 2 * Math.PI / 3) * r;
      const pts = kochPoints(x1, y1, x2, y2, 3);
      if (s === 0) ctx.moveTo(x1, y1); else ctx.lineTo(x1, y1);
      pts.forEach(([px, py]) => ctx.lineTo(px, py));
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    animId = requestAnimationFrame(draw);
  }

  return {
    start: () => { animId = requestAnimationFrame(draw); },
    stop:  () => cancelAnimationFrame(animId),
  };
}
