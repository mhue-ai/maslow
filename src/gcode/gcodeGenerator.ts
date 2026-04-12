import type { ToolConfig, ShapeLevel } from '../types/design';
import type { ConvertedPath } from '../svg/svgToShapes';
import type { SvgTransform } from '../svg/svgScaler';
import { gcodeHeader, gcodeFooter } from './gcodeWriter';
import { generatePocketGcode } from './pocketClearing';
import { generateProfileGcode } from './profileCut';

export interface GenerationResult {
  lines: string[];
  stats: {
    lineCount: number;
    estimatedTimeMin: number;
    operationCount: number;
    copyCount: number;
  };
}

/**
 * Derive cut strategy from shape level:
 * - level 0: skip (face)
 * - 0 < level < thickness: pocket clearing, inside offset
 * - level >= thickness: profile/through cut
 *   - outermost shape (profileCutId): outside offset
 *   - other shapes: inside offset (holes)
 */
function generateInstance(
  paths: ConvertedPath[],
  shapeLevels: Map<string, ShapeLevel>,
  toolConfig: ToolConfig,
  transform: SvgTransform,
  materialThickness: number,
  operationOrder: string[],
  profileCutId: string | null,
  copyOffset?: { x: number; y: number }
): { lines: string[]; ops: number } {
  const lines: string[] = [];
  let ops = 0;
  const pathMap = new Map(paths.map((p) => [p.data.id, p]));

  const t: SvgTransform = copyOffset
    ? { ...transform, offsetX: transform.offsetX + copyOffset.x, offsetY: transform.offsetY + copyOffset.y }
    : transform;

  for (const shapeId of operationOrder) {
    const path = pathMap.get(shapeId);
    const shapeLevel = shapeLevels.get(shapeId);
    if (!path || !shapeLevel) continue;

    const level = shapeLevel.level;
    if (level <= 0) continue; // Face — no cut

    const isThrough = level >= materialThickness;
    const isProfileCut = shapeId === profileCutId;
    const cutDepth = isThrough ? materialThickness + 0.5 : level;

    // Derive offset: profile cut = outside, everything else = inside
    const profileOffset = isProfileCut ? 'outside' as const : 'inside' as const;

    let label: string;
    if (isProfileCut) {
      label = 'Profile cut (release)';
    } else if (isThrough) {
      label = 'Through-cut';
    } else {
      label = `Relief pocket ${level}mm`;
    }

    lines.push('');
    lines.push(`; === ${path.data.name} — ${label} ===`);

    for (const shape of path.shapes) {
      if (isThrough) {
        // Through-cut: profile (outline) with tabs
        lines.push(...generateProfileGcode(
          shape, cutDepth, toolConfig, t, true, profileOffset
        ));
      } else {
        // Relief: pocket clearing inside boundary
        lines.push(...generatePocketGcode(shape, cutDepth, toolConfig, t));
      }
      ops++;
    }
  }

  return { lines, ops };
}

/**
 * Generate complete G-code for all shape instances.
 */
export function generateGcode(
  paths: ConvertedPath[],
  shapeLevels: Map<string, ShapeLevel>,
  toolConfig: ToolConfig,
  transform: SvgTransform,
  materialThickness: number,
  operationOrder: string[],
  profileCutId: string | null,
  designCopies: { offsetX: number; offsetY: number }[] = []
): GenerationResult {
  const lines: string[] = [];
  let operationCount = 0;

  lines.push(...gcodeHeader(toolConfig.rpm));

  // Primary instance
  lines.push('');
  lines.push('; ====== Primary Instance ======');
  const primary = generateInstance(paths, shapeLevels, toolConfig, transform, materialThickness, operationOrder, profileCutId);
  lines.push(...primary.lines);
  operationCount += primary.ops;

  // Additional copies
  for (let i = 0; i < designCopies.length; i++) {
    const copy = designCopies[i];
    lines.push('');
    lines.push(`; ====== Copy ${i + 1} (offset ${copy.offsetX}, ${copy.offsetY}) ======`);
    const inst = generateInstance(paths, shapeLevels, toolConfig, transform, materialThickness, operationOrder, profileCutId, { x: copy.offsetX, y: copy.offsetY });
    lines.push(...inst.lines);
    operationCount += inst.ops;
  }

  lines.push(...gcodeFooter(toolConfig.safeHeight));

  // Estimate time
  let totalDist = 0;
  let px = 0, py = 0;
  for (const line of lines) {
    const xm = line.match(/X(-?[\d.]+)/);
    const ym = line.match(/Y(-?[\d.]+)/);
    if (xm || ym) {
      const nx = xm ? parseFloat(xm[1]) : px;
      const ny = ym ? parseFloat(ym[1]) : py;
      totalDist += Math.sqrt((nx - px) ** 2 + (ny - py) ** 2);
      px = nx;
      py = ny;
    }
  }

  return {
    lines,
    stats: {
      lineCount: lines.length,
      estimatedTimeMin: Math.max(1, Math.round(totalDist / toolConfig.feedRate)),
      operationCount,
      copyCount: 1 + designCopies.length,
    },
  };
}
