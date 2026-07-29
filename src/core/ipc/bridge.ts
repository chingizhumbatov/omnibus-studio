import { invoke } from "@tauri-apps/api/core";
import { ChannelNode, DeviceNode, ModbusDeviceConfig } from "@/core/contracts/devices";
import { ConnectionConfig, ConnectionType, DeviceInstance } from "@/core/contracts/ipc";
import { useUIStore } from "@/store/uiStore";

/**
 * Converts the frontend's ChannelNode + associated DeviceNodes 
 * into the strict Rust ConnectionConfig structure.
 */
function buildConnectionConfig(channel: ChannelNode, devices: DeviceNode[]): { config: ConnectionConfig, profiles: any[] } {
  let connection_type: ConnectionType;

  // 1. Build Connection Type
  if (channel.protocol === "modbus" && channel.transport === "tcp") {
    const tConfig = channel.transportConfig as any;
    connection_type = {
      type: "Tcp",
      ip: tConfig?.ipAddress || "127.0.0.1",
      port: tConfig?.tcpPort || 502
    };
  } else if (channel.protocol === "modbus" && channel.transport === "serial") {
    const sConfig = channel.transportConfig as any;
    connection_type = {
      type: "Serial",
      port: "COM1", // TODO: Should come from transport config
      baud_rate: sConfig?.baudRate || 115200,
      data_bits: sConfig?.dataBits || 8,
      parity: sConfig?.parity || "none",
      stop_bits: sConfig?.stopBits || 1
    };
  } else {
    connection_type = { type: "Mock" };
  }

  // 2. Build Device Instances and Profiles
  const instances: DeviceInstance[] = [];
  const profiles: any[] = [];

  // Only include enabled devices
  const enabledDevices = devices.filter(d => d.enabled);

  for (const dev of enabledDevices) {
    const config = dev.config as ModbusDeviceConfig;
    
    // In our architecture, the Rust backend needs a Profile mapping to tags.
    // For now, we dynamically generate a Profile on the fly based on the Device's local tags.
    const profileId = `profile_${dev.id}`;
    
    const tags = config.tags || [];

    profiles.push({
      profile_id: profileId,
      name: `${dev.name} Profile`,
      tags: tags.map(t => ({
        tag_id: t.id,
        name: t.name,
        unit: null,
        register_type: t.registerType.charAt(0).toUpperCase() + t.registerType.slice(1), // "Holding", "Input", etc
        address: t.address,
        bit_offset: null,
        data_type: t.dataType.charAt(0).toUpperCase() + t.dataType.slice(1), // "Uint16", "Float32", etc
        byte_order: "ABCD", // TODO: Map from config.byteOrder
        scale: null
      }))
    });

    instances.push({
      instance_id: dev.id,
      profile_id: profileId,
      connection_id: channel.id,
      slave_id: config.slaveId || 1
    });
  }

  // Calculate polling interval (use minimum across all devices, default to 1000)
  let polling_interval_ms = 1000;
  if (devices.length > 0) {
    const rates = devices
      .map(d => (d.config as any)?.pollingRateMs)
      .filter(rate => typeof rate === "number" && rate > 0);
    if (rates.length > 0) {
      polling_interval_ms = Math.min(...rates);
    }
  }

  const config: ConnectionConfig = {
    connection_id: channel.id,
    connection_type,
    polling_interval_ms,
    devices: instances
  };

  return { config, profiles };
}

/**
 * Sends the connect command to Rust.
 */
export async function startChannel(channelId: string): Promise<void> {
  const state = useUIStore.getState();
  const channel = state.channels.find(c => c.id === channelId);
  if (!channel) throw new Error(`Channel ${channelId} not found`);

  const devices = state.devices.filter(d => d.channelId === channelId);

  const { config, profiles } = buildConnectionConfig(channel, devices);

  console.log("Sending connect_channel to Rust:", { config, profiles });
  
  await invoke("connect_channel", { config, profiles });
}

/**
 * Sends the disconnect command to Rust.
 */
export async function stopChannel(channelId: string): Promise<void> {
  console.log("Sending disconnect_channel to Rust:", channelId);
  await invoke("disconnect_channel", { connectionId: channelId });
}

let isListening = false;

/**
 * Subscribes to global backend events (TagsUpdated, ConnectionStatus).
 * Only needs to be called once at app startup.
 */
export async function initIpcBridge(): Promise<void> {
  if (isListening) return;
  isListening = true;

  const { listen } = await import("@tauri-apps/api/event");
  const { useDataStore } = await import("@/store/dataStore");
  const { useUIStore } = await import("@/store/uiStore");
  const { useLogStore } = await import("@/store/logStore");

  // Listen for real-time tag updates
  await listen("tags-updated", (event: any) => {
    const payload = event.payload as any;
    if (payload && payload.tags) {
      useDataStore.getState().updateTags(payload.tags);
    }
  });

  // Listen for telemetry updates
  await listen("telemetry-updated", (event: any) => {
    const payload = event.payload as any;
    if (payload && payload.telemetry) {
      useDataStore.getState().updateTelemetry(payload.telemetry);
    }
  });

  // Listen for raw sniffer traces
  await listen("sniffer-updated", (event: any) => {
    const payload = event.payload as any;
    if (payload && payload.frames) {
      const logState = useLogStore.getState();
      
      // DEBUG:
      console.log("Received sniffer-updated event!", payload.frames);

      payload.frames.forEach((f: any) => {
        // Convert array of bytes to hex string (e.g. "0A 1B 2C")
        const hexPayload = (f.payload as number[])
          .map(b => b.toString(16).padStart(2, '0').toUpperCase())
          .join(' ');
          
        logState.addSnifferFrame({
          channelId: f.connection_id,
          direction: f.direction as "tx" | "rx",
          payload: hexPayload
        });
      });
    }
  });

  // Listen for connection status changes
  await listen("connection-status", (event: any) => {
    const payload = event.payload as any;
    if (payload && payload.connection_id) {
      const status = payload.is_connected ? "ok" : (payload.error ? "faulted" : "offline");
      
      const uiState = useUIStore.getState();
      const devicesInChannel = uiState.devices.filter(d => d.channelId === payload.connection_id);
      for (const dev of devicesInChannel) {
        uiState.updateDevice(dev.id, { status });
      }
      
      useLogStore.getState().addSystemLog({
        level: payload.is_connected ? "info" : "warn",
        source: "core",
        message: `Connection '${payload.connection_id}' status changed: ${status} ${payload.error ? `(${payload.error})` : ''}`
      });
    }
  });

  console.log("IPC bridge initialized and listening for events.");
}
