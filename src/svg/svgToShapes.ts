import { Shape, ShapeUtils } from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import type { ParsedSvg } from './svgParser';
import type { SvgPathData } from '../types/design';

export interface ConvertedPath {
  data: SvgPathData;
  shapes: Shape[];
}

/**
 * Convert parsed SVG into Three.js Shapes using the shape registry.
 * After normalization, registry entries match SVGLoader paths sequentially.
 */
export function svgToShapes(parsed: ParsedSvg): ConvertedPath[] {
  const paths: ConvertedPath[] = [];

  for (const entry of parsed.shapeRegistry) {
    if (entry.isText) continue;
    if (entry.svgLoaderIndex === null) continue;

    const shapePath = parsed.result.paths[entry.svgLoaderIndex];
    if (!shapePath) continue;

    const color = shapePath.color?.getHexString() ?? '888888';
    let shapes: Shape[] = [];

    // Try filled shapes first
    const style = shapePath.userData?.style || {};
    const hasFill = style.fill !== undefined && style.fill !== 'none' && style.fill !== '';
    if (hasFill) {
      shapes = SVGLoader.createShapes(shapePath);
    }

    // If no filled shapes, try from closed subpaths
    if (shapes.length === 0 && shapePath.subPaths.length > 0) {
      for (const subPath of shapePath.subPaths) {
        const points = subPath.getPoints();
        if (points.length < 3) continue;
        const first = points[0];
        const last = points[points.length - 1];
        if (first.distanceTo(last) < 0.5) {
          const shape = new Shape(points);
          if (Math.abs(ShapeUtils.area(points)) > 1) {
            shapes.push(shape);
          }
        }
      }
    }

    // Fallback
    if (shapes.length === 0) {
      const fallback = SVGLoader.createShapes(shapePath);
      if (fallback.length > 0) shapes = fallback;
    }

    if (shapes.length === 0) continue;

    paths.push({
      data: {
        id: entry.id,
        name: entry.name,
        color: `#${color}`,
      },
      shapes,
    });
  }

  return paths;
}
