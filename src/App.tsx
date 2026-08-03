import { useEffect, useState } from 'react';
import { RootLayout } from './components/layout/RootLayout';
import { initIpcBridge, startChannel, serializeWorkspaceSession } from './core/ipc/bridge';
import { useUIStore } from './store/uiStore';
import { listWorkspaces, loadWorkspaceSession, saveWorkspaceSession } from './core/api';
import { getCurrentWindow } from '@tauri-apps/api/window';

import * as Dialog from '@radix-ui/react-dialog';
import { X, AlertTriangle, Save, LogOut } from 'lucide-react';

export default function App() {
  const [showExitDialog, setShowExitDialog] = useState(false);
  const pendingNavigation = useUIStore((state) => state.pendingNavigation);
  const setPendingNavigation = useUIStore((state) => state.setPendingNavigation);

  useEffect(() => {
    // 1. Initialize IPC
    initIpcBridge().catch(console.error);

    // 2. Load Workspace on startup
    const loadDefaultWorkspace = async () => {
      try {
        const workspaces = await listWorkspaces();
        // Load "default" if it exists, otherwise do nothing (start empty)
        if (workspaces.includes('default')) {
          await loadWorkspaceSession('default');
          // The UI store uses localStorage, so we don't need to overwrite everything
          // unless we want the file to be the single source of truth.
          // For now, we rely on Zustand's persist, but we DO auto-start channels here!
          const state = useUIStore.getState();
          const autoConnectChannels = state.channels.filter((c) => c.autoConnect);
          for (const channel of autoConnectChannels) {
            console.log(`Auto-connecting channel ${channel.id}...`);
            await startChannel(channel.id).catch(console.error);
          }
        }
      } catch (e) {
        console.error('Failed to load workspace on startup:', e);
      }
    };
    loadDefaultWorkspace();

    // 3. Intercept Window Close (Tauri 2)
    const setupCloseHandler = async () => {
      const appWindow = getCurrentWindow();
      const unlisten = await appWindow.onCloseRequested(async (event) => {
        const isDirty = useUIStore.getState().isDirty;
        if (isDirty) {
          event.preventDefault(); // Stop normal close
          setShowExitDialog(true);
        } else {
          // If not dirty, let it close normally
          console.log('No unsaved changes, closing...');
        }
      });
      return unlisten;
    };

    let unlistenFn: (() => void) | undefined;
    setupCloseHandler().then((fn) => {
      unlistenFn = fn;
    });

    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, []);

  const handleSaveAndExit = async () => {
    try {
      const session = serializeWorkspaceSession('default');
      await saveWorkspaceSession(session);
      useUIStore.getState().setDirty(false);
      await getCurrentWindow().close();
    } catch (e) {
      console.error('Failed to save and exit:', e);
    }
  };

  const handleExitWithoutSaving = async () => {
    // Discard UI changes (wait, localStorage is already written by zustand...
    // strictly speaking, to discard we'd need to reload from disk.
    // For now, just exit. Next time it will load the localStorage state.)
    useUIStore.getState().setDirty(false);
    await getCurrentWindow().close();
  };

  return (
    <>
      <RootLayout />

      {/* Exit Dialog Modal */}
      <Dialog.Root open={showExitDialog} onOpenChange={setShowExitDialog}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 border border-border bg-card p-5 rounded-lg shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
            <div className="flex flex-col space-y-1.5 text-center sm:text-left">
              <Dialog.Title className="text-lg font-semibold leading-none tracking-tight flex items-center text-foreground">
                <AlertTriangle className="w-5 h-5 text-yellow-500 mr-2" />
                Unsaved Changes
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground mt-2">
                You have unsaved changes in your workspace configuration. What would you like to do
                before exiting?
              </Dialog.Description>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-4">
              <Dialog.Close asChild>
                <button className="h-8 px-4 py-2 mt-2 sm:mt-0 inline-flex items-center justify-center rounded-md text-[11px] font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                onClick={handleExitWithoutSaving}
                className="h-8 px-4 py-2 mt-2 sm:mt-0 inline-flex items-center justify-center rounded-md text-[11px] font-medium border border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
              >
                <LogOut className="w-3 h-3 mr-1.5" />
                Don't Save & Exit
              </button>
              <button
                onClick={handleSaveAndExit}
                className="h-8 px-4 py-2 inline-flex items-center justify-center rounded-md text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Save className="w-3 h-3 mr-1.5" />
                Save & Exit
              </button>
            </div>

            <Dialog.Close asChild>
              <button className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Discard Edits Dialog Modal */}
      <Dialog.Root
        open={pendingNavigation !== null}
        onOpenChange={(open) => {
          if (!open) setPendingNavigation(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-sm translate-x-[-50%] translate-y-[-50%] gap-4 border border-border bg-card p-5 rounded-lg shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
            <div className="flex flex-col space-y-1.5 text-center sm:text-left">
              <Dialog.Title className="text-base font-semibold leading-none tracking-tight flex items-center text-foreground">
                <AlertTriangle className="w-5 h-5 text-yellow-500 mr-2" />
                Unsaved Changes
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground mt-2">
                You have unsaved changes in the editor. Are you sure you want to discard them and
                switch?
              </Dialog.Description>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-4">
              <Dialog.Close asChild>
                <button className="h-8 px-4 py-2 mt-2 sm:mt-0 inline-flex items-center justify-center rounded-md text-[11px] font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                onClick={() => {
                  if (pendingNavigation) pendingNavigation();
                  setPendingNavigation(null);
                }}
                className="h-8 px-4 py-2 inline-flex items-center justify-center rounded-md text-[11px] font-medium border border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
              >
                Discard & Switch
              </button>
            </div>

            <Dialog.Close asChild>
              <button className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
