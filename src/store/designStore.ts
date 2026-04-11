import { create } from 'zustand';
import type { Shape } from 'three';
import type { Material, DepthAssignment, ToolConfig, SvgPathData, CutStrategy } from '../types/design';
import { DEFAULT_MATERIAL, DEFAULT_TOOL_CONFIG } from '../types/design';

interface ParsedPath {
  data: SvgPathData;
  shapes: Shape[];
}

interface DesignState {
  // Material
  material: Material;
  setMaterial: (m: Partial<Material>) => void;

  // SVG paths
  paths: ParsedPath[];
  setPaths: (p: ParsedPath[]) => void;
  selectedPathId: string | null;
  selectPath: (id: string | null) => void;

  // Raw SVG text (for project save/load — Shape objects aren't serializable)
  svgText: string | null;
  setSvgText: (t: string | null) => void;

  // SVG bounding box (from parsed SVG)
  svgBounds: { width: number; height: number } | null;
  setSvgBounds: (b: { width: number; height: number } | null) => void;

  // Depth assignments
  depthAssignments: Map<string, DepthAssignment>;
  setDepth: (pathId: string, type: DepthAssignment['type'], depth?: number, strategy?: CutStrategy) => void;
  setStrategy: (pathId: string, strategy: CutStrategy) => void;

  // Tool config
  toolConfig: ToolConfig;
  setToolConfig: (c: Partial<ToolConfig>) => void;

  // Generated G-code
  gcode: string | null;
  setGcode: (g: string | null) => void;

  // Preview mode
  showCutPreview: boolean;
  toggleCutPreview: () => void;
}

export const useDesignStore = create<DesignState>((set) => ({
  material: DEFAULT_MATERIAL,
  setMaterial: (m) => set((s) => ({ material: { ...s.material, ...m } })),

  paths: [],
  setPaths: (p) => set({ paths: p }),
  selectedPathId: null,
  selectPath: (id) => set({ selectedPathId: id }),

  svgText: null,
  setSvgText: (t) => set({ svgText: t }),

  svgBounds: null,
  setSvgBounds: (b) => set({ svgBounds: b }),

  depthAssignments: new Map(),
  setDepth: (pathId, type, depth, strategy) =>
    set((s) => {
      const next = new Map(s.depthAssignments);
      const existing = next.get(pathId);
      const d = type === 'face' ? 0 : type === 'through' ? s.material.thickness : (depth ?? 5);
      const strat = strategy ?? existing?.strategy ?? (type === 'through' ? 'outline' : 'pocket');
      next.set(pathId, { pathId, type, depth: d, strategy: strat });
      return { depthAssignments: next };
    }),
  setStrategy: (pathId, strategy) =>
    set((s) => {
      const next = new Map(s.depthAssignments);
      const existing = next.get(pathId);
      if (existing) {
        next.set(pathId, { ...existing, strategy });
      }
      return { depthAssignments: next };
    }),

  toolConfig: DEFAULT_TOOL_CONFIG,
  setToolConfig: (c) => set((s) => ({ toolConfig: { ...s.toolConfig, ...c } })),

  gcode: null,
  setGcode: (g) => set({ gcode: g }),

  showCutPreview: false,
  toggleCutPreview: () => set((s) => ({ showCutPreview: !s.showCutPreview })),
}));
