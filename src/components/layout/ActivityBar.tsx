import { useUIStore, ActivityPanel } from "@/store/uiStore";
import { Activity, Database, Network, Cpu, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const activities: { id: ActivityPanel; icon: React.ReactNode; label: string }[] = [
  { id: "devices", icon: <Network className="w-3 h-3" />, label: "Ports & Devices" },
  { id: "datahub", icon: <Database className="w-3 h-3" />, label: "Data Hub" },
  { id: "sniffer", icon: <Activity className="w-3 h-3" />, label: "Sniffer" },
  { id: "ai", icon: <Cpu className="w-3 h-3" />, label: "AI Analyst" },
  { id: "settings", icon: <Settings className="w-3 h-3" />, label: "Settings" },
];

export function ActivityBar() {
  const { activeActivity, setActiveActivity, setSidebarOpen } = useUIStore();

  const handleActivityClick = (id: ActivityPanel) => {
    if (activeActivity === id) {
      // Toggle sidebar if clicking the active one again (like VS Code)
      useUIStore.getState().toggleSidebar();
    } else {
      setActiveActivity(id);
      setSidebarOpen(true); // Always open sidebar when switching
    }
  };

  return (
    <div className="flex flex-col items-center w-12 bg-background border-r border-border py-1 space-y-4 shrink-0">
      {activities.map((act) => {
        const isActive = activeActivity === act.id;
        return (
          <button
            key={act.id}
            onClick={() => handleActivityClick(act.id)}
            title={act.label}
            className={cn(
              "p-1 rounded-md transition-colors",
              isActive ? "text-primary bg-secondary/50" : "text-muted-foreground hover:text-primary hover:bg-secondary/30"
            )}
          >
            {act.icon}
          </button>
        );
      })}
    </div>
  );
}
