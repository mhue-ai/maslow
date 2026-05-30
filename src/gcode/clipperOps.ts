/**
 * ClipperLib wrapper — polygon boolean operations for CNC.
 * Uses js-angusj-clipper for mathematically correct polygon clipping,
 * offsetting, and containment testing.
 *
 * ClipperLib works with integer coordinates. We scale float mm values
 * by SCALE_FACTOR to preserve precision.
 */
import * as ClipperLib from 'js-angusj-clipper';

const SCALE = 10000; // 0.0001mm precision

interface Point {
  x: number;
  y: number;
}

let clipperInstance: ClipperLib.ClipperLibWrapper | null = null;

async function getClipper(): Promise<ClipperLib.ClipperLibWrapper> {
  if (!clipperInstance) {
    try {
      clipperInstance = await ClipperLib.loadNativeClipperLibInstanceAsync(
        ClipperLib.NativeClipperLibRequestedFormat.WasmWithAsmJsFallback as any
      );
    } catch (err) {
      throw new Error(`ClipperLib failed to initialize: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return clipperInstance;
}

function toClipper(points: Point[]): { x: number; y: number }[] {
  return points.map((p) => ({ x: Math.round(p.x * SCALE), y: Math.round(p.y * SCALE) }));
}

function fromClipper(data: readonly { x: number; y: number }[]): Point[] {
  return data.map((p) => ({ x: p.x / SCALE, y: p.y / SCALE }));
}

/**
 * Compute polygon A minus polygon B (difference).
 * Returns array of result polygons (may be multiple disjoint regions).
 * Returns empty array if the result is empty (B covers all of A).
 */
export async function polygonDifference(subject: Point[], clip: Point[]): Promise<Point[][]> {
  const c = await getClipper();
  const result = c.clipToPaths({
    clipType: ClipperLib.ClipType.Difference,
    subjectInputs: [{ data: toClipper(subject), closed: true }],
    clipInputs: [{ data: toClipper(clip) }],
    subjectFillType: ClipperLib.PolyFillType.EvenOdd,
  });
  // null = API error → return original as fallback
  // empty array = valid result, no geometry remains
  if (result === null || result === undefined) return [subject];
  if (result.length === 0) return [];
  return result.map((p) => fromClipper(p));
}

/**
 * Compute polygon A union polygon B.
 */
export async function polygonUnion(a: Point[], b: Point[]): Promise<Point[][]> {
  const c = await getClipper();
  const result = c.clipToPaths({
    clipType: ClipperLib.ClipType.Union,
    subjectInputs: [{ data: toClipper(a), closed: true }],
    clipInputs: [{ data: toClipper(b) }],
    subjectFillType: ClipperLib.PolyFillType.EvenOdd,
  });
  if (!result) return [a];
  return result.map((p) => fromClipper(p));
}

/**
 * Offset a polygon inward (negative distance) or outward (positive distance).
 *
 * Returns:
 * - `[polygon]` (unchanged input) when Clipper fails entirely (null/undefined result) —
 *   safe fallback for CAM that still wants SOMETHING to cut.
 * - `[]` (empty array) when the offset is so large the polygon disappears —
 *   this is a LEGITIMATE empty result, NOT an error. Callers must handle it
 *   (e.g. concentric fill must stop iterating when this happens).
 * - `[polygons]` — normal case, one or more offset polygons.
 */
export async function offsetPolygon(polygon: Point[], distance: number): Promise<Point[][]> {
  const c = await getClipper();
  const result = c.offsetToPaths({
    delta: Math.round(distance * SCALE),
    offsetInputs: [{ data: toClipper(polygon), joinType: ClipperLib.JoinType.Miter, endType: ClipperLib.EndType.ClosedPolygon }],
  });
  // null = Clipper error → fallback to original
  if (result === null || result === undefined) return [polygon];
  // Empty array = polygon disappeared (legitimate). DO NOT fall back to original —
  // that would cause infinite loops in concentric clearing.
  if (result.length === 0) return [];
  return result.map((p) => fromClipper(p));
}

/**
 * Test if `inner` is geometrically (almost entirely) inside `outer`.
 *
 * AREA-BASED containment, not a vertex sample. The previous implementation
 * sampled up to 8 vertices and returned true if a majority were inside — that
 * gave false positives for shapes straddling the boundary (e.g. 5/8 vertices
 * inside a partially-overlapping shape read as "fully contained") and false
 * negatives for concave islands whose sampled vertices sat in a notch. Both
 * mis-feed island detection and Z-level start-depth.
 *
 * Here: intersect inner ∩ outer and compare the intersection area to inner's
 * own area. If ≥99% of inner lies inside outer, it's contained. This is exact
 * up to Clipper's integer precision and robust to concavity and partial
 * overlap.
 */
export async function isPolygonInside(inner: Point[], outer: Point[]): Promise<boolean> {
  if (inner.length < 3 || outer.length < 3) return false;

  const c = await getClipper();
  const result = c.clipToPaths({
    clipType: ClipperLib.ClipType.Intersection,
    subjectInputs: [{ data: toClipper(inner), closed: true }],
    clipInputs: [{ data: toClipper(outer) }],
    subjectFillType: ClipperLib.PolyFillType.NonZero,
  });
  if (!result || result.length === 0) return false;

  const innerArea = polygonAreaInt(toClipper(inner));
  if (innerArea <= 0) return false;

  let intersectArea = 0;
  for (const path of result) intersectArea += polygonAreaInt(path);

  return intersectArea / innerArea >= 0.99;
}

/** Absolute shoelace area of an integer-coordinate polygon. */
function polygonAreaInt(poly: readonly { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/**
 * Subtract multiple clip polygons from a subject polygon.
 * Used for island avoidance: pocket = outer - island1 - island2 - ...
 * Returns empty array if all islands cover the entire pocket.
 */
export async function polygonDifferenceMultiple(subject: Point[], clips: Point[][]): Promise<Point[][]> {
  if (clips.length === 0) return [subject];

  const c = await getClipper();
  // Use NonZero fill for clips so NESTED clip polygons UNION instead of XOR.
  // With EvenOdd, a point inside both an outer clip and a nested inner clip
  // counts as "in 2 clips" → excluded from the clip region → re-INCLUDED in
  // the difference result. That produced cuts inside islands-within-islands
  // (e.g. a diamond inside a text block, both face-depth). NonZero treats
  // overlapping same-winding polygons as their union, giving the expected
  // "subject minus (union of all clips)" semantics.
  const result = c.clipToPaths({
    clipType: ClipperLib.ClipType.Difference,
    subjectInputs: [{ data: toClipper(subject), closed: true }],
    clipInputs: clips.map((clip) => ({ data: toClipper(clip) })),
    subjectFillType: ClipperLib.PolyFillType.EvenOdd,
    clipFillType: ClipperLib.PolyFillType.NonZero,
  });
  if (result === null || result === undefined) return [subject];
  if (result.length === 0) return []; // Islands cover entire pocket
  return result.map((p) => fromClipper(p));
}
