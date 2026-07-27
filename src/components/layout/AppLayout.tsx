import { ReactNode } from 'react';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="app-container">
      {/* Sidebar - Explorer Style */}
      <aside className="app-sidebar">
        <div className="app-sidebar-header">
          <span>Explorer</span>
        </div>
        <div className="app-sidebar-content">
          {/* Tree view or project files go here */}
          <div
            style={{ padding: '0 1rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}
          >
            <p>No project open</p>
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <main className="app-main">
        {/* Top Toolbar / Tabs */}
        <div className="app-tabs">
          <div className="app-tab">Welcome</div>
        </div>

        {/* Active Content */}
        <div className="app-content">{children}</div>
      </main>
    </div>
  );
}
