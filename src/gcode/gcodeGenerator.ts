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
 * Operation order: relief (pocket) first, then through-cut (profile) last.
 */
export function generateGcode(
  paths: ConvertedPath[],
  depthAssignments: Map<string, DepthAssignment>,
  toolConfig: ToolConfig,
  transform: SvgTransform,
  materialThickness: number
): GenerationResult {
  const lines: string[] = [];
  let operationCount = 0;

  // Header
  lines.push(...gcodeHeader(toolConfig.rpm));

  // Sort operations: relief first, through-cut last
  const reliefPaths = paths.filter((p) => depthAssignments.get(p.data.id)?.type === 'relief');
  const throughPaths = paths.filter((p) => depthAssignments.get(p.data.id)?.type === 'through');

  // Generate pocket clearing for relief areas
  for (const path of reliefPaths) {
    const assignment = depthAssignments.get(path.data.id)!;
    lines.push('');
    lines.push(`; === ${path.data.name} — Relief pocket ===`);

    for (const shape of path.shapes) {
      lines.push(...generatePocketGcode(shape, assignment.depth, toolConfig, transform));
      operationCount++;
    }
  }

  // Generate profile cuts for through areas
  for (const path of throughPaths) {
    lines.push('');
    lines.push(`; === ${path.data.name} — Through-cut profile ===`);

    for (const shape of path.shapes) {
      const totalDepth = materialThickness + 0.5; // slight overshoot
      lines.push(...generateProfileGcode(shape, totalDepth, toolConfig, transform, true));
      operationCount++;
    }
  }

  // Footer
  lines.push(...gcodeFooter());

  // Estimate time (very rough: total G1 distance / feed rate)
  const totalMoveLines = lines.filter((l) => l.startsWith('G1') || l.startsWith('G0')).length;
  const estimatedTimeMin = (totalMoveLines * 2) / toolConfig.feedRate; // rough estimate

  return {
    lines,
    stats: {
      lineCount: lines.length,
      estimatedTimeMin: Math.max(1, Math.round(estimatedTimeMin)),
      operationCount,
    },
  };
}
