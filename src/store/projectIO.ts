import { useDesignStore } from './designStore';
import { parseSvg } from '../svg/svgParser';
import { svgToShapes } from '../svg/svgToShapes';
import type { Material, ShapeLevel, ToolConfig, SvgTransformOverride, DesignCopy } from '../types/design';
import { DEFAULT_SVG_TRANSFORM } from '../types/design';
import { saveProjectFile } from '../utils/fileSave';

/**
 * Project file format.
 *
 * version 3 adds the per-mode fields (profileCutId, outline-mode reliefs +
 * depth, cut-mode selection + depth). v1/v2 files load fine — the new fields
 * just default. Sets are serialized as string arrays (JSON can't encode Set).
 */
interface ProjectFile {
  version: 3;
  name: string;
  material: Material;
  svgText: string | null;
  shapeLevels: { shapeId: string; level: number }[];
  toolConfig: ToolConfig;
  svgTransformOverride?: SvgTransformOverride;
  operationOrder?: string[];
  designCopies?: DesignCopy[];
  // Per-mode state (v3+)
  profileCutId?: string | null;
  outlineReliefIds?: string[];
  outlineReliefDepth?: number;
  cutShapeIds?: string[];
  cutThrough?: boolean;
  cutDepth?: number;
}

export async function saveProject(name: string): Promise<void> {
  const state = useDesignStore.getState();

  const project: ProjectFile = {
    version: 3,
    name,
    material: state.material,
    svgText: state.svgText,
    shapeLevels: Array.from(state.shapeLevels.values()),
    toolConfig: state.toolConfig,
    svgTransformOverride: state.svgTransformOverride,
    operationOrder: state.operationOrder,
    designCopies: state.designCopies,
    profileCutId: state.profileCutId,
    outlineReliefIds: Array.from(state.outlineReliefIds),
    outlineReliefDepth: state.outlineReliefDepth,
    cutShapeIds: Array.from(state.cutShapeIds),
    cutThrough: state.cutThrough,
    cutDepth: state.cutDepth,
  };

  const json = JSON.stringify(project, null, 2);
  await saveProjectFile(json, name);
}

export async function loadProject(file: File): Promise<string | null> {
  const text = await file.text();
  let project: Partial<ProjectFile> & {
    depthAssignments?: { pathId?: string; shapeId?: string; depth?: number }[];
  };

  try {
    project = JSON.parse(text);
  } catch {
    return 'Invalid JSON file';
  }

  if (!project.material || !project.toolConfig) {
    return 'Missing required project data';
  }

  // Bulk-restore scalar/object state via setState rather than the individual
  // setters — the setters each call pushHistory(), which would pollute the
  // undo stack with intermediate half-loaded snapshots. We reset history
  // entirely at the end of a load instead.
  useDesignStore.setState({
    material: project.material,
    toolConfig: project.toolConfig,
    svgTransformOverride: project.svgTransformOverride ?? DEFAULT_SVG_TRANSFORM,
  });

  const store = useDesignStore.getState();

  // Re-parse SVG / set paths FIRST. setPaths() resets per-mode selection
  // (outlineReliefIds, cutShapeIds, profileCutId), so everything below that
  // restores those must run AFTER this block.
  if (project.svgText) {
    store.setSvgText(project.svgText);
    try {
      const parsed = parseSvg(project.svgText);
      const converted = svgToShapes(parsed);
      store.setShapeRegistry(parsed.shapeRegistry); // before setPaths
      store.setPaths(converted);
      store.setSvgBounds(parsed.viewBox);
    } catch {
      return 'Project loaded but SVG could not be re-parsed';
    }
  } else {
    store.setPaths([]);
    store.setSvgText(null);
    store.setSvgBounds(null);
  }

  // Restore shape levels (v2+) or convert from old depthAssignments (v1).
  // Clone each entry so the live store map never aliases the parsed JSON.
  const levels = new Map<string, ShapeLevel>();
  if (project.shapeLevels) {
    for (const sl of project.shapeLevels) {
      levels.set(sl.shapeId, { shapeId: sl.shapeId, level: sl.level });
    }
  } else if (project.depthAssignments) {
    for (const da of project.depthAssignments) {
      const id = da.pathId ?? da.shapeId;
      if (id) levels.set(id, { shapeId: id, level: da.depth ?? 0 });
    }
  }

  // Restore per-mode state. profileCutId must be applied via setProfileCutId
  // so operationOrder keeps it last; do it before operationOrder restore so a
  // persisted order can override if present.
  useDesignStore.setState({
    shapeLevels: levels,
    profileCutId: project.profileCutId ?? store.profileCutId,
    outlineReliefIds: new Set(project.outlineReliefIds ?? []),
    outlineReliefDepth: project.outlineReliefDepth ?? store.outlineReliefDepth,
    cutShapeIds: new Set(project.cutShapeIds ?? []),
    cutThrough: project.cutThrough ?? store.cutThrough,
    cutDepth: project.cutDepth ?? store.cutDepth,
    designCopies: project.designCopies ?? [],
  });

  if (project.operationOrder) {
    store.setOperationOrder(project.operationOrder);
  }

  store.setGcode(null);
  store.selectPath(null);

  // A freshly loaded project is the new baseline — discard prior undo history
  // (which now also contains the load's intermediate states).
  useDesignStore.setState({ history: [], historyIndex: -1 });

  return null;
}
