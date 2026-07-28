import { listen } from '@tauri-apps/api/event';
import { useAppStore } from '../store';
import { TagsUpdatedEvent } from './contracts';

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

    console.log('Tauri IPC listeners setup complete.');
  } catch (error) {
    console.error('Failed to setup Tauri IPC listeners:', error);
    isListening = false;
  }
}
