import { useUIStore } from "@/store/uiStore";
import { useLogStore } from "@/store/logStore";
import { Terminal, Activity, AlertTriangle, Bug, X, Trash2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { SystemLogView } from "@/components/logs/SystemLogView";
import { SnifferView } from "@/components/logs/SnifferView";

type DrawerTab = "logs" | "sniffer" | "alarms";

export function BottomDrawer() {
  const { isBottomDrawerOpen, setBottomDrawerOpen } = useUIStore();
  const { addSystemLog, addSnifferFrame, clearSystemLogs, clearSnifferFrames } = useLogStore();
  
  const [activeTab, setActiveTab] = useState<DrawerTab>("logs");

  // Dummy Log Generator for testing virtualization performance
  const generateDummyLogs = () => {
    for (let i = 0; i < 50; i++) {
      addSystemLog({
        level: Math.random() > 0.8 ? "error" : Math.random() > 0.5 ? "warn" : "info",
        source: "modbus_worker",
        message: `Connection attempt to 192.168.1.${Math.floor(Math.random() * 255)} failed with timeout`,
      });
      
      const isTx = Math.random() > 0.5;
      addSnifferFrame({
        channelId: "chan_1",
        direction: isTx ? "tx" : "rx",
        payload: isTx ? "01 03 00 00 00 02 C4 0B" : "01 03 04 01 22 01 22 5A 7F",
      });
    }
  };

  if (!isBottomDrawerOpen) {
    return (
      <div 
        className="h-8 border-t border-border bg-background flex items-center px-4 cursor-pointer hover:bg-secondary/50 transition-colors"
        onClick={() => setBottomDrawerOpen(true)}
      >
        <Terminal className="w-4 h-4 mr-2 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Output & Messages</span>
      </div>
    );
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case "logs":
        return <SystemLogView />;
      case "sniffer":
        return <SnifferView />;
      case "alarms":
        return (
          <div className="h-full w-full flex items-center justify-center text-zinc-600 bg-[#0d0d0d] font-mono text-sm select-none">
            No active alarms. System normal.
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-full w-full bg-background flex flex-col">
      {/* Tab Bar */}
      <div className="flex items-center justify-between border-b border-border bg-card pr-2">
        <div className="flex items-center">
          <button
            onClick={() => setActiveTab("logs")}
            className={cn(
              "flex items-center px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors border-r border-border",
              activeTab === "logs" ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/50"
            )}
          >
            <Terminal className="w-4 h-4 mr-2" />
            System Logs
          </button>
          <button
            onClick={() => setActiveTab("sniffer")}
            className={cn(
              "flex items-center px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors border-r border-border",
              activeTab === "sniffer" ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/50"
            )}
          >
            <Activity className="w-4 h-4 mr-2" />
            Protocol Sniffer
          </button>
          <button
            onClick={() => setActiveTab("alarms")}
            className={cn(
              "flex items-center px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors border-r border-border",
              activeTab === "alarms" ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/50"
            )}
          >
            <AlertTriangle className="w-4 h-4 mr-2" />
            Alarms
          </button>
        </div>
        
        {/* Toolbar Actions */}
        <div className="flex items-center space-x-1">
          <button 
            onClick={generateDummyLogs}
            className="p-1.5 text-muted-foreground hover:text-emerald-400 hover:bg-secondary rounded-md transition-colors"
            title="Generate Dummy Data (+50)"
          >
            <Bug className="w-4 h-4" />
          </button>
          <button 
            onClick={() => {
              if (activeTab === "logs") clearSystemLogs();
              if (activeTab === "sniffer") clearSnifferFrames();
            }}
            className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-secondary rounded-md transition-colors"
            title="Clear Current View"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-border mx-1"></div>
          <button 
            onClick={() => setBottomDrawerOpen(false)}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {renderTabContent()}
      </div>
    </div>
  );
}
