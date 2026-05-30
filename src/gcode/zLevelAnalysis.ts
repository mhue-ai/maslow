/**
 * Z-level (waterline) machining analysis.
 *
 * For each pocket shape, determine the "start depth" — the depth at which
 * an enclosing shallower pocket has already cleared material above this shape.
 *
 * Example:
 *   Shape A (outer hexagon) — 3mm deep
 *   Shape B (rectangle inside A) — 6mm deep
 *
 * Without Z-level: B cuts 0→6mm (wasted air passes 0→3mm since A already cleared)
 * With Z-level:    B cuts 3→6mm (one pass, skipping the air)
 *
 * Rules (from research — verified against Fusion 360 & FreeCAD):
 * - Only consider OVERLAPPING shapes (not adjacent/separate).
 * - Consider the SHALLOWEST enclosing shape (if multiple contain this shape,
 *   only the shallowest one cleared material above us; deeper enclosers are
 *   themselves this shape's peers).
 * - A shape doesn't count as an "enclosing clearer" unless its depth > 0
 *   (face-level shapes don't remove material).
 * - The profile cut (always last, always full-depth) is NOT an enclosing clearer
 *   for internal pockets because it runs AFTER them.
 */
import type { ShapeLevel } from '../types/design';
import type { SvgTransform } from '../svg/svgScaler';
import type { ConvertedPath } from '../svg/svgToShapes';
import { isPolygonInside } from './clipperOps';
import { shapeToPolygon } from './islandDetection';

export interface ShapeStartDepths {
  /** Map of shapeId → starting depth (in mm, positive). 0 = start from surface. */
  startDepths: Map<string, number>;
}

/**
 * For each shape with a pocket cut (level > 0), compute the depth at which
 * an enclosing shallower pocket would have already cleared material.
 *
 * Returns a Map where missing entries default to 0 (start from surface).
 */
export async function computeShapeStartDepths(
  paths: ConvertedPath[],
  shapeLevels: Map<string, ShapeLevel>,
  transform: SvgTransform,
  profileCutId: string | null,
): Promise<ShapeStartDepths> {
  const startDepths = new Map<string, number>();

  // Build polygons for every shape (cached, avoids N² polygon regeneration)
  const polyCache = new Map<string, { x: number; y: number }[]>();
  for (const path of paths) {
    if (path.shapes.length === 0) continue;
    polyCache.set(path.data.id, shapeToPolygon(path.shapes[0], transform));
  }

  // For each shape, find the shallowest OTHER shape that contains it.
  for (const path of paths) {
    const shapeId = path.data.id;
    const myLevel = shapeLevels.get(shapeId)?.level ?? 0;
    if (myLevel <= 0) continue; // Face — not a pocket

    const myPoly = polyCache.get(shapeId);
    if (!myPoly || myPoly.length < 3) continue;

    let shallowestEncloser = Infinity;

    for (const other of paths) {
      if (other.data.id === shapeId) continue;
      if (other.data.id === profileCutId) continue; // Profile runs last, not a clearer
      const otherLevel = shapeLevels.get(other.data.id)?.level ?? 0;
      // Encloser must cut (level > 0) AND be shallower than us (otherwise it
      // doesn't clear material ABOVE us — it clears SAME-depth material).
      if (otherLevel <= 0 || otherLevel >= myLevel) continue;

      const otherPoly = polyCache.get(other.data.id);
      if (!otherPoly || otherPoly.length < 3) continue;

      // Is MY polygon inside OTHER's polygon?
      const contained = await isPolygonInside(myPoly, otherPoly);
      if (contained && otherLevel < shallowestEncloser) {
        shallowestEncloser = otherLevel;
      }
    }

    if (shallowestEncloser !== Infinity) {
      startDepths.set(shapeId, shallowestEncloser);
    }
  }

  return { startDepths };
}
