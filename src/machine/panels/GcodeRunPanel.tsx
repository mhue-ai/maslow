import { useDesignStore } from '../../store/designStore';
import { useMachineStore } from '../../store/machineStore';
import { send } from '../../comms/maslowSocket';

export function GcodeRunPanel() {
  const gcode = useDesignStore((s) => s.gcode);
  const connection = useMachineStore((s) => s.connection);
  const status = useMachineStore((s) => s.status);
  const jobLines = useMachineStore((s) => s.jobLines);
  const jobCurrentLine = useMachineStore((s) => s.jobCurrentLine);
  const jobStartTime = useMachineStore((s) => s.jobStartTime);
  const jobRunning = useMachineStore((s) => s.jobRunning);
  const setJob = useMachineStore((s) => s.setJob);
  const clearJob = useMachineStore((s) => s.clearJob);

  const disabled = connection !== 'connected';

  const handleSendGcode = () => {
    if (!gcode) return;
    const lines = gcode.split('\n').filter((l) => l.trim() && !l.startsWith(';'));
    setJob(lines);
    // Start streaming — send first line
    if (lines.length > 0) send(lines[0]);
  };

  // Progress calculations
  const total = jobLines.length;
  const current = jobCurrentLine;
  const progress = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  const elapsed = jobStartTime ? Math.round((Date.now() - jobStartTime) / 1000) : 0;
  const rate = elapsed > 0 ? current / elapsed : 0;
  const remaining = rate > 0 ? Math.round((total - current) / rate) : 0;

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div>
      <h3>G-Code Control</h3>

      {!gcode ? (
        <p style={{ fontSize: 12, color: '#555' }}>
          Generate G-code in the Design Studio first.
        </p>
      ) : (
        <div>
          <p style={{ fontSize: 12, color: '#aaa', marginBottom: 8 }}>
            G-code ready ({gcode.split('\n').length} lines)
          </p>

          <button
            className="btn btn-primary"
            disabled={disabled || jobRunning}
            onClick={handleSendGcode}
            style={{ width: '100%', marginBottom: 8 }}
          >
            {jobRunning ? 'Running...' : 'Send to Machine'}
          </button>
        </div>
      )}

      {/* Job progress */}
      {total > 0 && (
        <div style={{ marginTop: 8, marginBottom: 8 }}>
          <div style={{
            height: 8,
            background: '#1a1a2e',
            borderRadius: 4,
            overflow: 'hidden',
            marginBottom: 4,
          }}>
            <div style={{
              height: '100%',
              width: `${progress}%`,
              background: jobRunning ? '#4488ff' : '#44cc44',
              transition: 'width 0.3s',
              borderRadius: 4,
            }} />
          </div>
          <div style={{ fontSize: 11, color: '#888', display: 'flex', justifyContent: 'space-between' }}>
            <span>Line {current}/{total} ({progress}%)</span>
            <span>{formatTime(elapsed)}{remaining > 0 ? ` / ~${formatTime(elapsed + remaining)}` : ''}</span>
          </div>
          {!jobRunning && current >= total && (
            <div style={{ fontSize: 12, color: '#44cc44', marginTop: 4 }}>
              Job complete
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
        <button
          className="btn btn-sm"
          disabled={disabled || status?.state !== 'Run'}
          onClick={() => send('!')}
          style={{ flex: 1 }}
        >
          Pause
        </button>
        <button
          className="btn btn-sm"
          disabled={disabled || status?.state !== 'Hold'}
          onClick={() => send('~')}
          style={{ flex: 1 }}
        >
          Resume
        </button>
        <button
          className="btn btn-sm"
          disabled={disabled}
          onClick={() => { send('\x18'); clearJob(); }}
          style={{ flex: 1, background: '#4a1a1a', borderColor: '#8a2a2a' }}
        >
          Stop
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        <h3>Set Zero</h3>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn-sm" disabled={disabled} onClick={() => send('G92 Z0')}>
            Zero Z
          </button>
          <button className="btn btn-sm" disabled={disabled} onClick={() => send('G92 X0 Y0')}>
            Zero XY
          </button>
          <button className="btn btn-sm" disabled={disabled} onClick={() => send('G92 X0 Y0 Z0')}>
            Zero All
          </button>
        </div>
      </div>
    </div>
  );
}
