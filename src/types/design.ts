export interface Material {
  width: number;   // mm
  height: number;  // mm
  thickness: number; // mm
}

export type DepthType = 'face' | 'relief' | 'through';

export interface DepthAssignment {
  pathId: string;
  type: DepthType;
  depth: number; // mm: 0 for face, user value for relief, material thickness for through
}

export interface SvgPathData {
  id: string;
  name: string;
  color: string;
  // Three.js Shape stored in designStore, not here (not serializable)
}

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
}

export const DEFAULT_TOOL_CONFIG: ToolConfig = {
  bitDiameter: 6.35,      // 1/4"
  feedRate: 750,           // conservative for Maslow
  plungeRate: 250,
  depthPerPass: 3,
  rpm: 18000,
  safeHeight: 5,
  stepover: 0.4,
  tabWidth: 12,
  tabHeight: 9.5,         // half of 19mm
  tabCount: 4,
};

export const DEFAULT_MATERIAL: Material = {
  width: 600,
  height: 200,
  thickness: 19,
};
