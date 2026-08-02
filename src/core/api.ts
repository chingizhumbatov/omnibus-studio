import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import {
  TagsUpdatedEvent,
  TagValue,
  TagState,
  WorkspaceSession,
  SnifferUpdatedEvent,
} from './contracts';

/**
 * Send a command to the Rust backend to write data to a specific tag.
 */
export async function writeTag(
  connectionId: string,
  deviceId: string,
  tagId: string,
  value: TagValue,
): Promise<void> {
  return invoke('write_tag', {
    connectionId,
    deviceId,
    tagId,
    value,
  });
}

/**
 * Resets the telemetry counters for a specific device in the Data Hub.
 */
export async function resetTelemetry(deviceId: string): Promise<void> {
  return invoke('reset_telemetry', { deviceId });
}

/**
 * Loads a workspace session into the Rust backend, starting all configured connections.
 */
export async function loadWorkspace(session: WorkspaceSession): Promise<void> {
  return invoke('load_workspace', { session });
}

/**
 * Stops all active workspace connections in the Rust backend.
 */
export async function stopWorkspace(): Promise<void> {
  return invoke('stop_workspace');
}

/**
 * Sends the latest virtual tags configuration to the Data Hub.
 */
export async function applyVirtualTags(tags: any[]): Promise<void> {
  return invoke('apply_virtual_tags', { tags });
}

/**
 * Requests the full telemetry history for a specific tag from the Data Hub ring buffer.
 */
export async function getTagHistory(tagId: string): Promise<TagState[]> {
  return invoke('get_tag_history', { tagId });
}

/**
 * Subscribes to periodic tag updates from the Data Hub.
 */
export async function listenToTagUpdates(
  callback: (event: TagsUpdatedEvent) => void,
): Promise<UnlistenFn> {
  return listen<TagsUpdatedEvent>('tags-updated', (event) => {
    callback(event.payload);
  });
}

/**
 * Starts the protocol sniffer backend service.
 */
export async function startSniffer(): Promise<void> {
  return invoke('start_sniffer');
}

/**
 * Stops the protocol sniffer backend service.
 */
export async function stopSniffer(): Promise<void> {
  return invoke('stop_sniffer');
}

/**
 * Subscribes to periodic sniffer frame updates from the Data Hub.
 */
export async function listenToSnifferUpdates(
  callback: (event: SnifferUpdatedEvent) => void,
): Promise<UnlistenFn> {
  return listen<SnifferUpdatedEvent>('sniffer-updated', (event) => {
    callback(event.payload);
  });
}

/**
 * Saves a workspace session to a file on disk via the Rust backend.
 */
export async function saveWorkspaceSession(session: WorkspaceSession): Promise<void> {
  return invoke('save_session', { session });
}

/**
 * Loads a workspace session from a file on disk via the Rust backend.
 */
export async function loadWorkspaceSession(sessionId: string): Promise<WorkspaceSession> {
  return invoke('load_session', { sessionId });
}

/**
 * Lists all saved workspace sessions on disk via the Rust backend.
 */
export async function listWorkspaces(): Promise<string[]> {
  return invoke('list_sessions');
}
