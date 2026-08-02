import { create } from 'zustand';
import { SystemLog } from '@/core/contracts/messages';

const MAX_LOGS = 1000;

interface LogState {
  systemLogs: SystemLog[];
  addSystemLog: (log: Omit<SystemLog, 'id' | 'timestamp'>) => void;
  clearSystemLogs: () => void;
}

export const useLogStore = create<LogState>((set) => ({
  systemLogs: [],

  addSystemLog: (log) =>
    set((state) => {
      const newLog: SystemLog = {
        ...log,
        id: `sys_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
      };

      // Ring buffer logic: keep only the latest MAX_LOGS
      const newLogs = [...state.systemLogs, newLog];
      if (newLogs.length > MAX_LOGS) {
        newLogs.shift();
      }

      return { systemLogs: newLogs };
    }),

  clearSystemLogs: () => set({ systemLogs: [] }),
}));
