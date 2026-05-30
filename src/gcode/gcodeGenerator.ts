import type { ToolConfig, ShapeLevel } from '../types/design';
import type { ConvertedPath } from '../svg/svgToShapes';
import type { SvgTransform } from '../svg/svgScaler';
import { transformPoint } from '../svg/svgScaler';
import { gcodeHeader, gcodeFooter, rapidZ } from './gcodeWriter';
import { cutPocketAtLayer } from './pocketClearing';
import { generateProfileGcode, prepareProfileGeometry, cutProfileAtLayer, type ProfileGeometry } from './profileCut';
import { detectIslands } from './islandDetection';
import { computeShapeStartDepths } from './zLevelAnalysis';
import { calculateDepthPasses } from './depthPasses';

export interface GenerationResult {
  lines: string[];
  stats: {
    lineCount: number;
    estimatedTimeMin: number;
    operationCount: number;
    copyCount: number;
  };
}

interface PocketJob {
  shapeId: string;
  shapeName: string;
  shape: ConvertedPath['shapes'][0];
  totalDepth: number;
  startDepth: number;
  /** All Z values this pocket needs to cut at (negative, sorted shallow→deep) */
  passZs: number[];
  /** Raw outer boundary of the pocket shape. */
  outer: { x: number; y: number }[];
  /** Island polygons (shapes inside this pocket at shallower depth). Subtracted
   *  at each concentric offset step so spirals don't cut through them. */
  islands: { x: number; y: number }[][];
}

/**
 * Sled CNC ordering (Maslow-specific):
 *
 * Phase 1 — Pocket clearing, Z-LEVEL LAYER BY LAYER (shallow → deep)
 *   For each layer Z (sorted from shallowest), cut every pocket that has a pass
 *   at this Z. This keeps the sled support consistent across the workpiece —
 *   after layer N, all cleared zones are at the same depth.
 *
 * Phase 2 — Through-cuts (still Z-level, with auto-tabs)
 *   Cut all internal through-features last but before profile.
 *
 * Phase 3 — Profile cut (release cut)
 *   Always absolute last, with tabs, so the workpiece stays held in place
 *   until everything else is done.
 *
 * This is the OPPOSITE of gantry-CNC "feature-by-feature to full depth" because
 * the sled rests on the uncut surface plane — preserving that plane as long as
 * possible across the whole job is critical.
 */
async function generateInstance(
  paths: ConvertedPath[],
  shapeLevels: Map<string, ShapeLevel>,
  toolConfig: ToolConfig,
  transform: SvgTransform,
  materialThickness: number,
  operationOrder: string[],
  profileCutId: string | null,
  copyOffset?: { x: number; y: number }
): Promise<{ lines: string[]; ops: number }> {
  const lines: string[] = [];
  let ops = 0;
  const pathMap = new Map(paths.map((p) => [p.data.id, p]));

  const t: SvgTransform = copyOffset
    ? { ...transform, offsetX: transform.offsetX + copyOffset.x, offsetY: transform.offsetY + copyOffset.y }
    : transform;

  // Z-level analysis: find enclosing shallower pockets so we skip redundant passes.
  const zLevel = await computeShapeStartDepths(paths, shapeLevels, t, profileCutId);

  // ── Categorize shapes into pockets / through-cuts / profile ──
  interface ThroughJob {
    shapeId: string;
    shapeName: string;
    geom: ProfileGeometry;
  }
  const pocketJobs: PocketJob[] = [];
  const throughJobs: ThroughJob[] = [];
  let profileJob: { shapeId: string; shapeName: string; depth: number; shapes: ConvertedPath['shapes'] } | null = null;

  // Bug 6 fix: cache detectIslands result per shapeId — multiple shapes-per-path
  // and cross-reference lookups would otherwise re-run the (expensive) island scan.
  const islandCache = new Map<string, Awaited<ReturnType<typeof detectIslands>>>();
  const getIslands = async (shapeId: string, level: number) => {
    const key = `${shapeId}@${level}`;
    let cached = islandCache.get(key);
    if (!cached) {
      cached = await detectIslands(shapeId, level, paths, shapeLevels, t);
      islandCache.set(key, cached);
    }
    return cached;
  };

  for (const shapeId of operationOrder) {
    const path = pathMap.get(shapeId);
    const shapeLevel = shapeLevels.get(shapeId);
    if (!path || !shapeLevel) continue;
    const level = shapeLevel.level;
    if (level <= 0) continue;

    if (shapeId === profileCutId) {
      // Profile = release cut, always last
      profileJob = { shapeId, shapeName: path.data.name, depth: level, shapes: path.shapes };
      continue;
    }

    if (level >= materialThickness) {
      // Internal through-cut (NOT profile) — phase 2, Z-level layer scheduled
      const cutDepth = materialThickness + 0.5;
      for (const shape of path.shapes) {
        const geom = await prepareProfileGeometry(shape, cutDepth, toolConfig, t, true, 'inside');
        if (!geom) continue;
        throughJobs.push({ shapeId, shapeName: path.data.name, geom });
      }
      continue;
    }

    // Relief pocket — phase 1, Z-level layer scheduling
    const startDepth = zLevel.startDepths.get(shapeId) ?? 0;
    const passZs = calculateDepthPasses(level, toolConfig.depthPerPass, startDepth);
    if (passZs.length === 0) continue; // already cleared

    // Pre-compute outer + islands once per shape. Islands are RE-SUBTRACTED
    // at every concentric offset step inside cutPocketAtLayer so inward
    // spirals correctly skip over them.
    for (const shape of path.shapes) {
      try {
        const region = await getIslands(shapeId, level);
        if (region.outer.length < 3) {
          lines.push(`; ${path.data.name}: degenerate boundary — skipping`);
          continue;
        }
        pocketJobs.push({
          shapeId,
          shapeName: path.data.name,
          shape,
          totalDepth: level,
          startDepth,
          passZs,
          outer: region.outer,
          islands: region.islands,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        lines.push(`; WARNING: Island detection failed for ${path.data.name} (${msg})`);
        const rawPts = shape.getPoints(128).map((p) => transformPoint(p.x, p.y, t));
        pocketJobs.push({
          shapeId, shapeName: path.data.name, shape,
          totalDepth: level, startDepth, passZs, outer: rawPts, islands: [],
        });
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // PHASE 1 — Z-level pocket clearing (shallow → deep across all shapes)
  // ══════════════════════════════════════════════════════════════════
  // Layer Z values are rounded to 3 decimals before being keyed into the
  // set. Without that, two pockets whose `calculateDepthPasses` accumulates
  // floating-point differently (e.g. one lands on -3.0000000001, another on
  // exactly -3) end up on different "layers" — breaking the sled-support
  // invariant that all pockets sit at the same depth at each layer.
  const roundZ = (z: number) => Math.round(z * 1000) / 1000;

  if (pocketJobs.length > 0) {
    lines.push('');
    lines.push('; ════════ PHASE 1: Pocket clearing (Z-level layer-by-layer) ════════');

    const allLayerZs = new Set<number>();
    for (const job of pocketJobs) {
      for (const z of job.passZs) allLayerZs.add(roundZ(z));
    }
    const sortedLayers = Array.from(allLayerZs).sort((a, b) => b - a);

    for (const layerZ of sortedLayers) {
      lines.push('');
      lines.push(`; ── Layer Z=${layerZ.toFixed(2)}mm ──`);
      for (const job of pocketJobs) {
        const passIdx = job.passZs.findIndex((z) => roundZ(z) === layerZ);
        if (passIdx === -1) continue;
        const isFinalPass = passIdx === job.passZs.length - 1;

        const startTag = job.startDepth > 0 ? ` (Z-level skip from ${job.startDepth}mm)` : '';
        lines.push(`; ${job.shapeName} — pass ${passIdx + 1}/${job.passZs.length}${startTag}`);
        lines.push(...(await cutPocketAtLayer(job.outer, job.islands, layerZ, toolConfig, isFinalPass, passIdx)));
        lines.push(rapidZ(toolConfig.safeHeight));
        ops++;
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // PHASE 2 — Internal through-cuts (Z-level layer-by-layer, with auto-tabs)
  // ══════════════════════════════════════════════════════════════════
  // Same shallow-first interleaving as pockets: cut every internal hole at
  // layer N, then move to layer N+1. Preserves sled support across the
  // workpiece — no through-cut goes deeper than its neighbors at any moment.
  if (throughJobs.length > 0) {
    lines.push('');
    lines.push('; ════════ PHASE 2: Internal through-cuts (Z-level, with tabs) ════════');

    const allLayerZs = new Set<number>();
    for (const job of throughJobs) {
      for (const z of job.geom.passZs) allLayerZs.add(roundZ(z));
    }
    const sortedLayers = Array.from(allLayerZs).sort((a, b) => b - a); // shallow→deep

    for (const layerZ of sortedLayers) {
      lines.push('');
      lines.push(`; ── Through-cut layer Z=${layerZ.toFixed(2)}mm ──`);
      for (const job of throughJobs) {
        const passIdx = job.geom.passZs.findIndex((z) => roundZ(z) === layerZ);
        if (passIdx === -1) continue;
        lines.push(`; ${job.shapeName} — pass ${passIdx + 1}/${job.geom.passZs.length}`);
        lines.push(...cutProfileAtLayer(job.geom, layerZ, passIdx, toolConfig));
        lines.push(rapidZ(toolConfig.safeHeight));
        ops++;
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // PHASE 3 — Profile / release cut (absolute last)
  // ══════════════════════════════════════════════════════════════════
  if (profileJob) {
    lines.push('');
    lines.push('; ════════ PHASE 3: Profile cut (release) ════════');
    lines.push(`; === ${profileJob.shapeName} — release cut ===`);
    const cutDepth = materialThickness + 0.5;
    for (const shape of profileJob.shapes) {
      lines.push(...(await generateProfileGcode(shape, cutDepth, toolConfig, t, true, 'outside')));
      ops++;
    }
  }

  return { lines, ops };
}

/**
 * Generate complete G-code for all shape instances.
 */
export async function generateGcode(
  paths: ConvertedPath[],
  shapeLevels: Map<string, ShapeLevel>,
  toolConfig: ToolConfig,
  transform: SvgTransform,
  materialThickness: number,
  operationOrder: string[],
  profileCutId: string | null,
  designCopies: { offsetX: number; offsetY: number }[] = []
): Promise<GenerationResult> {
  const lines: string[] = [];
  let operationCount = 0;

  lines.push(...gcodeHeader(toolConfig.rpm));

  // Primary instance
  lines.push('');
  lines.push('; ====== Primary Instance ======');
  const primary = await generateInstance(paths, shapeLevels, toolConfig, transform, materialThickness, operationOrder, profileCutId);
  lines.push(...primary.lines);
  operationCount += primary.ops;

  // Additional copies
  for (let i = 0; i < designCopies.length; i++) {
    const copy = designCopies[i];
    lines.push('');
    lines.push(`; ====== Copy ${i + 1} (offset ${copy.offsetX}, ${copy.offsetY}) ======`);
    const inst = await generateInstance(paths, shapeLevels, toolConfig, transform, materialThickness, operationOrder, profileCutId, { x: copy.offsetX, y: copy.offsetY });
    lines.push(...inst.lines);
    operationCount += inst.ops;
  }

  lines.push(...gcodeFooter(toolConfig.safeHeight));

  // Estimate time — differentiate rapids (G0), cuts (G1 XY), and plunges (G1 Z)
  // Rapids run at the machine's max traverse rate; cuts at toolConfig.feedRate;
  // plunges at toolConfig.plungeRate. Lumping them together (the previous
  // implementation) overestimated rapid time by 5-10× for designs with lots
  // of inter-feature retracts.
  const RAPID_RATE = 5000; // mm/min — Maslow 4 typical max traverse
  let rapidTime = 0; // minutes
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
      // Rapid — moves both XY and Z at traverse rate. Use longest leg.
      rapidTime += Math.max(xyDist, zDist) / RAPID_RATE;
    } else {
      // G1: if there's any Z motion, use plungeRate; else feedRate
      if (zDist > 0.001) {
        plungeTime += Math.hypot(xyDist, zDist) / toolConfig.plungeRate;
      } else {
        cutTime += xyDist / toolConfig.feedRate;
      }
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
