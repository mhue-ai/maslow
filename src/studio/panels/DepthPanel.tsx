import { useDesignStore } from '../../store/designStore';

export function DepthPanel() {
  const paths = useDesignStore((s) => s.paths);
  const shapeLevels = useDesignStore((s) => s.shapeLevels);
  const setShapeLevel = useDesignStore((s) => s.setShapeLevel);
  const selectedPathId = useDesignStore((s) => s.selectedPathId);
  const selectPath = useDesignStore((s) => s.selectPath);
  const material = useDesignStore((s) => s.material);
  const operationOrder = useDesignStore((s) => s.operationOrder);
  const moveOperation = useDesignStore((s) => s.moveOperation);
  const profileCutId = useDesignStore((s) => s.profileCutId);

  if (paths.length === 0) {
    return (
      <div>
        <h3>Shapes</h3>
        <p style={{ fontSize: 11, color: '#555' }}>Import an SVG to see shapes</p>
      </div>
    );
  }

  const pathMap = new Map(paths.map((p) => [p.data.id, p]));

  // Include ring shapes (virtual gap regions) that have been clicked/assigned
  const ringIds = Array.from(shapeLevels.keys()).filter((id) => id.startsWith('ring-'));

  const orderedIds = operationOrder.length > 0
    ? [...operationOrder.filter((id) => !id.startsWith('ring-')), ...ringIds]
    : [...paths.map((p) => p.data.id), ...ringIds];

  const thickness = material.thickness;

  // Get display info for a shape
  const getInfo = (id: string) => {
    const level = shapeLevels.get(id)?.level ?? 0;
    const isProfile = id === profileCutId;
    let label: string;
    let color: string;

    if (isProfile) {
      label = `${thickness}mm (profile)`;
      color = '#ff8800';
    } else if (level <= 0) {
      label = 'face';
      color = '#44cc44';
    } else if (level >= thickness) {
      label = `${thickness}mm (through)`;
      color = '#ff4444';
    } else {
      label = `${level}mm`;
      color = `rgb(${68 - level * 2}, ${100 - level * 3}, ${200 - level * 5})`;
    }
    return { level, label, color };
  };

  const selectedLevel = selectedPathId ? (shapeLevels.get(selectedPathId)?.level ?? 0) : 0;

  return (
    <div>
      <h3 data-tip="Each shape has a depth level. 0mm = face (no cut). Higher = deeper pocket. Click shapes in the design to set depth.">Shapes ({paths.length})</h3>

      <p style={{ fontSize: 10, color: '#555', marginBottom: 6 }}>
        Click = deepen 2mm. Shift+click = reset.
      </p>

      <div className="path-list">
        {orderedIds.map((id, idx) => {
          const path = pathMap.get(id);
          const isRing = id.startsWith('ring-');
          const shapeName = path?.data.name ?? (isRing ? `Border Ring ${id.replace('ring-', '')}` : id);
          const info = getInfo(id);
          const isSelected = selectedPathId === id;
          const isProfile = id === profileCutId;

          return (
            <div
              key={id}
              className={`path-item ${isSelected ? 'selected' : ''}`}
              onClick={() => selectPath(id)}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginRight: 4 }}>
                <button
                  className="btn btn-sm"
                  style={{ padding: '0 3px', fontSize: 8, lineHeight: 1 }}
                  onClick={(e) => { e.stopPropagation(); moveOperation(id, 'up'); }}
                  disabled={idx === 0}
                >^</button>
                <button
                  className="btn btn-sm"
                  style={{ padding: '0 3px', fontSize: 8, lineHeight: 1 }}
                  onClick={(e) => { e.stopPropagation(); moveOperation(id, 'down'); }}
                  disabled={idx === orderedIds.length - 1}
                >v</button>
              </div>
              <div className="path-swatch" style={{
                background: info.color,
                border: isProfile ? '1px solid #ffaa44' : 'none',
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {isProfile ? '✂ ' : ''}{isRing ? '◇ ' : ''}{shapeName}
                </div>
                <div style={{ fontSize: 9, color: '#888' }}>
                  {info.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected shape controls */}
      {selectedPathId && (
        <div style={{ marginTop: 12 }}>
          <h3>{pathMap.get(selectedPathId)?.data.name ?? (selectedPathId.startsWith('ring-') ? `Border Ring` : 'Shape')}</h3>

          <label>
            Level
            <input
              type="number"
              value={selectedLevel}
              min={0}
              max={thickness}
              step={1}
              onChange={(e) => setShapeLevel(selectedPathId, Number(e.target.value))}
            />
            <span className="unit">mm</span>
          </label>

          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            <button className="btn btn-sm" onClick={() => setShapeLevel(selectedPathId, 0)}>
              Face (0)
            </button>
            <button className="btn btn-sm" onClick={() => setShapeLevel(selectedPathId, thickness / 2)}>
              Half
            </button>
            <button className="btn btn-sm" onClick={() => setShapeLevel(selectedPathId, thickness)}>
              Through
            </button>
          </div>

          <p style={{ fontSize: 10, color: '#555', marginTop: 6 }}>
            {selectedLevel <= 0 && 'No cut — stays at material surface'}
            {selectedLevel > 0 && selectedLevel < thickness && `Pocket ${selectedLevel}mm deep, cut inside boundary`}
            {selectedLevel >= thickness && (selectedPathId === profileCutId
              ? 'Profile cut — releases workpiece, cut outside'
              : 'Through-cut — cut inside boundary')}
          </p>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <h3>Quick Set</h3>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn-sm" onClick={() => paths.forEach((p) => { if (p.data.id !== profileCutId) setShapeLevel(p.data.id, 0); })}>
            All Face
          </button>
          <button className="btn btn-sm" onClick={() => paths.forEach((p) => { if (p.data.id !== profileCutId) setShapeLevel(p.data.id, 6); })}>
            All 6mm
          </button>
        </div>
      </div>
    </div>
  );
}
