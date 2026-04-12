import { Shape, ShapeUtils } from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import type { ParsedSvg } from './svgParser';
import type { SvgPathData } from '../types/design';

export interface ConvertedPath {
  data: SvgPathData;
  shapes: Shape[];
}

/**
 * Convert parsed SVG into Three.js Shapes, using the shape registry
 * for stable IDs that match between the 2D preview and the store.
 *
 * Only creates shapes for non-text registry entries that SVGLoader
 * was able to parse.
 */
export function svgToShapes(parsed: ParsedSvg): ConvertedPath[] {
  const paths: ConvertedPath[] = [];

  for (const entry of parsed.shapeRegistry) {
    // Skip text elements — can't be CNC-machined
    if (entry.isText) continue;

    // Skip entries that SVGLoader didn't parse
    if (entry.svgLoaderIndex === null) continue;

    const shapePath = parsed.result.paths[entry.svgLoaderIndex];
    if (!shapePath) continue;

    const style = shapePath.userData?.style || {};
    const hasFill = style.fill !== undefined && style.fill !== 'none' && style.fill !== '';
    const color = shapePath.color?.getHexString() ?? '888888';
    let shapes: Shape[] = [];

    // Try to create filled shapes
    if (hasFill) {
      shapes = SVGLoader.createShapes(shapePath);
    }

    // If no filled shapes, try from stroked subpaths (closed outlines)
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

    // Fallback: try createShapes regardless
    if (shapes.length === 0) {
      const fallback = SVGLoader.createShapes(shapePath);
      if (fallback.length > 0) shapes = fallback;
    }

    if (shapes.length === 0) continue;

    paths.push({
      data: {
        id: entry.id,    // Use registry ID (stable, matches 2D preview)
        name: entry.name,
        color: `#${color}`,
      },
      shapes,
    });
  }

  return paths;
}
