import { useState, useMemo } from 'react';
import { useMachineStore } from '../../store/machineStore';
import { send } from '../../comms/maslowSocket';
import { loadBeltSnapshot } from '../../comms/maslowSocket';

interface Step {
  id: string;
  title: string;
  description: string;
  action?: 'command' | 'manual' | 'z-controls' | 'jog';
  command?: string;
  buttonLabel?: string;
  warning?: string;
}

const STEPS: Step[] = [
  {
    id: 'unlock',
    title: 'Unlock Machine',
    description: 'Clear the startup alarm so the machine accepts commands.',
    action: 'command',
    command: '$X',
    buttonLabel: 'Clear Alarm ($X)',
  },
  {
    id: 'z-init',
    title: 'Initialize Z-Axis',
    description: 'Lower Z fully until it bottoms out, then set the Z stop. This must be done before belt calibration so belt length measurements are accurate.',
    action: 'z-controls',
    warning: 'Remove any router bit before lowering Z.',
  },
  {
    id: 'retract',
    title: 'Retract All Belts',
    description: 'Winds all 4 belts fully onto their spools. This resets belt length tracking to zero — the most critical step for accuracy.',
    action: 'command',
    command: '$RET',
    buttonLabel: 'Retract All',
    warning: 'Detach belts from anchors first if they are currently attached.',
  },
  {
    id: 'extend',
    title: 'Extend All Belts',
    description: 'Extends belts outward to the configured distance. Use a rocking motion on the sled if belts need help feeding out.',
    action: 'command',
    command: '$EXT',
    buttonLabel: 'Extend All',
  },
  {
    id: 'attach',
    title: 'Attach Belts to Anchors',
    description: 'Fold each belt end in half, press into the belt end piece, secure with bolts, and attach to the corresponding anchor point (TL→TL, TR→TR, BL→BL, BR→BR). Position the sled roughly in the center of the work area.',
    action: 'manual',
  },
  {
    id: 'tension',
    title: 'Apply Tension',
    description: 'Retracts each belt slightly to take up slack. All 4 belts become taut, holding the sled in position.',
    action: 'command',
    command: '$RET',
    buttonLabel: 'Apply Tension',
  },
  {
    id: 'calibrate',
    title: 'Find Anchor Locations',
    description: 'The machine moves through a grid of measurement points, measuring belt lengths at each position. Your browser runs the optimization algorithm to compute precise anchor coordinates.',
    action: 'command',
    command: '$CAL',
    buttonLabel: 'Start Calibration',
    warning: 'Keep this browser tab open — calibration math runs in your browser. Do not move the sled or disconnect during calibration.',
  },
  {
    id: 'z-zero',
    title: 'Set Work Zero',
    description: 'Install your router bit, lower Z until it touches the material surface, then set Z=0. Jog XY to your desired cut origin and set XY home.',
    action: 'z-controls',
  },
  {
    id: 'verify',
    title: 'Verify',
    description: 'Jog the sled to various positions across the work surface. Check for smooth movement, accurate return to home, and no belt slack.',
    action: 'jog',
  },
];

export function CalibratePanel() {
  const connection = useMachineStore((s) => s.connection);
  const status = useMachineStore((s) => s.status);
  const minfo = useMachineStore((s) => s.minfo);
  const disabled = connection !== 'connected';
  const [activeStep, setActiveStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  const markDone = (idx: number) => {
    setCompletedSteps((prev) => new Set(prev).add(idx));
    if (idx === activeStep && idx < STEPS.length - 1) {
      setActiveStep(idx + 1);
    }
  };

  const sendAndMark = (cmd: string, idx: number) => {
    send(cmd);
    markDone(idx);
  };

  // ── Recovery detection ──
  const snapshot = useMemo(() => loadBeltSnapshot(), []);
  const [showRecovery, setShowRecovery] = useState(true);

  const MAX_SAFE_DRIFT = 11; // mm — 1/4 encoder revolution

  const recovery = useMemo(() => {
    if (!snapshot || !minfo || !connection) return null;

    const age = Date.now() - snapshot.timestamp;
    const ageMin = Math.round(age / 60000);
    const ageStr = ageMin < 60 ? `${ageMin}m ago` : `${Math.round(ageMin / 60)}h ago`;

    // Compare snapshot vs live MINFO
    const deltas = {
      tl: Math.abs(snapshot.tl - minfo.tl),
      tr: Math.abs(snapshot.tr - minfo.tr),
      bl: Math.abs(snapshot.bl - minfo.bl),
      br: Math.abs(snapshot.br - minfo.br),
    };
    const maxDelta = Math.max(deltas.tl, deltas.tr, deltas.bl, deltas.br);
    const allSmall = maxDelta < MAX_SAFE_DRIFT;
    const snapshotHasBelts = snapshot.tl > 0 || snapshot.tr > 0 || snapshot.bl > 0 || snapshot.br > 0;

    // Firmware auto-recovered?
    const fwRecovered = minfo.homed && snapshotHasBelts;

    return { snapshot, ageStr, deltas, maxDelta, allSmall, fwRecovered, snapshotHasBelts };
  }, [snapshot, minfo, connection]);

  // Only show recovery card if machine appears freshly booted and we have a snapshot
  const shouldShowRecovery = showRecovery && recovery && recovery.snapshotHasBelts && connection === 'connected';

  return (
    <div>
      <h3>Calibration Wizard</h3>

      {/* ── Recovery Card ── */}
      {shouldShowRecovery && recovery && (
        <div style={{
          padding: 10, marginBottom: 12, borderRadius: 6,
          background: recovery.fwRecovered ? 'rgba(68,204,68,0.08)' : 'rgba(255,170,68,0.08)',
          border: `1px solid ${recovery.fwRecovered ? 'rgba(68,204,68,0.3)' : 'rgba(255,170,68,0.3)'}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: recovery.fwRecovered ? '#44cc44' : '#ffaa44' }}>
              {recovery.fwRecovered ? '✓ Position Recovered' : '⚠ Position Recovery Available'}
            </div>
            <div style={{ fontSize: 9, color: '#666' }}>Snapshot: {recovery.ageStr}</div>
          </div>

          {recovery.fwRecovered ? (
            <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
              Firmware auto-recovered belt positions on startup. Encoder angles matched within tolerance.
            </div>
          ) : (
            <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
              Last known belt positions saved. Firmware could not auto-recover — belts may have moved more than 11mm while powered off.
            </div>
          )}

          {/* Comparison table */}
          <div style={{ fontFamily: 'monospace', fontSize: 10, marginBottom: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '40px 80px 80px 60px', gap: 2, color: '#666' }}>
              <span>Belt</span><span>Snapshot</span><span>Live</span><span>Drift</span>
            </div>
            {(['tl', 'tr', 'bl', 'br'] as const).map((belt) => {
              const delta = recovery.deltas[belt];
              const safe = delta < MAX_SAFE_DRIFT;
              return (
                <div key={belt} style={{ display: 'grid', gridTemplateColumns: '40px 80px 80px 60px', gap: 2 }}>
                  <span style={{ color: '#888', textTransform: 'uppercase' }}>{belt}</span>
                  <span style={{ color: '#aaa' }}>{recovery.snapshot[belt].toFixed(1)}</span>
                  <span style={{ color: '#aaa' }}>{minfo?.[belt]?.toFixed(1) ?? '?'}</span>
                  <span style={{ color: safe ? '#44cc44' : '#ff4444' }}>
                    {delta.toFixed(1)}mm {safe ? '✓' : '⚠'}
                  </span>
                </div>
              );
            })}
          </div>

          {recovery.maxDelta >= MAX_SAFE_DRIFT && (
            <div style={{
              fontSize: 10, color: '#ff6666', padding: '4px 8px', borderRadius: 3,
              background: '#220000', border: '1px solid #440000', marginBottom: 8,
            }}>
              ⚠ Belt drift exceeds {MAX_SAFE_DRIFT}mm — positions may be inaccurate. Full re-init recommended.
            </div>
          )}

          <div style={{ display: 'flex', gap: 4 }}>
            {recovery.fwRecovered && recovery.allSmall && (
              <button className="btn btn-sm" onClick={() => { setShowRecovery(false); setActiveStep(8); setCompletedSteps(new Set([0,1,2,3,4,5,6,7])); }}
                style={{ background: '#1a3a1a', border: '1px solid #2a5a2a', color: '#44cc44' }}>
                Skip to Verify
              </button>
            )}
            <button className="btn btn-sm" onClick={() => setShowRecovery(false)}>
              Full Re-Init
            </button>
          </div>
        </div>
      )}

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
          Machine is calibrated and homed.
        </div>
      )}

      {/* Progress bar */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 12 }}>
        {STEPS.map((_, i) => (
          <div
            key={i}
            onClick={() => setActiveStep(i)}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              cursor: 'pointer',
              background: completedSteps.has(i)
                ? '#44cc44'
                : i === activeStep
                ? '#4488ff'
                : '#2a2a4a',
            }}
          />
        ))}
      </div>

      {/* Step counter */}
      <div style={{ fontSize: 10, color: '#666', marginBottom: 8 }}>
        Step {activeStep + 1} of {STEPS.length} — {completedSteps.size} completed
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {STEPS.map((step, i) => {
          const isActive = i === activeStep;
          const isDone = completedSteps.has(i);

          return (
            <div
              key={step.id}
              onClick={() => setActiveStep(i)}
              style={{
                padding: isActive ? 12 : '8px 12px',
                border: `1px solid ${isActive ? '#4488ff' : isDone ? '#2a4a2a' : '#2a2a4a'}`,
                borderRadius: 6,
                background: isActive ? '#12122a' : isDone ? '#0a1a0a' : '#0d0d1a',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: isDone ? '#44cc44' : isActive ? '#4488ff' : '#333',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {isDone ? '✓' : i + 1}
                </div>
                <div style={{ fontSize: 12, fontWeight: isActive ? 600 : 400, color: isActive ? '#ddd' : '#888' }}>
                  {step.title}
                </div>
              </div>

              {/* Expanded content */}
              {isActive && (
                <div style={{ marginTop: 8, marginLeft: 28 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
                    {step.description}
                  </div>

                  {step.warning && (
                    <div style={{
                      fontSize: 10,
                      color: '#ffaa44',
                      background: '#221800',
                      padding: '4px 8px',
                      borderRadius: 3,
                      marginBottom: 8,
                      border: '1px solid #443300',
                    }}>
                      ⚠ {step.warning}
                    </div>
                  )}

                  {/* Command action */}
                  {step.action === 'command' && step.command && (
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={disabled}
                        onClick={() => sendAndMark(step.command!, i)}
                      >
                        {step.buttonLabel}
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={() => markDone(i)}
                        style={{ fontSize: 10, color: '#666' }}
                      >
                        Skip
                      </button>
                    </div>
                  )}

                  {/* Manual action */}
                  {step.action === 'manual' && (
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => markDone(i)}
                    >
                      Done — Belts Attached
                    </button>
                  )}

                  {/* Z-axis controls */}
                  {step.action === 'z-controls' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          className="btn btn-sm"
                          disabled={disabled}
                          onClick={() => send('$J=Z10F200')}
                        >
                          Z Up 10
                        </button>
                        <button
                          className="btn btn-sm"
                          disabled={disabled}
                          onClick={() => send('$J=Z1F100')}
                        >
                          Z Up 1
                        </button>
                        <button
                          className="btn btn-sm"
                          disabled={disabled}
                          onClick={() => send('$J=Z-1F100')}
                        >
                          Z Down 1
                        </button>
                        <button
                          className="btn btn-sm"
                          disabled={disabled}
                          onClick={() => send('$J=Z-10F200')}
                        >
                          Z Down 10
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          className="btn btn-sm"
                          disabled={disabled}
                          onClick={() => { send('G10 L20 P1 Z0'); }}
                          style={{ background: '#1a2a1a', border: '1px solid #2a4a2a', color: '#44cc44' }}
                        >
                          Set Z = 0 Here
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={() => markDone(i)}
                          style={{ fontSize: 10, color: '#666' }}
                        >
                          Done
                        </button>
                      </div>
                      {status && (
                        <div style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>
                          Z: {status.position.z.toFixed(3)} mm
                        </div>
                      )}
                    </div>
                  )}

                  {/* Jog controls */}
                  {step.action === 'jog' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button className="btn btn-sm" disabled={disabled} onClick={() => send('$J=X-50F500')}>← X-50</button>
                        <button className="btn btn-sm" disabled={disabled} onClick={() => send('$J=X50F500')}>X+50 →</button>
                        <button className="btn btn-sm" disabled={disabled} onClick={() => send('$J=Y50F500')}>↑ Y+50</button>
                        <button className="btn btn-sm" disabled={disabled} onClick={() => send('$J=Y-50F500')}>Y-50 ↓</button>
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          className="btn btn-sm"
                          disabled={disabled}
                          onClick={() => send('G0 X0 Y0')}
                          style={{ background: '#1a2a1a', border: '1px solid #2a4a2a', color: '#44cc44' }}
                        >
                          Go Home
                        </button>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => markDone(i)}
                        >
                          Calibration Complete
                        </button>
                      </div>
                      {status && (
                        <div style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>
                          X: {status.position.x.toFixed(1)}  Y: {status.position.y.toFixed(1)}  Z: {status.position.z.toFixed(1)} mm
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Current state */}
      {status && (
        <div style={{ marginTop: 12, fontSize: 10, color: '#555', display: 'flex', gap: 12 }}>
          <span>State: <span style={{ color: status.state === 'Idle' ? '#44cc44' : status.state === 'Alarm' ? '#ff4444' : '#ffaa44' }}>{status.state}</span></span>
          <span>Z: {status.position.z.toFixed(1)}mm</span>
          <span>Feed: {status.feedRate}</span>
        </div>
      )}
    </div>
  );
}
