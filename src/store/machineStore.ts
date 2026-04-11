import { create } from 'zustand';
import type { ConnectionState, MachineStatus, MInfo, ConsoleMessage } from '../types/machine';

interface MachineStoreState {
  connection: ConnectionState;
  setConnection: (c: ConnectionState) => void;

  url: string;
  setUrl: (u: string) => void;

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

  url: 'ws://maslow.fortmiller:81',
  setUrl: (u) => set({ url: u }),

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
