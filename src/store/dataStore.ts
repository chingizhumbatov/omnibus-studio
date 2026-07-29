import { create } from "zustand";
import { TagState, DeviceTelemetry } from "@/core/contracts/ipc";

interface DataState {
  tags: Record<string, TagState>;
  telemetry: Record<string, DeviceTelemetry>;
  updateTags: (newTags: Record<string, TagState>) => void;
  updateTelemetry: (newTelemetry: Record<string, DeviceTelemetry>) => void;
}

export const useDataStore = create<DataState>((set) => ({
  tags: {},
  telemetry: {},
  updateTags: (newTags) => set((state) => ({ 
    tags: { ...state.tags, ...newTags } 
  })),
  updateTelemetry: (newTelemetry) => set((state) => ({
    telemetry: { ...state.telemetry, ...newTelemetry }
  })),
}));
