import { create } from 'zustand';
import type { ConnectionState, MachineStatus, MInfo, ConsoleMessage } from '../types/machine';

const URL_STORAGE_KEY = 'maslow_ws_url';
const AUTOCONNECT_STORAGE_KEY = 'maslow_autoconnect';
const DEFAULT_URL = 'ws://maslow.fortmiller:81';

// Load persisted values from localStorage
const loadPersistedUrl = (): string => {
  try {
    return localStorage.getItem(URL_STORAGE_KEY) || DEFAULT_URL;
  } catch {
    return DEFAULT_URL;
  }
};

const loadAutoconnect = (): boolean => {
  try {
    return localStorage.getItem(AUTOCONNECT_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

interface MachineStoreState {
  connection: ConnectionState;
  setConnection: (c: ConnectionState) => void;

  url: string;
  setUrl: (u: string) => void;

  autoconnect: boolean;
  setAutoconnect: (v: boolean) => void;

  // Connection error detail for UI display
  connectionError: string | null;
  setConnectionError: (e: string | null) => void;

  // Retry tracking for better UX
  retryAttempt: number;
  incrementRetry: () => void;
  resetRetry: () => void;

  status: MachineStatus | null;
  setStatus: (s: MachineStatus) => void;

  minfo: MInfo | null;
  setMInfo: (m: MInfo) => void;

  consoleLog: ConsoleMessage[];
  addConsoleMessage: (msg: ConsoleMessage) => void;
  clearConsole: () => void;

  // Job streaming state
  jobLines: string[];
  jobCurrentLine: number;
  jobStartTime: number | null;
  jobRunning: boolean;
  setJob: (lines: string[]) => void;
  advanceJob: () => void;
  clearJob: () => void;
}

export const useMachineStore = create<MachineStoreState>((set) => ({
  connection: 'disconnected',
  setConnection: (c) => set({ connection: c }),

  url: loadPersistedUrl(),
  setUrl: (u) => {
    try { localStorage.setItem(URL_STORAGE_KEY, u); } catch { /* ignore */ }
    set({ url: u });
  },

  autoconnect: loadAutoconnect(),
  setAutoconnect: (v) => {
    try { localStorage.setItem(AUTOCONNECT_STORAGE_KEY, String(v)); } catch { /* ignore */ }
    set({ autoconnect: v });
  },

  connectionError: null,
  setConnectionError: (e) => set({ connectionError: e }),

  retryAttempt: 0,
  incrementRetry: () => set((s) => ({ retryAttempt: s.retryAttempt + 1 })),
  resetRetry: () => set({ retryAttempt: 0 }),

  status: null,
  setStatus: (s) => set({ status: s }),

  minfo: null,
  setMInfo: (m) => set({ minfo: m }),

  consoleLog: [],
  addConsoleMessage: (msg) =>
    set((s) => ({
      consoleLog: [...s.consoleLog.slice(-499), msg],
    })),
  clearConsole: () => set({ consoleLog: [] }),

  jobLines: [],
  jobCurrentLine: 0,
  jobStartTime: null,
  jobRunning: false,
  setJob: (lines) => set({ jobLines: lines, jobCurrentLine: 0, jobStartTime: Date.now(), jobRunning: true }),
  advanceJob: () =>
    set((s) => {
      const next = s.jobCurrentLine + 1;
      if (next >= s.jobLines.length) {
        return { jobCurrentLine: next, jobRunning: false };
      }
      return { jobCurrentLine: next };
    }),
  clearJob: () => set({ jobLines: [], jobCurrentLine: 0, jobStartTime: null, jobRunning: false }),
}));
