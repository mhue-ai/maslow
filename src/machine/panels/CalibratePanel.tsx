import { useMachineStore } from '../../store/machineStore';
import { send } from '../../comms/maslowSocket';

const STEPS = [
  {
    title: '1. Retract All Belts',
    description: 'Pulls all 4 belts tight. Must be done before extending.',
    command: '$RET',
    buttonLabel: 'Retract All',
  },
  {
    title: '2. Extend All Belts',
    description:
      'Puts motors in extend mode. Go to each corner and manually pull the belts outward (~6cm). Use a rocking motion to initiate.',
    command: '$EXT',
    buttonLabel: 'Extend All',
  },
  {
    title: '3. Stop Extension',
    description: 'Once belts have slack, stop the extend mode. Clear any alarm with $X.',
    command: null,
    buttonLabel: null,
  },
  {
    title: '4. Find Anchor Locations',
    description:
      'Calibration routine — the machine learns where the corners are. This takes a few minutes. Do not move the sled during calibration.',
    command: null,
    buttonLabel: 'Start Calibration',
  },
];

export function CalibratePanel() {
  const connection = useMachineStore((s) => s.connection);
  const status = useMachineStore((s) => s.status);
  const minfo = useMachineStore((s) => s.minfo);
  const disabled = connection !== 'connected';

  return (
    <div>
      <h3>Calibration Wizard</h3>

      {minfo?.homed && (
        <div style={{
          padding: 8,
          background: 'rgba(68, 204, 68, 0.1)',
          border: '1px solid rgba(68, 204, 68, 0.3)',
          borderRadius: 4,
          fontSize: 12,
          color: '#44cc44',
          marginBottom: 12,
        }}>
          Machine is calibrated. XY movement is available.
        </div>
      )}

      {minfo?.calibrationInProgress && (
        <div style={{
          padding: 8,
          background: 'rgba(68, 136, 255, 0.1)',
          border: '1px solid rgba(68, 136, 255, 0.3)',
          borderRadius: 4,
          fontSize: 12,
          color: '#4488ff',
          marginBottom: 12,
        }}>
          Calibration in progress... Do not move the sled.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {STEPS.map((step, i) => (
          <div
            key={i}
            style={{
              padding: 12,
              border: '1px solid #2a2a4a',
              borderRadius: 6,
              background: '#12122a',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{step.title}</div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>{step.description}</div>

            {i === 0 && (
              <button
                className="btn btn-sm btn-primary"
                disabled={disabled}
                onClick={() => send('$RET')}
              >
                Retract All
              </button>
            )}

            {i === 1 && (
              <button
                className="btn btn-sm btn-primary"
                disabled={disabled}
                onClick={() => send('$EXT')}
              >
                Extend All
              </button>
            )}

            {i === 2 && (
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  className="btn btn-sm"
                  disabled={disabled}
                  onClick={() => send('\x18')}
                  style={{ background: '#4a2a1a', borderColor: '#8a4a2a' }}
                >
                  Stop
                </button>
                <button
                  className="btn btn-sm"
                  disabled={disabled}
                  onClick={() => send('$X')}
                >
                  Clear Alarm ($X)
                </button>
              </div>
            )}

            {i === 3 && (
              <button
                className="btn btn-sm btn-primary"
                disabled={disabled || minfo?.calibrationInProgress}
                onClick={() => {
                  // Find Anchor Locations is triggered via the web UI setup dialog.
                  // The firmware command may vary; $CAL or similar.
                  send('$CAL');
                }}
              >
                Start Calibration
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Current state indicator */}
      {status && (
        <div style={{ marginTop: 12, fontSize: 11, color: '#666' }}>
          Current state: {status.state}
        </div>
      )}
    </div>
  );
}
