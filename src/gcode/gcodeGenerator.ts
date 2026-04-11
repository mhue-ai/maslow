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

  // Generate relief operations (pocket or outline based on strategy)
  for (const path of reliefPaths) {
    const assignment = depthAssignments.get(path.data.id)!;
    const label = assignment.strategy === 'pocket' ? 'Relief pocket' : 'Relief outline';
    lines.push('');
    lines.push(`; === ${path.data.name} — ${label} ===`);

    for (const shape of path.shapes) {
      if (assignment.strategy === 'outline') {
        lines.push(...generateProfileGcode(shape, assignment.depth, toolConfig, transform, false));
      } else {
        lines.push(...generatePocketGcode(shape, assignment.depth, toolConfig, transform));
      }
      operationCount++;
    }
  }

  // Generate through-cut operations (pocket or outline based on strategy)
  for (const path of throughPaths) {
    const assignment = depthAssignments.get(path.data.id)!;
    const totalDepth = materialThickness + 0.5; // slight overshoot
    const label = assignment.strategy === 'pocket' ? 'Through-cut pocket' : 'Through-cut profile';
    lines.push('');
    lines.push(`; === ${path.data.name} — ${label} ===`);

    for (const shape of path.shapes) {
      if (assignment.strategy === 'pocket') {
        lines.push(...generatePocketGcode(shape, totalDepth, toolConfig, transform));
      } else {
        lines.push(...generateProfileGcode(shape, totalDepth, toolConfig, transform, true));
      }
      operationCount++;
    }
  }

  // Footer
  lines.push(...gcodeFooter(toolConfig.safeHeight));

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
