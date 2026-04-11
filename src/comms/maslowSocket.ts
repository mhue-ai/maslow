import { useMachineStore } from '../store/machineStore';
import { parseStatusReport } from './statusParser';
import { parseMInfo } from './minfoParser';

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let statusPollTimer: ReturnType<typeof setInterval> | null = null;
let lastResponseTime = 0;
let healthCheckTimer: ReturnType<typeof setInterval> | null = null;

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

    // Status polling — 1 second interval (ESP32 friendly)
    statusPollTimer = setInterval(() => {
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

function cleanup(): void {
  if (statusPollTimer) {
    clearInterval(statusPollTimer);
    statusPollTimer = null;
  }
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
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
    return;
  }

  // ok acknowledgments — advance job streaming
  if (line === 'ok') {
    if (store.jobRunning) {
      store.advanceJob();
      const s = useMachineStore.getState();
      if (s.jobRunning && s.jobCurrentLine < s.jobLines.length) {
        send(s.jobLines[s.jobCurrentLine]);
      }
    }
    return;
  }

  // Everything else
  store.addConsoleMessage({ timestamp: Date.now(), text: line, type: 'response' });
}
