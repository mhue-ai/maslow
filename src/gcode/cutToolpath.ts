/**
 * Cut-mode toolpath — BIT FOLLOWS THE LINE, no kerf offset.
 *
 * Simplest of the three design modes (Full | Outline | Cut). Each selected
 * shape's path is traced AS DRAWN — the centerline of the bit follows the
 * polygon — at a single user-chosen depth. No inside/outside choice, no
 * island detection, no fill clearing.
 *
 * Through-cut auto-tabbing:
 *   If `cutDepth` reaches material thickness (treated as "through" within
 *   0.1mm tolerance), the bit will release each piece — so we engage tabs
 *   automatically using `tool.tabCount/tabWidth/tabHeight`. Below thickness
 *   the cuts are partial grooves and tabs would be meaningless.
 *
 * Z scheduling:
 *   Each shape independently runs from 0 to -cutDepth in `depthPerPass`
 *   steps. We don't Z-level interleave across shapes because Cut mode is
 *   for engraves / simple holes / through-cuts where the user is fine
 *   finishing one before starting the next.
 */

import type { ToolConfig } from '../types/design';
import type { ConvertedPath } from '../svg/svgToShapes';
import type { SvgTransform } from '../svg/svgScaler';
import { gcodeHeader, gcodeFooter } from './gcodeWriter';
import { generateProfileGcode } from './profileCut';
import type { GenerationResult } from './gcodeGenerator';

async function generateCutInstance(
  paths: ConvertedPath[],
  cutShapeIds: Set<string>,
  cutDepth: number,
  toolConfig: ToolConfig,
  transform: SvgTransform,
  materialThickness: number,
  copyOffset?: { x: number; y: number }
): Promise<{ lines: string[]; ops: number }> {
  const lines: string[] = [];
  let ops = 0;

  const t: SvgTransform = copyOffset
    ? { ...transform, offsetX: transform.offsetX + copyOffset.x, offsetY: transform.offsetY + copyOffset.y }
    : transform;

  // Through-cut detection — auto-engage tabs only when the bit will actually
  // release the piece. A 0.1mm tolerance avoids rounding-error edge cases.
  const isThrough = cutDepth >= materialThickness - 0.1;
  // Through-cuts get a small over-travel so the bit clears the back face,
  // mirroring what generateProfileGcode does for the Full-mode profile.
  const effectiveDepth = isThrough ? materialThickness + 0.5 : cutDepth;

  // Selected shapes only — in the order they appear in `paths`. The user
  // can reorder via the standard operationOrder mechanism if needed; for
  // Cut mode we don't expose a per-mode ordering UI yet.
  const selected = paths.filter((p) => cutShapeIds.has(p.data.id));

  if (selected.length === 0) return { lines, ops };

  lines.push('');
  lines.push('; ════════ Cut mode — bit follows the line (no kerf offset) ════════');
  lines.push(`; Depth: ${cutDepth.toFixed(2)}mm${isThrough ? ' (through-cut, tabs auto-engaged)' : ''}`);

  for (const path of selected) {
    lines.push('');
    lines.push(`; ── ${path.data.name} ──`);
    for (const shape of path.shapes) {
      // eslint-disable-next-line no-await-in-loop
      const block = await generateProfileGcode(
        shape,
        effectiveDepth,
        toolConfig,
        t,
        isThrough,     // tabs only when actually cutting through
        'none',        // critical: no kerf offset — bit centerline follows the line
      );
      lines.push(...block);
      ops++;
    }
  }

  return { lines, ops };
}

/**
 * Top-level Cut-mode G-code generator.
 *
 * Returns the same GenerationResult shape as the other modes so the export
 * panel can render stats identically.
 */
export async function generateCutGcode(
  paths: ConvertedPath[],
  cutShapeIds: Set<string>,
  cutDepth: number,
  toolConfig: ToolConfig,
  transform: SvgTransform,
  materialThickness: number,
  designCopies: { offsetX: number; offsetY: number }[] = []
): Promise<GenerationResult> {
  const lines: string[] = [];
  let operationCount = 0;

  lines.push(...gcodeHeader(toolConfig.rpm));

  lines.push('');
  lines.push('; ====== Primary Instance (Cut mode — bit follows the line) ======');
  const primary = await generateCutInstance(
    paths, cutShapeIds, cutDepth, toolConfig, transform, materialThickness
  );
  lines.push(...primary.lines);
  operationCount += primary.ops;

  for (let i = 0; i < designCopies.length; i++) {
    const copy = designCopies[i];
    lines.push('');
    lines.push(`; ====== Copy ${i + 1} (offset ${copy.offsetX}, ${copy.offsetY}) ======`);
    // eslint-disable-next-line no-await-in-loop
    const inst = await generateCutInstance(
      paths, cutShapeIds, cutDepth, toolConfig, transform,
      materialThickness, { x: copy.offsetX, y: copy.offsetY }
    );
    lines.push(...inst.lines);
    operationCount += inst.ops;
  }

  lines.push(...gcodeFooter(toolConfig.safeHeight));

  // Same rapid/cut/plunge time estimator as the other generators.
  const RAPID_RATE = 5000;
  let rapidTime = 0;
  let cutTime = 0;
  let plungeTime = 0;
  let px = 0, py = 0, pz = toolConfig.safeHeight;

  for (const line of lines) {
    const isG0 = line.startsWith('G0');
    const isG1 = line.startsWith('G1');
    if (!isG0 && !isG1) continue;
    const xm = line.match(/X(-?[\d.]+)/);
    const ym = line.match(/Y(-?[\d.]+)/);
    const zm = line.match(/Z(-?[\d.]+)/);
    if (!xm && !ym && !zm) continue;
    const nx = xm ? parseFloat(xm[1]) : px;
    const ny = ym ? parseFloat(ym[1]) : py;
    const nz = zm ? parseFloat(zm[1]) : pz;
    const dx = nx - px, dy = ny - py, dz = nz - pz;
    const xyDist = Math.hypot(dx, dy);
    const zDist = Math.abs(dz);
    if (isG0) {
      rapidTime += Math.max(xyDist, zDist) / RAPID_RATE;
    } else if (zDist > 0.001) {
      plungeTime += Math.hypot(xyDist, zDist) / toolConfig.plungeRate;
    } else {
      cutTime += xyDist / toolConfig.feedRate;
    }
    px = nx; py = ny; pz = nz;
  }

  const totalMin = rapidTime + cutTime + plungeTime;

  return {
    lines,
    stats: {
      lineCount: lines.length,
      estimatedTimeMin: Math.max(1, Math.round(totalMin)),
      operationCount,
      copyCount: 1 + designCopies.length,
    },
  };
}
