/**
 * Shape Tracer — rasterize SVG elements then trace their boundaries
 * to produce clean, artifact-free polygons.
 *
 * The browser's SVG renderer handles all curve types perfectly.
 * We leverage that by rendering each shape to a canvas, then tracing
 * the boundary pixels to extract clean polygon outlines.
 */
import type { SvgShapeEntry } from './svgParser';

export interface TracedShape {
  id: string;
  name: string;
  polygon: { x: number; y: number }[];
  area: number;
}

/**
 * Trace all shapes from a normalized SVG into clean polygons.
 * Renders each shape individually to a canvas and traces the boundary.
 */
export async function traceShapes(
  normalizedSvgText: string,
  shapeRegistry: SvgShapeEntry[],
  canvasWidth: number = 2000
): Promise<TracedShape[]> {
  // Parse the SVG to get viewBox dimensions
  const parser = new DOMParser();
  const doc = parser.parseFromString(normalizedSvgText, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) return [];

  const vb = svg.getAttribute('viewBox');
  if (!vb) return [];
  const [vbMinX, vbMinY, vbW, vbH] = vb.split(/[\s,]+/).map(Number);
  if (!vbW || !vbH) return [];

  const canvasHeight = Math.round(canvasWidth * (vbH / vbW));
  const scaleX = canvasWidth / vbW;
  const scaleY = canvasHeight / vbH;

  // Query all shape elements in DOM order (must match registry order)
  const allElements = svg.querySelectorAll('path, polygon, polyline, rect, circle, ellipse, line, text');
  const results: TracedShape[] = [];

  for (let i = 0; i < shapeRegistry.length && i < allElements.length; i++) {
    const entry = shapeRegistry[i];
    if (entry.isText) continue;

    const el = allElements[i];
    if (!el) continue;

    try {
      // Create a copy of the SVG with only this element visible
      const isolatedSvg = createIsolatedSvg(svg, allElements, i);

      // Render to canvas
      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      // Render SVG to canvas via Image
      const blob = new Blob([new XMLSerializer().serializeToString(isolatedSvg)], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const img = new Image();

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject();
        img.src = url;
      });

      ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
      URL.revokeObjectURL(url);

      // Get pixel data and trace boundary
      const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
      const boundary = traceBoundary(imageData);

      if (boundary.length < 3) continue;

      // Simplify the polygon (Douglas-Peucker)
      const simplified = simplifyPolygon(boundary, 1.5);
      if (simplified.length < 3) continue;

      // Convert pixel coordinates to SVG viewBox coordinates
      const polygon = simplified.map(p => ({
        x: p.x / scaleX + vbMinX,
        y: p.y / scaleY + vbMinY,
      }));

      // Compute area
      let area = 0;
      for (let k = 0; k < polygon.length; k++) {
        const j = (k + 1) % polygon.length;
        area += polygon[k].x * polygon[j].y - polygon[j].x * polygon[k].y;
      }
      area = Math.abs(area) / 2;

      if (area < 0.01) continue;

      results.push({ id: entry.id, name: entry.name, polygon, area });
    } catch {
      // Skip shapes that can't be rendered
    }
  }

  return results;
}

/**
 * Create a copy of the SVG with only the target element visible.
 * All other shape elements are hidden (display:none).
 */
function createIsolatedSvg(
  originalSvg: SVGSVGElement,
  _allElements: NodeListOf<Element>,
  targetIndex: number
): SVGSVGElement {
  const clone = originalSvg.cloneNode(true) as SVGSVGElement;
  // Ensure the SVG has explicit dimensions for canvas rendering
  const vb = clone.getAttribute('viewBox');
  if (vb) {
    const parts = vb.split(/[\s,]+/).map(Number);
    if (parts.length >= 4) {
      clone.setAttribute('width', String(parts[2]));
      clone.setAttribute('height', String(parts[3]));
    }
  }

  // Find all shape elements in the clone and hide everything except the target
  const cloneElements = clone.querySelectorAll('path, polygon, polyline, rect, circle, ellipse, line, text');
  cloneElements.forEach((el, idx) => {
    if (idx !== targetIndex) {
      (el as HTMLElement).style.display = 'none';
    } else {
      // Ensure the target is visible with a solid fill
      const fill = el.getAttribute('fill');
      if (!fill || fill === 'none') {
        el.setAttribute('fill', 'black');
      }
      const stroke = el.getAttribute('stroke');
      if (stroke && stroke !== 'none') {
        el.setAttribute('stroke', 'black');
        el.setAttribute('stroke-width', '1');
      }
    }
  });

  return clone;
}

/**
 * Trace the boundary of filled pixels in the image data.
 * Uses a simple contour tracing algorithm (Moore neighborhood).
 */
function traceBoundary(imageData: ImageData): { x: number; y: number }[] {
  const { width, height, data } = imageData;

  // Create binary mask: 1 = filled (alpha > 128), 0 = empty
  const isFilled = (x: number, y: number): boolean => {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    return data[(y * width + x) * 4 + 3] > 128; // Alpha channel
  };

  // Find the first filled pixel (start point)
  let startX = -1, startY = -1;
  outer: for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isFilled(x, y)) {
        startX = x;
        startY = y;
        break outer;
      }
    }
  }

  if (startX < 0) return [];

  // Moore neighborhood tracing
  const boundary: { x: number; y: number }[] = [];
  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1];

  let cx = startX, cy = startY;
  let dir = 7; // Start direction: upper-left
  const maxSteps = width * height; // Prevent infinite loops
  let steps = 0;

  do {
    boundary.push({ x: cx, y: cy });

    // Find next boundary pixel by scanning neighbors
    let found = false;
    const startDir = (dir + 5) % 8; // Backtrack direction
    for (let i = 0; i < 8; i++) {
      const d = (startDir + i) % 8;
      const nx = cx + dx[d];
      const ny = cy + dy[d];
      if (isFilled(nx, ny)) {
        cx = nx;
        cy = ny;
        dir = d;
        found = true;
        break;
      }
    }

    if (!found) break;
    steps++;
  } while ((cx !== startX || cy !== startY) && steps < maxSteps);

  // Subsample if boundary has too many points
  if (boundary.length > 5000) {
    const step = Math.ceil(boundary.length / 2000);
    return boundary.filter((_, i) => i % step === 0);
  }

  return boundary;
}

/**
 * Douglas-Peucker polygon simplification.
 * Reduces the number of points while preserving shape.
 */
function simplifyPolygon(
  points: { x: number; y: number }[],
  tolerance: number
): { x: number; y: number }[] {
  if (points.length <= 3) return points;

  // Find the point farthest from the line between first and last
  let maxDist = 0;
  let maxIdx = 0;

  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = pointToLineDistance(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > tolerance) {
    // Recurse on both halves
    const left = simplifyPolygon(points.slice(0, maxIdx + 1), tolerance);
    const right = simplifyPolygon(points.slice(maxIdx), tolerance);
    return [...left.slice(0, -1), ...right];
  } else {
    return [first, last];
  }
}

function pointToLineDistance(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
  const num = Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x);
  return num / Math.sqrt(lenSq);
}
