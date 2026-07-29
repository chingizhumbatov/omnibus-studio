import { useUIStore } from "@/store/uiStore";
import { DeviceEditor } from "@/components/devices/DeviceEditor";

export function Workspace() {
  const { activeMode, setActiveMode, selectedDeviceId } = useUIStore();

  if (selectedDeviceId) {
    return <DeviceEditor />;
  }

  return (
    <div className="h-full w-full bg-background flex flex-col relative">
      <div className="absolute top-4 right-4 z-10 flex bg-card border border-border rounded-md shadow-sm overflow-hidden">
        <button
          onClick={() => setActiveMode("operator")}
          className={`px-4 py-1.5 text-xs font-medium transition-colors ${
            activeMode === "operator" 
              ? "bg-primary text-primary-foreground" 
              : "text-muted-foreground hover:bg-secondary/50"
          }`}
        >
          Grid (Operator)
        </button>
        <button
          onClick={() => setActiveMode("engineer")}
          className={`px-4 py-1.5 text-xs font-medium transition-colors ${
            activeMode === "engineer" 
              ? "bg-primary text-primary-foreground" 
              : "text-muted-foreground hover:bg-secondary/50"
          }`}
        >
          Canvas (Engineer)
        </button>
      </div>

      <div className="flex-1 w-full h-full flex items-center justify-center p-8">
        {activeMode === "operator" ? (
          <div className="w-full h-full border-2 border-dashed border-border rounded-xl flex items-center justify-center">
            <p className="text-muted-foreground">Grid Dashboard Placeholder</p>
          </div>
        ) : (
          <div className="w-full h-full bg-zinc-950 rounded-xl flex items-center justify-center relative overflow-hidden">
            {/* Grid background effect */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px]"></div>
            <p className="text-muted-foreground z-10">Topology Canvas Placeholder</p>
          </div>
        )}
      </div>
    </div>
  );
}
