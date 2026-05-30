import { SVGLoader, type SVGResult } from 'three/examples/jsm/loaders/SVGLoader.js';
import { normalizeSvg } from './svgNormalizer';

export interface SvgShapeEntry {
  id: string;          // stable ID: "shape-0", "shape-1", etc.
  name: string;        // descriptive name from SVG id attribute or auto-generated
  tag: string;         // original SVG element tag (polygon, path, rect, etc.)
  isClosed: boolean;   // can be used for pocket operations
  isText: boolean;     // text element (not CNC-machinable without path conversion)
  svgLoaderIndex: number | null; // index in SVGLoader.result.paths
}

export interface ParsedSvg {
  result: SVGResult;
  normalizedSvgText: string;      // the normalized SVG (used by 2D preview)
  viewBox: { width: number; height: number; minX: number; minY: number };
  hasTextElements: boolean;
  shapeRegistry: SvgShapeEntry[];
}

/**
 * Parse an SVG string: normalize it first, then build a shape registry.
 * After normalization, DOM elements and SVGLoader paths are in the same
 * flat sequential order — no fingerprint matching needed.
 */
export function parseSvg(svgText: string): ParsedSvg {
  // Step 1: Normalize the SVG into canonical form
  const normalizedText = normalizeSvg(svgText);

  // Step 2: Parse with SVGLoader (uses the normalized text)
  const loader = new SVGLoader();
  const result = loader.parse(normalizedText);

  // Step 3: Extract viewBox from the normalized SVG
  const viewBox = extractViewBox(normalizedText);

  // Step 4: Check for text elements
  const hasTextElements = /<text[\s>]/i.test(normalizedText);

  // Step 5: Build shape registry from the normalized DOM
  const parser = new DOMParser();
  const doc = parser.parseFromString(normalizedText, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  const shapeRegistry: SvgShapeEntry[] = [];

  if (svg) {
    const allElements = svg.querySelectorAll(
      'path, polygon, polyline, rect, circle, ellipse, line, text'
    );

    // After normalization, SVGLoader paths and DOM elements are in the same
    // sequential order. SVGLoader may skip some elements (text, degenerate paths)
    // but the ORDER of successfully parsed elements matches the DOM order.
    let loaderIdx = 0;

    allElements.forEach((el) => {
      const tag = el.tagName.toLowerCase();
      const isText = tag === 'text';

      const isClosed = tag === 'polygon' || tag === 'rect' || tag === 'circle' || tag === 'ellipse'
        || (tag === 'path' && isPathClosed(el.getAttribute('d') ?? ''));

      const svgId = el.getAttribute('id');
      const name = svgId
        ? svgId.replace(/[-_]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
        : `${capitalize(tag)} ${shapeRegistry.length + 1}`;

      // Match to SVGLoader: try the current loaderIdx, skip text elements
      let matchedIndex: number | null = null;
      if (!isText && loaderIdx < result.paths.length) {
        matchedIndex = loaderIdx;
        loaderIdx++;
      }

      shapeRegistry.push({
        id: `shape-${shapeRegistry.length}`,
        name,
        tag,
        isClosed,
        isText,
        svgLoaderIndex: matchedIndex,
      });
    });
  }

  return { result, normalizedSvgText: normalizedText, viewBox, hasTextElements, shapeRegistry };
}

function extractViewBox(svgText: string): { width: number; height: number; minX: number; minY: number } {
  const vbMatch = svgText.match(/viewBox=["']([^"']+)["']/i);
  if (vbMatch) {
    const parts = vbMatch[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length >= 4) {
      return { minX: parts[0], minY: parts[1], width: parts[2], height: parts[3] };
    }
  }
  // Fall back to width/height — strip units since normalizer already converted
  const wMatch = svgText.match(/\bwidth=["']([0-9.]+)/i);
  const hMatch = svgText.match(/\bheight=["']([0-9.]+)/i);
  return { minX: 0, minY: 0, width: wMatch ? parseFloat(wMatch[1]) : 100, height: hMatch ? parseFloat(hMatch[1]) : 100 };
}

function isPathClosed(d: string): boolean {
  // Check if ANY subpath is closed (has Z anywhere, not just at the end)
  return /z/i.test(d);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
