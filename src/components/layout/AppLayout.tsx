import { ReactNode } from 'react';
import { TreeView } from './TreeView';
import { useAppStore } from '../../store';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const currentView = useAppStore((state) => state.currentView);
  const setCurrentView = useAppStore((state) => state.setCurrentView);

  return (
    <div className="app-container">
      {/* Sidebar - Explorer Style */}
      <aside className="app-sidebar">
        <div className="app-sidebar-header">
          <span>Explorer</span>
        </div>
        <div className="app-sidebar-content">
          <TreeView />
        </div>
      </aside>

      {/* Main Area */}
      <main className="app-main">
        {/* Top Toolbar / Tabs */}
        <div className="app-tabs">
          <div
            className={`app-tab ${currentView === 'dashboard' ? 'active' : ''}`}
            onClick={() => setCurrentView('dashboard')}
            style={{ cursor: 'pointer' }}
          >
            Dashboard
          </div>
          <div
            className={`app-tab ${currentView === 'configurator' ? 'active' : ''}`}
            onClick={() => setCurrentView('configurator')}
            style={{ cursor: 'pointer' }}
          >
            Configurator
          </div>
        </div>

        {/* Active Content */}
        <div className="app-content">{children}</div>
      </main>
    </div>
  );
}
