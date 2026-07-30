import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ChannelNode, DeviceNode } from "@/core/contracts/devices";

export type WorkspaceMode = "operator" | "engineer";
export type ActivityPanel = "devices" | "datahub" | "sniffer" | "ai" | "settings";

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
  selectedDeviceId: string | null;
  selectedChannelId: string | null;
  
  addChannel: (channel: ChannelNode) => void;
  updateChannel: (id: string, updates: Partial<ChannelNode>) => void;
  removeChannel: (id: string) => void;
  setSelectedChannel: (id: string | null) => void;
  
  addDevice: (device: DeviceNode) => void;
  removeDevice: (id: string) => void;
  setSelectedDevice: (id: string | null) => void;
  updateDevice: (id: string, updates: Partial<DeviceNode>) => void;
  updateDevicesInChannel: (channelId: string, updates: Partial<DeviceNode>) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      activeMode: "operator",
      setActiveMode: (mode) => set({ activeMode: mode }),

      activeActivity: "devices",
      setActiveActivity: (activity) => set({ activeActivity: activity }),

      isSidebarOpen: true,
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),

      isBottomDrawerOpen: false,
      toggleBottomDrawer: () => set((state) => ({ isBottomDrawerOpen: !state.isBottomDrawerOpen })),
      setBottomDrawerOpen: (isOpen) => set({ isBottomDrawerOpen: isOpen }),

      channels: [],
      devices: [],
      selectedDeviceId: null,
      selectedChannelId: null,
      
      addChannel: (channel) => set((state) => ({ channels: [...state.channels, channel] })),
      updateChannel: (id, updates) => set((state) => ({
        channels: state.channels.map(c => c.id === id ? { ...c, ...updates } : c)
      })),
      removeChannel: (id) => set((state) => ({
        channels: state.channels.filter(c => c.id !== id),
        devices: state.devices.filter(d => d.channelId !== id),
        selectedChannelId: state.selectedChannelId === id ? null : state.selectedChannelId,
        selectedDeviceId: state.devices.find(d => d.channelId === id && d.id === state.selectedDeviceId) ? null : state.selectedDeviceId,
      })),
      setSelectedChannel: (id) => set({ selectedChannelId: id, selectedDeviceId: null }),
      
      addDevice: (device) => set((state) => ({ devices: [...state.devices, device] })),
      removeDevice: (id) => set((state) => ({ 
        devices: state.devices.filter(d => d.id !== id),
        selectedDeviceId: state.selectedDeviceId === id ? null : state.selectedDeviceId 
      })),

      setSelectedDevice: (id) => set({ selectedDeviceId: id, selectedChannelId: null }),
      updateDevice: (id, updates) => set((state) => ({
        devices: state.devices.map(dev => dev.id === id ? { ...dev, ...updates } : dev)
      })),
      updateDevicesInChannel: (channelId, updates) => set((state) => ({
        devices: state.devices.map(dev => dev.channelId === channelId ? { ...dev, ...updates } : dev)
      })),
    }),
    {
      name: "omnibus-ui-store",
      // Persist only channels and devices — not selection or UI state
      partialize: (state) => ({
        channels: state.channels,
        devices: state.devices,
      }),
    }
  )
);
