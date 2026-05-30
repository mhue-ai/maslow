export interface Material {
  width: number;   // mm
  height: number;  // mm
  thickness: number; // mm
}

export type WorkOrigin = 'center' | 'bottom-left' | 'top-left';

/**
 * ShapeLevel: one number per shape — its depth level in mm.
 * Everything else (cut strategy, offset, pocket vs profile) is auto-derived:
 * - level 0: face (no cut)
 * - 0 < level < thickness: relief pocket, cut inside boundary
 * - level >= thickness: through-cut (outside for profile, inside for holes)
 */
export interface ShapeLevel {
  shapeId: string;
  level: number; // mm: 0 = face, positive = relief depth, thickness = through
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

export type FillStrategy = 'offset' | 'zigzag';
export type MillingDirection = 'conventional' | 'climb';
export type FinishPassMode = 'per-layer' | 'final-only' | 'disabled';

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
  edgeClearance: number;  // mm from sheet edges — Maslow accuracy degrades at edges

  // Advanced toolpath quality options
  fillStrategy: FillStrategy;      // 'offset' = concentric (smooth walls), 'zigzag' = raster (fast but jagged)
  stockToLeave: number;            // mm radial — roughing leaves this much; finish pass removes it
  finishPass: FinishPassMode;      // when to run the wall-cleanup contour pass
  millingDirection: MillingDirection; // 'conventional' recommended for Maslow (belt-safe)
  rampPlunge: boolean;             // ramp in diagonally instead of straight plunge
  rampAngle: number;               // degrees — ramp descent angle (3-15° typical)
}

export const DEFAULT_TOOL_CONFIG: ToolConfig = {
  bitDiameter: 6.35,
  feedRate: 1500,       // Community-tuned for Maslow 4 belt kinematics (~60-80 IPM)
  plungeRate: 350,      // Matched to feed rate ratio
  depthPerPass: 3,
  rpm: 16000,           // Plywood burns at 18k — community runs 14-16k on plywood
  safeHeight: 5,
  stepover: 0.30,       // Reduced from 40% — belts have compliance, 30% prevents chatter
  tabWidth: 12,
  tabHeight: 9.5,
  tabCount: 4,
  workOrigin: 'center',
  edgeClearance: 100,   // Community: belt arc geometry degrades accuracy within 100mm of frame edges

  // Quality defaults — tuned for plywood/MDF on Maslow
  fillStrategy: 'offset',          // Concentric offset = smoother walls than zig-zag raster
  stockToLeave: 0.3,               // mm — left by roughing, removed by finish pass
  finishPass: 'final-only',        // One contour pass at final depth (fast, clean enough for wood)
  millingDirection: 'conventional', // Safer on belt-driven Maslow than climb
  rampPlunge: true,                // Ramp entry reduces Z chatter on Maslow
  rampAngle: 5,                    // 5° ramp — gentle, works for MDF and plywood
};

export const DEFAULT_MATERIAL: Material = {
  width: 1220,  // 4' wide (landscape)
  height: 610,  // 2' tall
  thickness: 19, // 3/4"
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
  // Plywood — community-tuned feeds (1500-1800 mm/min), 16k RPM to prevent burning
  { name: '1/8" Plywood (4x8)',  width: 2440, height: 1220, thickness: 3.2,  feedRate: 1800, plungeRate: 400, rpm: 16000, depthPerPass: 1.5 },
  { name: '1/4" Plywood (4x8)',  width: 2440, height: 1220, thickness: 6.35, feedRate: 1800, plungeRate: 400, rpm: 16000, depthPerPass: 2 },
  { name: '5/16" Plywood (4x8)', width: 2440, height: 1220, thickness: 8,    feedRate: 1700, plungeRate: 380, rpm: 16000, depthPerPass: 2.5 },
  { name: '3/8" Plywood (4x8)',  width: 2440, height: 1220, thickness: 9.5,  feedRate: 1700, plungeRate: 380, rpm: 16000, depthPerPass: 2.5 },
  { name: '1/2" Plywood (4x8)',  width: 2440, height: 1220, thickness: 12.7, feedRate: 1600, plungeRate: 350, rpm: 16000, depthPerPass: 3 },
  { name: '5/8" Plywood (4x8)',  width: 2440, height: 1220, thickness: 16,   feedRate: 1600, plungeRate: 350, rpm: 16000, depthPerPass: 3 },
  { name: '3/4" Plywood (4x8)',  width: 2440, height: 1220, thickness: 19,   feedRate: 1500, plungeRate: 350, rpm: 16000, depthPerPass: 3 },
  { name: '3/4" Plywood (4x4)',  width: 1220, height: 1220, thickness: 19,   feedRate: 1500, plungeRate: 350, rpm: 16000, depthPerPass: 3 },
  { name: '3/4" Plywood (2x4)',  width: 1220, height: 610,  thickness: 19,   feedRate: 1500, plungeRate: 350, rpm: 16000, depthPerPass: 3 },
  // MDF — community runs hot, full RPM tolerated
  { name: '1/4" MDF (4x8)',      width: 2440, height: 1220, thickness: 6.35, feedRate: 1800, plungeRate: 400, rpm: 18000, depthPerPass: 2 },
  { name: '1/2" MDF (4x8)',      width: 2440, height: 1220, thickness: 12.7, feedRate: 1700, plungeRate: 400, rpm: 18000, depthPerPass: 2.5 },
  { name: '3/4" MDF (4x8)',      width: 2440, height: 1220, thickness: 19,   feedRate: 1600, plungeRate: 400, rpm: 18000, depthPerPass: 2.5 },
  // Hardwood — legitimately slower, lower RPM
  { name: '1/2" Hardwood',       width: 1220, height: 610,  thickness: 12.7, feedRate: 500,  plungeRate: 150, rpm: 14000, depthPerPass: 1.5 },
  { name: '3/4" Hardwood',       width: 1220, height: 610,  thickness: 19,   feedRate: 500,  plungeRate: 150, rpm: 14000, depthPerPass: 1.5 },
  // Acrylic — prevents melt/weld
  { name: '1/8" Acrylic',        width: 1220, height: 610,  thickness: 3.2,  feedRate: 600,  plungeRate: 150, rpm: 16000, depthPerPass: 1 },
  { name: '1/4" Acrylic',        width: 1220, height: 610,  thickness: 6.35, feedRate: 600,  plungeRate: 150, rpm: 16000, depthPerPass: 1.5 },
];
