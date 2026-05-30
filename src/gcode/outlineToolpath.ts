/**
 * Outline-mode toolpath — OUTLINES ONLY, no fill.
 *
 * One of three design modes: Full (pocket clearing) | Outline (THIS FILE) |
 * Cut (bit follows the line, no offset). Outline mode is the middle ground —
 * you get clean kerf-compensated boundaries around each relief and each
 * island, and you clear the waste between them by hand.
 *
 * Model:
 *   - User marks shapes as RELIEF (waste / lowered region).
 *   - Any non-Relief shape geometrically inside a Relief is an auto-ISLAND
 *     (it should remain raised at the material surface).
 *   - Optional one shape can be the outer PROFILE (release through-cut).
 *
 * Cuts emitted:
 *   - Each Relief outline → bit OFFSET INSIDE, cut to `reliefDepth`.
 *     Result: the relief's outer boundary lands exactly on the user's drawn
 *     line, and the cut is on the waste side of that line.
 *   - Each auto-Island outline → bit OFFSET OUTSIDE, cut to `reliefDepth`.
 *     Result: the island stays at its full drawn size, and the cut is on the
 *     waste side of the island's edge.
 *   - Profile (if set) → through-cut with tabs at the end (offset OUTSIDE).
 *
 * The waste material between the two outlines is NOT cleared — the user
 * removes it manually (chisel, router, palm sander, etc).
 *
 * Z-level scheduling is preserved (shallow → deep across all outlines) to
 * keep sled support consistent across the workpiece, matching the Full-mode
 * generator's strategy.
 */

import type { ToolConfig } from '../types/design';
import type { ConvertedPath } from '../svg/svgToShapes';
import type { SvgTransform } from '../svg/svgScaler';
import { gcodeHeader, gcodeFooter, rapidZ } from './gcodeWriter';
import {
  prepareProfileGeometry,
  generateProfileGcode,
  cutProfileAtLayer,
  type ProfileGeometry,
} from './profileCut';
import { shapeToPolygon } from './islandDetection';
import { isPolygonInside } from './clipperOps';
import type { GenerationResult } from './gcodeGenerator';

interface OutlineJob {
  shapeId: string;
  shapeName: string;
  role: 'relief' | 'island';
  geom: ProfileGeometry;
}

async function generateOutlineInstance(
  paths: ConvertedPath[],
  reliefIds: Set<string>,
  reliefDepth: number,
  toolConfig: ToolConfig,
  transform: SvgTransform,
  materialThickness: number,
  profileCutId: string | null,
  copyOffset?: { x: number; y: number }
): Promise<{ lines: string[]; ops: number }> {
  const lines: string[] = [];
  let ops = 0;

  const t: SvgTransform = copyOffset
    ? { ...transform, offsetX: transform.offsetX + copyOffset.x, offsetY: transform.offsetY + copyOffset.y }
    : transform;

  // ── Classify shapes ──
  // - reliefShapes: explicitly marked Relief (and not profile)
  // - keepShapes:   everything else (and not profile) — candidates for auto-island
  // - profileShape: the optional outer release through-cut
  const reliefShapes: ConvertedPath[] = [];
  const keepShapes: ConvertedPath[] = [];
  let profilePath: ConvertedPath | null = null;

  for (const path of paths) {
    if (path.shapes.length === 0) continue;
    if (path.data.id === profileCutId) {
      profilePath = path;
      continue;
    }
    if (reliefIds.has(path.data.id)) {
      reliefShapes.push(path);
    } else {
      keepShapes.push(path);
    }
  }

  // ── Auto-island detection ──
  // A Keep shape is an island iff its polygon is inside ANY Relief polygon.
  // Cache relief polygons so we only project each once.
  const reliefPolys = reliefShapes.map((rs) => ({
    id: rs.data.id,
    poly: shapeToPolygon(rs.shapes[0], t),
  }));

  const islandShapes: ConvertedPath[] = [];
  for (const keep of keepShapes) {
    const keepPoly = shapeToPolygon(keep.shapes[0], t);
    if (keepPoly.length < 3) continue;
    for (const rp of reliefPolys) {
      if (rp.poly.length < 3) continue;
      // eslint-disable-next-line no-await-in-loop
      const inside = await isPolygonInside(keepPoly, rp.poly);
      if (inside) {
        islandShapes.push(keep);
        break;
      }
    }
  }

  // ── Build outline jobs ──
  // All outline cuts share the same depth (`reliefDepth`) and tab-less semantics.
  const outlineJobs: OutlineJob[] = [];

  for (const rs of reliefShapes) {
    for (const shape of rs.shapes) {
      // eslint-disable-next-line no-await-in-loop
      const geom = await prepareProfileGeometry(shape, reliefDepth, toolConfig, t, false, 'inside');
      if (!geom) continue;
      outlineJobs.push({ shapeId: rs.data.id, shapeName: rs.data.name, role: 'relief', geom });
    }
  }

  for (const is of islandShapes) {
    for (const shape of is.shapes) {
      // eslint-disable-next-line no-await-in-loop
      const geom = await prepareProfileGeometry(shape, reliefDepth, toolConfig, t, false, 'outside');
      if (!geom) continue;
      outlineJobs.push({ shapeId: is.data.id, shapeName: is.data.name, role: 'island', geom });
    }
  }

  // ── Phase 1 — Outline cuts, Z-level scheduled ──
  if (outlineJobs.length > 0) {
    lines.push('');
    lines.push('; ════════ PHASE 1: Relief & island outlines (Z-level layer-by-layer) ════════');
    lines.push(`; Relief depth: ${reliefDepth.toFixed(2)}mm — no fill emitted (manual waste removal)`);

    const roundZ = (z: number) => Math.round(z * 1000) / 1000;
    const allLayerZs = new Set<number>();
    for (const job of outlineJobs) {
      for (const z of job.geom.passZs) allLayerZs.add(roundZ(z));
    }
    const sortedLayers = Array.from(allLayerZs).sort((a, b) => b - a); // shallow → deep

    for (const layerZ of sortedLayers) {
      lines.push('');
      lines.push(`; ── Layer Z=${layerZ.toFixed(2)}mm ──`);
      for (const job of outlineJobs) {
        const passIdx = job.geom.passZs.findIndex((z) => roundZ(z) === layerZ);
        if (passIdx === -1) continue;
        lines.push(`; ${job.shapeName} (${job.role}) — pass ${passIdx + 1}/${job.geom.passZs.length}`);
        lines.push(...cutProfileAtLayer(job.geom, layerZ, passIdx, toolConfig));
        lines.push(rapidZ(toolConfig.safeHeight));
        ops++;
      }
    }
  }

  // ── Phase 2 — Profile through-cut (release), always last ──
  if (profilePath) {
    lines.push('');
    lines.push('; ════════ PHASE 2: Profile cut (release, with tabs) ════════');
    const cutDepth = materialThickness + 0.5;
    for (const shape of profilePath.shapes) {
      // eslint-disable-next-line no-await-in-loop
      lines.push(...(await generateProfileGcode(shape, cutDepth, toolConfig, t, true, 'outside')));
      ops++;
    }
  }

  return { lines, ops };
}

/**
 * Top-level Outline-mode G-code generator.
 *
 * Returns the same GenerationResult shape as `generateGcode` so the export
 * panel can render stats the same way.
 */
export async function generateOutlineGcode(
  paths: ConvertedPath[],
  reliefIds: Set<string>,
  reliefDepth: number,
  toolConfig: ToolConfig,
  transform: SvgTransform,
  materialThickness: number,
  profileCutId: string | null,
  designCopies: { offsetX: number; offsetY: number }[] = []
): Promise<GenerationResult> {
  const lines: string[] = [];
  let operationCount = 0;

  lines.push(...gcodeHeader(toolConfig.rpm));

  lines.push('');
  lines.push('; ====== Primary Instance (Outline mode — outlines only) ======');
  const primary = await generateOutlineInstance(
    paths, reliefIds, reliefDepth, toolConfig, transform,
    materialThickness, profileCutId
  );
  lines.push(...primary.lines);
  operationCount += primary.ops;

  for (let i = 0; i < designCopies.length; i++) {
    const copy = designCopies[i];
    lines.push('');
    lines.push(`; ====== Copy ${i + 1} (offset ${copy.offsetX}, ${copy.offsetY}) ======`);
    // eslint-disable-next-line no-await-in-loop
    const inst = await generateOutlineInstance(
      paths, reliefIds, reliefDepth, toolConfig, transform,
      materialThickness, profileCutId, { x: copy.offsetX, y: copy.offsetY }
    );
    lines.push(...inst.lines);
    operationCount += inst.ops;
  }

  lines.push(...gcodeFooter(toolConfig.safeHeight));

  // Same rapid/cut/plunge time estimator the Studio generator uses.
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

/**
 * Compute auto-island IDs from the current paths + relief set + transform.
 * Used by the UI to label shapes as "island" without re-running the toolpath
 * generator. Cheap enough to call on every render — it only does
 * `relief × keep` containment tests.
 */
export async function detectAutoIslands(
  paths: ConvertedPath[],
  reliefIds: Set<string>,
  transform: SvgTransform,
  profileCutId: string | null
): Promise<Set<string>> {
  const islands = new Set<string>();
  const reliefPolys: { id: string; poly: ReturnType<typeof shapeToPolygon> }[] = [];

  for (const path of paths) {
    if (path.shapes.length === 0) continue;
    if (path.data.id === profileCutId) continue;
    if (!reliefIds.has(path.data.id)) continue;
    reliefPolys.push({ id: path.data.id, poly: shapeToPolygon(path.shapes[0], transform) });
  }
  if (reliefPolys.length === 0) return islands;

  for (const path of paths) {
    if (path.shapes.length === 0) continue;
    if (path.data.id === profileCutId) continue;
    if (reliefIds.has(path.data.id)) continue;
    const poly = shapeToPolygon(path.shapes[0], transform);
    if (poly.length < 3) continue;
    for (const rp of reliefPolys) {
      if (rp.poly.length < 3) continue;
      // eslint-disable-next-line no-await-in-loop
      const inside = await isPolygonInside(poly, rp.poly);
      if (inside) {
        islands.add(path.data.id);
        break;
      }
    }
  }
  return islands;
}
