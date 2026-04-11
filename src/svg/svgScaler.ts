import type { Material } from '../types/design';

export interface SvgTransform {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Compute the transform to map SVG coordinates onto the material surface.
 * SVG origin is top-left with Y-down; Three.js uses center origin with Y-up (for the XY plane).
 * We map SVG content to cover the material surface, centered at origin.
 */
export function computeSvgTransform(
  svgBounds: { width: number; height: number; minX: number; minY: number },
  material: Material
): SvgTransform {
  // Scale SVG to fit material dimensions (uniform scale to contain)
  const scaleX = material.width / svgBounds.width;
  const scaleY = material.height / svgBounds.height;
  const uniformScale = Math.min(scaleX, scaleY);

  // Center the SVG on the material
  // SVG coords: (minX, minY) is top-left
  // Material coords: centered at (0, 0), X goes right, Y goes up
  const offsetX = -svgBounds.width / 2 - svgBounds.minX;
  const offsetY = -svgBounds.height / 2 - svgBounds.minY;

  return {
    scaleX: uniformScale,
    scaleY: -uniformScale, // Flip Y (SVG is Y-down, Three.js is Y-up)
    offsetX: offsetX * uniformScale,
    offsetY: -offsetY * uniformScale, // Flip offset too
  };
}
