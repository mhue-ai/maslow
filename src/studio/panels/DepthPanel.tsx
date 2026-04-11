import { useDesignStore } from '../../store/designStore';
import type { DepthType, CutStrategy } from '../../types/design';

const DEPTH_COLORS: Record<string, string> = {
  face: '#44cc44',
  relief: '#4488ff',
  through: '#ff4444',
  unassigned: '#888888',
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
  const selectedPathId = useDesignStore((s) => s.selectedPathId);
  const selectPath = useDesignStore((s) => s.selectPath);
  const material = useDesignStore((s) => s.material);

  if (paths.length === 0) {
    return (
      <div>
        <h3>Paths & Depth</h3>
        <p style={{ fontSize: 11, color: '#555' }}>Import an SVG to see paths</p>
      </div>
    );
  }

  const selected = paths.find((p) => p.data.id === selectedPathId);
  const selectedAssignment = selectedPathId ? depthAssignments.get(selectedPathId) : null;

  return (
    <div>
      <h3>Paths ({paths.length})</h3>

      <div className="path-list">
        {paths.map((path) => {
          const assignment = depthAssignments.get(path.data.id);
          const depthType = assignment?.type ?? 'unassigned';
          const color = DEPTH_COLORS[depthType];

          return (
            <div
              key={path.data.id}
              className={`path-item ${selectedPathId === path.data.id ? 'selected' : ''}`}
              onClick={() => selectPath(path.data.id)}
            >
              <div className="path-swatch" style={{ background: color }} />
              <span style={{ flex: 1 }}>{path.data.name}</span>
              <span style={{ fontSize: 10, color: '#666' }}>
                {assignment
                  ? `${DEPTH_LABELS[assignment.type]}${assignment.type !== 'face' ? ` · ${assignment.strategy === 'pocket' ? 'Pkt' : 'Out'}` : ''}`
                  : '—'}
              </span>
            </div>
          );
        })}
      </div>

      {selected && selectedPathId && (
        <div style={{ marginTop: 12 }}>
          <h3>Depth: {selected.data.name}</h3>

          <div className="depth-controls">
            {(['face', 'relief', 'through'] as DepthType[]).map((type) => (
              <button
                key={type}
                className={`btn btn-sm depth-btn ${selectedAssignment?.type === type ? 'active' : ''}`}
                onClick={() => setDepth(selectedPathId, type)}
              >
                {DEPTH_LABELS[type]}
              </button>
            ))}
          </div>

          {/* Cut strategy: pocket vs outline */}
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
                    title={strat === 'pocket'
                      ? 'Clear all material inside the path boundary'
                      : 'Cut along the path outline only'}
                  >
                    {strat === 'pocket' ? 'Pocket' : 'Outline'}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: 10, color: '#555', marginTop: 4 }}>
                {selectedAssignment.strategy === 'pocket'
                  ? 'Clears all material inside the shape'
                  : 'Traces the path boundary only'}
              </p>
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
                onChange={(e) =>
                  setDepth(selectedPathId, 'relief', Number(e.target.value))
                }
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

      {/* Bulk actions */}
      <div style={{ marginTop: 16 }}>
        <h3>Bulk Assign</h3>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className="btn btn-sm"
            onClick={() => paths.forEach((p) => setDepth(p.data.id, 'face'))}
          >
            All Face
          </button>
          <button
            className="btn btn-sm"
            onClick={() => paths.forEach((p) => setDepth(p.data.id, 'relief'))}
          >
            All Relief
          </button>
          <button
            className="btn btn-sm"
            onClick={() => paths.forEach((p) => setDepth(p.data.id, 'through'))}
          >
            All Through
          </button>
        </div>
      </div>
    </div>
  );
}
