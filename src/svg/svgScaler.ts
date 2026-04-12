import type { Material, WorkOrigin, SvgTransformOverride } from '../types/design';

export interface SvgTransform {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  rotation: number; // radians
}

/**
 * Compute the transform to map SVG coordinates onto the material surface.
 * SVG origin is top-left with Y-down; CNC/Three.js uses Y-up.
 *
 * Work origin determines where (0,0) is on the material:
 * - center: (0,0) at material center (default)
 * - bottom-left: (0,0) at bottom-left corner, all coordinates positive
 * - top-left: (0,0) at top-left corner, Y goes negative downward
 */
export function computeSvgTransform(
  svgBounds: { width: number; height: number; minX: number; minY: number },
  material: Material,
  workOrigin: WorkOrigin = 'center',
  override?: SvgTransformOverride,
  edgeClearance: number = 0
): SvgTransform {
  // Scale SVG to fit within the SAFE area (material minus edge clearance)
  const safeWidth = material.width - 2 * edgeClearance;
  const safeHeight = material.height - 2 * edgeClearance;
  const scaleX = safeWidth / svgBounds.width;
  const scaleY = safeHeight / svgBounds.height;
  let uniformScale = Math.min(scaleX, scaleY);

  // Apply user scale override
  if (override) {
    uniformScale *= override.scale;
  }

  // Apply mirror
  const mirrorX = override?.mirrorX ? -1 : 1;
  const mirrorY = override?.mirrorY ? -1 : 1;

  const finalScaleX = uniformScale * mirrorX;
  const finalScaleY = -uniformScale * mirrorY; // Negative for SVG Y-flip

  // Compute base offsets to center SVG content
  const svgCenterX = (svgBounds.minX + svgBounds.width / 2);
  const svgCenterY = (svgBounds.minY + svgBounds.height / 2);

  let offsetX = -svgCenterX * finalScaleX;
  let offsetY = -svgCenterY * finalScaleY;

  // Shift for work origin
  if (workOrigin === 'bottom-left') {
    offsetX += material.width / 2;
    offsetY += material.height / 2;
  } else if (workOrigin === 'top-left') {
    offsetX += material.width / 2;
    offsetY -= material.height / 2;
  }

  // Apply user offset override (in mm)
  if (override) {
    offsetX += override.offsetX;
    offsetY += override.offsetY;
  }

  // Rotation in radians
  const rotation = override ? (override.rotation * Math.PI) / 180 : 0;

  return {
    scaleX: finalScaleX,
    scaleY: finalScaleY,
    offsetX,
    offsetY,
    rotation,
  };
}

/**
 * Apply the full SVG transform to a point (for G-code generation).
 * Applies scale, then rotation, then offset.
 */
export function transformPoint(
  px: number, py: number,
  t: SvgTransform
): { x: number; y: number } {
  // Scale
  let x = px * t.scaleX;
  let y = py * t.scaleY;

  // Rotate around origin
  if (t.rotation !== 0) {
    const cos = Math.cos(t.rotation);
    const sin = Math.sin(t.rotation);
    const rx = x * cos - y * sin;
    const ry = x * sin + y * cos;
    x = rx;
    y = ry;
  }

  // Translate
  x += t.offsetX;
  y += t.offsetY;

  return { x, y };
}
