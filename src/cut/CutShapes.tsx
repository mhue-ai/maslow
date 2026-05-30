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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <h3 style={{ margin: '0 0 6px' }}>Shapes</h3>

      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        <button className="btn btn-sm" onClick={selectAll} style={{ flex: 1 }}>Select All</button>
        <button className="btn btn-sm" onClick={clearCutShapes} style={{ flex: 1 }}>Clear</button>
      </div>

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

    </div>
  );
}
