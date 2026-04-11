import type { Shape, Vector2 } from 'three';
import type { ToolConfig } from '../types/design';
import { linearMove, rapid, rapidZ, plunge } from './gcodeWriter';
import { calculateDepthPasses } from './depthPasses';

interface Point {
  x: number;
  y: number;
}

/**
 * Generate profile cut G-code that follows the shape outline.
 * Uses linearized path segments (all G1 moves, no arcs for MVP).
 */
export function generateProfileGcode(
  shape: Shape,
  totalDepth: number,
  tool: ToolConfig,
  transform: { scaleX: number; scaleY: number; offsetX: number; offsetY: number },
  withTabs: boolean
): string[] {
  const lines: string[] = [];

  // Get outline points with high resolution
  const rawPoints = shape.getPoints(128);
  const points: Point[] = rawPoints.map((p) => ({
    x: p.x * transform.scaleX + transform.offsetX,
    y: p.y * transform.scaleY + transform.offsetY,
  }));

  if (points.length < 2) return lines;

  const passes = calculateDepthPasses(totalDepth, tool.depthPerPass);

  // Calculate tab positions along the path
  const tabPositions = withTabs
    ? calculateTabPositions(points, tool.tabCount)
    : [];

  lines.push(`; Profile cut - depth ${totalDepth.toFixed(1)}mm`);

  for (const z of passes) {
    const isFinalPass = z === passes[passes.length - 1];
    lines.push(`; Pass at Z=${z.toFixed(3)}`);

    // Rapid to start
    lines.push(rapidZ(tool.safeHeight));
    lines.push(rapid(points[0].x, points[0].y));
    lines.push(plunge(z, tool.plungeRate));

    // Follow the path
    const totalLength = pathLength(points);
    let accumulated = 0;

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const segLen = dist(prev, curr);
      accumulated += segLen;

      // Check if we're in a tab zone (only on final pass with through-cuts)
      if (withTabs && isFinalPass) {
        const inTab = tabPositions.some(
          (tp) => Math.abs(accumulated - tp) < tool.tabWidth / 2
        );
        if (inTab) {
          const tabZ = z + tool.tabHeight;
          lines.push(`G1 Z${tabZ.toFixed(3)} F${tool.plungeRate}`);
          lines.push(linearMove(curr.x, curr.y, tool.feedRate));
          lines.push(plunge(z, tool.plungeRate));
          continue;
        }
      }

      lines.push(linearMove(curr.x, curr.y, tool.feedRate));
    }

    // Close the path
    lines.push(linearMove(points[0].x, points[0].y, tool.feedRate));
  }

  lines.push(rapidZ(tool.safeHeight));
  return lines;
}

function calculateTabPositions(points: Point[], tabCount: number): number[] {
  const total = pathLength(points);
  const positions: number[] = [];
  const spacing = total / tabCount;

  for (let i = 0; i < tabCount; i++) {
    positions.push(spacing * (i + 0.5));
  }

  return positions;
}

function pathLength(points: Point[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += dist(points[i - 1], points[i]);
  }
  return length;
}

function dist(a: Point, b: Point): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}
