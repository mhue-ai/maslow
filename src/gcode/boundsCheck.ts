import type { Material, WorkOrigin } from '../types/design';

export interface BoundsResult {
  inBounds: boolean;
  warnings: string[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const MASLOW_MAX_X = 1220; // 4 feet in mm
const MASLOW_MAX_Y = 2440; // 8 feet in mm

/**
 * Scan G-code for out-of-bounds moves.
 * Checks against material dimensions and Maslow's max cutting envelope.
 */
export function checkBounds(
  lines: string[],
  material: Material,
  workOrigin: WorkOrigin
): BoundsResult {
  const warnings: string[] = [];
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (const line of lines) {
    if (!line.startsWith('G0') && !line.startsWith('G1')) continue;

    const xMatch = line.match(/X(-?[\d.]+)/);
    const yMatch = line.match(/Y(-?[\d.]+)/);

    if (xMatch) {
      const x = parseFloat(xMatch[1]);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
    if (yMatch) {
      const y = parseFloat(yMatch[1]);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (!isFinite(minX)) {
    return { inBounds: true, warnings: [], minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }

  // Compute material bounds based on work origin
  let matMinX: number, matMaxX: number, matMinY: number, matMaxY: number;

  if (workOrigin === 'center') {
    matMinX = -material.width / 2;
    matMaxX = material.width / 2;
    matMinY = -material.height / 2;
    matMaxY = material.height / 2;
  } else if (workOrigin === 'bottom-left') {
    matMinX = 0;
    matMaxX = material.width;
    matMinY = 0;
    matMaxY = material.height;
  } else {
    // top-left
    matMinX = 0;
    matMaxX = material.width;
    matMinY = -material.height;
    matMaxY = 0;
  }

  // Check against material
  if (minX < matMinX - 0.5 || maxX > matMaxX + 0.5 ||
      minY < matMinY - 0.5 || maxY > matMaxY + 0.5) {
    warnings.push(
      `Toolpath exceeds material: X[${minX.toFixed(1)}..${maxX.toFixed(1)}] Y[${minY.toFixed(1)}..${maxY.toFixed(1)}] ` +
      `vs material X[${matMinX.toFixed(0)}..${matMaxX.toFixed(0)}] Y[${matMinY.toFixed(0)}..${matMaxY.toFixed(0)}]`
    );
  }

  // Check against Maslow max envelope
  const toolpathWidth = maxX - minX;
  const toolpathHeight = maxY - minY;
  if (toolpathWidth > MASLOW_MAX_X || toolpathHeight > MASLOW_MAX_Y) {
    warnings.push(
      `Toolpath extent ${toolpathWidth.toFixed(0)}x${toolpathHeight.toFixed(0)}mm exceeds Maslow max ${MASLOW_MAX_X}x${MASLOW_MAX_Y}mm`
    );
  }

  return {
    inBounds: warnings.length === 0,
    warnings,
    minX, maxX, minY, maxY,
  };
}
