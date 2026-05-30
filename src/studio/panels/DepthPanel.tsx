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
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <h3>Shapes</h3>
        <p style={{ fontSize: 11, color: '#555' }}>Import an SVG to see shapes</p>
      </div>
    );
  }

  const pathMap = new Map(paths.map((p) => [p.data.id, p]));

  // Include ring shapes (virtual gap regions) — insert BEFORE the profile cut
  const ringIds = Array.from(shapeLevels.keys()).filter((id) => id.startsWith('ring-'));

  const baseOrder = operationOrder.length > 0
    ? operationOrder.filter((id) => !id.startsWith('ring-'))
    : paths.map((p) => p.data.id);

  // Insert rings before the profile cut (which must always be last)
  const profileIdx = baseOrder.indexOf(profileCutId ?? '');
  const orderedIds = profileIdx >= 0
    ? [...baseOrder.slice(0, profileIdx), ...ringIds, ...baseOrder.slice(profileIdx)]
    : [...baseOrder, ...ringIds];

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
  const selectedName = selectedPathId
    ? (pathMap.get(selectedPathId)?.data.name ?? (selectedPathId.startsWith('ring-') ? 'Border Ring' : 'Shape'))
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── Selected shape controls — FIXED at top ── */}
      {selectedPathId && (
        <div style={{ flexShrink: 0, paddingBottom: 8, borderBottom: '1px solid #2a2a4a', marginBottom: 8 }}>
          <h3 style={{ margin: '0 0 6px' }}>{selectedName}</h3>

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
            <button className="btn btn-sm" onClick={() => setShapeLevel(selectedPathId, 0)}>Face</button>
            <button className="btn btn-sm" onClick={() => setShapeLevel(selectedPathId, thickness / 2)}>Half</button>
            <button className="btn btn-sm" onClick={() => setShapeLevel(selectedPathId, thickness)}>Through</button>
          </div>
        </div>
      )}

      {/* ── Shapes list — SCROLLABLE ── */}
      <div style={{ flexShrink: 0, marginBottom: 4 }}>
        <h3 style={{ margin: '0 0 4px' }}>Shapes</h3>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
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
                <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ flex: 1, fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {isProfile ? '✂ ' : ''}{isRing ? '◇ ' : ''}{shapeName}
                  </span>
                  <span style={{ fontSize: 9, color: '#888', flexShrink: 0 }}>{info.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
