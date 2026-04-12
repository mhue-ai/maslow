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
 * Replaces the naive vertex-normal approach in profileCut.ts.
 */
export async function offsetPolygon(polygon: Point[], distance: number): Promise<Point[][]> {
  const c = await getClipper();
  const result = c.offsetToPaths({
    delta: Math.round(distance * SCALE),
    offsetInputs: [{ data: toClipper(polygon), joinType: ClipperLib.JoinType.Miter, endType: ClipperLib.EndType.ClosedPolygon }],
  });
  if (!result || result.length === 0) return [polygon];
  return result.map((p) => fromClipper(p));
}

/**
 * Test if inner polygon is geometrically inside outer polygon.
 * Tests MULTIPLE points of the inner polygon (not just centroid)
 * to handle concave shapes correctly.
 */
export async function isPolygonInside(inner: Point[], outer: Point[]): Promise<boolean> {
  const c = await getClipper();
  const outerClipper = toClipper(outer);

  // Test multiple points of the inner polygon — if majority are inside, it's contained
  const testCount = Math.min(inner.length, 8); // Test up to 8 points
  const step = Math.max(1, Math.floor(inner.length / testCount));
  let insideCount = 0;

  for (let i = 0; i < inner.length; i += step) {
    const p = inner[i];
    const result = c.pointInPolygon(
      { x: Math.round(p.x * SCALE), y: Math.round(p.y * SCALE) },
      outerClipper
    );
    if (result !== 0) insideCount++; // 1 = inside, -1 = on edge
  }

  // Consider "inside" if more than half the tested points are inside
  return insideCount > testCount / 2;
}

/**
 * Subtract multiple clip polygons from a subject polygon.
 * Used for island avoidance: pocket = outer - island1 - island2 - ...
 * Returns empty array if all islands cover the entire pocket.
 */
export async function polygonDifferenceMultiple(subject: Point[], clips: Point[][]): Promise<Point[][]> {
  if (clips.length === 0) return [subject];

  const c = await getClipper();
  const result = c.clipToPaths({
    clipType: ClipperLib.ClipType.Difference,
    subjectInputs: [{ data: toClipper(subject), closed: true }],
    clipInputs: clips.map((clip) => ({ data: toClipper(clip) })),
    subjectFillType: ClipperLib.PolyFillType.EvenOdd,
  });
  if (result === null || result === undefined) return [subject];
  if (result.length === 0) return []; // Islands cover entire pocket
  return result.map((p) => fromClipper(p));
}
