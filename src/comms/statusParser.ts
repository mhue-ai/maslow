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

  for (const part of parts) {
    if (part.startsWith('MPos:')) {
      const vals = part.slice(5).split(',').map(Number);
      x = vals[0] || 0;
      y = vals[1] || 0;
      z = vals[2] || 0;
      a = vals[3] || 0;
      b = vals[4] || 0;
    } else if (part.startsWith('FS:')) {
      const vals = part.slice(3).split(',').map(Number);
      feedRate = vals[0] || 0;
      spindleSpeed = vals[1] || 0;
    } else if (part.startsWith('F:')) {
      feedRate = Number(part.slice(2)) || 0;
    }
  }

  return {
    state,
    position: { x, y, z, a, b },
    feedRate,
    spindleSpeed,
  };
}
