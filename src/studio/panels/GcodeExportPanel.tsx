import { useState } from 'react';
import { useDesignStore } from '../../store/designStore';
import { generateGcode, type GenerationResult } from '../../gcode/gcodeGenerator';
import { computeSvgTransform } from '../../svg/svgScaler';
import { checkBounds, type BoundsResult } from '../../gcode/boundsCheck';
import { checkSledClearance, type SledClearanceResult } from '../../gcode/sledClearanceCheck';
import { downloadGcode } from '../../gcode/gcodeWriter';

export function GcodeExportPanel() {
  const paths = useDesignStore((s) => s.paths);
  const shapeLevels = useDesignStore((s) => s.shapeLevels);
  const toolConfig = useDesignStore((s) => s.toolConfig);
  const material = useDesignStore((s) => s.material);
  const svgBounds = useDesignStore((s) => s.svgBounds);
  const svgTransformOverride = useDesignStore((s) => s.svgTransformOverride);
  const operationOrder = useDesignStore((s) => s.operationOrder);
  const designCopies = useDesignStore((s) => s.designCopies);
  const profileCutId = useDesignStore((s) => s.profileCutId);
  const setGcode = useDesignStore((s) => s.setGcode);

  const [result, setResult] = useState<GenerationResult | null>(null);
  const [bounds, setBounds] = useState<BoundsResult | null>(null);
  const [sledCheck, setSledCheck] = useState<SledClearanceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasCuts = Array.from(shapeLevels.values()).some((s) => s.level > 0);

  if (paths.length === 0) {
    return (
      <div>
        <h3><span className="step">4</span> G-Code</h3>
        <p style={{ fontSize: 11, color: '#555' }}>Import SVG and set shape levels first</p>
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

    if (!hasCuts) {
      setError('No shapes have depth set. Click shapes to deepen them.');
      return;
    }

    try {
      const transform = computeSvgTransform(
        svgBounds, material, toolConfig.workOrigin, svgTransformOverride, toolConfig.edgeClearance
      );

      const gen = await generateGcode(
        paths, shapeLevels, toolConfig, transform,
        material.thickness, operationOrder, profileCutId, designCopies
      );

      setResult(gen);
      setGcode(gen.lines.join('\n'));

      const boundsResult = checkBounds(gen.lines, material, toolConfig.workOrigin, toolConfig.edgeClearance);
      setBounds(boundsResult);

      // Sled-clearance analysis (Maslow-specific)
      const sled = checkSledClearance(paths, shapeLevels, transform, material, profileCutId);
      setSledCheck(sled);
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
        disabled={!hasCuts}
        style={{ width: '100%', marginBottom: 8 }}
      >
        Generate G-Code
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

      {sledCheck && sledCheck.warnings.length > 0 && (
        <div style={{ marginTop: 6, marginBottom: 8, fontSize: 10 }}>
          <div style={{ color: '#aaa', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
            Sled Support Check
          </div>
          {sledCheck.warnings.map((w, i) => {
            const colors = {
              error:   { bg: 'rgba(255,68,68,0.1)', bd: 'rgba(255,68,68,0.3)', fg: '#ff8888' },
              warning: { bg: 'rgba(255,170,68,0.1)', bd: 'rgba(255,170,68,0.3)', fg: '#ffaa44' },
              info:    { bg: 'rgba(136,170,204,0.08)', bd: 'rgba(136,170,204,0.2)', fg: '#88aacc' },
            };
            const c = colors[w.level];
            const icon = w.level === 'error' ? '✗' : w.level === 'warning' ? '⚠' : 'ℹ';
            return (
              <div key={i} style={{
                background: c.bg, border: `1px solid ${c.bd}`, color: c.fg,
                padding: '4px 8px', borderRadius: 3, marginBottom: 3,
              }}>
                <div style={{ fontWeight: 600 }}>{icon} {w.shapeName}</div>
                <div style={{ fontSize: 9, color: '#999' }}>{w.message}</div>
              </div>
            );
          })}
        </div>
      )}

      {sledCheck && sledCheck.warnings.length === 0 && result && (
        <div style={{ fontSize: 10, color: '#44aa44', marginBottom: 4 }}>
          ✓ Sled support OK — all cuts within sled-bridge limits
        </div>
      )}

      {result && (
        <div style={{ fontSize: 12, color: '#aaa' }}>
          <div>{result.stats.lineCount} lines</div>
          <div>{result.stats.operationCount} operations</div>
          <div>~{result.stats.estimatedTimeMin} min estimated</div>

          <button className="btn" onClick={() => result && downloadGcode(result.lines, 'maslow-cut.nc')} style={{ width: '100%', marginTop: 8 }}>
            Download .nc
          </button>
        </div>
      )}
    </div>
  );
}
