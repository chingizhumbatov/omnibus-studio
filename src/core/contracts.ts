/**
 * Data contracts for IPC communication with the Rust Data Hub.
 *
 * IMPORTANT: These must be kept strictly in sync with the Rust structs
 * defined in `src-tauri/src/protocol/ipc.rs`.
 */

export interface TagsUpdatedEvent {
  /**
   * Record mapping Tag ID to its raw byte payload.
   * Rust's `Vec<u8>` is serialized as `number[]` in JSON for Tauri.
   */
  tags: Record<string, number[]>;
}

export interface DeviceFaultEvent {
  device_id: string;
  error_code: number;
}
