import { ReactNode } from 'react';
import { TreeView } from './TreeView';

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
          <TreeView />
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
