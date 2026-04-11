import { SVGLoader, type SVGResult } from 'three/examples/jsm/loaders/SVGLoader.js';

export interface ParsedSvg {
  result: SVGResult;
  viewBox: { width: number; height: number; minX: number; minY: number };
  hasTextElements: boolean;
}

/**
 * Parse an SVG string using Three.js SVGLoader.
 * Returns the parsed result, viewBox dimensions, and whether text elements were found.
 */
export function parseSvg(svgText: string): ParsedSvg {
  const loader = new SVGLoader();
  const result = loader.parse(svgText);

  // Extract viewBox from the raw SVG
  const viewBox = extractViewBox(svgText);

  // Check for <text> elements (which SVGLoader can't handle)
  const hasTextElements = /<text[\s>]/i.test(svgText);

  return { result, viewBox, hasTextElements };
}

function extractViewBox(svgText: string): { width: number; height: number; minX: number; minY: number } {
  // Try viewBox attribute first
  const vbMatch = svgText.match(/viewBox=["']([^"']+)["']/i);
  if (vbMatch) {
    const parts = vbMatch[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length >= 4) {
      return { minX: parts[0], minY: parts[1], width: parts[2], height: parts[3] };
    }
  }

  // Fall back to width/height attributes
  const wMatch = svgText.match(/\bwidth=["']([0-9.]+)/i);
  const hMatch = svgText.match(/\bheight=["']([0-9.]+)/i);
  const w = wMatch ? parseFloat(wMatch[1]) : 100;
  const h = hMatch ? parseFloat(hMatch[1]) : 100;

  return { minX: 0, minY: 0, width: w, height: h };
}
