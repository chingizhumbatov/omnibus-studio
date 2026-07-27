import { AppLayout } from './components/layout/AppLayout';

function App() {
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
            <li style={{ marginBottom: '0.5rem' }}>⏳ Rust Core & IPC Data Contracts (Pending)</li>
          </ul>
        </div>
      </div>
    </AppLayout>
  );
}

export default App;
