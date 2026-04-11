import { useDesignStore } from '../../store/designStore';
import { useMachineStore } from '../../store/machineStore';
import { send } from '../../comms/maslowSocket';

export function GcodeRunPanel() {
  const gcode = useDesignStore((s) => s.gcode);
  const connection = useMachineStore((s) => s.connection);
  const status = useMachineStore((s) => s.status);
  const disabled = connection !== 'connected';

  const handleSendGcode = () => {
    if (!gcode) return;

    // Send G-code line by line
    const lines = gcode.split('\n').filter((l) => l.trim() && !l.startsWith(';'));
    for (const line of lines) {
      send(line);
    }
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
            disabled={disabled}
            onClick={handleSendGcode}
            style={{ width: '100%', marginBottom: 8 }}
          >
            Send to Machine
          </button>
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
          onClick={() => send('\x18')}
          style={{ flex: 1, background: '#4a1a1a', borderColor: '#8a2a2a' }}
        >
          Stop
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        <h3>Set Zero</h3>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className="btn btn-sm"
            disabled={disabled}
            onClick={() => send('G92 Z0')}
          >
            Zero Z
          </button>
          <button
            className="btn btn-sm"
            disabled={disabled}
            onClick={() => send('G92 X0 Y0')}
          >
            Zero XY
          </button>
          <button
            className="btn btn-sm"
            disabled={disabled}
            onClick={() => send('G92 X0 Y0 Z0')}
          >
            Zero All
          </button>
        </div>
      </div>
    </div>
  );
}
