import type { Material, WorkOrigin, SvgTransformOverride } from '../types/design';

export interface SvgTransform {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
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
  override?: SvgTransformOverride
): SvgTransform {
  // Base scale: fit SVG to material, uniform to preserve aspect ratio
  const scaleX = material.width / svgBounds.width;
  const scaleY = material.height / svgBounds.height;
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
  // 'center' needs no shift

  // Apply user offset override (in mm)
  if (override) {
    offsetX += override.offsetX;
    offsetY += override.offsetY;
  }

  return {
    scaleX: finalScaleX,
    scaleY: finalScaleY,
    offsetX,
    offsetY,
  };
}
