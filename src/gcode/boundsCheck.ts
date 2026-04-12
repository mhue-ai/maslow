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
 * Checks against material dimensions WITH edge clearance applied,
 * and against Maslow's max cutting envelope.
 */
export function checkBounds(
  lines: string[],
  material: Material,
  workOrigin: WorkOrigin,
  edgeClearance: number = 50
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

  // Compute safe cutting area = material minus edge clearance
  const ec = edgeClearance;
  let safeMinX: number, safeMaxX: number, safeMinY: number, safeMaxY: number;

  if (workOrigin === 'center') {
    safeMinX = -material.width / 2 + ec;
    safeMaxX = material.width / 2 - ec;
    safeMinY = -material.height / 2 + ec;
    safeMaxY = material.height / 2 - ec;
  } else if (workOrigin === 'bottom-left') {
    safeMinX = ec;
    safeMaxX = material.width - ec;
    safeMinY = ec;
    safeMaxY = material.height - ec;
  } else {
    safeMinX = ec;
    safeMaxX = material.width - ec;
    safeMinY = -material.height + ec;
    safeMaxY = -ec;
  }

  // Check against safe area (material minus edge clearance)
  if (minX < safeMinX - 0.5 || maxX > safeMaxX + 0.5 ||
      minY < safeMinY - 0.5 || maxY > safeMaxY + 0.5) {
    warnings.push(
      `Toolpath enters edge clearance zone (${ec}mm from edges). ` +
      `Safe area: X[${safeMinX.toFixed(0)}..${safeMaxX.toFixed(0)}] Y[${safeMinY.toFixed(0)}..${safeMaxY.toFixed(0)}]`
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
