import type { MachineStatus, MachineState } from '../types/machine';

const KNOWN_STATES: Set<string> = new Set([
  'Idle', 'Alarm', 'Home', 'Run', 'Jog', 'Hold',
  'Extending', 'Retracting', 'Unknown', 'Door', 'Homing',
]);

/**
 * Parse Grbl-style status reports:
 * <Idle|MPos:0.000,0.000,-58.000,0.000,0.000|FS:0,0>
 */
export function parseStatusReport(msg: string): MachineStatus | null {
  const match = msg.match(/^<([^|]+)\|MPos:([^|]+)\|FS:([^>]+)>/);
  if (!match) return null;

  const rawState = match[1];
  const state: MachineState = KNOWN_STATES.has(rawState)
    ? (rawState as MachineState)
    : 'Unknown';

  const posParts = match[2].split(',').map(Number);
  const fsParts = match[3].split(',').map(Number);

  return {
    state,
    position: {
      x: posParts[0] ?? 0,
      y: posParts[1] ?? 0,
      z: posParts[2] ?? 0,
      a: posParts[3] ?? 0,
      b: posParts[4] ?? 0,
    },
    feedRate: fsParts[0] ?? 0,
    spindleSpeed: fsParts[1] ?? 0,
  };
}
