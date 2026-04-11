import { useDesignStore } from '../../store/designStore';
import type { DepthType, CutStrategy, ProfileOffset } from '../../types/design';

const DEPTH_COLORS: Record<string, string> = {
  face: '#44cc44',
  relief: '#4488ff',
  through: '#ff4444',
};

const DEPTH_LABELS: Record<DepthType, string> = {
  face: 'Face',
  relief: 'Relief',
  through: 'Through',
};

export function DepthPanel() {
  const paths = useDesignStore((s) => s.paths);
  const depthAssignments = useDesignStore((s) => s.depthAssignments);
  const setDepth = useDesignStore((s) => s.setDepth);
  const setStrategy = useDesignStore((s) => s.setStrategy);
  const setProfileOffset = useDesignStore((s) => s.setProfileOffset);
  const selectedPathId = useDesignStore((s) => s.selectedPathId);
  const selectPath = useDesignStore((s) => s.selectPath);
  const material = useDesignStore((s) => s.material);
  const operationOrder = useDesignStore((s) => s.operationOrder);
  const moveOperation = useDesignStore((s) => s.moveOperation);

  if (paths.length === 0) {
    return (
      <div>
        <h3>Paths & Depth</h3>
        <p style={{ fontSize: 11, color: '#555' }}>Import an SVG to see paths</p>
      </div>
    );
  }

  const pathMap = new Map(paths.map((p) => [p.data.id, p]));
  const orderedIds = operationOrder.length > 0
    ? operationOrder
    : paths.map((p) => p.data.id);

  const selected = paths.find((p) => p.data.id === selectedPathId);
  const selectedAssignment = selectedPathId ? depthAssignments.get(selectedPathId) : null;

  // Helper: get display info for a path
  const getPathInfo = (id: string) => {
    const a = depthAssignments.get(id);
    const type = a?.type ?? 'face';
    const depth = a?.depth ?? 0;
    const label = DEPTH_LABELS[type];
    const depthStr = type === 'face' ? '' : type === 'through' ? `${material.thickness}mm` : `${depth}mm`;
    return { type, label, depthStr, color: DEPTH_COLORS[type] };
  };

  return (
    <div>
      <h3>Cut Order ({paths.length} paths)</h3>

      <p style={{ fontSize: 10, color: '#555', marginBottom: 6 }}>
        Click shape = pocket. Shift+click = through.
      </p>

      <div className="path-list">
        {orderedIds.map((id, idx) => {
          const path = pathMap.get(id);
          if (!path) return null;
          const info = getPathInfo(id);
          const isSelected = selectedPathId === id;

          return (
            <div
              key={id}
              className={`path-item ${isSelected ? 'selected' : ''}`}
              onClick={() => selectPath(id)}
              onMouseEnter={() => selectPath(id)}
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
              <div className="path-swatch" style={{ background: info.color }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {path.data.name}
                </div>
                <div style={{ fontSize: 9, color: '#666' }}>
                  {info.label}{info.depthStr ? ` — ${info.depthStr}` : ''}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Profile Cut (release cut) */}
      <div style={{ marginTop: 12 }}>
        <h3>Profile Cut</h3>
        <p style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>
          Final outline cut that releases the work from the sheet. Always cut last.
        </p>
        {(() => {
          // Check if any path is assigned as through-cut with outline strategy
          const profilePaths = orderedIds.filter((id) => {
            const a = depthAssignments.get(id);
            return a?.type === 'through' && a?.strategy === 'outline';
          });
          if (profilePaths.length > 0) {
            return (
              <div style={{ fontSize: 11, color: '#44cc44' }}>
                {profilePaths.length} profile cut(s) assigned
              </div>
            );
          }
          return (
            <div style={{ fontSize: 11, color: '#888' }}>
              Select a border path and set it to Through + Outline to create the profile cut
            </div>
          );
        })()}
      </div>

      {/* Selected path detail controls */}
      {selected && selectedPathId && (
        <div style={{ marginTop: 12 }}>
          <h3>{selected.data.name}</h3>

          <div className="depth-controls">
            {(['face', 'relief', 'through'] as DepthType[]).map((type) => (
              <button
                key={type}
                className={`btn btn-sm depth-btn ${(selectedAssignment?.type ?? 'face') === type ? 'active' : ''}`}
                onClick={() => setDepth(selectedPathId, type)}
              >
                {DEPTH_LABELS[type]}
              </button>
            ))}
          </div>

          {selectedAssignment && selectedAssignment.type !== 'face' && (
            <div style={{ marginTop: 8 }}>
              <label style={{ fontSize: 11, color: '#666', marginBottom: 4, display: 'block' }}>
                Cut approach
              </label>
              <div className="depth-controls">
                {(['pocket', 'outline'] as CutStrategy[]).map((strat) => (
                  <button
                    key={strat}
                    className={`btn btn-sm depth-btn ${selectedAssignment.strategy === strat ? 'active' : ''}`}
                    onClick={() => setStrategy(selectedPathId, strat)}
                  >
                    {strat === 'pocket' ? 'Pocket' : 'Outline'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedAssignment && selectedAssignment.type !== 'face' && selectedAssignment.strategy === 'outline' && (
            <div style={{ marginTop: 8 }}>
              <label style={{ fontSize: 11, color: '#666', marginBottom: 4, display: 'block' }}>
                Bit offset
              </label>
              <div className="depth-controls">
                {(['inside', 'none', 'outside'] as ProfileOffset[]).map((off) => (
                  <button
                    key={off}
                    className={`btn btn-sm depth-btn ${selectedAssignment.profileOffset === off ? 'active' : ''}`}
                    onClick={() => setProfileOffset(selectedPathId, off)}
                  >
                    {off === 'inside' ? 'Inside' : off === 'outside' ? 'Outside' : 'On Line'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedAssignment?.type === 'relief' && (
            <label style={{ marginTop: 8 }}>
              Depth
              <input
                type="number"
                value={selectedAssignment.depth}
                min={0.5}
                max={material.thickness}
                step={0.5}
                onChange={(e) => setDepth(selectedPathId, 'relief', Number(e.target.value))}
              />
              <span className="unit">mm</span>
            </label>
          )}

          {selectedAssignment?.type === 'through' && (
            <p style={{ fontSize: 11, color: '#555', marginTop: 4 }}>
              Full depth: {material.thickness} mm
            </p>
          )}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <h3>Bulk Assign</h3>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn-sm" onClick={() => paths.forEach((p) => setDepth(p.data.id, 'face'))}>All Face</button>
          <button className="btn btn-sm" onClick={() => paths.forEach((p) => setDepth(p.data.id, 'relief'))}>All Relief</button>
          <button className="btn btn-sm" onClick={() => paths.forEach((p) => setDepth(p.data.id, 'through'))}>All Through</button>
        </div>
      </div>
    </div>
  );
}
