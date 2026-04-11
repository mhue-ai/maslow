/**
 * Calculate depth passes for multi-pass cutting.
 * Returns an array of Z depths (negative values) for each pass.
 * Example: totalDepth=10, depthPerPass=3 → [-3, -6, -9, -10]
 */
export function calculateDepthPasses(
  totalDepth: number,
  depthPerPass: number
): number[] {
  const passes: number[] = [];
  let currentDepth = 0;

  while (totalDepth - currentDepth > 0.01) {
    const cut = Math.min(depthPerPass, totalDepth - currentDepth);
    currentDepth += cut;
    passes.push(-currentDepth);
  }

  return passes;
}
