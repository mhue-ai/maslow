import type { Shape, Vector2 } from 'three';
import type { ToolConfig } from '../types/design';
import { linearMove, rapid, rapidZ, plunge } from './gcodeWriter';
import { calculateDepthPasses } from './depthPasses';

interface Point {
  x: number;
  y: number;
}

/**
 * Generate zig-zag pocket clearing G-code for a shape.
 * Uses horizontal scan lines clipped to the shape boundary.
 */
export function generatePocketGcode(
  shape: Shape,
  totalDepth: number,
  tool: ToolConfig,
  transform: { scaleX: number; scaleY: number; offsetX: number; offsetY: number }
): string[] {
  const lines: string[] = [];
  const stepover = tool.bitDiameter * tool.stepover;

  // Get shape outline points
  const points = shape.getPoints(64);
  const polygon = points.map((p) => transformPoint(p, transform));

  // Compute bounding box of transformed polygon
  const bbox = computeBBox(polygon);

  // Calculate depth passes
  const passes = calculateDepthPasses(totalDepth, tool.depthPerPass);

  lines.push(`; Pocket clearing - depth ${totalDepth.toFixed(1)}mm`);

  for (const z of passes) {
    lines.push(`; Pass at Z=${z.toFixed(3)}`);
    lines.push(rapidZ(tool.safeHeight));

    // Generate scan lines
    let direction = 1; // alternating direction for zig-zag
    for (let y = bbox.minY + stepover / 2; y <= bbox.maxY - stepover / 2; y += stepover) {
      const intersections = scanLineIntersections(polygon, y);
      if (intersections.length < 2) continue;

      // Sort intersections by X
      intersections.sort((a, b) => a - b);

      // Process pairs of intersections (inside/outside)
      for (let i = 0; i < intersections.length - 1; i += 2) {
        const x1 = intersections[i] + tool.bitDiameter / 2;
        const x2 = intersections[i + 1] - tool.bitDiameter / 2;
        if (x2 <= x1) continue;

        const startX = direction > 0 ? x1 : x2;
        const endX = direction > 0 ? x2 : x1;

        lines.push(rapidZ(tool.safeHeight));
        lines.push(rapid(startX, y));
        lines.push(plunge(z, tool.plungeRate));
        lines.push(linearMove(endX, y, tool.feedRate));
      }

      direction *= -1;
    }
  }

  lines.push(rapidZ(tool.safeHeight));
  return lines;
}

function transformPoint(
  p: Vector2,
  t: { scaleX: number; scaleY: number; offsetX: number; offsetY: number }
): Point {
  return {
    x: p.x * t.scaleX + t.offsetX,
    y: p.y * t.scaleY + t.offsetY,
  };
}

function computeBBox(points: Point[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

/**
 * Find X intersections of a horizontal scan line at Y with a polygon.
 */
function scanLineIntersections(polygon: Point[], y: number): number[] {
  const intersections: number[] = [];
  const n = polygon.length;

  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];

    // Check if the scan line crosses this edge
    if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
      const t = (y - a.y) / (b.y - a.y);
      intersections.push(a.x + t * (b.x - a.x));
    }
  }

  return intersections;
}
