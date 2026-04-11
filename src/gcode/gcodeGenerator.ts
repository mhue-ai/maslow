import type { ToolConfig, DepthAssignment } from '../types/design';
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
  };
}

/**
 * Generate complete G-code for all paths with depth assignments.
 * Uses operationOrder to control cut sequence.
 */
export function generateGcode(
  paths: ConvertedPath[],
  depthAssignments: Map<string, DepthAssignment>,
  toolConfig: ToolConfig,
  transform: SvgTransform,
  materialThickness: number,
  operationOrder: string[]
): GenerationResult {
  const lines: string[] = [];
  let operationCount = 0;

  // Header
  lines.push(...gcodeHeader(toolConfig.rpm));

  // Build path lookup
  const pathMap = new Map(paths.map((p) => [p.data.id, p]));

  // Process paths in user-defined order
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
        lines.push(...generatePocketGcode(shape, totalDepth, toolConfig, transform));
      } else {
        lines.push(...generateProfileGcode(
          shape, totalDepth, toolConfig, transform,
          isThrough, assignment.profileOffset
        ));
      }
      operationCount++;
    }
  }

  // Footer
  lines.push(...gcodeFooter(toolConfig.safeHeight));

  // Estimate time based on total cutting distance
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
  const estimatedTimeMin = Math.max(1, Math.round(totalDist / toolConfig.feedRate));

  return {
    lines,
    stats: {
      lineCount: lines.length,
      estimatedTimeMin,
      operationCount,
    },
  };
}
