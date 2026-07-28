import { create } from 'zustand';
import { TagState, WorkspaceSession } from '../core/contracts';

export type WidgetType = 'value' | 'chart';
export type AppView = 'dashboard' | 'configurator';

export interface DashboardWidget {
  id: string;
  tag_id: string;
  type: WidgetType;
}

interface AppState {
  currentView: AppView;
  tags: Record<string, TagState>;
  workspace: WorkspaceSession | null;
  connectionStatuses: Record<string, boolean>;
  widgets: DashboardWidget[];
  draggedTagId: string | null;

  setCurrentView: (view: AppView) => void;
  updateTags: (newTags: Record<string, TagState>) => void;
  setWorkspace: (workspace: WorkspaceSession) => void;
  updateConnectionStatus: (connectionId: string, isConnected: boolean) => void;
  addWidget: (tagId: string, type?: WidgetType) => void;
  removeWidget: (widgetId: string) => void;
  updateWidgetType: (widgetId: string, type: WidgetType) => void;
  setDraggedTagId: (tagId: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentView: 'dashboard',
  tags: {},
  workspace: null,
  connectionStatuses: {},
  widgets: [],
  draggedTagId: null,

  setCurrentView: (view) => set({ currentView: view }),

  updateTags: (newTags) =>
    set((state) => ({
      tags: { ...state.tags, ...newTags },
    })),

  setWorkspace: (workspace) =>
    set(() => ({
      workspace,
      // Reset connection statuses and dashboard when a new workspace is loaded
      connectionStatuses: {},
      widgets: [],
    })),

  updateConnectionStatus: (connectionId, isConnected) =>
    set((state) => ({
      connectionStatuses: {
        ...state.connectionStatuses,
        [connectionId]: isConnected,
      },
    })),

  addWidget: (tagId, type = 'value') =>
    set((state) => ({
      widgets: [
        ...state.widgets,
        {
          id: `widget_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          tag_id: tagId,
          type,
        },
      ],
    })),

  removeWidget: (widgetId) =>
    set((state) => ({
      widgets: state.widgets.filter((w) => w.id !== widgetId),
    })),

  updateWidgetType: (widgetId, type) =>
    set((state) => ({
      widgets: state.widgets.map((w) => (w.id === widgetId ? { ...w, type } : w)),
    })),

  setDraggedTagId: (tagId) =>
    set(() => ({
      draggedTagId: tagId,
    })),
}));
