import { useState } from 'react';
import { useDesignStore } from '../store/designStore';
import { generateOutlineGcode } from '../gcode/outlineToolpath';
import type { GenerationResult } from '../gcode/gcodeGenerator';
import { computeSvgTransform } from '../svg/svgScaler';
import { checkBounds, type BoundsResult } from '../gcode/boundsCheck';
import { downloadGcode } from '../gcode/gcodeWriter';

/**
 * Export panel — Outline mode.
 *
 * Calls `generateOutlineGcode` (outlines only, no fill) instead of the Full
 * mode's `generateGcode`. The Full export panel is unchanged.
 */
export function OutlineExportPanel() {
  const paths = useDesignStore((s) => s.paths);
  const outlineReliefIds = useDesignStore((s) => s.outlineReliefIds);
  const outlineReliefDepth = useDesignStore((s) => s.outlineReliefDepth);
  const toolConfig = useDesignStore((s) => s.toolConfig);
  const material = useDesignStore((s) => s.material);
  const svgBounds = useDesignStore((s) => s.svgBounds);
  const svgTransformOverride = useDesignStore((s) => s.svgTransformOverride);
  const designCopies = useDesignStore((s) => s.designCopies);
  const profileCutId = useDesignStore((s) => s.profileCutId);
  const setGcode = useDesignStore((s) => s.setGcode);

  const [result, setResult] = useState<GenerationResult | null>(null);
  const [bounds, setBounds] = useState<BoundsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasReliefs = outlineReliefIds.size > 0;
  const hasProfile = !!profileCutId;
  const hasAnyCut = hasReliefs || hasProfile;

  if (paths.length === 0) {
    return (
      <div>
        <h3><span className="step">4</span> G-Code</h3>
        <p style={{ fontSize: 11, color: '#555' }}>Import SVG and mark relief shapes first</p>
      </div>
    );
  }

  const handleGenerate = async () => {
    setError(null);
    setBounds(null);

    if (!svgBounds) {
      setError('No SVG bounds available');
      return;
    }
    if (!hasAnyCut) {
      setError('Mark at least one shape as Relieve, or pick an outer profile, before generating.');
      return;
    }
    if (outlineReliefDepth >= material.thickness) {
      setError(`Relief depth (${outlineReliefDepth}mm) must be less than material thickness (${material.thickness}mm).`);
      return;
    }

    try {
      const transform = computeSvgTransform(
        svgBounds, material, toolConfig.workOrigin, svgTransformOverride, toolConfig.edgeClearance
      );

      const gen = await generateOutlineGcode(
        paths, outlineReliefIds, outlineReliefDepth, toolConfig, transform,
        material.thickness, profileCutId, designCopies
      );

      setResult(gen);
      setGcode(gen.lines.join('\n'));

      const boundsResult = checkBounds(gen.lines, material, toolConfig.workOrigin, toolConfig.edgeClearance);
      setBounds(boundsResult);
    } catch (err) {
      setError(`Generation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div>
      <h3><span className="step">4</span> G-Code</h3>

      {error && <div className="warning">{error}</div>}

      <button
        className="btn btn-primary"
        onClick={handleGenerate}
        disabled={!hasAnyCut}
        style={{ width: '100%', marginBottom: 8 }}
      >
        Generate Outline G-Code
      </button>

      {bounds && !bounds.inBounds && (
        <div className="warning" style={{ background: 'rgba(255, 50, 50, 0.15)', borderColor: 'rgba(255, 50, 50, 0.4)', color: '#ff6666' }}>
          {bounds.warnings.map((w, i) => (
            <div key={i} style={{ marginBottom: 4 }}>{w}</div>
          ))}
        </div>
      )}

      {bounds && bounds.inBounds && result && (
        <div style={{ fontSize: 11, color: '#44cc44', marginBottom: 4 }}>
          Bounds OK: {bounds.maxX - bounds.minX > 0 ? `${(bounds.maxX - bounds.minX).toFixed(0)}x${(bounds.maxY - bounds.minY).toFixed(0)}mm` : '—'}
        </div>
      )}

      {result && (
        <div style={{ fontSize: 12, color: '#aaa' }}>
          <div>{result.stats.lineCount} lines</div>
          <div>{result.stats.operationCount} operations</div>
          <div>~{result.stats.estimatedTimeMin} min estimated</div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>
            Outlines only — clear the waste between cuts by hand before the profile release.
          </div>

          <button className="btn" onClick={() => result && downloadGcode(result.lines, 'maslow-outline.nc')} style={{ width: '100%', marginTop: 8 }}>
            Download .nc
          </button>
        </div>
      )}
    </div>
  );
}
