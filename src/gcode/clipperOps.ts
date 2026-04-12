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
    clipperInstance = await ClipperLib.loadNativeClipperLibInstanceAsync(
      // @ts-ignore — loadNativeClipperLibInstanceAsync accepts format
      ClipperLib.NativeClipperLibRequestedFormat.WasmWithAsmJsFallback
    );
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
 */
export async function polygonDifference(subject: Point[], clip: Point[]): Promise<Point[][]> {
  const c = await getClipper();
  const result = c.clipToPaths({
    clipType: ClipperLib.ClipType.Difference,
    subjectInputs: [{ data: toClipper(subject), closed: true }],
    clipInputs: [{ data: toClipper(clip) }],
    subjectFillType: ClipperLib.PolyFillType.EvenOdd,
  });
  if (!result) return [subject]; // fallback: return original if clipping fails
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
 * Uses Clipper's point-in-polygon test on the centroid of the inner polygon.
 */
export async function isPolygonInside(inner: Point[], outer: Point[]): Promise<boolean> {
  const c = await getClipper();

  // Test centroid of inner polygon
  let cx = 0, cy = 0;
  for (const p of inner) { cx += p.x; cy += p.y; }
  cx /= inner.length;
  cy /= inner.length;

  const result = c.pointInPolygon({ x: Math.round(cx * SCALE), y: Math.round(cy * SCALE) }, toClipper(outer));
  return result !== 0; // 0 = outside, 1 = inside, -1 = on edge
}

/**
 * Subtract multiple clip polygons from a subject polygon.
 * Used for island avoidance: pocket = outer - island1 - island2 - ...
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
  if (!result) return [subject];
  return result.map((p) => fromClipper(p));
}
