import { useEffect } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { setupIpcListeners } from './core/tauri-ipc';
import { loadWorkspace } from './core/api';
import { useAppStore } from './store';
import { Dashboard } from './components/dashboard/Dashboard';
import { ConnectionType } from './core/contracts';

function App() {
  useEffect(() => {
    setupIpcListeners();

    // Start a mock workspace session for demonstration
    const mockSession = {
      session_id: 'demo_session',
      ui_throttle_ms: 100,
      connections: [
        {
          connection_id: 'mock_demo',
          connection_type: { type: 'Tcp', ip: '127.0.0.1', port: 502 } satisfies ConnectionType,
          polling_interval_ms: 100,
          devices: [
            {
              instance_id: 'dev_1',
              profile_id: 'mock_profile',
              connection_id: 'mock_demo',
              slave_id: 1,
            },
          ],
        },
      ],
    };

    loadWorkspace(mockSession)
      .then(() => {
        useAppStore.getState().setWorkspace(mockSession);
      })
      .catch((err) => console.error('Failed to load workspace:', err));
  }, []);

  return (
    <AppLayout>
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          marginTop: '2rem',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <h1 style={{ marginBottom: '1rem', fontWeight: 500 }}>Omnibus Studio</h1>

        <div style={{ flex: 1, paddingBottom: '2rem' }}>
          <Dashboard />
        </div>
      </div>
    </AppLayout>
  );
}

export default App;
