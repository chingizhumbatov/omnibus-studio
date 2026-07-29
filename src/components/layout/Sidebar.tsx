import { useUIStore } from "@/store/uiStore";
import { SidebarTree } from "./SidebarTree";

export function Sidebar() {
  const { activeActivity, isSidebarOpen } = useUIStore();

  if (!isSidebarOpen) return null;

  return (
    <div className="h-full w-full bg-card border-r border-border flex flex-col">
      {activeActivity === "devices" ? (
        <SidebarTree />
      ) : (
        <>
          <div className="p-3 border-b border-border">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {activeActivity}
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <p className="text-sm text-muted-foreground">Tree view for {activeActivity}</p>
          </div>
        </>
      )}
    </div>
  );
}
