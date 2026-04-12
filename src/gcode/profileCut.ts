import type { Shape } from 'three';
import type { ToolConfig } from '../types/design';
type ProfileOffset = 'none' | 'inside' | 'outside';
import type { SvgTransform } from '../svg/svgScaler';
import { transformPoint } from '../svg/svgScaler';
import { linearMove, rapid, rapidZ, plunge } from './gcodeWriter';
import { calculateDepthPasses } from './depthPasses';

interface Point {
  x: number;
  y: number;
}

/**
 * Generate profile cut G-code that follows the shape outline.
 * Uses linearized path segments (all G1 moves, no arcs for MVP).
 * profileOffset shifts the path by half the bit diameter inside or outside.
 */
export function generateProfileGcode(
  shape: Shape,
  totalDepth: number,
  tool: ToolConfig,
  transform: SvgTransform,
  withTabs: boolean,
  profileOffset: ProfileOffset = 'none'
): string[] {
  const lines: string[] = [];

  // Get outline points with high resolution, apply full transform (scale + rotation + offset)
  const rawPoints = shape.getPoints(128);
  let points: Point[] = rawPoints.map((p) => transformPoint(p.x, p.y, transform));

  if (points.length < 2) return lines;

  // Apply bit offset compensation
  if (profileOffset !== 'none') {
    const offsetDist = tool.bitDiameter / 2;
    const dir = profileOffset === 'outside' ? 1 : -1;
    points = offsetPolygon(points, offsetDist * dir);
    if (points.length < 2) return lines;
  }

  const passes = calculateDepthPasses(totalDepth, tool.depthPerPass);

  // Calculate tab positions along the path (center of each tab)
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

    // Follow the path, tracking tab zone entry/exit
    let accumulated = 0;
    let inTab = false;
    const tabZ = z + tool.tabHeight;
    const halfTabWidth = tool.tabWidth / 2;

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      accumulated += dist(prev, curr);

      if (withTabs && isFinalPass && tabPositions.length > 0) {
        const nowInTab = tabPositions.some(
          (tp) => accumulated >= tp - halfTabWidth && accumulated <= tp + halfTabWidth
        );

        if (nowInTab && !inTab) {
          // Entering tab zone — raise Z
          lines.push(plunge(tabZ, tool.plungeRate));
          inTab = true;
        } else if (!nowInTab && inTab) {
          // Exiting tab zone — plunge back down
          inTab = false;
          lines.push(linearMove(curr.x, curr.y, tool.feedRate));
          lines.push(plunge(z, tool.plungeRate));
          continue;
        }
      }

      lines.push(linearMove(curr.x, curr.y, tool.feedRate));
    }

    // If still in a tab at end, plunge back before closing
    if (inTab) {
      lines.push(plunge(z, tool.plungeRate));
    }

    // Close the path
    lines.push(linearMove(points[0].x, points[0].y, tool.feedRate));
  }

  lines.push(rapidZ(tool.safeHeight));
  return lines;
}

function calculateTabPositions(points: Point[], tabCount: number): number[] {
  if (tabCount <= 0) return [];
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

/**
 * Offset a closed polygon by a distance. Positive = outward, negative = inward.
 * Uses vertex normal averaging for simple offset.
 */
function offsetPolygon(points: Point[], distance: number): Point[] {
  const n = points.length;
  if (n < 3) return points;

  const result: Point[] = [];

  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];

    // Edge normals (perpendicular to edge, pointing outward)
    const e1 = { x: curr.x - prev.x, y: curr.y - prev.y };
    const e2 = { x: next.x - curr.x, y: next.y - curr.y };

    // Normals (rotate 90 degrees CCW)
    const n1 = normalize({ x: -e1.y, y: e1.x });
    const n2 = normalize({ x: -e2.y, y: e2.x });

    // Average normal at vertex
    const avg = normalize({ x: n1.x + n2.x, y: n1.y + n2.y });

    // Degenerate case: collinear or zero-length edges — fall back to edge normal
    if (avg.x === 0 && avg.y === 0) {
      result.push({
        x: curr.x + n1.x * distance,
        y: curr.y + n1.y * distance,
      });
      continue;
    }

    // Handle sharp corners: limit offset to avoid self-intersection
    const dot = n1.x * avg.x + n1.y * avg.y;
    const scale = dot > 0.1 ? distance / dot : distance;

    result.push({
      x: curr.x + avg.x * scale,
      y: curr.y + avg.y * scale,
    });
  }

  return result;
}

function normalize(p: Point): Point {
  const len = Math.sqrt(p.x * p.x + p.y * p.y);
  if (len < 0.0001) return { x: 0, y: 0 };
  return { x: p.x / len, y: p.y / len };
}
