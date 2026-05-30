/**
 * Raster → vector tracer. Turns a PNG/JPG (a logo, a silhouette, clip art)
 * into cuttable outlines so a maker doesn't need a vector editor.
 *
 * Pipeline: downscale → grayscale threshold → marching-squares contour
 * extraction (handles holes, e.g. the inside of an "O") → Douglas–Peucker
 * simplify → emit an SVG string. The SVG then goes through the SAME parseSvg /
 * svgToShapes path as a hand-made vector file, so everything downstream
 * (scaling, modes, generators) is unchanged.
 *
 * Dependency-free on purpose — no potrace/opencv. Good enough for the
 * high-contrast silhouettes makers actually trace; not a photo vectorizer.
 */

interface Point { x: number; y: number; }

export interface TraceOptions {
  threshold: number; // 0–255 luminance cutoff
  invert: boolean;   // trace light-on-dark instead of dark-on-light
  maxDimension: number; // downscale longest side to this many px
  simplifyEpsilon: number; // Douglas–Peucker tolerance in px
  minLoopArea: number; // drop specks smaller than this (px²)
}

export const DEFAULT_TRACE: TraceOptions = {
  threshold: 128,
  invert: false,
  maxDimension: 360,
  simplifyEpsilon: 1.2,
  minLoopArea: 12,
};

/** Load a File into an HTMLImageElement. */
export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not load image')); };
    img.src = url;
  });
}

/**
 * Trace an image element to an SVG string. Throws if nothing traceable is
 * found (blank image / threshold too extreme).
 */
export function traceImageToSvg(img: HTMLImageElement, opts: TraceOptions): string {
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (!srcW || !srcH) throw new Error('Image has no dimensions');

  // Downscale to keep the cell grid manageable.
  const scale = Math.min(1, opts.maxDimension / Math.max(srcW, srcH));
  const W = Math.max(2, Math.round(srcW * scale));
  const H = Math.max(2, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not available');
  // White backing so transparent PNGs threshold as "empty".
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);

  // Binary field: 1 = "filled" (to be traced). Account for alpha (transparent
  // → treated as background/white).
  const bin = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
    const lum = a < 16 ? 255 : 0.299 * r + 0.587 * g + 0.114 * b;
    let filled = lum < opts.threshold;
    if (opts.invert) filled = !filled && a >= 16;
    bin[i] = filled ? 1 : 0;
  }
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : bin[y * W + x]);

  // Marching squares. Edge midpoints per cell (x,y) covering pixel corners
  // (x,y),(x+1,y),(x+1,y+1),(x,y+1).
  // a=top b=right c=bottom d=left
  const seg: number[] = []; // flat [x1,y1,x2,y2, ...]
  const A = (x: number, y: number): Point => ({ x: x + 0.5, y });
  const B = (x: number, y: number): Point => ({ x: x + 1, y: y + 0.5 });
  const C = (x: number, y: number): Point => ({ x: x + 0.5, y: y + 1 });
  const D = (x: number, y: number): Point => ({ x, y: y + 0.5 });
  const push = (p: Point, q: Point) => { seg.push(p.x, p.y, q.x, q.y); };

  for (let y = -1; y < H; y++) {
    for (let x = -1; x < W; x++) {
      const tl = at(x, y), tr = at(x + 1, y), br = at(x + 1, y + 1), bl = at(x, y + 1);
      const code = tl * 1 + tr * 2 + br * 4 + bl * 8;
      switch (code) {
        case 1:  push(D(x, y), A(x, y)); break;
        case 2:  push(A(x, y), B(x, y)); break;
        case 3:  push(D(x, y), B(x, y)); break;
        case 4:  push(B(x, y), C(x, y)); break;
        case 5:  push(D(x, y), A(x, y)); push(B(x, y), C(x, y)); break;
        case 6:  push(A(x, y), C(x, y)); break;
        case 7:  push(D(x, y), C(x, y)); break;
        case 8:  push(C(x, y), D(x, y)); break;
        case 9:  push(C(x, y), A(x, y)); break;
        case 10: push(A(x, y), B(x, y)); push(C(x, y), D(x, y)); break;
        case 11: push(C(x, y), B(x, y)); break;
        case 12: push(B(x, y), D(x, y)); break;
        case 13: push(B(x, y), A(x, y)); break;
        case 14: push(A(x, y), D(x, y)); break;
        default: break; // 0 and 15 → no crossing
      }
    }
  }
  if (seg.length === 0) throw new Error('Nothing to trace at this threshold');

  // Stitch segments into closed loops. Points sit on a half-integer grid, so
  // key by doubled integer coordinates for exact matching.
  const key = (x: number, y: number) => `${Math.round(x * 2)}_${Math.round(y * 2)}`;
  const adjacency = new Map<string, number[]>(); // pointKey → segment indices
  const segCount = seg.length / 4;
  for (let i = 0; i < segCount; i++) {
    const k1 = key(seg[i * 4], seg[i * 4 + 1]);
    const k2 = key(seg[i * 4 + 2], seg[i * 4 + 3]);
    (adjacency.get(k1) ?? adjacency.set(k1, []).get(k1)!).push(i);
    (adjacency.get(k2) ?? adjacency.set(k2, []).get(k2)!).push(i);
  }

  const used = new Uint8Array(segCount);
  const loops: Point[][] = [];

  for (let start = 0; start < segCount; start++) {
    if (used[start]) continue;
    const loop: Point[] = [];
    let curIdx = start;
    let curPt: Point = { x: seg[start * 4], y: seg[start * 4 + 1] };
    let guard = 0;
    while (curIdx >= 0 && !used[curIdx] && guard++ < segCount + 5) {
      used[curIdx] = 1;
      const x1 = seg[curIdx * 4], y1 = seg[curIdx * 4 + 1], x2 = seg[curIdx * 4 + 2], y2 = seg[curIdx * 4 + 3];
      // Step to the far endpoint from curPt.
      const nextPt = (Math.abs(x1 - curPt.x) < 0.01 && Math.abs(y1 - curPt.y) < 0.01)
        ? { x: x2, y: y2 } : { x: x1, y: y1 };
      loop.push(nextPt);
      curPt = nextPt;
      // Find an unused segment sharing curPt.
      const cands = adjacency.get(key(curPt.x, curPt.y)) ?? [];
      let nxt = -1;
      for (const ci of cands) { if (!used[ci]) { nxt = ci; break; } }
      curIdx = nxt;
    }
    if (loop.length >= 3) loops.push(loop);
  }

  // Simplify + drop specks.
  const kept = loops
    .map((l) => douglasPeucker(l, opts.simplifyEpsilon))
    .filter((l) => l.length >= 3 && Math.abs(polygonArea(l)) >= opts.minLoopArea);

  if (kept.length === 0) throw new Error('Nothing left after cleanup — try a different threshold');

  // Emit SVG (pixel space; viewBox matches downscaled size — the design
  // scaler maps it onto the material afterwards).
  const paths = kept.map((l) => {
    const d = l.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') + ' Z';
    return `<path d="${d}" fill="none" stroke="#000"/>`;
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">\n${paths}\n</svg>`;
}

function polygonArea(poly: Point[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Iterative Douglas–Peucker polyline simplification (treats the loop as closed). */
function douglasPeucker(points: Point[], epsilon: number): Point[] {
  if (points.length < 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];

  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpDist(points[i], points[s], points[e]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > epsilon && idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function perpDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}
