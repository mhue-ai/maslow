/**
 * Easel-style depth-first island avoidance.
 *
 * When pocketing a shape, detect all shapes inside it that are at a
 * shallower depth (islands). Subtract the island polygons from the
 * pocket area so the pocket clearing avoids cutting through them.
 */
import type { Shape } from 'three';
import type { ShapeLevel } from '../types/design';
import type { SvgTransform } from '../svg/svgScaler';
import { transformPoint } from '../svg/svgScaler';
import { isPolygonInside, polygonDifferenceMultiple } from './clipperOps';
import type { ConvertedPath } from '../svg/svgToShapes';

interface Point {
  x: number;
  y: number;
}

export interface PocketRegion {
  shapeId: string;
  depth: number;
  /** Raw outer boundary of the target shape (NOT yet island-subtracted). */
  outer: Point[];
  /** Island polygons that should be preserved (shapes inside the target at
   *  a shallower depth). Subtract these AT EACH offset step of concentric
   *  fill — not just once — so inward spirals don't cut through them. */
  islands: Point[][];
  /** Legacy: outer minus islands. Kept for callers that don't do island-aware
   *  concentric fill. Newer code should use `outer` and `islands`. */
  pocketPolygons: Point[][];
  islandIds: string[];
}

/**
 * Extract polygon points from a Three.js Shape, transformed to material space.
 */
export function shapeToPolygon(shape: Shape, transform: SvgTransform): Point[] {
  const rawPts = shape.getPoints(64);
  return rawPts.map((p) => transformPoint(p.x, p.y, transform));
}

/**
 * Detect islands inside a pocket shape and compute the cuttable area.
 *
 * An island is any shape whose polygon is geometrically inside the
 * target shape AND whose depth level is shallower (closer to surface).
 * Islands are subtracted from the pocket area so the CNC doesn't cut
 * through them.
 */
export async function detectIslands(
  targetShapeId: string,
  targetDepth: number,
  allPaths: ConvertedPath[],
  shapeLevels: Map<string, ShapeLevel>,
  transform: SvgTransform
): Promise<PocketRegion> {
  // Get the target shape's polygon
  const targetPath = allPaths.find((p) => p.data.id === targetShapeId);
  if (!targetPath || targetPath.shapes.length === 0) {
    return { shapeId: targetShapeId, depth: targetDepth, outer: [], islands: [], pocketPolygons: [], islandIds: [] };
  }

  const targetPoly = shapeToPolygon(targetPath.shapes[0], transform);
  if (targetPoly.length < 3) {
    return { shapeId: targetShapeId, depth: targetDepth, outer: targetPoly, islands: [], pocketPolygons: [targetPoly], islandIds: [] };
  }

  // Find all shapes that are:
  // 1. Geometrically inside the target shape
  // 2. At a shallower depth (level < targetDepth) — these are islands to preserve
  const islandPolygons: Point[][] = [];
  const islandIds: string[] = [];

  for (const path of allPaths) {
    if (path.data.id === targetShapeId) continue;
    if (path.shapes.length === 0) continue;

    const level = shapeLevels.get(path.data.id)?.level ?? 0;
    if (level >= targetDepth) continue; // Same depth or deeper — not an island

    const poly = shapeToPolygon(path.shapes[0], transform);
    if (poly.length < 3) continue;

    // Check if this shape is inside the target
    const inside = await isPolygonInside(poly, targetPoly);
    if (inside) {
      islandPolygons.push(poly);
      islandIds.push(path.data.id);
    }
  }

  // Compute pocket area: target minus all islands
  let pocketPolygons: Point[][];
  if (islandPolygons.length > 0) {
    pocketPolygons = await polygonDifferenceMultiple(targetPoly, islandPolygons);
  } else {
    pocketPolygons = [targetPoly];
  }

  return {
    shapeId: targetShapeId,
    depth: targetDepth,
    outer: targetPoly,
    islands: islandPolygons,
    pocketPolygons,
    islandIds,
  };
}
