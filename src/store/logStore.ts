import { create } from "zustand";
import { SystemLog, SnifferFrame } from "@/core/contracts/messages";

const MAX_LOGS = 1000;

interface LogState {
  systemLogs: SystemLog[];
  snifferFrames: SnifferFrame[];
  
  addSystemLog: (log: Omit<SystemLog, "id" | "timestamp">) => void;
  addSnifferFrame: (frame: Omit<SnifferFrame, "id" | "timestamp">) => void;
  clearSystemLogs: () => void;
  clearSnifferFrames: () => void;
}

export const useLogStore = create<LogState>((set) => ({
  systemLogs: [],
  snifferFrames: [],

  addSystemLog: (log) => set((state) => {
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

  addSnifferFrame: (frame) => set((state) => {
    const newFrame: SnifferFrame = {
      ...frame,
      id: `sniff_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };
    
    // Ring buffer logic
    const newFrames = [...state.snifferFrames, newFrame];
    if (newFrames.length > MAX_LOGS) {
      newFrames.shift();
    }
    
    return { snifferFrames: newFrames };
  }),

  clearSystemLogs: () => set({ systemLogs: [] }),
  clearSnifferFrames: () => set({ snifferFrames: [] }),
}));
