import { useState, useEffect, useCallback } from 'react';
import {
  getJobHistory,
  deleteJobRecord,
  clearJobHistory,
  formatDuration,
  formatRelativeTime,
  type JobRecord,
  type JobOutcome,
} from '../../utils/jobHistory';

const OUTCOME_COLORS: Record<JobOutcome, string> = {
  completed: '#44cc44',
  aborted: '#ffaa44',
  error: '#ff4444',
  running: '#4488ff',
};

const OUTCOME_LABELS: Record<JobOutcome, string> = {
  completed: 'Completed',
  aborted: 'Aborted',
  error: 'Error',
  running: 'Running',
};

export function JobHistoryPanel() {
  const [records, setRecords] = useState<JobRecord[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);

  const refresh = useCallback(() => {
    setRecords(getJobHistory());
  }, []);

  useEffect(() => {
    refresh();
    // Refresh every 5 seconds to catch running job updates
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  const handleDelete = (id: string) => {
    deleteJobRecord(id);
    refresh();
  };

  const handleClearAll = () => {
    clearJobHistory();
    setConfirmClear(false);
    refresh();
  };

  // Summary stats
  const completed = records.filter((r) => r.outcome === 'completed').length;
  const totalCutTime = records
    .filter((r) => r.outcome === 'completed' && r.durationMs)
    .reduce((sum, r) => sum + (r.durationMs ?? 0), 0);

  return (
    <div>
      <h3>Job History</h3>

      {/* Summary */}
      {records.length > 0 && (
        <div style={{
          display: 'flex',
          gap: 12,
          padding: '8px 10px',
          background: '#0d0d1a',
          borderRadius: 4,
          marginBottom: 10,
          fontSize: 11,
        }}>
          <div>
            <div style={{ color: '#666', fontSize: 9, textTransform: 'uppercase' }}>Total Jobs</div>
            <div style={{ color: '#ccc' }}>{records.length}</div>
          </div>
          <div>
            <div style={{ color: '#666', fontSize: 9, textTransform: 'uppercase' }}>Completed</div>
            <div style={{ color: '#44cc44' }}>{completed}</div>
          </div>
          <div>
            <div style={{ color: '#666', fontSize: 9, textTransform: 'uppercase' }}>Total Cut Time</div>
            <div style={{ color: '#ccc' }}>{totalCutTime > 0 ? formatDuration(totalCutTime) : '—'}</div>
          </div>
        </div>
      )}

      {records.length === 0 ? (
        <p style={{ fontSize: 11, color: '#555', textAlign: 'center', padding: 24 }}>
          No jobs yet. Your cut history will appear here.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {records.map((r) => (
            <div key={r.id} style={{
              padding: '8px 10px',
              background: '#0d0d1a',
              border: `1px solid ${r.outcome === 'running' ? 'rgba(68,136,255,0.3)' : '#1a1a2a'}`,
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              {/* Outcome dot */}
              <div style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: OUTCOME_COLORS[r.outcome],
                flexShrink: 0,
                animation: r.outcome === 'running' ? 'pulse 1s ease-in-out infinite' : 'none',
              }} />

              {/* Filename + metadata */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12,
                  color: '#ddd',
                  fontFamily: 'monospace',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {r.filename}
                  {r.dryRun && (
                    <span style={{
                      marginLeft: 6,
                      fontSize: 8,
                      padding: '1px 4px',
                      background: '#332200',
                      color: '#ffaa44',
                      borderRadius: 2,
                      textTransform: 'uppercase',
                    }}>
                      Dry Run
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 9, color: '#666', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span>{formatRelativeTime(r.startTime)}</span>
                  <span>•</span>
                  <span>{r.lineCount.toLocaleString()} lines</span>
                  <span>•</span>
                  <span style={{ color: OUTCOME_COLORS[r.outcome] }}>{OUTCOME_LABELS[r.outcome]}</span>
                  {r.durationMs && (
                    <>
                      <span>•</span>
                      <span>{formatDuration(r.durationMs)}</span>
                    </>
                  )}
                </div>
                {r.errorMessage && (
                  <div style={{ fontSize: 9, color: '#ff6666', marginTop: 2 }}>
                    {r.errorMessage}
                  </div>
                )}
              </div>

              {/* Delete button */}
              {r.outcome !== 'running' && (
                <button
                  onClick={() => handleDelete(r.id)}
                  style={{
                    background: 'none',
                    border: '1px solid #333',
                    color: '#666',
                    fontSize: 10,
                    padding: '2px 6px',
                    borderRadius: 2,
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                  title="Delete record"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Clear all */}
      {records.length > 0 && (
        <div style={{ marginTop: 10, textAlign: 'right' }}>
          {confirmClear ? (
            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
              <button
                className="btn btn-sm"
                onClick={handleClearAll}
                style={{ background: '#4a1a1a', borderColor: '#8a2a2a', color: '#ff6666', fontSize: 10 }}
              >
                Confirm Clear All
              </button>
              <button
                className="btn btn-sm"
                onClick={() => setConfirmClear(false)}
                style={{ fontSize: 10 }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              className="btn btn-sm"
              onClick={() => setConfirmClear(true)}
              style={{ fontSize: 10, color: '#888' }}
            >
              Clear All History
            </button>
          )}
        </div>
      )}
    </div>
  );
}
