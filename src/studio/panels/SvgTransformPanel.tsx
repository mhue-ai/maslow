import { useDesignStore } from '../../store/designStore';
import { DEFAULT_SVG_TRANSFORM } from '../../types/design';

export function SvgTransformPanel() {
  const paths = useDesignStore((s) => s.paths);
  const t = useDesignStore((s) => s.svgTransformOverride);
  const setT = useDesignStore((s) => s.setSvgTransformOverride);

  if (paths.length === 0) return null;

  return (
    <div>
      <h3>SVG Transform</h3>

      <label>
        Offset X
        <input
          type="number"
          value={t.offsetX}
          step={1}
          onChange={(e) => setT({ offsetX: Number(e.target.value) })}
        />
        <span className="unit">mm</span>
      </label>

      <label>
        Offset Y
        <input
          type="number"
          value={t.offsetY}
          step={1}
          onChange={(e) => setT({ offsetY: Number(e.target.value) })}
        />
        <span className="unit">mm</span>
      </label>

      <label>
        Scale
        <input
          type="number"
          value={t.scale}
          min={0.1}
          max={10}
          step={0.05}
          onChange={(e) => setT({ scale: Number(e.target.value) })}
        />
        <span className="unit">x</span>
      </label>

      <label>
        Rotation
        <input
          type="number"
          value={t.rotation}
          min={-180}
          max={180}
          step={1}
          onChange={(e) => setT({ rotation: Number(e.target.value) })}
        />
        <span className="unit">deg</span>
      </label>

      <div style={{ display: 'flex', gap: 8, marginTop: 6, marginBottom: 6 }}>
        <label style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={t.mirrorX}
            onChange={(e) => setT({ mirrorX: e.target.checked })}
          />
          {' '}Mirror X
        </label>
        <label style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={t.mirrorY}
            onChange={(e) => setT({ mirrorY: e.target.checked })}
          />
          {' '}Mirror Y
        </label>
      </div>

      <button
        className="btn btn-sm"
        onClick={() => setT(DEFAULT_SVG_TRANSFORM)}
      >
        Reset Transform
      </button>
    </div>
  );
}
