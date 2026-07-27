import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { TagsUpdatedEvent, DeviceFaultEvent } from './contracts';

/**
 * Send a command to the Rust backend to write data to a specific tag.
 *
 * @param tagId The unique identifier of the tag.
 * @param payload The raw byte payload to write.
 */
export async function writeTag(tagId: string, payload: Uint8Array | number[]): Promise<void> {
  return invoke('write_tag', {
    tagId,
    // Tauri auto-converts arrays of numbers to Vec<u8> in Rust
    payload: Array.from(payload),
  });
}

/**
 * Subscribes to periodic tag updates from the Data Hub.
 *
 * @param callback Function to call when tags are updated.
 * @returns A function to unsubscribe from the event.
 */
export async function listenToTagUpdates(
  callback: (event: TagsUpdatedEvent) => void,
): Promise<UnlistenFn> {
  return listen<TagsUpdatedEvent>('tags-updated', (event) => {
    callback(event.payload);
  });
}

/**
 * Subscribes to critical device faults emitted by the Data Hub.
 */
export async function listenToDeviceFaults(
  callback: (event: DeviceFaultEvent) => void,
): Promise<UnlistenFn> {
  return listen<DeviceFaultEvent>('device-fault', (event) => {
    callback(event.payload);
  });
}
