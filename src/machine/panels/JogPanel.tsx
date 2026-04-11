import { useState } from 'react';
import { send } from '../../comms/maslowSocket';
import { useMachineStore } from '../../store/machineStore';

const STEP_SIZES = [0.1, 1, 2, 5, 10, 50, 100];
const XY_FEED = 1000;
const Z_FEED = 300;

export function JogPanel() {
  const [step, setStep] = useState(10);
  const connection = useMachineStore((s) => s.connection);
  const disabled = connection !== 'connected';

  const jog = (axis: string, distance: number) => {
    const feed = axis === 'Z' ? Z_FEED : XY_FEED;
    send(`$J=G91 ${axis}${distance} F${feed}`);
  };

  const btnStyle = (disabled: boolean): React.CSSProperties => ({
    width: 48,
    height: 48,
    fontSize: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid #333',
    borderRadius: 4,
    background: disabled ? '#1a1a2e' : '#1e1e3a',
    color: disabled ? '#444' : '#ccc',
    cursor: disabled ? 'default' : 'pointer',
  });

  return (
    <div>
      <h3>Jog Controls</h3>

      {/* Step size selector */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: '#666', marginBottom: 4, display: 'block' }}>
          Step: {step} mm
        </label>
        <div style={{ display: 'flex', gap: 2 }}>
          {STEP_SIZES.map((s) => (
            <button
              key={s}
              className={`btn btn-sm ${step === s ? 'depth-btn active' : ''}`}
              onClick={() => setStep(s)}
              style={{ flex: 1, fontSize: 10 }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* XY pad */}
      <div style={{ display: 'grid', gridTemplateColumns: '48px 48px 48px', gap: 4, justifyContent: 'center', marginBottom: 12 }}>
        <div />
        <button style={btnStyle(disabled)} disabled={disabled} onClick={() => jog('Y', step)}>
          Y+
        </button>
        <div />
        <button style={btnStyle(disabled)} disabled={disabled} onClick={() => jog('X', -step)}>
          X-
        </button>
        <div style={{
          ...btnStyle(true),
          background: '#0d0d1a',
          border: '1px solid #222',
          fontSize: 10,
          color: '#444',
        }}>
          XY
        </div>
        <button style={btnStyle(disabled)} disabled={disabled} onClick={() => jog('X', step)}>
          X+
        </button>
        <div />
        <button style={btnStyle(disabled)} disabled={disabled} onClick={() => jog('Y', -step)}>
          Y-
        </button>
        <div />
      </div>

      {/* Z controls */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button
          style={{ ...btnStyle(disabled), width: 64, background: disabled ? '#1a1a2e' : '#1a2a4a' }}
          disabled={disabled}
          onClick={() => jog('Z', step)}
        >
          Z+
        </button>
        <button
          style={{ ...btnStyle(disabled), width: 64, background: disabled ? '#1a1a2e' : '#1a2a4a' }}
          disabled={disabled}
          onClick={() => jog('Z', -step)}
        >
          Z-
        </button>
      </div>
    </div>
  );
}
