export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export type MachineState =
  | 'Idle'
  | 'Alarm'
  | 'Home'
  | 'Run'
  | 'Jog'
  | 'Hold'
  | 'Extending'
  | 'Retracting'
  | 'Unknown';

export interface Position {
  x: number;
  y: number;
  z: number;
  a: number;
  b: number;
}

export interface MachineStatus {
  state: MachineState;
  position: Position;
  feedRate: number;
  spindleSpeed: number;
}

export interface MInfo {
  homed: boolean;
  calibrationInProgress: boolean;
  tl: number;  // belt length top-left
  tr: number;  // top-right
  bl: number;  // bottom-left
  br: number;  // bottom-right
  etl: number; // extended top-left
  etr: number;
  ebl: number;
  ebr: number;
}

export interface ConsoleMessage {
  timestamp: number;
  text: string;
  type: 'info' | 'error' | 'status' | 'response';
}
