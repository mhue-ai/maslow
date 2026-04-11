export interface Material {
  width: number;   // mm
  height: number;  // mm
  thickness: number; // mm
}

export type DepthType = 'face' | 'relief' | 'through';
export type CutStrategy = 'pocket' | 'outline';
export type ProfileOffset = 'none' | 'inside' | 'outside';
export type WorkOrigin = 'center' | 'bottom-left' | 'top-left';

export interface DepthAssignment {
  pathId: string;
  type: DepthType;
  depth: number;
  strategy: CutStrategy;
  profileOffset: ProfileOffset; // bit offset for outline/profile cuts
}

export interface SvgPathData {
  id: string;
  name: string;
  color: string;
}

export interface SvgTransformOverride {
  offsetX: number;   // mm shift
  offsetY: number;   // mm shift
  scale: number;     // multiplier (1 = no change)
  rotation: number;  // degrees
  mirrorX: boolean;
  mirrorY: boolean;
}

export const DEFAULT_SVG_TRANSFORM: SvgTransformOverride = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  rotation: 0,
  mirrorX: false,
  mirrorY: false,
};

export interface ToolConfig {
  bitDiameter: number;    // mm
  feedRate: number;        // mm/min
  plungeRate: number;      // mm/min
  depthPerPass: number;    // mm
  rpm: number;
  safeHeight: number;      // mm above material
  stepover: number;        // fraction of bit diameter (0.4 = 40%)
  tabWidth: number;        // mm
  tabHeight: number;       // mm
  tabCount: number;        // per path
  workOrigin: WorkOrigin;
}

export const DEFAULT_TOOL_CONFIG: ToolConfig = {
  bitDiameter: 6.35,
  feedRate: 750,
  plungeRate: 250,
  depthPerPass: 3,
  rpm: 18000,
  safeHeight: 5,
  stepover: 0.4,
  tabWidth: 12,
  tabHeight: 9.5,
  tabCount: 4,
  workOrigin: 'center',
};

export const DEFAULT_MATERIAL: Material = {
  width: 600,
  height: 200,
  thickness: 19,
};

/** A positioned copy of the design on the material (for tiling/nesting) */
export interface DesignCopy {
  id: string;
  offsetX: number; // mm from base design position
  offsetY: number;
}

export interface MaterialPreset {
  name: string;
  width: number;
  height: number;
  thickness: number;
  feedRate: number;
  plungeRate: number;
  rpm: number;
  depthPerPass: number;
}

export const BUILT_IN_PRESETS: MaterialPreset[] = [
  { name: '3/4" Plywood (4x8)', width: 1220, height: 2440, thickness: 19, feedRate: 750, plungeRate: 250, rpm: 18000, depthPerPass: 3 },
  { name: '3/4" Plywood (2x4)', width: 610, height: 1220, thickness: 19, feedRate: 750, plungeRate: 250, rpm: 18000, depthPerPass: 3 },
  { name: '1/2" MDF', width: 1220, height: 2440, thickness: 12.7, feedRate: 625, plungeRate: 200, rpm: 18000, depthPerPass: 2.5 },
  { name: '3/4" Hardwood', width: 600, height: 300, thickness: 19, feedRate: 500, plungeRate: 150, rpm: 14000, depthPerPass: 1.5 },
  { name: '1/4" Acrylic', width: 600, height: 300, thickness: 6.35, feedRate: 600, plungeRate: 150, rpm: 16000, depthPerPass: 1.5 },
  { name: 'PeopleMover Sign', width: 600, height: 200, thickness: 19, feedRate: 750, plungeRate: 250, rpm: 18000, depthPerPass: 3 },
];
