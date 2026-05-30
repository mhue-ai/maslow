/**
 * Calculate depth passes for multi-pass cutting.
 * Returns an array of Z depths (negative values) for each pass.
 * Example: totalDepth=10, depthPerPass=3 → [-3, -6, -9, -10]
 *
 * If startDepth > 0, skips depths already cleared by a shallower enclosing pocket.
 * Example: totalDepth=10, depthPerPass=3, startDepth=3 → [-6, -9, -10]
 * This is the core of Z-level (waterline) machining — don't re-cut air.
 */
export function calculateDepthPasses(
  totalDepth: number,
  depthPerPass: number,
  startDepth: number = 0,
): number[] {
  const passes: number[] = [];
  let currentDepth = Math.max(0, startDepth);

  while (totalDepth - currentDepth > 0.01) {
    const cut = Math.min(depthPerPass, totalDepth - currentDepth);
    currentDepth += cut;
    passes.push(-currentDepth);
  }

  return passes;
}
