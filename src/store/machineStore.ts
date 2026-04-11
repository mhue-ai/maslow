import { create } from 'zustand';
import type { ConnectionState, MachineStatus, MInfo, ConsoleMessage } from '../types/machine';

interface MachineState {
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
}

export const useMachineStore = create<MachineState>((set) => ({
  connection: 'disconnected',
  setConnection: (c) => set({ connection: c }),

  url: 'ws://maslow.fortmiller',
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
}));
