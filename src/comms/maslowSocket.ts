import { useMachineStore } from '../store/machineStore';
import { parseStatusReport } from './statusParser';
import { parseMInfo } from './minfoParser';

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let statusPollTimer: ReturnType<typeof setInterval> | null = null;

export function connect(url: string): void {
  const store = useMachineStore.getState();

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  store.setConnection('connecting');

  try {
    ws = new WebSocket(url);
  } catch {
    store.setConnection('error');
    return;
  }

  ws.onopen = () => {
    store.setConnection('connected');
    store.addConsoleMessage({ timestamp: Date.now(), text: 'Connected', type: 'info' });

    // Start status polling
    statusPollTimer = setInterval(() => {
      send('?');
    }, 500);

    // Request initial machine info
    send('MINFO');
  };

  ws.onmessage = (event) => {
    const data = String(event.data);
    const lines = data.split('\n').filter((l) => l.trim());

    for (const line of lines) {
      handleMessage(line.trim());
    }
  };

  ws.onerror = () => {
    store.setConnection('error');
  };

  ws.onclose = () => {
    store.setConnection('disconnected');
    stopPolling();

    // Auto-reconnect after 3 seconds
    reconnectTimer = setTimeout(() => {
      const currentStore = useMachineStore.getState();
      if (currentStore.connection === 'disconnected') {
        connect(currentStore.url); // Use current URL, not stale closure
      }
    }, 3000);
  };
}

export function disconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  stopPolling();

  if (ws) {
    ws.onclose = null; // Prevent auto-reconnect
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

function stopPolling(): void {
  if (statusPollTimer) {
    clearInterval(statusPollTimer);
    statusPollTimer = null;
  }
}

function handleMessage(line: string): void {
  const store = useMachineStore.getState();

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
