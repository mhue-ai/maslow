import { useDesignStore } from './designStore';
import { parseSvg } from '../svg/svgParser';
import { svgToShapes } from '../svg/svgToShapes';
import type { Material, DepthAssignment, ToolConfig } from '../types/design';

interface ProjectFile {
  version: 1;
  name: string;
  material: Material;
  svgText: string | null;
  depthAssignments: DepthAssignment[];
  toolConfig: ToolConfig;
}

/**
 * Save current design state as a downloadable .maslow.json file.
 */
export function saveProject(name: string): void {
  const state = useDesignStore.getState();

  const project: ProjectFile = {
    version: 1,
    name,
    material: state.material,
    svgText: state.svgText,
    depthAssignments: Array.from(state.depthAssignments.values()),
    toolConfig: state.toolConfig,
  };

  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.maslow.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Load a project from a .maslow.json file and restore all state.
 */
export async function loadProject(file: File): Promise<string | null> {
  const text = await file.text();
  let project: ProjectFile;

  try {
    project = JSON.parse(text);
  } catch {
    return 'Invalid JSON file';
  }

  if (!project.version || project.version !== 1) {
    return 'Unsupported project version';
  }

  if (!project.material || !project.toolConfig) {
    return 'Missing required project data';
  }

  const store = useDesignStore.getState();

  // Restore material and tool config
  store.setMaterial(project.material);
  store.setToolConfig(project.toolConfig);

  // Restore SVG if present
  if (project.svgText) {
    store.setSvgText(project.svgText);

    try {
      const parsed = parseSvg(project.svgText);
      const converted = svgToShapes(parsed);
      store.setPaths(converted);
      store.setSvgBounds({ width: parsed.viewBox.width, height: parsed.viewBox.height });
    } catch {
      return 'Project loaded but SVG could not be re-parsed';
    }
  } else {
    store.setPaths([]);
    store.setSvgText(null);
    store.setSvgBounds(null);
  }

  // Restore depth assignments
  const assignments = new Map<string, DepthAssignment>();
  if (project.depthAssignments) {
    for (const a of project.depthAssignments) {
      assignments.set(a.pathId, a);
    }
  }
  useDesignStore.setState({ depthAssignments: assignments });

  // Clear generated G-code (stale after load)
  store.setGcode(null);
  store.selectPath(null);

  return null; // no error
}
