import { listen } from '@tauri-apps/api/event';
import { useAppStore } from '../store';
import { TagsUpdatedEvent, ConnectionStatusEvent } from './contracts';

let isListening = false;

export async function setupIpcListeners() {
  if (isListening) return;
  isListening = true;

  console.log('Setting up Tauri IPC listeners...');

  try {
    await listen<TagsUpdatedEvent>('tags-updated', (event) => {
      const { tags } = event.payload;
      // Update global store with the new tags
      useAppStore.getState().updateTags(tags);
    });

    await listen<ConnectionStatusEvent>('connection-status', (event) => {
      const { connection_id, is_connected } = event.payload;
      useAppStore.getState().updateConnectionStatus(connection_id, is_connected);
    });

    console.log('Tauri IPC listeners setup complete.');
  } catch (error) {
    console.error('Failed to setup Tauri IPC listeners:', error);
    isListening = false;
  }
}
