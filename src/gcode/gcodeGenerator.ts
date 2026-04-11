import type { ToolConfig, DepthAssignment, DesignCopy } from '../types/design';
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
 * Generate G-code for a single instance at a given offset.
 */
function generateInstance(
  paths: ConvertedPath[],
  depthAssignments: Map<string, DepthAssignment>,
  toolConfig: ToolConfig,
  transform: SvgTransform,
  materialThickness: number,
  operationOrder: string[],
  copyOffset?: { x: number; y: number }
): { lines: string[]; ops: number } {
  const lines: string[] = [];
  let ops = 0;

  const pathMap = new Map(paths.map((p) => [p.data.id, p]));

  // Apply copy offset to the transform
  const t: SvgTransform = copyOffset
    ? { ...transform, offsetX: transform.offsetX + copyOffset.x, offsetY: transform.offsetY + copyOffset.y }
    : transform;

  for (const pathId of operationOrder) {
    const path = pathMap.get(pathId);
    const assignment = depthAssignments.get(pathId);
    if (!path || !assignment || assignment.type === 'face') continue;

    const isThrough = assignment.type === 'through';
    const totalDepth = isThrough ? materialThickness + 0.5 : assignment.depth;
    const label = `${assignment.type === 'through' ? 'Through-cut' : 'Relief'} ${assignment.strategy}`;

    lines.push('');
    lines.push(`; === ${path.data.name} — ${label} ===`);

    for (const shape of path.shapes) {
      if (assignment.strategy === 'pocket') {
        lines.push(...generatePocketGcode(shape, totalDepth, toolConfig, t));
      } else {
        lines.push(...generateProfileGcode(
          shape, totalDepth, toolConfig, t,
          isThrough, assignment.profileOffset
        ));
      }
      ops++;
    }
  }

  return { lines, ops };
}

/**
 * Generate complete G-code for all design instances (primary + copies).
 */
export function generateGcode(
  paths: ConvertedPath[],
  depthAssignments: Map<string, DepthAssignment>,
  toolConfig: ToolConfig,
  transform: SvgTransform,
  materialThickness: number,
  operationOrder: string[],
  designCopies: DesignCopy[] = []
): GenerationResult {
  const lines: string[] = [];
  let operationCount = 0;

  lines.push(...gcodeHeader(toolConfig.rpm));

  // Primary instance
  lines.push('');
  lines.push('; ====== Primary Instance ======');
  const primary = generateInstance(paths, depthAssignments, toolConfig, transform, materialThickness, operationOrder);
  lines.push(...primary.lines);
  operationCount += primary.ops;

  // Additional copies
  for (let i = 0; i < designCopies.length; i++) {
    const copy = designCopies[i];
    lines.push('');
    lines.push(`; ====== Copy ${i + 1} (offset ${copy.offsetX}, ${copy.offsetY}) ======`);
    const inst = generateInstance(
      paths, depthAssignments, toolConfig, transform, materialThickness, operationOrder,
      { x: copy.offsetX, y: copy.offsetY }
    );
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
