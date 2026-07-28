/**
 * Data contracts for IPC communication with the Rust Data Hub.
 *
 * IMPORTANT: These must be kept strictly in sync with the Rust structs
 * defined in `src-tauri/src/core/messages.rs` and `ipc.rs`.
 */

export type TagValue =
  | { type: 'Integer'; value: number }
  | { type: 'Float'; value: number }
  | { type: 'String'; value: string }
  | { type: 'Raw'; value: number[] };

export type TagQuality =
  { status: 'Good' } | { status: 'Bad'; reason: string } | { status: 'Unknown' };

export interface TagState {
  tag_id: string;
  value: TagValue;
  quality: TagQuality;
  timestamp_ms: number;
}

export interface TagsUpdatedEvent {
  tags: Record<string, TagState>;
}

export interface ConnectionStatusEvent {
  connection_id: string;
  is_connected: boolean;
  error?: string;
}

export type ConnectionType =
  | {
      type: 'Serial';
      port: string;
      baud_rate: number;
      data_bits: number;
      parity: string;
      stop_bits: number;
    }
  | { type: 'Tcp'; ip: string; port: number };

export interface DeviceInstance {
  instance_id: string;
  profile_id: string;
  connection_id: string;
  slave_id: number;
}

export interface ConnectionConfig {
  connection_id: string;
  connection_type: ConnectionType;
  polling_interval_ms: number;
  devices: DeviceInstance[];
}

export interface WorkspaceSession {
  session_id: string;
  ui_throttle_ms: number;
  connections: ConnectionConfig[];
}
