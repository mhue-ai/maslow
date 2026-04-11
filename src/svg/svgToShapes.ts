import { Shape, ShapeUtils } from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import type { ParsedSvg } from './svgParser';
import type { SvgPathData } from '../types/design';

export interface ConvertedPath {
  data: SvgPathData;
  shapes: Shape[];
}

/**
 * Convert parsed SVG ShapePaths into Three.js Shapes with metadata.
 *
 * Handles three cases:
 * 1. Filled paths (fill != none) → createShapes directly
 * 2. Stroked paths with no fill → convert subpaths to closed shapes
 * 3. Both filled and stroked → include both
 */
export function svgToShapes(parsed: ParsedSvg): ConvertedPath[] {
  const paths: ConvertedPath[] = [];

  for (let i = 0; i < parsed.result.paths.length; i++) {
    const shapePath = parsed.result.paths[i];
    const style = shapePath.userData?.style || {};
    const hasFill = style.fill !== undefined && style.fill !== 'none' && style.fill !== '';
    const color = shapePath.color?.getHexString() ?? '888888';
    let shapes: Shape[] = [];

    // Try to create filled shapes
    if (hasFill) {
      shapes = SVGLoader.createShapes(shapePath);
    }

    // If no filled shapes found, try to create shapes from subpaths (stroked outlines)
    if (shapes.length === 0 && shapePath.subPaths.length > 0) {
      for (const subPath of shapePath.subPaths) {
        const points = subPath.getPoints();
        if (points.length < 3) continue;

        // Check if the path is closed (first point ≈ last point)
        const first = points[0];
        const last = points[points.length - 1];
        const isClosed = first.distanceTo(last) < 0.5;

        if (isClosed) {
          // Create a filled shape from the closed path
          const shape = new Shape(points);
          // Only add if it has meaningful area (not a degenerate line)
          const area = Math.abs(ShapeUtils.area(points));
          if (area > 1) {
            shapes.push(shape);
          }
        }
      }
    }

    // If still no shapes and we have subPaths, also try the main path
    if (shapes.length === 0) {
      // Try creating shapes regardless of fill/stroke
      const fallbackShapes = SVGLoader.createShapes(shapePath);
      if (fallbackShapes.length > 0) {
        shapes = fallbackShapes;
      }
    }

    if (shapes.length === 0) continue;

    // Generate a descriptive name from the SVG element id if available
    const name = getPathName(i, shapePath);

    paths.push({
      data: {
        id: `path-${i}`,
        name,
        color: `#${color}`,
      },
      shapes,
    });
  }

  return paths;
}

function getPathName(index: number, shapePath: any): string {
  // Try to use SVG element id if available
  const id = shapePath.userData?.node?.id;
  if (id) {
    return id.replace(/[-_]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
  }
  return `Path ${index + 1}`;
}
