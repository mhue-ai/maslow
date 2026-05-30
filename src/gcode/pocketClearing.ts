import type { Shape } from 'three';
import type { ToolConfig, MillingDirection } from '../types/design';
import type { SvgTransform } from '../svg/svgScaler';
import { transformPoint } from '../svg/svgScaler';
import { linearMove, rapid, rapidZ, plunge } from './gcodeWriter';
import { calculateDepthPasses } from './depthPasses';
import { offsetPolygon, isPolygonInside, polygonDifferenceMultiple } from './clipperOps';

interface Point {
  x: number;
  y: number;
}

/**
 * Pocket clearing strategy (research-backed, see notes below):
 *
 * 1. **Offset (concentric) fill** — progressively offset the pocket boundary inward
 *    by (bitDiameter × stepover) creating spiral loops. Maintains consistent tool
 *    engagement → smoother walls and less chatter than zig-zag.
 *
 * 2. **Stock-to-leave** — roughing loops are offset by `bitRadius + stockToLeave`.
 *    Belt compliance on Maslow (0.5-1.5mm positional error) means roughing dims
 *    aren't reliable; stock-to-leave gives the finish pass material to cut cleanly.
 *
 * 3. **Finish pass** — one contour-following loop at `bitRadius` (no stock-to-leave)
 *    cuts the wall to exact dimension at reduced feed (65% of rough).
 *
 * 4. **Conventional milling** default — on belt-driven Maslow, climb can pull the
 *    sled unpredictably. Conventional is safer (chip thickens at entry → sled is
 *    pushed away from material, not into it).
 *
 * 5. **Ramp plunge** — descend at a shallow angle while moving along the contour
 *    instead of straight plunging. Prevents Z-axis chatter and reduces bit heat.
 *
 * Zig-zag strategy is kept as `fillStrategy: 'zigzag'` for users who want the
 * old behavior on simple open pockets where speed matters more than edge quality.
 */
export async function generatePocketGcode(
  shape: Shape,
  totalDepth: number,
  tool: ToolConfig,
  transform: SvgTransform,
  pocketRegions?: Point[][],
  startDepth: number = 0,
  islands: Point[][] = [],
): Promise<string[]> {
  const lines: string[] = [];

  // Pick the outer boundary: caller-supplied region (first entry) or raw shape.
  let outer: Point[];
  if (pocketRegions && pocketRegions.length > 0) {
    outer = pocketRegions[0];
  } else {
    const rawPoints = shape.getPoints(128);
    outer = rawPoints.map((p) => transformPoint(p.x, p.y, transform));
  }

  const startTag = startDepth > 0 ? `, start ${startDepth.toFixed(1)}mm (Z-level skip)` : '';
  lines.push(`; Pocket clearing - depth ${totalDepth.toFixed(1)}mm${startTag}, ${tool.fillStrategy} fill, ${tool.millingDirection} milling`);

  const passes = calculateDepthPasses(totalDepth, tool.depthPerPass, startDepth);

  if (passes.length === 0) {
    lines.push('; No passes needed — already cleared by enclosing shallower pocket');
    return lines;
  }

  for (let passIdx = 0; passIdx < passes.length; passIdx++) {
    const z = passes[passIdx];
    const isFinalPass = passIdx === passes.length - 1;
    lines.push(`; Pass ${passIdx + 1}/${passes.length} at Z=${z.toFixed(3)}`);
    lines.push(...(await cutPocketAtLayer(outer, islands, z, tool, isFinalPass, passIdx)));
  }

  lines.push(rapidZ(tool.safeHeight));
  return lines;
}

/**
 * Cut a pocket at a single Z layer.
 * Used by the Z-level (waterline) layer-by-layer scheduler in gcodeGenerator.
 *
 * Pass `isFinalPass=true` to enable the wall-finishing contour pass when
 * `tool.finishPass === 'final-only'`.
 *
 * `passIndex` is reserved for future per-pass logic (e.g., reduced feed on
 * intermediate roughing passes); concentric fill always spirals outer→inner
 * to avoid dragging through uncut material on reposition.
 */
export async function cutPocketAtLayer(
  outer: Point[],
  islands: Point[][],
  z: number,
  tool: ToolConfig,
  isFinalPass: boolean,
  passIndex: number = 0,
): Promise<string[]> {
  const lines: string[] = [];
  const bitRadius = tool.bitDiameter / 2;
  void passIndex;

  // ── Roughing ── offset outer inward by (bitRadius + stockToLeave). Keep
  // the island polygons separate — they get passed to the concentric fill
  // which re-subtracts them at each inward offset step, keeping the spiral
  // clear of every island at every depth.
  const roughOffset = -(bitRadius + tool.stockToLeave);
  const roughOuters = await offsetPolygon(outer, roughOffset);
  if (roughOuters.length === 0) {
    lines.push(`; Pocket too narrow for bit (${tool.bitDiameter}mm) at this level`);
    return lines;
  }

  // Expand each island outward by (bitRadius + stockToLeave). Tool center must
  // stay this far from the island edge so the bit radius doesn't touch it.
  const expandedIslands: Point[][] = [];
  for (const isl of islands) {
    const expanded = await offsetPolygon(isl, bitRadius + tool.stockToLeave);
    for (const e of expanded) if (e.length >= 3) expandedIslands.push(e);
  }

  for (const rOuter of roughOuters) {
    if (tool.fillStrategy === 'offset') {
      lines.push(...(await generateConcentricFill(rOuter, z, tool, expandedIslands)));
    } else {
      // Zigzag fill: pre-subtract once, fill each resulting CCW region.
      const diff = expandedIslands.length > 0
        ? await polygonDifferenceMultiple(rOuter, expandedIslands)
        : [rOuter];
      for (const region of diff) {
        if (region.length < 3) continue;
        if (signedArea(region) <= 0) continue; // skip CW hole contours
        lines.push(...generateZigzagFill(region, z, tool));
      }
    }
  }

  // ── Finishing pass ── wall contour at exact dim (bitRadius offset). Each
  // island gets a separate finish loop around it (expanded by bitRadius so the
  // bit edge exactly meets the island wall). The outer gets its own contour.
  const runFinish =
    tool.finishPass === 'per-layer' ||
    (tool.finishPass === 'final-only' && isFinalPass);

  if (runFinish) {
    // Outer wall finish.
    const outerFinish = await offsetPolygon(outer, -bitRadius);
    for (const fb of outerFinish) {
      if (fb.length < 3) continue;
      // Only run if rough actually cleared some of this region.
      let roughReachedHere = false;
      for (const rb of roughOuters) {
        if (await isPolygonInside(rb, fb) || await isPolygonInside(fb, rb)) {
          roughReachedHere = true;
          break;
        }
      }
      if (!roughReachedHere) {
        lines.push(`; Skipping finish pass — region not reached by rough`);
        continue;
      }
      lines.push('; Finish pass — outer wall');
      lines.push(...generateFinishContour(fb, z, tool));
    }

    // Island-wall finish: one contour around each island expanded by bitRadius.
    for (const isl of islands) {
      const islandFinish = await offsetPolygon(isl, bitRadius);
      for (const fb of islandFinish) {
        if (fb.length < 3) continue;
        lines.push('; Finish pass — around island');
        lines.push(...generateFinishContour(fb, z, tool));
      }
    }
  }

  return lines;
}

/**
 * CONCENTRIC offset clearing — spirals inward from the rough boundary.
 *
 * Correctly handles NON-CONVEX pockets: when an inward offset causes the
 * polygon to split into multiple disjoint sub-regions (e.g. an L-shape whose
 * narrow neck disappears), each sub-region is spiraled independently with
 * a full retract-rapid-plunge entry between them. Without this, the linear
 * reposition between disjoint islands would drag the bit sideways through
 * uncut full-thickness material.
 *
 * Each successive loop rotates its start point to the vertex closest to
 * where we ended the previous loop — keeps the inter-loop move short and
 * inside the already-cleared annulus.
 */
async function generateConcentricFill(
  roughBoundary: Point[],
  z: number,
  tool: ToolConfig,
  holes: Point[][] = [],
): Promise<string[]> {
  const lines: string[] = [];
  const stepover = tool.bitDiameter * tool.stepover;
  const MIN_AREA = tool.bitDiameter * tool.bitDiameter * 0.5;
  const MAX_TOTAL_LOOPS = 2000; // hard cap, last-resort safety

  // Helper: subtract holes from a polygon, keep only CCW "outer" pieces with
  // meaningful area. CW polygons returned by Clipper are hole contours we
  // don't need to traverse separately — the outer contour of each returned
  // CCW piece fully describes the cuttable boundary at that offset.
  const subtractHoles = async (poly: Point[]): Promise<Point[][]> => {
    if (holes.length === 0) return [poly];
    const diff = await polygonDifferenceMultiple(poly, holes);
    return diff.filter((p) => p.length >= 3 && signedArea(p) > 0 && polygonArea(p) >= MIN_AREA);
  };

  // BFS over regions. Each queue item is a polygon whose OUTERMOST loop still
  // needs cutting with a fresh plunge (because we just retracted to get here).
  // Seed: the input boundary with holes subtracted (may yield multiple regions).
  const queue: Point[][] = [];
  for (const p of await subtractHoles(roughBoundary)) queue.push(p);
  let totalLoops = 0;

  while (queue.length > 0 && totalLoops < MAX_TOTAL_LOOPS) {
    const regionRoot = queue.shift()!;
    if (regionRoot.length < 3 || polygonArea(regionRoot) < MIN_AREA) continue;

    // Cut the outermost loop of this region — plunge at start.
    lines.push(...cutContour(regionRoot, z, tool, true, 'inner'));
    totalLoops++;
    let ring = regionRoot;
    let ringArea = polygonArea(ring);

    // Spiral inward. At each step: offset inward, then re-subtract holes so
    // the ring correctly goes AROUND each island. If the result splits into
    // multiple regions (offset dipped into a hole from two sides), enqueue
    // each for independent spiraling with its own plunge entry.
    while (totalLoops < MAX_TOTAL_LOOPS) {
      const offsetInward = await offsetPolygon(ring, -stepover);
      if (offsetInward.length === 0) break;

      const withHoles: Point[][] = [];
      for (const p of offsetInward) {
        for (const sub of await subtractHoles(p)) withHoles.push(sub);
      }
      if (withHoles.length === 0) break;

      if (withHoles.length > 1) {
        for (const sub of withHoles) queue.push(sub);
        break;
      }

      const child = withHoles[0];
      const childArea = polygonArea(child);
      if (childArea >= ringArea - 0.01) break; // numerical degeneracy

      const rotated = rotateToClosestStart(child, ring[0]);
      // If the straight-line reposition from where we ended the previous
      // ring to the start of this one would cross ANY island, retract →
      // rapid → plunge instead of cutting across.
      const mustRetract = holes.length > 0 && segmentCrossesAny(ring[0], rotated[0], holes);
      lines.push(...cutContour(rotated, z, tool, mustRetract, 'inner'));
      totalLoops++;
      ring = rotated;
      ringArea = childArea;
    }
  }

  if (totalLoops >= MAX_TOTAL_LOOPS) {
    lines.push(`; WARN: concentric fill hit MAX_TOTAL_LOOPS=${MAX_TOTAL_LOOPS} — truncated`);
  }

  return lines;
}

/**
 * Does the segment A→B cross (or enter) any of the given closed polygons?
 * Used to decide whether a ring-to-ring reposition must retract+rapid+plunge
 * instead of linear-moving across — crossing an island at cut depth means
 * cutting through a feature that was supposed to stay raised.
 */
function segmentCrossesAny(a: Point, b: Point, polygons: Point[][]): boolean {
  for (const poly of polygons) {
    if (pointInPolygon(b, poly)) return true; // endpoint inside island
    if (pointInPolygon(a, poly)) return true; // unlikely, but defensive
    // Check intersection with each polygon edge.
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      if (segmentsIntersect(a, b, p1, p2)) return true;
    }
  }
  return false;
}

function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > p.y) !== (yj > p.y))
      && (p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const o = (p: Point, q: Point, r: Point) =>
    Math.sign((q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y));
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  return o1 !== o2 && o3 !== o4;
}

/**
 * Rotate a closed polygon so its first point is the vertex closest to `target`.
 * Used to minimize the inter-loop reposition distance when spiraling inward —
 * short straight line through the already-cleared annulus instead of potentially
 * crossing the interior.
 */
function rotateToClosestStart(polygon: Point[], target: Point): Point[] {
  if (polygon.length < 2) return polygon;
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const dx = polygon[i].x - target.x;
    const dy = polygon[i].y - target.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestDist) { bestDist = d2; bestIdx = i; }
  }
  if (bestIdx === 0) return polygon;
  return [...polygon.slice(bestIdx), ...polygon.slice(0, bestIdx)];
}

/** Legacy zig-zag raster fill (kept as fallback for simple rectangular pockets). */
function generateZigzagFill(roughBoundary: Point[], z: number, tool: ToolConfig): string[] {
  const lines: string[] = [];
  const stepover = tool.bitDiameter * tool.stepover;
  const bbox = computeBBox(roughBoundary);

  let direction = 1;
  let lastY: number | null = null;

  for (let y = bbox.minY + stepover / 2; y <= bbox.maxY - stepover / 2; y += stepover) {
    const intersections = scanLineIntersections(roughBoundary, y);
    if (intersections.length < 2) continue;
    intersections.sort((a, b) => a - b);

    for (let i = 0; i < intersections.length - 1; i += 2) {
      const x1 = intersections[i];
      const x2 = intersections[i + 1];
      if (x2 <= x1) continue;

      const startX = direction > 0 ? x1 : x2;
      const endX = direction > 0 ? x2 : x1;

      if (lastY === null || Math.abs(y - lastY) > stepover * 1.5) {
        lines.push(rapidZ(tool.safeHeight));
        lines.push(rapid(startX, y));
        lines.push(plunge(z, tool.plungeRate));
      } else {
        lines.push(linearMove(startX, y, tool.feedRate));
      }

      lines.push(linearMove(endX, y, tool.feedRate));
      lastY = y;
    }

    direction *= -1;
  }

  return lines;
}

/**
 * Cut a single closed contour at depth z.
 * If plungeIn is true, ramp or plunge at the first point, then trace the contour.
 * If false, assume tool is already at Z=z and just linearly move to the first point.
 */
function cutContour(
  polygon: Point[],
  z: number,
  tool: ToolConfig,
  plungeIn: boolean,
  boundaryType: 'outer' | 'inner' = 'outer',
): string[] {
  const lines: string[] = [];
  if (polygon.length < 3) return lines;

  const oriented = orientForMilling(polygon, tool.millingDirection, boundaryType);
  const first = oriented[0];

  if (plungeIn) {
    lines.push(rapidZ(tool.safeHeight));
    lines.push(rapid(first.x, first.y));

    if (tool.rampPlunge && oriented.length >= 2) {
      lines.push(...generateRampEntry(oriented, z, tool));
    } else {
      lines.push(plunge(z, tool.plungeRate));
    }
  } else {
    // Reposition inside the material — move linearly to the loop start.
    // Safe because we're already at cutting depth inside the pocket.
    lines.push(linearMove(first.x, first.y, tool.feedRate));
  }

  for (let i = 1; i < oriented.length; i++) {
    const p = oriented[i];
    lines.push(linearMove(p.x, p.y, tool.feedRate));
  }
  // Close the loop
  lines.push(linearMove(first.x, first.y, tool.feedRate));

  return lines;
}

/**
 * Finish pass: single contour at exact dim, reduced feed for clean wall.
 */
function generateFinishContour(polygon: Point[], z: number, tool: ToolConfig): string[] {
  const finishTool: ToolConfig = {
    ...tool,
    feedRate: Math.round(tool.feedRate * 0.65), // Finishing feed = 65% of rough
  };
  const lines: string[] = [];
  lines.push(rapidZ(tool.safeHeight));
  lines.push(...cutContour(polygon, z, finishTool, true));
  return lines;
}

/**
 * Ramp entry — descend at an angle while moving along the contour.
 * Descent distance = dropDepth / tan(rampAngle).
 * Exported so profile cuts can use the same entry strategy.
 */
export function generateRampEntry(polygon: Point[], targetZ: number, tool: ToolConfig): string[] {
  const lines: string[] = [];
  const startZ = tool.safeHeight;
  const dz = targetZ - startZ;
  const dropMagnitude = Math.abs(dz);
  const rampDist = dropMagnitude / Math.tan((tool.rampAngle * Math.PI) / 180);

  let walked = 0;
  let z = startZ;
  for (let i = 1; i < polygon.length; i++) {
    const prev = polygon[i - 1];
    const curr = polygon[i];
    const segLen = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    if (segLen === 0) continue;
    const remaining = rampDist - walked;

    if (segLen <= remaining) {
      walked += segLen;
      z = startZ + dz * (walked / rampDist);
      lines.push(`G1 X${curr.x.toFixed(3)} Y${curr.y.toFixed(3)} Z${z.toFixed(3)} F${tool.plungeRate}`);
    } else {
      const t = remaining / segLen;
      const ix = prev.x + (curr.x - prev.x) * t;
      const iy = prev.y + (curr.y - prev.y) * t;
      z = targetZ;
      lines.push(`G1 X${ix.toFixed(3)} Y${iy.toFixed(3)} Z${z.toFixed(3)} F${tool.plungeRate}`);
      break;
    }
  }

  // If the polygon was too short to complete the ramp, finish the plunge straight down.
  if (z > targetZ + 0.01 || z < targetZ - 0.01) {
    lines.push(`G1 Z${targetZ.toFixed(3)} F${tool.plungeRate}`);
  }

  return lines;
}

/**
 * Orient a polygon so the tool cuts in the desired direction.
 * For an OUTER boundary (material is outside the polygon): conventional = CCW.
 * For an INNER boundary (hole, material is inside): conventional = CW.
 * Conventional milling: tool rotation opposes feed direction → chip starts thick, ends thin.
 * Climb milling: tool rotation aligns with feed direction → chip starts thin, ends thick.
 *
 * IMPORTANT — coordinate frame: `polygon` is already in MACHINE space (the
 * SVG→machine transform applied a Y-flip, finalScaleY = -uniformScale, so
 * machine space is Y-up / right-handed). `signedArea > 0` therefore measures
 * true machine-space CCW. Because this function *forces* the winding to
 * `wantCCW` (reversing the polygon when it doesn't match), the input winding —
 * and hence the Y-flip's effect on it — is irrelevant: the emitted path always
 * has the same machine-space direction for a given (boundaryType, direction).
 * Do NOT add a mirror-compensation flip here; that would invert a correct,
 * frame-consistent convention.
 */
function orientForMilling(
  polygon: Point[],
  direction: MillingDirection,
  boundaryType: 'outer' | 'inner',
): Point[] {
  // Determine desired winding based on direction and boundary type
  let wantCCW: boolean;
  if (boundaryType === 'outer') {
    wantCCW = direction === 'conventional';
  } else {
    wantCCW = direction === 'climb';
  }

  const currentIsCCW = signedArea(polygon) > 0;
  if (currentIsCCW === wantCCW) return polygon;
  return [...polygon].reverse();
}

function signedArea(polygon: Point[]): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    area += (b.x - a.x) * (b.y + a.y);
  }
  return -area / 2;
}

function polygonArea(polygon: Point[]): number {
  return Math.abs(signedArea(polygon));
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
