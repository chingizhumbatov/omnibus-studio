import { useUIStore } from "@/store/uiStore";
import { useLogStore } from "@/store/logStore";
import { startChannel, stopChannel } from "@/core/ipc/bridge";
import { Cpu, Settings, Play, Square, Plug, Unplug, Trash2, ChevronRight, ChevronDown } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ChannelNode, DeviceNode, DeviceStatus, ProtocolType } from "@/core/contracts/devices";
import { AddDeviceModal } from "@/components/devices/AddDeviceModal";
import { AddChannelModal } from "@/components/devices/AddChannelModal";

const StatusDot = ({ status, enabled = true }: { status: DeviceStatus, enabled?: boolean }) => {
  const colors = {
    ok: "bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]",
    timeout: "bg-yellow-500 shadow-[0_0_5px_rgba(234,179,8,0.5)]",
    faulted: "bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]",
    offline: "bg-zinc-500"
  };
  
  if (!enabled) {
    return <div className="w-2 h-2 rounded-full mr-2 shrink-0 border border-zinc-600 bg-transparent" title="Disabled" />;
  }

  return <div className={cn("w-2 h-2 rounded-full mr-2 shrink-0", colors[status])} />;
};

interface ContextMenuState {
  x: number;
  y: number;
  node: DeviceNode | ChannelNode;
  type: "device" | "channel";
}

const DeviceItem = ({ 
  device, 
  protocol,
  onContextMenu
}: { 
  device: DeviceNode, 
  protocol: ProtocolType,
  onContextMenu: (e: React.MouseEvent, node: DeviceNode) => void
}) => {
  const { selectedDeviceId, setSelectedDevice } = useUIStore();
  const isSelected = selectedDeviceId === device.id;

  return (
    <div 
      className={cn(
        "flex items-center pl-6 py-1.5 cursor-pointer text-sm group transition-colors select-none",
        isSelected 
          ? "bg-primary/10 text-foreground border-r-2 border-primary" 
          : "hover:bg-secondary/50 text-muted-foreground hover:text-foreground",
        !device.enabled && "opacity-50"
      )}
      onClick={() => setSelectedDevice(device.id)}
      onContextMenu={(e) => onContextMenu(e, device)}
    >
      <StatusDot status={device.status} enabled={device.enabled} />
      <Cpu className={cn("w-4 h-4 mr-2 transition-colors", isSelected ? "text-primary" : "text-zinc-400 group-hover:text-primary")} />
      <span className="flex-1 truncate">{device.name}</span>
      
      {protocol === "modbus" && (
        <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded-sm mr-2" title="Modbus Slave ID">
          ID: {(device.config as any)?.slaveId}
        </span>
      )}
      {protocol === "mqtt" && (
        <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded-sm mr-2" title="MQTT Topic">
          MQTT
        </span>
      )}
    </div>
  );
};

const ChannelGroup = ({ 
  channel, 
  devices,
  onContextMenu
}: { 
  channel: ChannelNode, 
  devices: DeviceNode[],
  onContextMenu: (e: React.MouseEvent, node: DeviceNode | ChannelNode, type: "device" | "channel") => void
}) => {
  const [isOpen, setIsOpen] = useState(true);

  const { selectedChannelId, setSelectedChannel } = useUIStore();
  const isSelected = selectedChannelId === channel.id;

  return (
    <div className="mb-1">
      <div 
        className={cn(
          "flex items-center px-2 py-1.5 cursor-pointer text-sm font-medium group transition-colors select-none",
          isSelected 
            ? "bg-primary/10 text-foreground border-r-2 border-primary" 
            : "hover:bg-secondary/50 text-muted-foreground hover:text-foreground"
        )}
        onClick={() => setSelectedChannel(channel.id)}
        onContextMenu={(e) => onContextMenu(e, channel, "channel")}
      >
        <div 
          className="p-1 -ml-1 mr-1 hover:bg-zinc-700/50 rounded text-zinc-400"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
        >
          {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </div>
        <StatusDot status={channel.status} />
        <span className="flex-1 truncate select-none">{channel.name}</span>
        
        <AddDeviceModal channel={channel} devicesCount={devices.length} />
      </div>

      {isOpen && (
        <div className="flex flex-col">
          {devices.map(dev => (
            <DeviceItem 
              key={dev.id} 
              device={dev} 
              protocol={channel.protocol} 
              onContextMenu={(e, node) => onContextMenu(e, node, "device")}
            />
          ))}
          {devices.length === 0 && (
            <div className="pl-8 py-1.5 text-xs text-zinc-500 italic select-none">No devices</div>
          )}
        </div>
      )}
    </div>
  );
};

export function SidebarTree() {
  const { 
    channels, 
    devices, 
    removeDevice, 
    removeChannel, 
    updateDevice,
    updateChannel,
    updateDevicesInChannel
  } = useUIStore();
  const { addSystemLog } = useLogStore();
  
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, node: DeviceNode | ChannelNode, type: "device" | "channel") => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      node,
      type
    });
  };

  const handleToggleEnable = (node: DeviceNode) => {
    const newEnabled = !node.enabled;
    updateDevice(node.id, { enabled: newEnabled });
    addSystemLog({ level: "info", source: "ui", message: `Device '${node.name}' ${newEnabled ? "enabled" : "disabled"} via context menu` });
  };

  const handleConnect = async (node: DeviceNode, connect: boolean) => {
    try {
      if (connect) {
        await startChannel(node.channelId);
        updateDevicesInChannel(node.channelId, { status: "ok" });
        updateChannel(node.channelId, { status: "ok" });
      } else {
        await stopChannel(node.channelId);
        updateDevicesInChannel(node.channelId, { status: "offline" });
        updateChannel(node.channelId, { status: "offline" });
      }
      addSystemLog({ level: connect ? "info" : "warn", source: "core", message: `Successfully sent ${connect ? "connect" : "disconnect"} command for device '${node.name}'` });
    } catch (e: any) {
      addSystemLog({ level: "error", source: "core", message: `Failed to ${connect ? "connect" : "disconnect"}: ${e.message || e}` });
    }
  };

  const handleDelete = (node: DeviceNode | ChannelNode, type: "device" | "channel") => {
    if (type === "device") {
      removeDevice(node.id);
      addSystemLog({ level: "warn", source: "ui", message: `Device '${node.name}' deleted` });
    } else {
      removeChannel(node.id);
      addSystemLog({ level: "warn", source: "ui", message: `Channel '${node.name}' and all its devices deleted` });
    }
  };

  return (
    <div className="flex flex-col h-full relative">
      <div className="p-2 border-b border-border flex items-center justify-between">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Channels
        </h2>
        <div className="flex gap-1">
          <AddChannelModal />
          <button className="p-1 hover:bg-secondary text-muted-foreground hover:text-foreground rounded transition-colors">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto py-2">
        {channels.map(channel => (
          <ChannelGroup 
            key={channel.id} 
            channel={channel} 
            devices={devices.filter(d => d.channelId === channel.id)}
            onContextMenu={handleContextMenu}
          />
        ))}
        {channels.length === 0 && (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No channels configured. Click + to add one.
          </div>
        )}
      </div>

      {/* Custom Context Menu */}
      {contextMenu && (
        <div 
          className="fixed z-50 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[160px] text-sm text-popover-foreground overflow-hidden"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()} // Prevent auto-close when clicking inside menu
        >
          <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground border-b border-border mb-1 truncate">
            {contextMenu.node.name}
          </div>
          
          {contextMenu.type === "device" && (
            <>
              {(contextMenu.node as DeviceNode).status === "offline" ? (
                <button 
                  className="w-full flex items-center px-3 py-1.5 hover:bg-secondary transition-colors text-left"
                  onClick={() => { handleConnect(contextMenu.node as DeviceNode, true); setContextMenu(null); }}
                >
                  <Plug className="w-4 h-4 mr-2" /> Connect
                </button>
              ) : (
                <button 
                  className="w-full flex items-center px-3 py-1.5 hover:bg-secondary transition-colors text-left"
                  onClick={() => { handleConnect(contextMenu.node as DeviceNode, false); setContextMenu(null); }}
                >
                  <Unplug className="w-4 h-4 mr-2" /> Disconnect
                </button>
              )}

              {(contextMenu.node as DeviceNode).enabled ? (
                <button 
                  className="w-full flex items-center px-3 py-1.5 hover:bg-secondary transition-colors text-left"
                  onClick={() => { handleToggleEnable(contextMenu.node as DeviceNode); setContextMenu(null); }}
                >
                  <Square className="w-4 h-4 mr-2 text-yellow-500" /> Disable
                </button>
              ) : (
                <button 
                  className="w-full flex items-center px-3 py-1.5 hover:bg-secondary transition-colors text-left"
                  onClick={() => { handleToggleEnable(contextMenu.node as DeviceNode); setContextMenu(null); }}
                >
                  <Play className="w-4 h-4 mr-2 text-emerald-500" /> Enable
                </button>
              )}
            </>
          )}

          {contextMenu.type === "channel" && (
            <div className="px-3 py-1 text-xs text-muted-foreground italic">Channel actions coming soon</div>
          )}

          <div className="w-full h-px bg-border my-1"></div>

          <button 
            className="w-full flex items-center px-3 py-1.5 hover:bg-red-500/20 text-red-500 transition-colors text-left"
            onClick={() => { handleDelete(contextMenu.node, contextMenu.type); setContextMenu(null); }}
          >
            <Trash2 className="w-4 h-4 mr-2" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}
