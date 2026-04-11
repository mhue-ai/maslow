import { Shape } from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import type { ParsedSvg } from './svgParser';
import type { SvgPathData } from '../types/design';

export interface ConvertedPath {
  data: SvgPathData;
  shapes: Shape[];
}

/**
 * Convert parsed SVG ShapePaths into Three.js Shapes with metadata.
 * Each ShapePath becomes one entry with an ID, display name, and color.
 */
export function svgToShapes(parsed: ParsedSvg): ConvertedPath[] {
  const paths: ConvertedPath[] = [];

  for (let i = 0; i < parsed.result.paths.length; i++) {
    const shapePath = parsed.result.paths[i];
    const shapes = SVGLoader.createShapes(shapePath);

    if (shapes.length === 0) continue;

    const color = shapePath.color?.getHexString() ?? '888888';

    paths.push({
      data: {
        id: `path-${i}`,
        name: `Path ${i + 1}`,
        color: `#${color}`,
      },
      shapes,
    });
  }

  return paths;
}
