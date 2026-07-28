import { useEffect } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { setupIpcListeners } from './core/tauri-ipc';
import { loadWorkspace } from './core/api';
import { useAppStore } from './store';
import { Dashboard } from './components/dashboard/Dashboard';
import { Configurator } from './components/configurator/Configurator';
import { ConnectionType } from './core/contracts';

function App() {
  const currentView = useAppStore((state) => state.currentView);

  useEffect(() => {
    setupIpcListeners();

    // Start a mock workspace session for demonstration
    const mockSession = {
      session_id: 'demo_session',
      ui_throttle_ms: 100,
      connections: [
        {
          connection_id: 'mock_demo',
          connection_type: { type: 'Mock' } as ConnectionType,
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
      profiles: [
        {
          profile_id: 'mock_profile',
          name: 'Demo Sensor Pack',
          tags: [
            {
              tag_id: 'dev_1_reg_0',
              name: 'Temperature',
              unit: '°C',
              register_type: 'Holding',
              address: 0,
              data_type: 'Float32',
              byte_order: 'ABCD',
            },
            {
              tag_id: 'dev_1_reg_2',
              name: 'Pressure',
              unit: 'bar',
              register_type: 'Holding',
              address: 2,
              data_type: 'Float32',
              byte_order: 'CDAB',
            },
            {
              tag_id: 'dev_1_reg_4',
              name: 'Status',
              register_type: 'Holding',
              address: 4,
              data_type: 'Int16',
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
          {currentView === 'dashboard' ? <Dashboard /> : <Configurator />}
        </div>
      </div>
    </AppLayout>
  );
}

export default App;
