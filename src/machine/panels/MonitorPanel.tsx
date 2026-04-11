import { useMachineStore } from '../../store/machineStore';

const STATE_COLORS: Record<string, string> = {
  Idle: '#44cc44',
  Home: '#44cc44',
  Run: '#4488ff',
  Jog: '#4488ff',
  Alarm: '#ff4444',
  Hold: '#f0a030',
  Extending: '#f0a030',
  Retracting: '#f0a030',
  Unknown: '#555',
};

export function MonitorPanel() {
  const status = useMachineStore((s) => s.status);
  const minfo = useMachineStore((s) => s.minfo);

  return (
    <div>
      <h3>Machine Status</h3>

      {!status ? (
        <p style={{ fontSize: 12, color: '#555' }}>No status — connect to machine</p>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div
              style={{
                padding: '4px 12px',
                borderRadius: 4,
                background: STATE_COLORS[status.state] ?? '#555',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {status.state}
            </div>
            {minfo && (
              <span style={{ fontSize: 11, color: minfo.homed ? '#44cc44' : '#ff4444' }}>
                {minfo.homed ? 'Calibrated' : 'Not calibrated'}
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr', gap: '4px 8px', fontSize: 13 }}>
            <span style={{ color: '#ff4444', fontWeight: 600 }}>X</span>
            <span>{status.position.x.toFixed(3)} mm</span>
            <span style={{ color: '#44cc44', fontWeight: 600 }}>Y</span>
            <span>{status.position.y.toFixed(3)} mm</span>
            <span style={{ color: '#4488ff', fontWeight: 600 }}>Z</span>
            <span>{status.position.z.toFixed(3)} mm</span>
          </div>

          <div style={{ marginTop: 8, fontSize: 11, color: '#666' }}>
            Feed: {status.feedRate} mm/min | Spindle: {status.spindleSpeed} RPM
          </div>
        </>
      )}

      {minfo && (
        <div style={{ marginTop: 12 }}>
          <h3>Belt Status</h3>
          <div style={{ fontSize: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            <span>TL: {minfo.tl.toFixed(3)}</span>
            <span>TR: {minfo.tr.toFixed(3)}</span>
            <span>BL: {minfo.bl.toFixed(3)}</span>
            <span>BR: {minfo.br.toFixed(3)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
