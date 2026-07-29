import { create } from "zustand";
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
  setSelectedChannel: (id: string | null) => void;
  
  addDevice: (device: DeviceNode) => void;
  removeDevice: (id: string) => void;
  setSelectedDevice: (id: string | null) => void;
  updateDevice: (id: string, updates: Partial<DeviceNode>) => void;
}

export const useUIStore = create<UIState>((set) => ({
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

  channels: [
    {
      id: "chan_1",
      name: "Modbus Network 1",
      protocol: "modbus",
      transport: "serial",
      status: "ok",
      transportConfig: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none" }
    }
  ],
  devices: [
    {
      id: "dev_1",
      channelId: "chan_1",
      name: "Main PLC",
      enabled: true,
      config: { 
        slaveId: 1, 
        pollingRateMs: 1000, 
        timeoutMs: 500,
        byteOrder: "ABCD", 
        tags: [
          { id: "tag_1", name: "Temperature", registerType: "holding", address: 40001, dataType: "float32" }
        ] 
      },
      profileId: "template_1",
      status: "ok"
    }
  ],
  selectedDeviceId: null,
  selectedChannelId: null,
  
  addChannel: (channel) => set((state) => ({ channels: [...state.channels, channel] })),
  updateChannel: (id, updates) => set((state) => ({
    channels: state.channels.map(c => c.id === id ? { ...c, ...updates } : c)
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
}));
