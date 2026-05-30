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

// Receive reassembly buffer. WebSocket/TCP framing does NOT guarantee a frame
// ends on a newline — a status report or an `ok` can be split across two
// frames. We accumulate incoming text here and only dispatch COMPLETE lines
// (terminated by \n), retaining any trailing partial fragment for the next
// frame. Without this, a split `ok\n` never matches `line === 'ok'`, the
// buffer counter never decrements, and a running job stalls permanently.
let rxBuffer = '';

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

  // Cancel pending reconnects (user initiated a fresh connect)
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  store.setConnection('connecting');
  store.setConnectionError(null);

  try {
    ws = new WebSocket(url);
    store.addConsoleMessage({ timestamp: Date.now(), text: `Connecting to ${url}...`, type: 'info' });
  } catch (err) {
    store.setConnection('error');
    store.setConnectionError(`Invalid URL: ${err instanceof Error ? err.message : String(err)}`);
    store.addConsoleMessage({ timestamp: Date.now(), text: `Failed to create WebSocket: ${err}`, type: 'error' });
    return;
  }

  ws.onopen = () => {
    store.setConnection('connected');
    store.setConnectionError(null);
    store.resetRetry();
    store.addConsoleMessage({ timestamp: Date.now(), text: `Connected to ${url}`, type: 'info' });
    lastResponseTime = Date.now();
    bufferUsed = 0;
    pendingLineLengths = [];
    rxBuffer = ''; // fresh session — drop any stale partial line

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

    try {
      // ESP3D sends data as Blob or string — handle both
      let data: string;
      if (event.data instanceof Blob) {
        data = await event.data.text();
      } else {
        data = String(event.data);
      }

      // Append to the reassembly buffer, then peel off only complete lines.
      // The trailing fragment (text after the last \n) stays buffered until
      // the next frame completes it.
      rxBuffer += data;
      const parts = rxBuffer.split('\n');
      rxBuffer = parts.pop() ?? ''; // last element is the incomplete remainder

      for (const part of parts) {
        const line = part.trim();
        if (line) handleMessage(line);
      }
    } catch (err) {
      useMachineStore.getState().addConsoleMessage({
        timestamp: Date.now(),
        text: `Receive error: ${err instanceof Error ? err.message : String(err)}`,
        type: 'error',
      });
    }
  };

  ws.onerror = () => {
    const store = useMachineStore.getState();
    const attempt = store.retryAttempt;
    const detail = attempt === 0
      ? `Could not reach ${url}. Check the machine is on and on the same network.`
      : `Cannot reach machine (attempt ${attempt + 1}).`;
    store.setConnectionError(detail);
    store.addConsoleMessage({
      timestamp: Date.now(),
      text: detail,
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

    // Map WebSocket close codes to helpful messages
    const codeLabel =
      event.code === 1000 ? 'normal' :
      event.code === 1006 ? 'abnormal — no handshake' :
      event.code === 1011 ? 'server error' :
      event.code === 1015 ? 'TLS handshake failed' :
      `code ${event.code}`;

    store.addConsoleMessage({
      timestamp: Date.now(),
      text: `Disconnected (${codeLabel})`,
      type: 'info',
    });

    store.incrementRetry();

    // Auto-reconnect with exponential backoff (capped at 30s)
    const backoffMs = Math.min(30000, 1000 * Math.pow(2, Math.min(store.retryAttempt, 5)));
    reconnectTimer = setTimeout(() => {
      const currentStore = useMachineStore.getState();
      // Only auto-reconnect if user wanted it (autoconnect) OR was connected before
      if (currentStore.connection === 'disconnected' && currentStore.autoconnect) {
        connect(currentStore.url);
      }
    }, backoffMs);
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
  rxBuffer = '';
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
