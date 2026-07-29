import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { ActivityBar } from "./ActivityBar";
import { Sidebar } from "./Sidebar";
import { Workspace } from "./Workspace";
import { BottomDrawer } from "./BottomDrawer";
import { useUIStore } from "@/store/uiStore";

export function RootLayout() {
  const { isSidebarOpen, isBottomDrawerOpen } = useUIStore();

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
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
          
          {!isBottomDrawerOpen && <BottomDrawer />}
        </Panel>
      </PanelGroup>
    </div>
  );
}
