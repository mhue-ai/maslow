import type { Shape } from 'three';
import type { ToolConfig } from '../types/design';
import type { SvgTransform } from '../svg/svgScaler';
import { transformPoint } from '../svg/svgScaler';
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
  transform: SvgTransform
): string[] {
  const lines: string[] = [];
  const stepover = tool.bitDiameter * tool.stepover;

  // Get shape outline points, apply full transform (scale + rotation + offset)
  const rawPoints = shape.getPoints(64);
  const polygon: Point[] = rawPoints.map((p) => transformPoint(p.x, p.y, transform));

  // Compute bounding box of transformed polygon
  const bbox = computeBBox(polygon);

  // Calculate depth passes
  const passes = calculateDepthPasses(totalDepth, tool.depthPerPass);

  lines.push(`; Pocket clearing - depth ${totalDepth.toFixed(1)}mm`);

  for (const z of passes) {
    lines.push(`; Pass at Z=${z.toFixed(3)}`);
    lines.push(rapidZ(tool.safeHeight));

    // Generate scan lines — retract only between non-adjacent segments
    let direction = 1;
    let lastY: number | null = null;

    for (let y = bbox.minY + stepover / 2; y <= bbox.maxY - stepover / 2; y += stepover) {
      const intersections = scanLineIntersections(polygon, y);
      if (intersections.length < 2) continue;

      intersections.sort((a, b) => a - b);

      for (let i = 0; i < intersections.length - 1; i += 2) {
        const x1 = intersections[i] + tool.bitDiameter / 2;
        const x2 = intersections[i + 1] - tool.bitDiameter / 2;
        if (x2 <= x1) continue;

        const startX = direction > 0 ? x1 : x2;
        const endX = direction > 0 ? x2 : x1;

        // Only retract if we need to reposition (not continuous zig-zag)
        if (lastY === null || Math.abs(y - lastY) > stepover * 1.5) {
          lines.push(rapidZ(tool.safeHeight));
          lines.push(rapid(startX, y));
          lines.push(plunge(z, tool.plungeRate));
        } else {
          // Continue cutting to next scan line
          lines.push(linearMove(startX, y, tool.feedRate));
        }

        lines.push(linearMove(endX, y, tool.feedRate));
        lastY = y;
      }

      direction *= -1;
    }
  }

  lines.push(rapidZ(tool.safeHeight));
  return lines;
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
 * Uses strict inequality on one side to avoid duplicate vertex intersections.
 */
function scanLineIntersections(polygon: Point[], y: number): number[] {
  const intersections: number[] = [];
  const n = polygon.length;

  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];

    if ((a.y < y && b.y >= y) || (b.y < y && a.y >= y)) {
      const t = (y - a.y) / (b.y - a.y);
      intersections.push(a.x + t * (b.x - a.x));
    }
  }

  return intersections;
}
