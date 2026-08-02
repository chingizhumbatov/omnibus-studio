import { useUIStore } from '@/store/uiStore';
import { useLogStore } from '@/store/logStore';
import { useDataStore } from '@/store/dataStore';
import { startChannel, stopChannel } from '@/core/ipc/bridge';
import {
  Cpu,
  Settings,
  Play,
  Square,
  Plug,
  Unplug,
  Trash2,
  ChevronRight,
  ChevronDown,
  Plus,
  Calculator,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { cn } from '@/lib/utils';
import { ChannelNode, DeviceNode, DeviceStatus, ProtocolType } from '@/core/contracts/devices';
import { AddDeviceModal } from '@/components/devices/AddDeviceModal';
import { AddChannelModal } from '@/components/devices/AddChannelModal';

const StatusDot = ({ status, enabled = true }: { status: DeviceStatus; enabled?: boolean }) => {
  const colors = {
    ok: 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]',
    timeout: 'bg-yellow-500 shadow-[0_0_5px_rgba(234,179,8,0.5)]',
    faulted: 'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]',
    connecting: 'bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.5)] animate-pulse',
    offline: 'bg-zinc-500',
  };

  if (!enabled) {
    return (
      <div
        className="w-2 h-2 rounded-full mr-1.5 shrink-0 border border-zinc-600 bg-transparent"
        title="Disabled"
      />
    );
  }

  return <div className={cn('w-2 h-2 rounded-full mr-1.5 shrink-0', colors[status])} />;
};

interface ContextMenuState {
  x: number;
  y: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  node: DeviceNode | ChannelNode | any;
  type: 'device' | 'channel' | 'virtual_tag';
}

const DeviceItem = ({
  device,
  protocol,
  onContextMenu,
}: {
  device: DeviceNode;
  protocol: ProtocolType;
  onContextMenu: (e: React.MouseEvent, node: DeviceNode) => void;
}) => {
  const { selectedDeviceId, setSelectedDevice } = useUIStore();
  const isSelected = selectedDeviceId === device.id;

  return (
    <div
      className={cn(
        'flex items-center pl-5 py-1 cursor-pointer text-[10px] group transition-colors select-none',
        isSelected
          ? 'bg-primary/10 text-foreground border-r-2 border-primary'
          : 'hover:bg-secondary/50 text-muted-foreground hover:text-foreground',
        !device.enabled && 'opacity-50',
      )}
      onClick={() => {
        if (useUIStore.getState().editorIsDirty) {
          useUIStore.getState().setPendingNavigation(() => {
            useUIStore.getState().setEditorDirty(false);
            setSelectedDevice(device.id);
          });
          return;
        }
        setSelectedDevice(device.id);
      }}
      onContextMenu={(e) => onContextMenu(e, device)}
    >
      <StatusDot status={device.status} enabled={device.enabled} />
      <Cpu
        className={cn(
          'w-3 h-3 mr-1.5 transition-colors',
          isSelected ? 'text-primary' : 'text-zinc-400 group-hover:text-primary',
        )}
      />
      <span className="flex-1 truncate">{device.name}</span>

      {protocol === 'modbus' && (
        <span
          className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded-sm mr-1.5"
          title="Modbus Slave ID"
        >
          ID: {(device.config as any)?.slaveId}
        </span>
      )}
      {protocol === 'mqtt' && (
        <span
          className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded-sm mr-1.5"
          title="MQTT Topic"
        >
          MQTT
        </span>
      )}
    </div>
  );
};

const ChannelGroup = ({
  channel,
  devices,
  onContextMenu,
}: {
  channel: ChannelNode;
  devices: DeviceNode[];
  onContextMenu: (
    e: React.MouseEvent,
    node: DeviceNode | ChannelNode,
    type: 'device' | 'channel',
  ) => void;
}) => {
  const [isOpen, setIsOpen] = useState(true);

  const { selectedChannelId, setSelectedChannel } = useUIStore();
  const isSelected = selectedChannelId === channel.id;

  return (
    <div className="mb-1">
      <div
        className={cn(
          'flex items-center px-2 py-1 cursor-pointer text-[10px] font-medium group transition-colors select-none',
          isSelected
            ? 'bg-primary/10 text-foreground border-r-2 border-primary'
            : 'hover:bg-secondary/50 text-muted-foreground hover:text-foreground',
        )}
        onClick={() => {
          if (useUIStore.getState().editorIsDirty) {
            useUIStore.getState().setPendingNavigation(() => {
              useUIStore.getState().setEditorDirty(false);
              setSelectedChannel(channel.id);
            });
            return;
          }
          setSelectedChannel(channel.id);
        }}
        onContextMenu={(e) => onContextMenu(e, channel, 'channel')}
      >
        <div
          className="p-1 -ml-1 mr-1 hover:bg-zinc-700/50 rounded text-zinc-400"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
        >
          {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </div>
        <StatusDot status={channel.status} />
        <span className="flex-1 truncate select-none">{channel.name}</span>

        <AddDeviceModal channel={channel} devicesCount={devices.length} />
      </div>

      {isOpen && (
        <div className="flex flex-col">
          {devices.map((dev) => (
            <DeviceItem
              key={dev.id}
              device={dev}
              protocol={channel.protocol}
              onContextMenu={(e, node) => onContextMenu(e, node, 'device')}
            />
          ))}
          {devices.length === 0 && (
            <div className="pl-8 py-1 text-[10px] text-zinc-500 italic select-none">No devices</div>
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
    updateDevicesInChannel,
    virtualTags,
    selectedVirtualTagId,
    setSelectedVirtualTag,
    addVirtualTag,
    removeVirtualTag,
  } = useUIStore();
  const { addSystemLog } = useLogStore();
  const { tags } = useDataStore();

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const [channelsOpen, setChannelsOpen] = useState(true);
  const [virtualTagsOpen, setVirtualTagsOpen] = useState(true);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const handleContextMenu = (
    e: React.MouseEvent,
    node: any,
    type: 'device' | 'channel' | 'virtual_tag',
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      node,
      type,
    });
  };

  const handleToggleEnable = (node: DeviceNode) => {
    const newEnabled = !node.enabled;
    updateDevice(node.id, { enabled: newEnabled });
    addSystemLog({
      level: 'info',
      source: 'ui',
      message: `Device '${node.name}' ${newEnabled ? 'enabled' : 'disabled'} via context menu`,
    });
  };

  const handleConnect = async (node: DeviceNode, connect: boolean) => {
    try {
      if (connect) {
        await startChannel(node.channelId);
        updateDevicesInChannel(node.channelId, { status: 'ok' });
        updateChannel(node.channelId, { status: 'ok' });
      } else {
        await stopChannel(node.channelId);
        updateDevicesInChannel(node.channelId, { status: 'offline' });
        updateChannel(node.channelId, { status: 'offline' });
      }
      addSystemLog({
        level: connect ? 'info' : 'warn',
        source: 'core',
        message: `Successfully sent ${connect ? 'connect' : 'disconnect'} command for device '${node.name}'`,
      });
    } catch (e: any) {
      addSystemLog({
        level: 'error',
        source: 'core',
        message: `Failed to ${connect ? 'connect' : 'disconnect'}: ${e.message || e}`,
      });
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleDelete = (
    node: DeviceNode | ChannelNode | any,
    type: 'device' | 'channel' | 'virtual_tag',
  ) => {
    if (type === 'device') {
      removeDevice(node.id);
      addSystemLog({ level: 'warn', source: 'ui', message: `Device '${node.name}' deleted` });
    } else if (type === 'channel') {
      removeChannel(node.id);
      addSystemLog({
        level: 'warn',
        source: 'ui',
        message: `Channel '${node.name}' and all its devices deleted`,
      });
    } else if (type === 'virtual_tag') {
      removeVirtualTag(node.id);
      addSystemLog({ level: 'warn', source: 'ui', message: `Virtual Tag '${node.name}' deleted` });
    }
  };

  const renderChannelsHeader = () => (
    <div
      className="p-1 border-b border-border flex items-center justify-between sticky top-0 bg-card z-10 cursor-pointer select-none group shrink-0"
      onClick={() => setChannelsOpen(!channelsOpen)}
    >
      <div className="flex items-center gap-1">
        {channelsOpen ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        )}
        <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Channels
        </h2>
      </div>
      <div
        className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        <AddChannelModal />
        <button
          className="p-1 hover:bg-secondary text-muted-foreground hover:text-foreground rounded transition-colors"
          title="Settings"
        >
          <Settings className="w-3 h-3" />
        </button>
      </div>
    </div>
  );

  const renderChannelsListContent = () => (
    <div className="flex-1 overflow-y-auto py-1">
      {channels.map((channel) => (
        <ChannelGroup
          key={channel.id}
          channel={channel}
          devices={devices.filter((d) => d.channelId === channel.id)}
          onContextMenu={handleContextMenu}
        />
      ))}
      {channels.length === 0 && (
        <div className="p-1 text-center text-[10px] text-muted-foreground">
          No channels configured. Click + to add one.
        </div>
      )}
    </div>
  );

  const renderVirtualTagsHeader = () => (
    <div
      className="p-1 flex items-center justify-between group border-b border-border sticky top-0 bg-card z-10 cursor-pointer select-none shrink-0"
      onClick={() => setVirtualTagsOpen(!virtualTagsOpen)}
    >
      <div className="flex items-center gap-1">
        {virtualTagsOpen ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        )}
        <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Virtual Tags
        </h3>
      </div>
      <button
        className="p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-secondary text-muted-foreground hover:text-foreground rounded"
        onClick={(e) => {
          e.stopPropagation();
          if (!virtualTagsOpen) setVirtualTagsOpen(true);
          addVirtualTag({
            id: `vtag_${Date.now()}`,
            name: 'New Virtual Tag',
            data_type: 'Float32',
            sources: {},
            expression: '0',
          });
        }}
        title="Add Virtual Tag"
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );

  const renderVirtualTagsListContent = () => (
    <div className="flex-1 overflow-y-auto py-1 flex flex-col">
      {virtualTags.map((vtag) => {
        const liveState = tags[vtag.id];
        let status: DeviceStatus = 'offline';
        if (liveState) {
          status = liveState.quality.status === 'Good' ? 'ok' : 'faulted';
        }

        return (
          <div
            key={vtag.id}
            className={cn(
              'flex items-center pl-5 py-1 cursor-pointer text-[10px] group transition-colors select-none',
              selectedVirtualTagId === vtag.id
                ? 'bg-primary/10 text-foreground border-r-2 border-primary'
                : 'hover:bg-secondary/50 text-muted-foreground hover:text-foreground',
              vtag.enabled === false && 'opacity-50',
            )}
            onClick={() => {
              if (useUIStore.getState().editorIsDirty) {
                useUIStore.getState().setPendingNavigation(() => {
                  useUIStore.getState().setEditorDirty(false);
                  setSelectedVirtualTag(vtag.id);
                });
                return;
              }
              setSelectedVirtualTag(vtag.id);
            }}
            onContextMenu={(e) => handleContextMenu(e, vtag, 'virtual_tag')}
          >
            <StatusDot status={status} enabled={vtag.enabled !== false} />
            <Calculator
              className={cn(
                'w-3 h-3 mr-1.5 transition-colors',
                selectedVirtualTagId === vtag.id
                  ? 'text-primary'
                  : 'text-zinc-400 group-hover:text-primary',
              )}
            />
            <span className="flex-1 truncate">{vtag.name}</span>
          </div>
        );
      })}
      {virtualTags.length === 0 && (
        <div className="pl-5 py-1 text-[10px] text-zinc-500 italic select-none">
          No virtual tags
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full relative bg-background">
      {renderChannelsHeader()}

      {!channelsOpen && !virtualTagsOpen && renderVirtualTagsHeader()}

      {channelsOpen && !virtualTagsOpen && (
        <div className="flex flex-col flex-1 overflow-hidden">
          {renderChannelsListContent()}
          {renderVirtualTagsHeader()}
        </div>
      )}

      {!channelsOpen && virtualTagsOpen && (
        <div className="flex flex-col flex-1 overflow-hidden">
          {renderVirtualTagsHeader()}
          {renderVirtualTagsListContent()}
        </div>
      )}

      {channelsOpen && virtualTagsOpen && (
        <PanelGroup direction="vertical" autoSaveId="sidebar-panels" className="flex-1">
          <Panel defaultSize={60} minSize={20} className="flex flex-col">
            {renderChannelsListContent()}
          </Panel>

          <PanelResizeHandle className="h-1 w-full bg-border hover:bg-primary transition-colors cursor-row-resize z-50 shrink-0" />

          <Panel defaultSize={40} minSize={20} className="flex flex-col">
            {renderVirtualTagsHeader()}
            {renderVirtualTagsListContent()}
          </Panel>
        </PanelGroup>
      )}

      {/* Custom Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[160px] text-[10px] text-popover-foreground overflow-hidden"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()} // Prevent auto-close when clicking inside menu
        >
          <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground border-b border-border mb-1 truncate">
            {contextMenu.node.name}
          </div>

          {contextMenu.type === 'device' && (
            <>
              {(contextMenu.node as DeviceNode).status === 'offline' ? (
                <button
                  className="w-full flex items-center px-3 py-1 hover:bg-secondary transition-colors text-left"
                  onClick={() => {
                    handleConnect(contextMenu.node as DeviceNode, true);
                    setContextMenu(null);
                  }}
                >
                  <Plug className="w-3 h-3 mr-1.5" /> Connect
                </button>
              ) : (
                <button
                  className="w-full flex items-center px-3 py-1 hover:bg-secondary transition-colors text-left"
                  onClick={() => {
                    handleConnect(contextMenu.node as DeviceNode, false);
                    setContextMenu(null);
                  }}
                >
                  <Unplug className="w-3 h-3 mr-1.5" /> Disconnect
                </button>
              )}

              {(contextMenu.node as DeviceNode).enabled ? (
                <button
                  className="w-full flex items-center px-3 py-1 hover:bg-secondary transition-colors text-left"
                  onClick={() => {
                    handleToggleEnable(contextMenu.node as DeviceNode);
                    setContextMenu(null);
                  }}
                >
                  <Square className="w-3 h-3 mr-1.5 text-yellow-500" /> Disable
                </button>
              ) : (
                <button
                  className="w-full flex items-center px-3 py-1 hover:bg-secondary transition-colors text-left"
                  onClick={() => {
                    handleToggleEnable(contextMenu.node as DeviceNode);
                    setContextMenu(null);
                  }}
                >
                  <Play className="w-3 h-3 mr-1.5 text-emerald-500" /> Enable
                </button>
              )}
            </>
          )}

          {contextMenu.type === 'channel' && (
            <div className="px-3 py-1 text-[10px] text-muted-foreground italic">
              Channel actions coming soon
            </div>
          )}

          <div className="w-full h-px bg-border my-1"></div>

          <button
            className="w-full flex items-center px-3 py-1 hover:bg-red-500/20 text-red-500 transition-colors text-left"
            onClick={() => {
              handleDelete(contextMenu.node, contextMenu.type);
              setContextMenu(null);
            }}
          >
            <Trash2 className="w-3 h-3 mr-1.5" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}
