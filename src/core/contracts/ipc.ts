

export interface TcpConnection {
  type: "Tcp";
  ip: string;
  port: number;
}

export interface SerialConnection {
  type: "Serial";
  port: string;
  baud_rate: number;
  data_bits: number;
  parity: string;
  stop_bits: number;
}

export type ConnectionType = TcpConnection | SerialConnection | { type: "Mock" };

export interface DeviceInstance {
  instance_id: string;
  profile_id: string; // Used to lookup tags
  connection_id: string;
  slave_id: number;
}

export interface ConnectionConfig {
  connection_id: string; // Matches ChannelNode ID
  connection_type: ConnectionType;
  polling_interval_ms: number;
  devices: DeviceInstance[];
}

// ----------------------------------------------------
// Events emitted by Rust (received in React)
// ----------------------------------------------------

export type TagQuality = 
  | { status: "Good" }
  | { status: "Bad"; reason: string }
  | { status: "Unknown" };

export interface TagValue {
  type: "Integer" | "Float" | "String" | "Raw";
  value: any; 
}

export interface TagState {
  tag_id: string;
  value: TagValue;
  timestamp_ms: number;
  quality: TagQuality;
}

export interface TagsUpdatedEvent {
  tags: Record<string, TagState>;
}

export interface ConnectionStatusEvent {
  connection_id: string;
  is_connected: boolean;
  error?: string;
}

export interface DeviceTelemetry {
  requests: number;
  ok: number;
  timeouts: number;
  crc_errors: number;
  exceptions: number;
  response_time_ms: number;
}

export interface TelemetryUpdatedEvent {
  telemetry: Record<string, DeviceTelemetry>;
}

export interface SnifferFrame {
  connection_id: string;
  direction: string;
  payload: number[];
  timestamp_us: number;
}

export interface SnifferUpdatedEvent {
  frames: SnifferFrame[];
}
