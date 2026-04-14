import { useMachineStore } from '../store/machineStore';
import { parseStatusReport } from './statusParser';
import { parseMInfo } from './minfoParser';

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let statusPollTimer: ReturnType<typeof setInterval> | null = null;
let lastResponseTime = 0;
let healthCheckTimer: ReturnType<typeof setInterval> | null = null;

// Buffer-stuffing: track how many bytes are in the GRBL serial buffer
const GRBL_BUFFER_SIZE = 127; // GRBL RX buffer is 128 bytes, keep 1 byte margin
let bufferUsed = 0;
let pendingLineLengths: number[] = []; // track byte length of each sent line

export function connect(url: string): void {
  const store = useMachineStore.getState();

  // Prevent duplicate connections
  if (ws) {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      return;
    }
    // Clean up dead socket
    cleanup();
  }

  store.setConnection('connecting');

  try {
    ws = new WebSocket(url);
    store.addConsoleMessage({ timestamp: Date.now(), text: `Connecting to ${url}...`, type: 'info' });
  } catch (err) {
    store.setConnection('error');
    store.addConsoleMessage({ timestamp: Date.now(), text: `Failed to create WebSocket: ${err}`, type: 'error' });
    return;
  }

  ws.onopen = () => {
    store.setConnection('connected');
    store.addConsoleMessage({ timestamp: Date.now(), text: `Connected to ${url}`, type: 'info' });
    lastResponseTime = Date.now();
    bufferUsed = 0;
    pendingLineLengths = [];

    // Status polling — slower during jobs to avoid competing with G-code
    statusPollTimer = setInterval(() => {
      // ? is a realtime command in GRBL — doesn't use the serial buffer
      send('?');
    }, 1000);

    // Health check — if no response in 10 seconds, force reconnect
    healthCheckTimer = setInterval(() => {
      if (Date.now() - lastResponseTime > 10000) {
        store.addConsoleMessage({
          timestamp: Date.now(),
          text: 'Connection health check failed — reconnecting',
          type: 'error',
        });
        forceReconnect();
      }
    }, 5000);

    // Request initial machine info
    send('MINFO');
  };

  ws.onmessage = async (event) => {
    lastResponseTime = Date.now();

    // ESP3D sends data as Blob or string — handle both
    let data: string;
    if (event.data instanceof Blob) {
      data = await event.data.text();
    } else {
      data = String(event.data);
    }

    const lines = data.split('\n').filter((l) => l.trim());
    for (const line of lines) {
      handleMessage(line.trim());
    }
  };

  ws.onerror = () => {
    const store = useMachineStore.getState();
    store.addConsoleMessage({
      timestamp: Date.now(),
      text: 'WebSocket error',
      type: 'error',
    });
    // Force close so onclose fires and triggers reconnect
    if (ws && ws.readyState !== WebSocket.CLOSED) {
      ws.close();
    }
  };

  ws.onclose = (event) => {
    const store = useMachineStore.getState();
    store.setConnection('disconnected');
    cleanup();

    store.addConsoleMessage({
      timestamp: Date.now(),
      text: `Disconnected (code: ${event.code})`,
      type: 'info',
    });

    // Auto-reconnect after 3 seconds
    reconnectTimer = setTimeout(() => {
      const currentStore = useMachineStore.getState();
      if (currentStore.connection === 'disconnected') {
        connect(currentStore.url);
      }
    }, 3000);
  };
}

export function disconnect(): void {
  // Cancel any pending reconnect
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  cleanup();

  if (ws) {
    ws.onclose = null; // Prevent auto-reconnect
    ws.onerror = null;
    ws.close();
    ws = null;
  }

  useMachineStore.getState().setConnection('disconnected');
}

export function send(command: string): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(command + '\n');
  }
}

/** Start streaming a job — call after setJob() to begin buffer-stuffed sending */
export function startJobStream(): void {
  bufferUsed = 0;
  pendingLineLengths = [];
  pumpJobLines();
}

function cleanup(): void {
  if (statusPollTimer) {
    clearInterval(statusPollTimer);
    statusPollTimer = null;
  }
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
  bufferUsed = 0;
  pendingLineLengths = [];
}

function forceReconnect(): void {
  cleanup();
  if (ws) {
    ws.onclose = null;
    ws.onerror = null;
    ws.close();
    ws = null;
  }
  const store = useMachineStore.getState();
  store.setConnection('disconnected');
  // Reconnect immediately
  setTimeout(() => {
    connect(useMachineStore.getState().url);
  }, 500);
}

/**
 * Send as many queued G-code lines as will fit in the GRBL serial buffer.
 * This is "buffer-stuffing" / "character counting" protocol — dramatically
 * faster than single-line send-wait-ok.
 */
function pumpJobLines(): void {
  let state = useMachineStore.getState();
  if (!state.jobRunning) return;

  while (state.jobCurrentLine < state.jobLines.length) {
    const line = state.jobLines[state.jobCurrentLine];
    const lineBytes = line.length + 1; // +1 for \n

    if (bufferUsed + lineBytes > GRBL_BUFFER_SIZE) {
      // Buffer full — wait for 'ok' responses to free space
      break;
    }

    // Send this line and track its buffer usage
    send(line);
    bufferUsed += lineBytes;
    pendingLineLengths.push(lineBytes);
    state.advanceJob();
    // Re-read state after advance (Zustand set is synchronous)
    state = useMachineStore.getState();
  }
}

function handleMessage(line: string): void {
  const store = useMachineStore.getState();

  // ESP3D protocol messages — silently ignore
  if (line.startsWith('CURRENT_ID:') || line.startsWith('ACTIVE_ID:') || line.startsWith('PING:')) {
    return;
  }

  // Status report: <State|MPos:...|FS:...>
  if (line.startsWith('<') && line.endsWith('>')) {
    const status = parseStatusReport(line);
    if (status) {
      store.setStatus(status);
    }
    return;
  }

  // MINFO JSON response
  if (line.includes('"homed"')) {
    const minfo = parseMInfo(line);
    if (minfo) {
      store.setMInfo(minfo);
      // Auto-save belt snapshot when machine is in a known-good state
      if (minfo.homed && (minfo.tl > 0 || minfo.tr > 0 || minfo.bl > 0 || minfo.br > 0)) {
        saveBeltSnapshot(minfo, store.status);
      }
    }
  }

  // MSG:INFO messages
  if (line.includes('[MSG:INFO:')) {
    store.addConsoleMessage({ timestamp: Date.now(), text: line, type: 'info' });
    return;
  }

  // Error messages
  if (line.startsWith('error:') || line.includes('ALARM')) {
    store.addConsoleMessage({ timestamp: Date.now(), text: line, type: 'error' });
    // Free one buffer slot on error too
    if (pendingLineLengths.length > 0) {
      bufferUsed -= pendingLineLengths.shift()!;
    }
    return;
  }

  // ok acknowledgments — free buffer space and pump more lines
  if (line === 'ok') {
    if (pendingLineLengths.length > 0) {
      bufferUsed -= pendingLineLengths.shift()!;
    }
    if (store.jobRunning) {
      pumpJobLines();
    }
    return;
  }

  // Everything else
  store.addConsoleMessage({ timestamp: Date.now(), text: line, type: 'response' });
}

// ── Belt Position Snapshot (localStorage) ──

const SNAPSHOT_KEY = 'maslow_belt_snapshot';

export interface BeltSnapshot {
  tl: number;
  tr: number;
  bl: number;
  br: number;
  z: number;
  timestamp: number;
  homed: boolean;
  extended: boolean;
}

function saveBeltSnapshot(minfo: import('../types/machine').MInfo, status: import('../types/machine').MachineStatus | null): void {
  const snapshot: BeltSnapshot = {
    tl: minfo.tl,
    tr: minfo.tr,
    bl: minfo.bl,
    br: minfo.br,
    z: status?.position.z ?? 0,
    timestamp: Date.now(),
    homed: minfo.homed,
    extended: minfo.extended,
  };
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch { /* localStorage full or unavailable */ }
}

export function loadBeltSnapshot(): BeltSnapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BeltSnapshot;
  } catch {
    return null;
  }
}
