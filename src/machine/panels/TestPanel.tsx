import { useMachineStore } from '../../store/machineStore';
import { send } from '../../comms/maslowSocket';

export function TestPanel() {
  const connection = useMachineStore((s) => s.connection);
  const minfo = useMachineStore((s) => s.minfo);
  const disabled = connection !== 'connected';

  return (
    <div>
      <h3>Diagnostics</h3>

      <p style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
        Run diagnostics to test I2C communication and motor/encoder on all 4 corners.
      </p>

      <button
        className="btn btn-primary"
        disabled={disabled}
        onClick={() => send('$TEST')}
        style={{ width: '100%', marginBottom: 12 }}
      >
        Run Test
      </button>

      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        <button className="btn btn-sm" disabled={disabled} onClick={() => send('$X')}>
          Clear Alarm
        </button>
        <button className="btn btn-sm" disabled={disabled} onClick={() => send('MINFO')}>
          Refresh Info
        </button>
      </div>

      {minfo && (
        <div>
          <h3>Machine Info</h3>
          <div style={{
            fontFamily: 'monospace',
            fontSize: 11,
            background: '#0a0a14',
            border: '1px solid #222',
            borderRadius: 4,
            padding: 8,
            lineHeight: 1.6,
          }}>
            <div>Homed: <span style={{ color: minfo.homed ? '#44cc44' : '#ff4444' }}>{String(minfo.homed)}</span></div>
            <div>Calibrating: {String(minfo.calibrationInProgress)}</div>
            <div style={{ marginTop: 4 }}>Belt lengths:</div>
            <div>&nbsp; TL: {minfo.tl.toFixed(3)} | TR: {minfo.tr.toFixed(3)}</div>
            <div>&nbsp; BL: {minfo.bl.toFixed(3)} | BR: {minfo.br.toFixed(3)}</div>
            <div style={{ marginTop: 4 }}>Extended:</div>
            <div>&nbsp; eTL: {minfo.etl.toFixed(3)} | eTR: {minfo.etr.toFixed(3)}</div>
            <div>&nbsp; eBL: {minfo.ebl.toFixed(3)} | eBR: {minfo.ebr.toFixed(3)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
