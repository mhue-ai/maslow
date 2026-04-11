import { useDesignStore } from '../../store/designStore';
import { DEFAULT_SVG_TRANSFORM } from '../../types/design';

export function SvgTransformPanel() {
  const paths = useDesignStore((s) => s.paths);
  const material = useDesignStore((s) => s.material);
  const t = useDesignStore((s) => s.svgTransformOverride);
  const setT = useDesignStore((s) => s.setSvgTransformOverride);
  const designCopies = useDesignStore((s) => s.designCopies);
  const addDesignCopy = useDesignStore((s) => s.addDesignCopy);
  const removeDesignCopy = useDesignStore((s) => s.removeDesignCopy);
  const updateDesignCopy = useDesignStore((s) => s.updateDesignCopy);
  const clearDesignCopies = useDesignStore((s) => s.clearDesignCopies);
  const svgBounds = useDesignStore((s) => s.svgBounds);

  if (paths.length === 0) return null;

  // Estimate design size for smart copy placement
  const designWidth = svgBounds ? svgBounds.width * t.scale : material.width;
  const designHeight = svgBounds ? svgBounds.height * t.scale : material.height;

  const handleDuplicateRight = () => {
    const lastCopy = designCopies.length > 0
      ? designCopies[designCopies.length - 1]
      : { offsetX: 0, offsetY: 0 };
    addDesignCopy(lastCopy.offsetX + designWidth + 10, lastCopy.offsetY);
  };

  const handleDuplicateBelow = () => {
    const lastCopy = designCopies.length > 0
      ? designCopies[designCopies.length - 1]
      : { offsetX: 0, offsetY: 0 };
    addDesignCopy(lastCopy.offsetX, lastCopy.offsetY - designHeight - 10);
  };

  return (
    <div>
      <h3>Position & Transform</h3>

      <p style={{ fontSize: 10, color: '#555', marginBottom: 6 }}>
        Arrow keys: nudge 1mm (Shift: 10mm). Click material to place.
      </p>

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

      <button className="btn btn-sm" onClick={() => setT(DEFAULT_SVG_TRANSFORM)}>
        Reset Transform
      </button>

      {/* Design copies / tiling */}
      <h3 style={{ marginTop: 12 }}>Copies ({1 + designCopies.length} total)</h3>

      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        <button className="btn btn-sm" onClick={handleDuplicateRight} style={{ flex: 1 }}>
          Copy Right
        </button>
        <button className="btn btn-sm" onClick={handleDuplicateBelow} style={{ flex: 1 }}>
          Copy Below
        </button>
      </div>

      {designCopies.length > 0 && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 120, overflowY: 'auto' }}>
            {designCopies.map((copy, i) => (
              <div key={copy.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                <span style={{ color: '#666', width: 30 }}>#{i + 2}</span>
                <input
                  type="number"
                  value={copy.offsetX}
                  step={1}
                  style={{ width: 50, padding: '2px 4px', fontSize: 11, border: '1px solid #333', borderRadius: 3, background: '#0d0d1a', color: '#ddd' }}
                  onChange={(e) => updateDesignCopy(copy.id, Number(e.target.value), copy.offsetY)}
                />
                <input
                  type="number"
                  value={copy.offsetY}
                  step={1}
                  style={{ width: 50, padding: '2px 4px', fontSize: 11, border: '1px solid #333', borderRadius: 3, background: '#0d0d1a', color: '#ddd' }}
                  onChange={(e) => updateDesignCopy(copy.id, copy.offsetX, Number(e.target.value))}
                />
                <button
                  className="btn btn-sm"
                  style={{ padding: '1px 6px', fontSize: 10 }}
                  onClick={() => removeDesignCopy(copy.id)}
                >
                  x
                </button>
              </div>
            ))}
          </div>
          <button className="btn btn-sm" onClick={clearDesignCopies} style={{ marginTop: 4 }}>
            Remove All Copies
          </button>
        </>
      )}
    </div>
  );
}
