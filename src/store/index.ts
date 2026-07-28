import { create } from 'zustand';
import { TagState } from '../core/contracts';

interface AppState {
  tags: Record<string, TagState>;
  updateTags: (newTags: Record<string, TagState>) => void;
}

export const useAppStore = create<AppState>((set) => ({
  tags: {},
  updateTags: (newTags) =>
    set((state) => ({
      tags: { ...state.tags, ...newTags },
    })),
}));
