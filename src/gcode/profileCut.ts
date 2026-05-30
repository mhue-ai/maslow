import type { Shape } from 'three';
import type { ToolConfig } from '../types/design';
type ProfileOffset = 'none' | 'inside' | 'outside';
import type { SvgTransform } from '../svg/svgScaler';
import { transformPoint } from '../svg/svgScaler';
import { linearMove, rapid, rapidZ, plunge } from './gcodeWriter';
import { calculateDepthPasses } from './depthPasses';
import { offsetPolygon as clipperOffsetPolygon } from './clipperOps';
import { generateRampEntry } from './pocketClearing';

interface Point {
  x: number;
  y: number;
}

export interface ProfileGeometry {
  points: Point[];
  tabPositions: number[];
  tabTopZ: number;
  tabHalfWidth: number;
  totalDepth: number;
  passZs: number[];
  withTabs: boolean;
  span: number;
  /** Total closed-perimeter length including the closing segment. */
  perimeter: number;
}

/**
 * Pre-compute geometry for a profile/through cut.
 * Returns the offset points, tab positions, and depth pass list.
 * Used by both legacy `generateProfileGcode` and the Z-level scheduler.
 *
 * Uses ClipperLib for kerf-compensation offset — same library the pocket
 * clearing uses. The previous hand-rolled vertex-normal-averaging offset
 * broke on concave/reflex angles, producing self-intersecting polygons for
 * any realistic SVG shape.
 */
export async function prepareProfileGeometry(
  shape: Shape,
  totalDepth: number,
  tool: ToolConfig,
  transform: SvgTransform,
  withTabs: boolean,
  profileOffset: ProfileOffset = 'none',
): Promise<ProfileGeometry | null> {
  const rawPoints = shape.getPoints(128);
  let points: Point[] = rawPoints.map((p) => transformPoint(p.x, p.y, transform));
  if (points.length < 2) return null;

  if (profileOffset !== 'none') {
    const offsetDist = tool.bitDiameter / 2;
    const dir = profileOffset === 'outside' ? 1 : -1;
    const offsetResult = await clipperOffsetPolygon(points, offsetDist * dir);
    if (offsetResult.length === 0) return null;
    // Pick the largest resulting polygon. For 'outside', Clipper returns a
    // single enlarged polygon. For 'inside' on a weird shape that splits,
    // we cut the biggest piece (the remaining keeper outline).
    points = offsetResult.reduce((best, cand) =>
      polygonArea(cand) > polygonArea(best) ? cand : best, offsetResult[0]);
    if (points.length < 2) return null;
  }

  const passZs = calculateDepthPasses(totalDepth, tool.depthPerPass);
  const perimeter = pathLength(points, true);
  const tabPositions = withTabs ? calculateTabPositions(perimeter, tool.tabCount, tool.tabWidth) : [];
  const bbox = boundingBox(points);
  const span = Math.max(bbox.width, bbox.height);
  // Clamp tabHeight to < totalDepth so the tab top is always below the stock
  // surface — otherwise "passNeedsTabs" is always true and no material is cut
  // through the tab window, producing uncut tabs.
  const safeTabHeight = Math.min(tool.tabHeight, Math.max(0, totalDepth - 0.1));
  const tabTopZ = -(totalDepth - safeTabHeight);

  return {
    points,
    tabPositions,
    tabTopZ,
    tabHalfWidth: tool.tabWidth / 2,
    totalDepth,
    passZs,
    withTabs,
    span,
    perimeter,
  };
}

/**
 * Cut a profile/through-cut at a single Z layer.
 * Used by the Z-level scheduler so multiple through-cuts can be interleaved by depth.
 *
 * Tab handling correctly processes tab entry/exit with MID-SEGMENT interpolation.
 * A tab boundary landing inside a polyline segment splits the move at the exact
 * crossing point so the Z-raise/drop happens at the tab edge, not at the closest
 * polygon vertex. With coarse polylines the old endpoint-only logic effectively
 * destroyed tabs — the bit cut full-depth through most of the tab before rising.
 */
export function cutProfileAtLayer(
  geom: ProfileGeometry,
  z: number,
  passIdx: number,
  tool: ToolConfig,
): string[] {
  const lines: string[] = [];
  const { points, tabPositions, tabTopZ, tabHalfWidth, withTabs, passZs } = geom;
  const n = points.length;
  if (n < 2) return lines;

  const isFinalPass = passIdx === passZs.length - 1;
  const passNeedsTabs = withTabs && tabPositions.length > 0 && z < tabTopZ - 1e-6;

  // Entry: rapid to start, then plunge (ramp if enabled).
  lines.push(rapidZ(tool.safeHeight));
  lines.push(rapid(points[0].x, points[0].y));
  if (tool.rampPlunge && n >= 2) {
    // Build a path for ramp entry — trace the first few polygon segments.
    lines.push(...generateRampEntry([...points, points[0]], z, tool));
  } else {
    lines.push(plunge(z, tool.plungeRate));
  }

  let accumulated = 0;
  let currentZ = z;

  // Iterate over ALL closed-polygon segments, including the closing one (n-1 → 0).
  for (let i = 0; i < n; i++) {
    const prev = points[i];
    const curr = points[(i + 1) % n];
    const segLen = dist(prev, curr);
    if (segLen === 0) continue;

    const segStart = accumulated;
    const segEnd = segStart + segLen;

    if (!passNeedsTabs) {
      lines.push(linearMove(curr.x, curr.y, tool.feedRate));
      accumulated = segEnd;
      continue;
    }

    // Find all tab-boundary crossings inside this segment, sorted by position.
    interface Crossing { t: number; nowInTab: boolean }
    const crossings: Crossing[] = [];
    for (const tp of tabPositions) {
      const enter = tp - tabHalfWidth;
      const exit = tp + tabHalfWidth;
      if (enter > segStart && enter < segEnd) {
        crossings.push({ t: (enter - segStart) / segLen, nowInTab: true });
      }
      if (exit > segStart && exit < segEnd) {
        crossings.push({ t: (exit - segStart) / segLen, nowInTab: false });
      }
    }
    crossings.sort((a, b) => a.t - b.t);

    // Emit sub-segments between crossings. Switch Z at each crossing.
    for (const c of crossings) {
      const ix = prev.x + (curr.x - prev.x) * c.t;
      const iy = prev.y + (curr.y - prev.y) * c.t;
      lines.push(linearMove(ix, iy, tool.feedRate));
      const targetZ = c.nowInTab ? tabTopZ : z;
      if (Math.abs(targetZ - currentZ) > 1e-6) {
        lines.push(plunge(targetZ, tool.plungeRate));
        currentZ = targetZ;
      }
    }

    // Final sub-segment to the end of this polygon segment.
    lines.push(linearMove(curr.x, curr.y, tool.feedRate));
    accumulated = segEnd;
  }

  // If we ended inside a tab (shouldn't happen with sensible tab positions, but
  // numerical edge cases exist), drop back to cut depth before retracting so
  // callers emit a clean rapidZ.
  if (currentZ !== z) {
    lines.push(plunge(z, tool.plungeRate));
  }

  void isFinalPass; // kept as parameter for potential per-pass finishing logic
  return lines;
}

/**
 * Legacy entry point: generate profile cut as one block, all passes inline.
 * Now thin wrapper around prepareProfileGeometry + cutProfileAtLayer.
 */
export async function generateProfileGcode(
  shape: Shape,
  totalDepth: number,
  tool: ToolConfig,
  transform: SvgTransform,
  withTabs: boolean,
  profileOffset: ProfileOffset = 'none'
): Promise<string[]> {
  const geom = await prepareProfileGeometry(shape, totalDepth, tool, transform, withTabs, profileOffset);
  if (!geom) return [];

  const lines: string[] = [];
  if (withTabs) {
    lines.push(`; Through-cut span: ${geom.span.toFixed(0)}mm, ${geom.tabPositions.length} tabs (sled-bridge support)`);
    if (geom.span > 150) {
      lines.push(`; ⚠ Wide through-cut (${geom.span.toFixed(0)}mm > 150mm sled-radius) — verify support`);
    }
  }
  lines.push(`; Profile cut - depth ${totalDepth.toFixed(1)}mm`);

  for (let passIdx = 0; passIdx < geom.passZs.length; passIdx++) {
    const z = geom.passZs[passIdx];
    lines.push(`; Pass ${passIdx + 1}/${geom.passZs.length} at Z=${z.toFixed(3)}`);
    lines.push(...cutProfileAtLayer(geom, z, passIdx, tool));
  }
  lines.push(rapidZ(tool.safeHeight));
  return lines;
}

/**
 * Choose number of tabs based on the smaller of:
 *   - User's configured tabCount (their preference)
 *   - Auto-derived from perimeter to keep sled support adequate
 *
 * Maslow sled radius ~170mm. Tabs should be spaced no further than ~350mm
 * apart along the perimeter to maintain support during the final pass.
 *
 * Also: a perimeter < 200mm probably doesn't need tabs at all (sled bridges it).
 * Positions are along the CLOSED perimeter (including the segment from the
 * last polygon vertex back to the first), so tabs never cluster at one end.
 */
function calculateTabPositions(perimeter: number, userTabCount: number, tabWidth: number): number[] {
  // Tiny shapes — sled bridges naturally, skip tabs
  if (perimeter < 200) return [];

  // Auto-recommend tab count: at least 1 every 350mm (gives ~170mm sled radius slack)
  const MAX_SPACING = 350;
  const autoCount = Math.max(2, Math.ceil(perimeter / MAX_SPACING));

  // Use the larger of user count and auto count — never less support than auto recommends
  const tabCount = Math.max(userTabCount, autoCount);

  const spacing = perimeter / tabCount;
  // Sanity: tab width must be < spacing, otherwise tabs overlap / consume the
  // whole contour. Clamp tabCount down if necessary.
  const safeTabCount = spacing > tabWidth * 1.1
    ? tabCount
    : Math.max(1, Math.floor(perimeter / (tabWidth * 2.5)));
  const safeSpacing = perimeter / safeTabCount;

  const positions: number[] = [];
  for (let i = 0; i < safeTabCount; i++) {
    positions.push(safeSpacing * (i + 0.5));
  }
  return positions;
}

function boundingBox(points: Point[]): { width: number; height: number; minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Path length along the polyline. If `closed` (default true), includes the
 * segment from points[n-1] back to points[0] — required for a proper closed
 * contour perimeter. The old version silently dropped the closing segment,
 * which made tab positions cluster at the start of the contour.
 */
function pathLength(points: Point[], closed: boolean = true): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += dist(points[i - 1], points[i]);
  }
  if (closed && points.length > 2) {
    length += dist(points[points.length - 1], points[0]);
  }
  return length;
}

function polygonArea(polygon: Point[]): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    area += (b.x - a.x) * (b.y + a.y);
  }
  return Math.abs(area) / 2;
}

function dist(a: Point, b: Point): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}
