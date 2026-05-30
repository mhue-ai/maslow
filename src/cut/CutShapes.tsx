import { useDesignStore } from '../store/designStore';

/**
 * Shapes — Cut mode.
 *
 * Bit follows the line on every selected shape, at a single global depth,
 * with no kerf offset. The two parameters that matter — tool width
 * (bit diameter) and tool depth (cutDepth) — are surfaced inline at the
 * top so the user doesn't have to bounce to Tool Settings to tune them.
 */
export function CutShapes() {
  const paths = useDesignStore((s) => s.paths);
  const cutShapeIds = useDesignStore((s) => s.cutShapeIds);
  const setCutShape = useDesignStore((s) => s.setCutShape);
  const clearCutShapes = useDesignStore((s) => s.clearCutShapes);
  const cutDepth = useDesignStore((s) => s.cutDepth);
  const setCutDepth = useDesignStore((s) => s.setCutDepth);
  const toolConfig = useDesignStore((s) => s.toolConfig);
  const setToolConfig = useDesignStore((s) => s.setToolConfig);
  const material = useDesignStore((s) => s.material);
  const selectedPathId = useDesignStore((s) => s.selectedPathId);
  const selectPath = useDesignStore((s) => s.selectPath);

  if (paths.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <h3>Shapes</h3>
        <p style={{ fontSize: 11, color: '#555' }}>Import an SVG to see shapes</p>
      </div>
    );
  }

  const selectAll = () => { for (const p of paths) setCutShape(p.data.id, true); };
  const isThrough = cutDepth >= material.thickness - 0.1;
  const cutCount = paths.filter((p) => cutShapeIds.has(p.data.id)).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <h3 style={{ margin: '0 0 6px' }}>
        Shapes ({cutCount} / {paths.length} selected)
      </h3>

      {/*
        Tool width + tool depth — the two parameters Cut mode actually cares
        about. Surfaced inline at the top of the panel so the user can tune
        them right where they're picking which shapes to cut.
      */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6,
        padding: 6, marginBottom: 8, background: '#0f0f1e',
        border: '1px solid #2a2a4a', borderRadius: 4,
      }}>
        <label
          data-tip="How deep the bit cuts on each selected line. If this reaches material thickness, the cut goes all the way through and tabs auto-engage."
          style={{ margin: 0 }}
        >
          Tool depth
          <input
            type="number"
            value={cutDepth}
            min={0.5}
            max={Math.max(material.thickness, cutDepth)}
            step={0.5}
            onChange={(e) => setCutDepth(Number(e.target.value))}
          />
          <span className="unit">mm</span>
        </label>
        <label
          data-tip="Diameter of the router bit. The bit's centerline follows each line, so the bit diameter is the actual width of the resulting groove or slot."
          style={{ margin: 0 }}
        >
          Tool width
          <input
            type="number"
            value={toolConfig.bitDiameter}
            min={1}
            max={25}
            step={0.01}
            onChange={(e) => setToolConfig({ bitDiameter: Number(e.target.value) })}
          />
          <span className="unit">mm</span>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        <button className="btn btn-sm" onClick={selectAll} style={{ flex: 1 }}>Select All</button>
        <button className="btn btn-sm" onClick={clearCutShapes} style={{ flex: 1 }}>Clear</button>
      </div>

      <p style={{ fontSize: 10, color: '#666', marginTop: 0, marginBottom: 6 }}>
        Tick a shape to cut it. The bit centerline follows the line — the bit
        diameter is the resulting groove width. For an offset cut (kerf
        compensation around a part), use <strong style={{ color: '#88bbff' }}>Outline</strong> instead.
      </p>

      <div style={{
        flex: '1 1 0', minHeight: 0, overflow: 'auto', border: '1px solid #2a2a4a',
        borderRadius: 4, padding: 4, background: '#0a0a14',
      }}>
        {paths.map((p) => {
          const id = p.data.id;
          const isCut = cutShapeIds.has(id);
          const isSelected = id === selectedPathId;

          return (
            <div
              key={id}
              onClick={() => selectPath(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 6px', borderRadius: 3, cursor: 'pointer',
                background: isSelected ? '#1a2a4a' : 'transparent',
                marginBottom: 2,
                borderLeft: `3px solid ${isCut ? '#44cc44' : '#333'}`,
              }}
            >
              <input
                type="checkbox"
                checked={isCut}
                onChange={(e) => { e.stopPropagation(); setCutShape(id, e.target.checked); }}
                onClick={(e) => e.stopPropagation()}
                title="Cut this line"
              />
              <span
                style={{
                  flex: 1,
                  fontSize: 12,
                  color: isCut ? '#ccc' : '#666',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {p.data.name}
              </span>
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 10, color: '#666', marginTop: 6, marginBottom: 0 }}>
        All selected cut to <strong>{cutDepth} mm</strong>
        {isThrough && ' — through-cut with tabs'}
        {' · '}groove width <strong>{toolConfig.bitDiameter} mm</strong>.
      </p>
    </div>
  );
}
