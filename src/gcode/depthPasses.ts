/**
 * Calculate depth passes for multi-pass cutting.
 * Returns an array of Z depths (negative values) for each pass.
 */
export function calculateDepthPasses(
  totalDepth: number,
  depthPerPass: number
): number[] {
  const passes: number[] = [];
  let remaining = totalDepth;

  while (remaining > 0.01) {
    const cut = Math.min(depthPerPass, remaining);
    const z = totalDepth - remaining + cut;
    passes.push(-z);
    remaining -= cut;
  }

  return passes;
}
