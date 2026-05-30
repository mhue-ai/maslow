import type { MachineStatus, MachineState } from '../types/machine';

const KNOWN_STATES: Set<string> = new Set([
  'Idle', 'Alarm', 'Home', 'Run', 'Jog', 'Hold',
  'Extending', 'Retracting', 'Unknown', 'Door', 'Homing',
]);

/**
 * Parse Grbl-style status reports. Handles various formats:
 * <Idle|MPos:0.000,0.000,0.000,0.000,0.000|FS:0,0>
 * <Idle|MPos:0.000,0.000,0.000|FS:0,0|Ov:100,100,100>
 * <Idle|MPos:0.000,0.000,0.000|FS:0,0|WCO:0.000,0.000,0.000>
 * <Idle|MPos:0.000,0.000,0.000>  (no FS field)
 */
export function parseStatusReport(msg: string): MachineStatus | null {
  if (!msg.startsWith('<') || !msg.endsWith('>')) return null;

  // Strip < and >
  const inner = msg.slice(1, -1);
  const parts = inner.split('|');

  if (parts.length < 2) return null;

  // First part is state
  const rawState = parts[0];
  const state: MachineState = KNOWN_STATES.has(rawState)
    ? (rawState as MachineState)
    : 'Unknown';

  // Find MPos field
  let x = 0, y = 0, z = 0, a = 0, b = 0;
  let feedRate = 0, spindleSpeed = 0;

  // Coerce a parsed value, but treat a NON-FINITE result (garbled field) as a
  // parse failure rather than silently substituting 0. A spurious (0,0,0)
  // position would feed the Z-safe/bounds preflight and the belt-snapshot
  // auto-save with bogus data. `num('')` for an absent trailing axis is fine
  // (those default to 0); only a present-but-unparseable value is fatal.
  let corrupt = false;
  const num = (s: string | undefined): number => {
    if (s === undefined || s === '') return 0; // absent optional axis
    const n = Number(s);
    if (!Number.isFinite(n)) { corrupt = true; return 0; }
    return n;
  };

  for (const part of parts) {
    if (part.startsWith('MPos:')) {
      const vals = part.slice(5).split(',');
      x = num(vals[0]);
      y = num(vals[1]);
      z = num(vals[2]);
      a = num(vals[3]);
      b = num(vals[4]);
    } else if (part.startsWith('FS:')) {
      const vals = part.slice(3).split(',');
      feedRate = num(vals[0]);
      spindleSpeed = num(vals[1]);
    } else if (part.startsWith('F:')) {
      feedRate = num(part.slice(2));
    }
  }

  // A corrupted numeric field means the report is unreliable — drop it so the
  // caller keeps the last known-good status instead of trusting garbage.
  if (corrupt) return null;

  return {
    state,
    position: { x, y, z, a, b },
    feedRate,
    spindleSpeed,
  };
}
