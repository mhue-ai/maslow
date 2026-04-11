export interface ToolpathPoint {
  x: number;
  y: number;
  z: number;
  type: 'rapid' | 'cut';
}

export interface ToolpathSegment {
  from: ToolpathPoint;
  to: ToolpathPoint;
  type: 'rapid' | 'cut';
}

/**
 * Parse G-code lines into toolpath segments for 3D visualization.
 * Tracks current position through G0/G1 moves.
 */
export function gcodeToSegments(lines: string[]): ToolpathSegment[] {
  const segments: ToolpathSegment[] = [];
  let cx = 0, cy = 0, cz = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('G0') && !trimmed.startsWith('G1')) continue;

    const isRapid = trimmed.startsWith('G0');
    const xMatch = trimmed.match(/X(-?[\d.]+)/);
    const yMatch = trimmed.match(/Y(-?[\d.]+)/);
    const zMatch = trimmed.match(/Z(-?[\d.]+)/);

    const nx = xMatch ? parseFloat(xMatch[1]) : cx;
    const ny = yMatch ? parseFloat(yMatch[1]) : cy;
    const nz = zMatch ? parseFloat(zMatch[1]) : cz;

    // Only add segment if position actually changed
    if (nx !== cx || ny !== cy || nz !== cz) {
      segments.push({
        from: { x: cx, y: cy, z: cz, type: isRapid ? 'rapid' : 'cut' },
        to: { x: nx, y: ny, z: nz, type: isRapid ? 'rapid' : 'cut' },
        type: isRapid ? 'rapid' : 'cut',
      });
    }

    cx = nx;
    cy = ny;
    cz = nz;
  }

  return segments;
}
