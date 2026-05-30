import { create } from 'zustand';
import type { Shape } from 'three';
import type { Material, ShapeLevel, ToolConfig, SvgPathData, SvgTransformOverride, DesignCopy } from '../types/design';
import type { SvgShapeEntry } from '../svg/svgParser';
import { DEFAULT_MATERIAL, DEFAULT_TOOL_CONFIG, DEFAULT_SVG_TRANSFORM } from '../types/design';

export interface ParsedPath {
  data: SvgPathData;
  shapes: Shape[];
}

interface HistoryEntry {
  shapeLevels: Map<string, ShapeLevel>;
  toolConfig: ToolConfig;
  material: Material;
  svgTransformOverride: SvgTransformOverride;
  operationOrder: string[];
  designCopies: DesignCopy[];
  outlineReliefIds: Set<string>;
  outlineReliefDepth: number;
  cutShapeIds: Set<string>;
  cutDepth: number;
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

  // Raw SVG text
  svgText: string | null;
  setSvgText: (t: string | null) => void;

  // SVG shape registry (canonical list of shapes from SVG DOM)
  shapeRegistry: SvgShapeEntry[];
  setShapeRegistry: (r: SvgShapeEntry[]) => void;

  // SVG bounding box
  svgBounds: { width: number; height: number; minX: number; minY: number } | null;
  setSvgBounds: (b: { width: number; height: number; minX: number; minY: number } | null) => void;

  // SVG transform override (move/scale/rotate/mirror)
  svgTransformOverride: SvgTransformOverride;
  setSvgTransformOverride: (t: Partial<SvgTransformOverride>) => void;

  // Shape levels: one number per shape (mm depth from surface)
  shapeLevels: Map<string, ShapeLevel>;
  setShapeLevel: (shapeId: string, level: number) => void;

  // Operation order (path IDs in cut sequence)
  operationOrder: string[];
  setOperationOrder: (order: string[]) => void;
  moveOperation: (pathId: string, direction: 'up' | 'down') => void;

  // Tool config
  toolConfig: ToolConfig;
  setToolConfig: (c: Partial<ToolConfig>) => void;

  // Profile cut — outermost shape, always last operation (auto-set on SVG import)
  profileCutId: string | null;
  setProfileCutId: (id: string | null) => void;

  // ── Outline mode state ──
  // Shapes marked here become "relief" regions in Outline mode: their outlines
  // are cut (with bit offset INSIDE) at the relief depth. Any Keep shape
  // geometrically inside a Relief is auto-detected as an Island and gets
  // outlined with bit offset OUTSIDE so it stays at full size. NO pocket fill
  // is generated — the user clears the waste between outlines manually.
  outlineReliefIds: Set<string>;
  setOutlineRelief: (shapeId: string, isRelief: boolean) => void;
  clearOutlineReliefs: () => void;
  outlineReliefDepth: number;     // mm depth for all Outline-mode outline cuts
  setOutlineReliefDepth: (mm: number) => void;

  // ── Cut mode state ──
  // Cut mode is the simplest of the three design modes: the bit follows each
  // selected path AS DRAWN, no kerf offset (no inside/outside). One global
  // depth governs every cut; auto-tabs kick in when `cutDepth` reaches the
  // material thickness (through-cut). Bit diameter still comes from
  // toolConfig — it determines how wide the slot ends up.
  cutShapeIds: Set<string>;
  setCutShape: (shapeId: string, included: boolean) => void;
  clearCutShapes: () => void;
  cutDepth: number;               // mm depth for all Cut-mode line cuts
  setCutDepth: (mm: number) => void;

  // Generated G-code
  gcode: string | null;
  setGcode: (g: string | null) => void;

  // Design copies (tiling)
  designCopies: DesignCopy[];
  addDesignCopy: (offsetX: number, offsetY: number) => void;
  removeDesignCopy: (id: string) => void;
  updateDesignCopy: (id: string, offsetX: number, offsetY: number) => void;
  clearDesignCopies: () => void;

  // Nudge design position with arrow keys
  nudgeDesign: (dx: number, dy: number) => void;

  // Preview mode
  showCutPreview: boolean;
  toggleCutPreview: () => void;
  showToolpaths: boolean;
  toggleToolpaths: () => void;

  // Simulation playback
  simPlaying: boolean;
  simProgress: number;
  simSpeed: number;
  simTotalSegments: number;
  simPlay: () => void;
  simPause: () => void;
  simReset: () => void;
  simSetProgress: (n: number) => void;
  simSetSpeed: (s: number) => void;
  simSetTotalSegments: (n: number) => void;

  // Undo/redo
  history: HistoryEntry[];
  historyIndex: number;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
}

function captureHistory(s: DesignState): HistoryEntry {
  return {
    shapeLevels: new Map(s.shapeLevels),
    toolConfig: { ...s.toolConfig },
    material: { ...s.material },
    svgTransformOverride: { ...s.svgTransformOverride },
    operationOrder: [...s.operationOrder],
    designCopies: s.designCopies.map((c) => ({ ...c })),
    outlineReliefIds: new Set(s.outlineReliefIds),
    outlineReliefDepth: s.outlineReliefDepth,
    cutShapeIds: new Set(s.cutShapeIds),
    cutDepth: s.cutDepth,
  };
}

export const useDesignStore = create<DesignState>((set, get) => ({
  material: DEFAULT_MATERIAL,
  setMaterial: (m) => {
    get().pushHistory();
    set((s) => ({ material: { ...s.material, ...m } }));
  },

  paths: [],
  setPaths: (p) => {
    // Auto-detect the outermost shape (largest bounding box area) for profile cut
    let profileId: string | null = null;
    let maxArea = 0;
    for (const path of p) {
      for (const shape of path.shapes) {
        const pts = shape.getPoints(32);
        if (pts.length < 3) continue;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const pt of pts) {
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
        }
        const area = (maxX - minX) * (maxY - minY);
        if (area > maxArea) {
          maxArea = area;
          profileId = path.data.id;
        }
      }
    }

    // ALL shapes start at level 0 (face), except profile cut → material thickness.
    // Include shapes from the registry too (not just converted paths),
    // so every clickable element in the 2D preview has an explicit level.
    const levels = new Map<string, ShapeLevel>();
    const thickness = get().material.thickness;
    const registry = get().shapeRegistry;

    // First: entries for all converted paths
    for (const path of p) {
      levels.set(path.data.id, {
        shapeId: path.data.id,
        level: path.data.id === profileId ? thickness : 0,
      });
    }

    // Second: entries for registry shapes that weren't in converted paths
    for (const entry of registry) {
      if (!entry.isText && !levels.has(entry.id)) {
        levels.set(entry.id, { shapeId: entry.id, level: 0 });
      }
    }

    // Operation order: all non-profile shapes first, profile cut always last
    const order = p.map((pp) => pp.data.id).filter((id) => id !== profileId);
    if (profileId) order.push(profileId);

    set({
      paths: p,
      operationOrder: order,
      shapeLevels: levels,
      profileCutId: profileId,
      // Clear Outline-mode reliefs on every new SVG so stale IDs from a prior
      // file don't carry over.
      outlineReliefIds: new Set(),
      // Same for Cut-mode shape selection — fresh SVG, fresh selection.
      cutShapeIds: new Set(),
    });
  },
  selectedPathId: null,
  selectPath: (id) => set({ selectedPathId: id }),

  svgText: null,
  setSvgText: (t) => set({ svgText: t }),

  shapeRegistry: [],
  setShapeRegistry: (r) => set({ shapeRegistry: r }),

  svgBounds: null,
  setSvgBounds: (b) => set({ svgBounds: b }),

  svgTransformOverride: DEFAULT_SVG_TRANSFORM,
  setSvgTransformOverride: (t) => {
    get().pushHistory();
    set((s) => ({ svgTransformOverride: { ...s.svgTransformOverride, ...t } }));
  },

  shapeLevels: new Map(),
  setShapeLevel: (shapeId, level) => {
    get().pushHistory();
    set((s) => {
      const next = new Map(s.shapeLevels);
      next.set(shapeId, { shapeId, level: Math.max(0, level) });
      return { shapeLevels: next };
    });
  },

  operationOrder: [],
  setOperationOrder: (order) => set({ operationOrder: order }),
  moveOperation: (pathId, direction) => {
    get().pushHistory();
    set((s) => {
      const order = [...s.operationOrder];
      const idx = order.indexOf(pathId);
      if (idx < 0) return s;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= order.length) return s;
      // Profile cut must always stay last — prevent moving it up
      // or moving another shape below it
      if (s.profileCutId) {
        const profileIdx = order.indexOf(s.profileCutId);
        if (pathId === s.profileCutId && direction === 'up') return s;
        if (pathId !== s.profileCutId && newIdx >= profileIdx) return s;
      }
      [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
      return { operationOrder: order };
    });
  },

  toolConfig: DEFAULT_TOOL_CONFIG,
  setToolConfig: (c) => {
    get().pushHistory();
    set((s) => ({ toolConfig: { ...s.toolConfig, ...c } }));
  },

  gcode: null,
  setGcode: (g) => set({ gcode: g }),

  designCopies: [],
  addDesignCopy: (offsetX, offsetY) => {
    get().pushHistory();
    set((s) => ({
      designCopies: [...s.designCopies, { id: `copy-${Date.now()}`, offsetX, offsetY }],
    }));
  },
  removeDesignCopy: (id) => {
    get().pushHistory();
    set((s) => ({
      designCopies: s.designCopies.filter((c) => c.id !== id),
    }));
  },
  updateDesignCopy: (id, offsetX, offsetY) => {
    get().pushHistory();
    set((s) => ({
      designCopies: s.designCopies.map((c) => c.id === id ? { ...c, offsetX, offsetY } : c),
    }));
  },
  clearDesignCopies: () => {
    get().pushHistory();
    set({ designCopies: [] });
  },

  nudgeDesign: (dx, dy) => {
    get().pushHistory();
    set((s) => ({
      svgTransformOverride: {
        ...s.svgTransformOverride,
        offsetX: s.svgTransformOverride.offsetX + dx,
        offsetY: s.svgTransformOverride.offsetY + dy,
      },
    }));
  },

  profileCutId: null,
  setProfileCutId: (id) => {
    get().pushHistory();
    set((s) => {
      // Profile must always be last in operationOrder.
      const filtered = s.operationOrder.filter((x) => x !== id);
      const newOrder = id ? [...filtered, id] : filtered;
      return { profileCutId: id, operationOrder: newOrder };
    });
  },

  // ── Outline mode ──
  outlineReliefIds: new Set(),
  setOutlineRelief: (shapeId, isRelief) => {
    get().pushHistory();
    set((s) => {
      const next = new Set(s.outlineReliefIds);
      if (isRelief) next.add(shapeId);
      else next.delete(shapeId);
      return { outlineReliefIds: next };
    });
  },
  clearOutlineReliefs: () => {
    get().pushHistory();
    set({ outlineReliefIds: new Set() });
  },
  outlineReliefDepth: 3,
  setOutlineReliefDepth: (mm) => {
    get().pushHistory();
    set({ outlineReliefDepth: Math.max(0.5, mm) });
  },

  // ── Cut mode ──
  cutShapeIds: new Set(),
  setCutShape: (shapeId, included) => {
    get().pushHistory();
    set((s) => {
      const next = new Set(s.cutShapeIds);
      if (included) next.add(shapeId);
      else next.delete(shapeId);
      return { cutShapeIds: next };
    });
  },
  clearCutShapes: () => {
    get().pushHistory();
    set({ cutShapeIds: new Set() });
  },
  cutDepth: 3,
  setCutDepth: (mm) => {
    get().pushHistory();
    set({ cutDepth: Math.max(0.5, mm) });
  },

  showCutPreview: false,
  toggleCutPreview: () => set((s) => ({ showCutPreview: !s.showCutPreview })),
  showToolpaths: false,
  toggleToolpaths: () => set((s) => ({ showToolpaths: !s.showToolpaths })),

  // Simulation playback
  simPlaying: false,
  simProgress: 0,
  simSpeed: 1,
  simTotalSegments: 0,
  simPlay: () => set({ simPlaying: true }),
  simPause: () => set({ simPlaying: false }),
  simReset: () => set({ simPlaying: false, simProgress: 0 }),
  simSetProgress: (n) => set({ simProgress: n }),
  simSetSpeed: (s) => set({ simSpeed: s }),
  simSetTotalSegments: (n) => set({ simTotalSegments: n }),

  // Undo/redo — keep last 50 states
  history: [],
  historyIndex: -1,
  pushHistory: () =>
    set((s) => {
      const entry = captureHistory(s);
      const trimmed = s.history.slice(0, s.historyIndex + 1);
      const next = [...trimmed, entry].slice(-50);
      return { history: next, historyIndex: next.length - 1 };
    }),
  undo: () =>
    set((s) => {
      if (s.historyIndex < 0) return s;
      const entry = s.history[s.historyIndex];
      return {
        shapeLevels: new Map(entry.shapeLevels),
        toolConfig: { ...entry.toolConfig },
        material: { ...entry.material },
        svgTransformOverride: { ...entry.svgTransformOverride },
        operationOrder: [...entry.operationOrder],
        designCopies: entry.designCopies.map((c) => ({ ...c })),
        outlineReliefIds: new Set(entry.outlineReliefIds),
        outlineReliefDepth: entry.outlineReliefDepth,
        cutShapeIds: new Set(entry.cutShapeIds),
        cutDepth: entry.cutDepth,
        historyIndex: s.historyIndex - 1,
      };
    }),
  redo: () =>
    set((s) => {
      const nextIdx = s.historyIndex + 1;
      if (nextIdx >= s.history.length) return s;
      const entry = s.history[nextIdx];
      return {
        shapeLevels: new Map(entry.shapeLevels),
        toolConfig: { ...entry.toolConfig },
        material: { ...entry.material },
        svgTransformOverride: { ...entry.svgTransformOverride },
        operationOrder: [...entry.operationOrder],
        designCopies: entry.designCopies.map((c) => ({ ...c })),
        outlineReliefIds: new Set(entry.outlineReliefIds),
        outlineReliefDepth: entry.outlineReliefDepth,
        cutShapeIds: new Set(entry.cutShapeIds),
        cutDepth: entry.cutDepth,
        historyIndex: nextIdx,
      };
    }),
}));

// Dev-only: expose for browser console inspection (toolpath debugging).
if (typeof window !== 'undefined') {
  (window as unknown as { __designStore?: typeof useDesignStore }).__designStore = useDesignStore;
}
