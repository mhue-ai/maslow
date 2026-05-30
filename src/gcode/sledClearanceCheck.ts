/**
 * Sled-clearance analysis for Maslow CNC.
 *
 * The Maslow 4 has a sled (~340mm diameter, ~170mm radius around the bit) that
 * physically rests on the material surface. Any cut creates a void the sled
 * later has to bridge or route around.
 *
 * Rules:
 *   - Voids < 100mm wide: sled bridges them safely
 *   - Voids 100-170mm wide: marginal — sled may dip
 *   - Voids > 170mm wide: sled loses support, belts pull at bad angle
 *
 * This module scans the user's design (NOT the generated G-code) for cut
 * regions whose bounding box exceeds these limits, and emits warnings.
 */
import type { ShapeLevel, Material } from '../types/design';
import type { ConvertedPath } from '../svg/svgToShapes';
import type { SvgTransform } from '../svg/svgScaler';
import { transformPoint } from '../svg/svgScaler';

const SLED_BRIDGE_LIMIT = 100;
const SLED_DANGER_SPAN = 170;
const SLED_FAIL_SPAN = 250;

export interface SledWarning {
  level: 'info' | 'warning' | 'error';
  shapeId: string;
  shapeName: string;
  message: string;
  span: number;
  cutDepth: number;
}

export interface SledClearanceResult {
  warnings: SledWarning[];
  hasErrors: boolean;
  hasWarnings: boolean;
}

/**
 * Scan all cut shapes for sled-support issues.
 * Call this AFTER generating G-code as a quality check.
 */
export function checkSledClearance(
  paths: ConvertedPath[],
  shapeLevels: Map<string, ShapeLevel>,
  transform: SvgTransform,
  material: Material,
  profileCutId: string | null,
): SledClearanceResult {
  const warnings: SledWarning[] = [];

  for (const path of paths) {
    const shapeId = path.data.id;
    const level = shapeLevels.get(shapeId)?.level ?? 0;
    if (level <= 0) continue; // Face — no cut, no sled issue

    const isThrough = level >= material.thickness;
    const isProfile = shapeId === profileCutId;

    for (const shape of path.shapes) {
      const points = shape.getPoints(64).map((p) => transformPoint(p.x, p.y, transform));
      if (points.length < 3) continue;

      const bbox = computeBBox(points);
      const span = Math.max(bbox.width, bbox.height);

      // For PROFILE cut: the sled rides OUTSIDE the cut, so big profile = good
      // For internal cuts: sled has to bridge OVER the cut area
      if (isProfile) {
        // Profile is fine — sled rides on the workpiece itself
        continue;
      }

      if (isThrough) {
        // Through-cut: sled must bridge this void after the cut
        if (span > SLED_FAIL_SPAN) {
          warnings.push({
            level: 'error',
            shapeId, shapeName: path.data.name, span, cutDepth: level,
            message: `Through-cut ${span.toFixed(0)}mm wide exceeds sled span (~${SLED_DANGER_SPAN}mm). Sled will lose support after this cut. Add support webs/tabs or split into smaller features.`,
          });
        } else if (span > SLED_DANGER_SPAN) {
          warnings.push({
            level: 'warning',
            shapeId, shapeName: path.data.name, span, cutDepth: level,
            message: `Through-cut ${span.toFixed(0)}mm wide exceeds sled radius (${SLED_DANGER_SPAN}mm). Tabs may not be enough — verify sled support before cutting.`,
          });
        } else if (span > SLED_BRIDGE_LIMIT) {
          warnings.push({
            level: 'info',
            shapeId, shapeName: path.data.name, span, cutDepth: level,
            message: `Through-cut ${span.toFixed(0)}mm — sled will dip slightly into the void. Tabs recommended (auto-added).`,
          });
        }
      } else {
        // Pocket (relief): the sled doesn't bridge yet (material is still there
        // at the surface in some sense, just lower). But large WIDE pockets
        // still cause sled issues because the surface drops uniformly.
        if (span > SLED_FAIL_SPAN && level > material.thickness * 0.5) {
          warnings.push({
            level: 'warning',
            shapeId, shapeName: path.data.name, span, cutDepth: level,
            message: `Deep wide pocket: ${span.toFixed(0)}mm × ${level.toFixed(0)}mm deep. Sled may tip into the recess during traversal.`,
          });
        }
      }

    }
  }

  return {
    warnings,
    hasErrors: warnings.some((w) => w.level === 'error'),
    hasWarnings: warnings.some((w) => w.level === 'warning' || w.level === 'error'),
  };
}

function computeBBox(points: { x: number; y: number }[]): { width: number; height: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { width: maxX - minX, height: maxY - minY };
}
