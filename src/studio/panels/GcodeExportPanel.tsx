import { useState } from 'react';
import { useDesignStore } from '../../store/designStore';
import { generateGcode, type GenerationResult } from '../../gcode/gcodeGenerator';
import { computeSvgTransform } from '../../svg/svgScaler';
import { downloadGcode } from '../../gcode/gcodeWriter';

export function GcodeExportPanel() {
  const paths = useDesignStore((s) => s.paths);
  const depthAssignments = useDesignStore((s) => s.depthAssignments);
  const toolConfig = useDesignStore((s) => s.toolConfig);
  const material = useDesignStore((s) => s.material);
  const svgBounds = useDesignStore((s) => s.svgBounds);
  const setGcode = useDesignStore((s) => s.setGcode);

  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasAssignments = Array.from(depthAssignments.values()).some(
    (a) => a.type !== 'face'
  );

  if (paths.length === 0) {
    return (
      <div>
        <h3>G-Code Export</h3>
        <p style={{ fontSize: 11, color: '#555' }}>Import SVG and assign depths first</p>
      </div>
    );
  }

  const handleGenerate = () => {
    setError(null);

    if (!svgBounds) {
      setError('No SVG bounds available');
      return;
    }

    if (!hasAssignments) {
      setError('No depth assignments. Assign relief or through-cut to at least one path.');
      return;
    }

    try {
      const transform = computeSvgTransform(
        { ...svgBounds, minX: 0, minY: 0 },
        material
      );

      const gen = generateGcode(
        paths,
        depthAssignments,
        toolConfig,
        transform,
        material.thickness
      );

      setResult(gen);
      setGcode(gen.lines.join('\n'));
    } catch (err) {
      setError(`Generation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDownload = () => {
    if (!result) return;
    downloadGcode(result.lines, 'maslow-cut.nc');
  };

  return (
    <div>
      <h3>G-Code Export</h3>

      {error && <div className="warning">{error}</div>}

      <button
        className="btn btn-primary"
        onClick={handleGenerate}
        disabled={!hasAssignments}
        style={{ width: '100%', marginBottom: 8 }}
      >
        Generate G-Code
      </button>

      {result && (
        <div style={{ fontSize: 12, color: '#aaa' }}>
          <div>{result.stats.lineCount} lines</div>
          <div>{result.stats.operationCount} operations</div>
          <div>~{result.stats.estimatedTimeMin} min estimated</div>

          <button
            className="btn"
            onClick={handleDownload}
            style={{ width: '100%', marginTop: 8 }}
          >
            Download .nc
          </button>
        </div>
      )}
    </div>
  );
}
