import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ChannelNode, DeviceNode } from '@/core/contracts/devices';
import { VirtualTagConfig } from '@/core/contracts';

export type WorkspaceMode = 'operator' | 'engineer';
export type ActivityPanel = 'devices' | 'datahub' | 'sniffer' | 'ai' | 'settings';

interface UIState {
  activeMode: WorkspaceMode;
  setActiveMode: (mode: WorkspaceMode) => void;

  activeActivity: ActivityPanel;
  setActiveActivity: (activity: ActivityPanel) => void;

  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (isOpen: boolean) => void;

  isBottomDrawerOpen: boolean;
  toggleBottomDrawer: () => void;
  setBottomDrawerOpen: (isOpen: boolean) => void;

  channels: ChannelNode[];
  devices: DeviceNode[];
  virtualTags: VirtualTagConfig[];
  selectedDeviceId: string | null;
  selectedChannelId: string | null;
  selectedVirtualTagId: string | null;

  addChannel: (channel: ChannelNode) => void;
  updateChannel: (id: string, updates: Partial<ChannelNode>) => void;
  removeChannel: (id: string) => void;
  setSelectedChannel: (id: string | null) => void;

  addDevice: (device: DeviceNode) => void;
  removeDevice: (id: string) => void;
  setSelectedDevice: (id: string | null) => void;
  updateDevice: (id: string, updates: Partial<DeviceNode>) => void;
  updateDevicesInChannel: (channelId: string, updates: Partial<DeviceNode>) => void;

  addVirtualTag: (tag: VirtualTagConfig) => void;
  removeVirtualTag: (id: string) => void;
  updateVirtualTag: (id: string, updates: Partial<VirtualTagConfig>) => void;
  setSelectedVirtualTag: (id: string | null) => void;

  clearSelection: () => void;

  isDirty: boolean;
  setDirty: (dirty: boolean) => void;

  editorIsDirty: boolean;
  setEditorDirty: (dirty: boolean) => void;

  pendingNavigation: (() => void) | null;
  setPendingNavigation: (nav: (() => void) | null) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      activeMode: 'operator',
      setActiveMode: (mode) => set({ activeMode: mode }),

      activeActivity: 'devices',
      setActiveActivity: (activity) => set({ activeActivity: activity }),

      isSidebarOpen: true,
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),

      isBottomDrawerOpen: false,
      toggleBottomDrawer: () => set((state) => ({ isBottomDrawerOpen: !state.isBottomDrawerOpen })),
      setBottomDrawerOpen: (isOpen) => set({ isBottomDrawerOpen: isOpen }),

      channels: [],
      devices: [],
      virtualTags: [],
      selectedDeviceId: null,
      selectedChannelId: null,
      selectedVirtualTagId: null,
      isDirty: false,
      editorIsDirty: false,
      pendingNavigation: null,

      setDirty: (dirty) => set({ isDirty: dirty }),
      setEditorDirty: (dirty) => set({ editorIsDirty: dirty }),
      setPendingNavigation: (nav) => set({ pendingNavigation: nav }),

      addChannel: (channel) =>
        set((state) => ({ channels: [...state.channels, channel], isDirty: true })),
      updateChannel: (id, updates) =>
        set((state) => ({
          channels: state.channels.map((c) => (c.id === id ? { ...c, ...updates } : c)),
          isDirty: true,
        })),
      removeChannel: (id) =>
        set((state) => ({
          channels: state.channels.filter((c) => c.id !== id),
          devices: state.devices.filter((d) => d.channelId !== id),
          selectedChannelId: state.selectedChannelId === id ? null : state.selectedChannelId,
          selectedDeviceId: state.devices.find(
            (d) => d.channelId === id && d.id === state.selectedDeviceId,
          )
            ? null
            : state.selectedDeviceId,
        })),
      setSelectedChannel: (id) =>
        set({ selectedChannelId: id, selectedDeviceId: null, selectedVirtualTagId: null }),

      addDevice: (device) =>
        set((state) => ({ devices: [...state.devices, device], isDirty: true })),
      removeDevice: (id) =>
        set((state) => ({
          devices: state.devices.filter((d) => d.id !== id),
          selectedDeviceId: state.selectedDeviceId === id ? null : state.selectedDeviceId,
          isDirty: true,
        })),

      setSelectedDevice: (id) =>
        set({ selectedDeviceId: id, selectedChannelId: null, selectedVirtualTagId: null }),
      updateDevice: (id, updates) =>
        set((state) => ({
          devices: state.devices.map((dev) => (dev.id === id ? { ...dev, ...updates } : dev)),
          isDirty: true,
        })),
      updateDevicesInChannel: (channelId, updates) =>
        set((state) => ({
          devices: state.devices.map((dev) =>
            dev.channelId === channelId ? { ...dev, ...updates } : dev,
          ),
          isDirty: true,
        })),

      addVirtualTag: (tag) =>
        set((state) => ({ virtualTags: [...state.virtualTags, tag], isDirty: true })),
      removeVirtualTag: (id) =>
        set((state) => ({
          virtualTags: state.virtualTags.filter((t) => t.id !== id),
          selectedVirtualTagId:
            state.selectedVirtualTagId === id ? null : state.selectedVirtualTagId,
          isDirty: true,
        })),
      updateVirtualTag: (id, updates) =>
        set((state) => ({
          virtualTags: state.virtualTags.map((t) => (t.id === id ? { ...t, ...updates } : t)),
          isDirty: true,
        })),
      setSelectedVirtualTag: (id) =>
        set({ selectedVirtualTagId: id, selectedDeviceId: null, selectedChannelId: null }),

      clearSelection: () =>
        set({ selectedChannelId: null, selectedDeviceId: null, selectedVirtualTagId: null }),
    }),
    {
      name: 'omnibus-ui-store',
      // Persist only channels and devices — not selection or UI state
      partialize: (state) => ({
        channels: state.channels,
        devices: state.devices,
        virtualTags: state.virtualTags,
      }),
      merge: (persistedState: any, currentState) => {
        // Reset connection status on app load because backend connections do not persist across restarts
        const state = persistedState as Partial<UIState>;
        return {
          ...currentState,
          ...state,
          channels: (state.channels || []).map((c) => ({ ...c, status: 'offline' })),
          devices: (state.devices || []).map((d) => ({ ...d, status: 'offline' })),
        };
      },
    },
  ),
);
