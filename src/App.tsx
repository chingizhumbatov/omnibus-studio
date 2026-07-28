import { useEffect } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { setupIpcListeners } from './core/tauri-ipc';
import { useAppStore } from './store';

function App() {
  const tags = useAppStore((state) => state.tags);

  useEffect(() => {
    setupIpcListeners();
  }, []);

  return (
    <AppLayout>
      <div style={{ maxWidth: '800px', margin: '0 auto', marginTop: '2rem' }}>
        <h1 style={{ marginBottom: '1rem', fontWeight: 500 }}>Omnibus Studio</h1>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '2rem' }}>
          Data Hub and Workspace environment is ready.
        </p>

        <div
          style={{
            background: 'var(--color-bg-sidebar)',
            padding: '1.5rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            marginBottom: '2rem',
          }}
        >
          <h2
            style={{
              fontSize: 'var(--font-size-md)',
              marginBottom: '1rem',
              color: 'var(--color-accent)',
            }}
          >
            System Status
          </h2>
          <ul style={{ listStyle: 'none', fontSize: 'var(--font-size-sm)' }}>
            <li style={{ marginBottom: '0.5rem' }}>✓ UI Foundation Initialized (VS Code Theme)</li>
            <li style={{ marginBottom: '0.5rem' }}>✓ Git Hooks & Formatting (Active)</li>
            <li style={{ marginBottom: '0.5rem' }}>✓ Rust Core & IPC Data Contracts (Ready)</li>
            <li style={{ marginBottom: '0.5rem' }}>✓ Tauri Event Emitter Connected</li>
          </ul>
        </div>

        <div
          style={{
            background: 'var(--color-bg-sidebar)',
            padding: '1.5rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
          }}
        >
          <h2
            style={{
              fontSize: 'var(--font-size-md)',
              marginBottom: '1rem',
              color: 'var(--color-accent)',
            }}
          >
            Live Data Tags (Event Bus)
          </h2>

          {Object.keys(tags).length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
              No tags received yet. Waiting for Data Hub...
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {Object.values(tags).map((tag) => (
                <div
                  key={tag.tag_id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '0.5rem',
                    background: 'var(--color-bg-canvas)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                    fontSize: 'var(--font-size-sm)',
                  }}
                >
                  <span style={{ fontWeight: 500, color: 'var(--color-text)' }}>{tag.tag_id}</span>
                  <span style={{ color: 'var(--color-accent)' }}>
                    {tag.value.type === 'Integer' || tag.value.type === 'Float'
                      ? tag.value.value
                      : tag.value.type === 'String'
                        ? tag.value.value
                        : 'Raw Data'}
                  </span>
                  <span style={{ color: tag.quality.status === 'Good' ? '#4caf50' : '#f44336' }}>
                    {tag.quality.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

export default App;
