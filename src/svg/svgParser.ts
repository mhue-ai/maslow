import { SVGLoader, type SVGResult } from 'three/examples/jsm/loaders/SVGLoader.js';

export interface SvgShapeEntry {
  id: string;          // stable ID: "shape-0", "shape-1", etc.
  name: string;        // descriptive name from SVG id attribute or auto-generated
  tag: string;         // original SVG element tag (polygon, path, rect, etc.)
  isClosed: boolean;   // can be used for pocket operations
  isText: boolean;     // text element (not CNC-machinable without path conversion)
  svgLoaderIndex: number | null; // index in SVGLoader.result.paths, null if not parsed
}

export interface ParsedSvg {
  result: SVGResult;
  viewBox: { width: number; height: number; minX: number; minY: number };
  hasTextElements: boolean;
  shapeRegistry: SvgShapeEntry[];  // canonical shape list, single source of truth
}

/**
 * Parse an SVG string and build a unified shape registry.
 * The registry is the single source of truth for both the 2D preview
 * and the G-code generation pipeline.
 */
export function parseSvg(svgText: string): ParsedSvg {
  const loader = new SVGLoader();
  const result = loader.parse(svgText);
  const viewBox = extractViewBox(svgText);

  // Build shape registry from the DOM
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const svg = doc.querySelector('svg');

  const shapeRegistry: SvgShapeEntry[] = [];
  let hasTextElements = false;

  if (svg) {
    // Query ALL potential shape elements in DOM order
    const allElements = svg.querySelectorAll(
      'path, polygon, polyline, rect, circle, ellipse, line, text'
    );

    // Build a map from SVGLoader nodes to their indices
    const loaderNodeMap = new Map<string, number>();
    for (let i = 0; i < result.paths.length; i++) {
      const node = result.paths[i].userData?.node;
      if (node) {
        // Create a fingerprint from tag + attributes to match DOM nodes
        const fp = nodeFingerprint(node);
        loaderNodeMap.set(fp, i);
      }
    }

    allElements.forEach((el) => {
      const tag = el.tagName.toLowerCase();
      const isText = tag === 'text';
      if (isText) hasTextElements = true;

      const isClosed = tag === 'polygon' || tag === 'rect' || tag === 'circle' || tag === 'ellipse'
        || (tag === 'path' && isPathClosed(el.getAttribute('d') ?? ''));

      // Match to SVGLoader index
      const fp = nodeFingerprint(el);
      const svgLoaderIndex = loaderNodeMap.get(fp) ?? null;

      // Generate name from id attribute
      const svgId = el.getAttribute('id');
      const name = svgId
        ? svgId.replace(/[-_]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
        : `${capitalize(tag)} ${shapeRegistry.length + 1}`;

      shapeRegistry.push({
        id: `shape-${shapeRegistry.length}`,
        name,
        tag,
        isClosed,
        isText,
        svgLoaderIndex,
      });
    });
  }

  return { result, viewBox, hasTextElements, shapeRegistry };
}

function extractViewBox(svgText: string): { width: number; height: number; minX: number; minY: number } {
  const vbMatch = svgText.match(/viewBox=["']([^"']+)["']/i);
  if (vbMatch) {
    const parts = vbMatch[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length >= 4) {
      return { minX: parts[0], minY: parts[1], width: parts[2], height: parts[3] };
    }
  }
  const wMatch = svgText.match(/\bwidth=["']([0-9.]+)/i);
  const hMatch = svgText.match(/\bheight=["']([0-9.]+)/i);
  return { minX: 0, minY: 0, width: wMatch ? parseFloat(wMatch[1]) : 100, height: hMatch ? parseFloat(hMatch[1]) : 100 };
}

function nodeFingerprint(node: Element): string {
  const tag = node.tagName?.toLowerCase() ?? '';
  const id = node.getAttribute?.('id') ?? '';
  const d = node.getAttribute?.('d') ?? '';
  const points = node.getAttribute?.('points') ?? '';
  const x = node.getAttribute?.('x') ?? '';
  const y = node.getAttribute?.('y') ?? '';
  return `${tag}|${id}|${d}|${points}|${x},${y}`;
}

function isPathClosed(d: string): boolean {
  return /z\s*$/i.test(d.trim());
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
