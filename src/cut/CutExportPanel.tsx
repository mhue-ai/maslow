import { useState } from 'react';
import { useDesignStore } from '../store/designStore';
import { generateCutGcode } from '../gcode/cutToolpath';
import type { GenerationResult } from '../gcode/gcodeGenerator';
import { computeSvgTransform } from '../svg/svgScaler';
import { checkBounds, type BoundsResult } from '../gcode/boundsCheck';
import { downloadGcode } from '../gcode/gcodeWriter';
import { useUiStore } from '../store/uiStore';

/**
 * Export panel — Cut mode.
 *
 * Calls `generateCutGcode` (bit follows the line, no offset) and downloads
 * `maslow-cut.nc`. Mirrors the Outline/Full export panels for consistent UX.
 */
export function CutExportPanel() {
  const paths = useDesignStore((s) => s.paths);
  const cutShapeIds = useDesignStore((s) => s.cutShapeIds);
  const cutThrough = useDesignStore((s) => s.cutThrough);
  const cutDepth = useDesignStore((s) => s.cutDepth);
  const toolConfig = useDesignStore((s) => s.toolConfig);
  const isScore = useUiStore((s) => s.intent) === 'score';
  const material = useDesignStore((s) => s.material);
  const svgBounds = useDesignStore((s) => s.svgBounds);
  const svgTransformOverride = useDesignStore((s) => s.svgTransformOverride);
  const designCopies = useDesignStore((s) => s.designCopies);
  const setGcode = useDesignStore((s) => s.setGcode);

  const [result, setResult] = useState<GenerationResult | null>(null);
  const [bounds, setBounds] = useState<BoundsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasSelection = cutShapeIds.size > 0;

  if (paths.length === 0) {
    return (
      <div>
        <h3><span className="step">4</span> G-Code</h3>
        <p style={{ fontSize: 11, color: '#555' }}>Import SVG and select shapes to cut</p>
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
    if (!hasSelection) {
      setError('Select at least one shape to cut before generating.');
      return;
    }

    try {
      const transform = computeSvgTransform(
        svgBounds, material, toolConfig.workOrigin, svgTransformOverride, toolConfig.edgeClearance
      );

      // Score is always shallow (cutDepth). Cut Out tracks the material
      // thickness when "through" is on; otherwise the partial depth.
      // generateCutGcode auto-engages tabs once depth reaches thickness.
      const effectiveDepth = (!isScore && cutThrough) ? material.thickness : cutDepth;
      const gen = await generateCutGcode(
        paths, cutShapeIds, effectiveDepth, toolConfig, transform,
        material.thickness, designCopies
      );

      setResult(gen);
      setGcode(gen.lines.join('\n'));

      const boundsResult = checkBounds(gen.lines, material, toolConfig.workOrigin, toolConfig.edgeClearance);
      setBounds(boundsResult);
    } catch (err) {
      setError(`Generation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const isThrough = !isScore && cutThrough;

  return (
    <div>
      <h3><span className="step">4</span> G-Code</h3>

      {error && <div className="warning">{error}</div>}

      <button
        className="btn btn-primary"
        onClick={handleGenerate}
        disabled={!hasSelection}
        style={{ width: '100%', marginBottom: 8 }}
      >
        {isScore ? 'Generate Score G-Code' : 'Generate Cut G-Code'}
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
            {isScore
              ? 'Shallow surface lines along your paths — nothing is cut through.'
              : isThrough
                ? 'Through-cut — tabs hold each piece until you remove them by hand.'
                : 'Partial-depth cuts — leaves grooves at the chosen depth.'}
          </div>

          <button className="btn btn-primary" onClick={() => useUiStore.getState().setStage('preview')} style={{ width: '100%', marginTop: 8 }}>
            Preview →
          </button>
          <button className="btn" onClick={() => result && downloadGcode(result.lines, isScore ? 'maslow-score.nc' : 'maslow-cut.nc')} style={{ width: '100%', marginTop: 4 }}>
            Download .nc
          </button>
        </div>
      )}
    </div>
  );
}
