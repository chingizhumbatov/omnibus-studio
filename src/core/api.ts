import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { TagsUpdatedEvent, TagValue } from './contracts';

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
 * Subscribes to periodic tag updates from the Data Hub.
 */
export async function listenToTagUpdates(
  callback: (event: TagsUpdatedEvent) => void,
): Promise<UnlistenFn> {
  return listen<TagsUpdatedEvent>('tags-updated', (event) => {
    callback(event.payload);
  });
}
