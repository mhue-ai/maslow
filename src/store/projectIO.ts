import { useDesignStore } from './designStore';
import { parseSvg } from '../svg/svgParser';
import { svgToShapes } from '../svg/svgToShapes';
import type { Material, ShapeLevel, ToolConfig, SvgTransformOverride, DesignCopy } from '../types/design';
import { DEFAULT_SVG_TRANSFORM } from '../types/design';
import { saveProjectFile } from '../utils/fileSave';

interface ProjectFile {
  version: 2;
  name: string;
  material: Material;
  svgText: string | null;
  shapeLevels: { shapeId: string; level: number }[];
  toolConfig: ToolConfig;
  svgTransformOverride?: SvgTransformOverride;
  operationOrder?: string[];
  designCopies?: DesignCopy[];
}

export async function saveProject(name: string): Promise<void> {
  const state = useDesignStore.getState();

  const project: ProjectFile = {
    version: 2,
    name,
    material: state.material,
    svgText: state.svgText,
    shapeLevels: Array.from(state.shapeLevels.values()),
    toolConfig: state.toolConfig,
    svgTransformOverride: state.svgTransformOverride,
    operationOrder: state.operationOrder,
    designCopies: state.designCopies,
  };

  const json = JSON.stringify(project, null, 2);
  await saveProjectFile(json, name);
}

export async function loadProject(file: File): Promise<string | null> {
  const text = await file.text();
  let project: any;

  try {
    project = JSON.parse(text);
  } catch {
    return 'Invalid JSON file';
  }

  if (!project.material || !project.toolConfig) {
    return 'Missing required project data';
  }

  const store = useDesignStore.getState();

  store.setMaterial(project.material);
  store.setToolConfig(project.toolConfig);
  store.setSvgTransformOverride(project.svgTransformOverride ?? DEFAULT_SVG_TRANSFORM);

  if (project.svgText) {
    store.setSvgText(project.svgText);
    try {
      const parsed = parseSvg(project.svgText);
      const converted = svgToShapes(parsed);
      store.setPaths(converted);
      store.setSvgBounds(parsed.viewBox);
      store.setShapeRegistry(parsed.shapeRegistry);
    } catch {
      return 'Project loaded but SVG could not be re-parsed';
    }
  } else {
    store.setPaths([]);
    store.setSvgText(null);
    store.setSvgBounds(null);
  }

  // Restore shape levels (v2) or convert from old depthAssignments (v1)
  const levels = new Map<string, ShapeLevel>();
  if (project.shapeLevels) {
    for (const sl of project.shapeLevels) {
      levels.set(sl.shapeId, sl);
    }
  } else if (project.depthAssignments) {
    // Backward compatibility with v1 projects
    for (const da of project.depthAssignments) {
      const id = da.pathId ?? da.shapeId;
      levels.set(id, { shapeId: id, level: da.depth ?? 0 });
    }
  }
  useDesignStore.setState({ shapeLevels: levels });

  if (project.operationOrder) {
    store.setOperationOrder(project.operationOrder);
  }

  useDesignStore.setState({ designCopies: project.designCopies ?? [] });

  store.setGcode(null);
  store.selectPath(null);

  return null;
}
