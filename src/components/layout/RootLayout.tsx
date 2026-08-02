import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { ActivityBar } from './ActivityBar';
import { Sidebar } from './Sidebar';
import { Workspace } from './Workspace';
import { BottomDrawer } from './BottomDrawer';
import { StatusBar } from './StatusBar';
import { useUIStore } from '@/store/uiStore';
import { useLogStore } from '@/store/logStore';
import { Terminal, XCircle, AlertTriangle, Cpu, Wifi } from 'lucide-react';

export function RootLayout() {
  const { isSidebarOpen, isBottomDrawerOpen, toggleBottomDrawer } = useUIStore();
  const logs = useLogStore((state) => state.systemLogs);

  const errorCount = logs.filter((l) => l.level === 'error').length;
  const warnCount = logs.filter((l) => l.level === 'warn').length;

  return (
    <div className="flex flex-col h-screen w-full bg-background text-foreground overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <ActivityBar />

        <PanelGroup direction="horizontal" className="flex-1">
          {isSidebarOpen && (
            <>
              <Panel defaultSize={20} minSize={15} maxSize={40} className="h-full">
                <Sidebar />
              </Panel>
              <PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors cursor-col-resize z-50" />
            </>
          )}

          <Panel className="flex flex-col h-full">
            <PanelGroup direction="vertical">
              <Panel className="h-full flex-1">
                <Workspace />
              </Panel>

              {isBottomDrawerOpen && (
                <>
                  <PanelResizeHandle className="h-1 bg-border hover:bg-primary transition-colors cursor-row-resize z-50" />
                  <Panel defaultSize={30} minSize={15} maxSize={80}>
                    <BottomDrawer />
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>

      <StatusBar>
        <StatusBar.Left>
          <StatusBar.Item
            id="output"
            icon={<Terminal className="w-3.5 h-3.5" />}
            text="Output"
            onClick={toggleBottomDrawer}
            status={isBottomDrawerOpen ? 'active' : 'default'}
          />
          <StatusBar.Item
            id="errors"
            icon={<XCircle className="w-3 h-3" />}
            text={errorCount}
            status="error"
            tooltip={`${errorCount} errors in System Logs`}
            onClick={() => {
              if (!isBottomDrawerOpen) toggleBottomDrawer();
            }}
          />
          <StatusBar.Item
            id="warnings"
            icon={<AlertTriangle className="w-3 h-3" />}
            text={warnCount}
            status="warning"
            tooltip={`${warnCount} warnings in System Logs`}
            onClick={() => {
              if (!isBottomDrawerOpen) toggleBottomDrawer();
            }}
          />
        </StatusBar.Left>
        <StatusBar.Right>
          <StatusBar.Item
            id="system-status"
            icon={<Cpu className="w-3 h-3" />}
            text="Ready"
            tooltip="System Status"
          />
          <StatusBar.Item
            id="port"
            icon={<Wifi className="w-3 h-3" />}
            text="Port: 8080"
            tooltip="Backend Port"
          />
          <StatusBar.Item id="encoding" text="UTF-8" tooltip="Log Encoding" />
        </StatusBar.Right>
      </StatusBar>
    </div>
  );
}
