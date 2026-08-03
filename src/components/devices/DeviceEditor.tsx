import { useUIStore } from '@/store/uiStore';
import { useLogStore } from '@/store/logStore';
import { useDataStore } from '@/store/dataStore';
import { startChannel, stopChannel } from '@/core/ipc/bridge';
import {
  X,
  Save,
  Plus,
  Trash2,
  AlertCircle,
  Play,
  Square,
  Plug,
  Unplug,
  RotateCcw,
  Check,
  Copy,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import {
  ModbusDeviceConfig,
  ModbusTag,
  DeviceNode,
  Endianness,
  ModbusRegisterType,
  DataType,
} from '@/core/contracts/devices';
import { writeTag, resetTelemetry } from '@/core/api';
import { TagValue } from '@/core/contracts';
import { TooltipInfo } from '@/components/ui/TooltipInfo';

export function DeviceEditor() {
  const {
    selectedDeviceId,
    setSelectedDevice,
    devices,
    channels,
    updateDevice,
    updateDevicesInChannel,
    updateChannel,
    editorIsDirty,
    setEditorDirty,
  } = useUIStore();
  const { addSystemLog } = useLogStore();
  const tagsData = useDataStore((state) => state.tags);

  const device = devices.find((d) => d.id === selectedDeviceId);
  const channel = channels.find((c) => c.id === device?.channelId);
  const telemetry = useDataStore((state) =>
    selectedDeviceId ? state.telemetry[selectedDeviceId] : undefined,
  );

  // Local state for edits
  const [localDevice, setLocalDevice] = useState<DeviceNode | null>(null);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [isSaved, setIsSaved] = useState(false);
  const [hasCopiedId, setHasCopiedId] = useState(false);

  useEffect(() => {
    if (device) {
      setLocalDevice((prev) => {
        if (!prev || prev.id !== device.id) {
          return JSON.parse(JSON.stringify(device)); // deep copy
        }
        if (prev.status !== device.status) {
          return { ...prev, status: device.status };
        }
        return prev;
      });
    } else {
      setLocalDevice(null);
    }
  }, [device]);

  useEffect(() => {
    if (device && localDevice) {
      const isDirty = JSON.stringify(device) !== JSON.stringify(localDevice);
      setEditorDirty(isDirty);
    }
  }, [device, localDevice, setEditorDirty]);

  // Clean up dirty state on unmount
  useEffect(() => {
    return () => setEditorDirty(false);
  }, [setEditorDirty]);

  if (!device || !channel || !localDevice) {
    return null;
  }

  const isModbus = channel.protocol === 'modbus';
  const config = localDevice.config as ModbusDeviceConfig;

  const handleCopyId = () => {
    navigator.clipboard.writeText(localDevice.id);
    setHasCopiedId(true);
    setTimeout(() => setHasCopiedId(false), 2000);
  };

  const handleSave = () => {
    updateDevice(localDevice.id, localDevice);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleToggleEnable = () => {
    const newEnabled = !localDevice.enabled;
    setLocalDevice({ ...localDevice, enabled: newEnabled });
    updateDevice(localDevice.id, { enabled: newEnabled }); // Save immediately
    addSystemLog({
      level: 'info',
      source: 'ui',
      message: `Device '${localDevice.name}' ${newEnabled ? 'enabled' : 'disabled'}`,
    });
  };

  const handleConnect = async (connect: boolean) => {
    try {
      if (connect) {
        updateDevice(localDevice.id, localDevice); // Auto-save device config
        
        // Set connecting status BEFORE initiating the connection
        setLocalDevice(prev => prev ? { ...prev, status: 'connecting' } : prev);
        updateDevicesInChannel(channel.id, { status: 'connecting' });
        updateChannel(channel.id, { status: 'connecting' });
        
        await startChannel(channel.id);
      } else {
        // Set offline status BEFORE initiating disconnect
        setLocalDevice(prev => prev ? { ...prev, status: 'offline' } : prev);
        updateDevicesInChannel(channel.id, { status: 'offline' });
        updateChannel(channel.id, { status: 'offline' });
        
        await stopChannel(channel.id);
      }

      addSystemLog({
        level: connect ? 'info' : 'warn',
        source: 'core',
        message: `Successfully sent ${connect ? 'connect' : 'disconnect'} command for channel '${channel.name}'`,
      });
    } catch (err: any) {
      addSystemLog({
        level: 'error',
        source: 'core',
        message: `Failed to ${connect ? 'connect' : 'disconnect'}: ${err.message || err}`,
      });
    }
  };

  const handleWriteTag = async (tagId: string, valueStr: string, dataType: string) => {
    if (!channel || !device) return;

    let val: TagValue;
    if (dataType === 'float32' || dataType === 'float64') {
      val = { type: 'Float', value: parseFloat(valueStr) };
    } else if (dataType === 'bool') {
      val = {
        type: 'Integer',
        value: valueStr.toLowerCase() === 'true' || valueStr === '1' ? 1 : 0,
      };
    } else {
      val = { type: 'Integer', value: parseInt(valueStr, 10) };
    }

    try {
      await writeTag(channel.id, device.id, tagId, val);
      addSystemLog({
        level: 'info',
        source: 'ui',
        message: `Sent write command to ${tagId}: ${valueStr}`,
      });
    } catch (e) {
      addSystemLog({ level: 'error', source: 'ui', message: `Failed to write tag ${tagId}: ${e}` });
    }
    setEditingTag(null);
  };

  const handleAddTag = () => {
    if (isModbus) {
      const newTag: ModbusTag = {
        id: `tag_${Date.now()}`,
        name: `New Tag`,
        registerType: 'holding',
        address: 40001 + (config.tags?.length || 0),
        dataType: 'uint16',
      };
      setLocalDevice({
        ...localDevice,
        config: {
          ...config,
          tags: [...(config.tags || []), newTag],
        },
      });
    }
  };

  const handleRemoveTag = (tagId: string) => {
    if (isModbus) {
      setLocalDevice({
        ...localDevice,
        config: {
          ...config,
          tags: config.tags.filter((t) => t.id !== tagId),
        },
      });
    }
  };

  const handleUpdateTag = (tagId: string, updates: Partial<ModbusTag>) => {
    if (isModbus) {
      setLocalDevice({
        ...localDevice,
        config: {
          ...config,
          tags: config.tags.map((t) => (t.id === tagId ? { ...t, ...updates } : t)),
        },
      });
    }
  };

  const getOverlappingTags = (tags: ModbusTag[]) => {
    const overlaps = new Set<string>();
    for (let i = 0; i < tags.length; i++) {
      for (let j = i + 1; j < tags.length; j++) {
        const t1 = tags[i];
        const t2 = tags[j];

        if (t1.registerType !== t2.registerType) continue;

        const size1 =
          t1.dataType === 'int32' || t1.dataType === 'uint32' || t1.dataType === 'float32' ? 2 : 1;
        const size2 =
          t2.dataType === 'int32' || t2.dataType === 'uint32' || t2.dataType === 'float32' ? 2 : 1;

        const start1 = t1.address;
        const end1 = t1.address + size1 - 1;
        const start2 = t2.address;
        const end2 = t2.address + size2 - 1;

        if (start1 <= end2 && start2 <= end1) {
          overlaps.add(t1.id);
          overlaps.add(t2.id);
        }
      }
    }
    return overlaps;
  };

  const overlappingTagIds = isModbus ? getOverlappingTags(config.tags || []) : new Set<string>();

  return (
    <div className="w-full h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card/50 backdrop-blur-sm z-10 sticky top-0">
        <div className="flex flex-col min-w-0 flex-1 mr-4">
          <h2 className="text-xs font-semibold tracking-tight text-foreground flex items-center min-w-0">
            <span className="truncate">{localDevice.name}</span>
            <span className="ml-2 flex items-center shrink-0 text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded border border-border/50 font-mono text-[10px]">
              ID: {localDevice.id}
              <button
                onClick={handleCopyId}
                className="ml-1.5 hover:text-foreground transition-colors"
                title="Copy ID"
              >
                {hasCopiedId ? (
                  <Check className="w-2.5 h-2.5 text-emerald-500" />
                ) : (
                  <Copy className="w-2.5 h-2.5" />
                )}
              </button>
            </span>
            <span className="ml-2 px-1.5 py-0.5 shrink-0 text-[10px] bg-secondary text-secondary-foreground rounded font-mono uppercase">
              {channel.protocol}
            </span>
          </h2>
          <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wider font-medium truncate">
            Connected via {channel.name}
          </p>
        </div>
        <div className="flex items-center space-x-2 shrink-0">
          {localDevice.enabled ? (
            <button
              onClick={handleToggleEnable}
              className="flex items-center h-6 px-2.5 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/20 rounded shadow-sm transition-all text-[11px] font-medium"
              title="Device is Enabled. Click to Disable (Stops Polling)"
            >
              <Play className="w-3 h-3 mr-1" />
              Enabled
            </button>
          ) : (
            <button
              onClick={handleToggleEnable}
              className="flex items-center h-6 px-2.5 bg-zinc-500/10 text-zinc-400 hover:bg-zinc-500/20 border border-zinc-500/20 rounded shadow-sm transition-all text-[11px] font-medium"
              title="Device is Disabled. Click to Enable (Starts Polling)"
            >
              <Square className="w-3 h-3 mr-1" />
              Disabled
            </button>
          )}

          <div className="w-px h-4 bg-border mx-1"></div>

          {localDevice.status === 'offline' ? (
            <button
              onClick={() => handleConnect(true)}
              disabled={!localDevice.enabled}
              className={cn(
                'flex items-center h-6 px-2.5 rounded shadow-sm transition-all text-[11px] font-medium border border-transparent',
                !localDevice.enabled
                  ? 'bg-secondary/50 text-secondary-foreground/50 cursor-not-allowed'
                  : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20',
              )}
              title={!localDevice.enabled ? 'Enable device first' : 'Connect (Initialize Port)'}
            >
              <Plug className="w-3 h-3 mr-1.5" />
              Connect
            </button>
          ) : (
            <button
              onClick={() => handleConnect(false)}
              disabled={!localDevice.enabled}
              className={cn(
                'flex items-center h-6 px-2.5 rounded shadow-sm transition-all text-[11px] font-medium',
                !localDevice.enabled
                  ? 'bg-secondary/50 text-secondary-foreground/50 cursor-not-allowed'
                  : 'bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20',
              )}
              title="Disconnect (Close Port)"
            >
              {localDevice.status === 'connecting' || localDevice.status === 'faulted' ? (
                <span className="w-3 h-3 mr-1.5 rounded-full border-2 border-destructive/30 border-t-destructive animate-spin"></span>
              ) : (
                <Unplug className="w-3 h-3 mr-1.5" />
              )}
              {localDevice.status === 'connecting' || localDevice.status === 'faulted'
                ? 'Stop'
                : 'Disconnect'}
            </button>
          )}

          <div className="w-px h-4 bg-border mx-1"></div>

          <button
            onClick={handleSave}
            className={cn(
              'flex items-center h-6 px-2.5 rounded shadow-sm transition-all text-[11px] font-medium relative',
              isSaved
                ? 'bg-emerald-600 text-white'
                : 'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
          >
            {!isSaved && editorIsDirty && (
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-500 border border-background"></span>
              </span>
            )}
            {isSaved ? (
              <>
                <Check className="w-3 h-3 mr-1" />
                Saved!
              </>
            ) : (
              <>
                <Save className="w-3 h-3 mr-1" />
                Save
              </>
            )}
          </button>

          <div className="w-px h-4 bg-border mx-0.5"></div>

          <button
            onClick={() => {
              if (editorIsDirty) {
                useUIStore.getState().setPendingNavigation(() => {
                  setEditorDirty(false);
                  setSelectedDevice(null);
                });
                return;
              }
              setSelectedDevice(null);
            }}
            className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground rounded transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Telemetry Bar */}
      <div className="bg-[#111116] border-b border-border px-3 py-1.5 flex items-center justify-between text-[11px] font-mono text-zinc-400 select-none z-0 relative">
        <div className="flex items-center">
          <span>
            Req: <span className="text-zinc-300">{telemetry?.requests || 0}</span>
          </span>
          <span className="mx-2">·</span>
          <span>
            OK: <span className="text-emerald-400">{telemetry?.ok || 0}</span>
          </span>
          <span className="mx-2">·</span>
          <span>
            Timeouts: <span className="text-red-400">{telemetry?.timeouts || 0}</span>
          </span>
          <span className="mx-2">·</span>
          <span>
            CRC: <span className="text-red-400">{telemetry?.crc_errors || 0}</span>
          </span>
          <span className="mx-2">·</span>
          <span>
            Exceptions: <span className="text-yellow-500">{telemetry?.exceptions || 0}</span>
          </span>
          <span className="mx-2">·</span>
          <span>
            Response:{' '}
            <span className="text-zinc-300">
              {telemetry?.response_time_ms !== undefined
                ? `${telemetry.response_time_ms} ms`
                : '— ms'}
            </span>
          </span>
        </div>
        <button
          onClick={async () => {
            try {
              await resetTelemetry(device.id);
            } catch (e) {
              console.error(e);
            }
          }}
          className="flex items-center text-zinc-500 hover:text-zinc-300 transition-colors bg-zinc-800/50 hover:bg-zinc-700/50 px-2 py-0.5 rounded border border-zinc-700/50 shadow-sm"
          title="Reset Counters"
        >
          <RotateCcw className="w-3 h-3 mr-1" />
          Reset
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* General Settings */}
        <section className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
          <div className="px-3 py-1.5 border-b border-border bg-muted/30">
            <h3 className="text-[11px] font-medium text-foreground uppercase tracking-wider">
              General Configuration
            </h3>
          </div>
          <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="flex items-center text-[11px] font-medium text-muted-foreground mb-1">
                Device Name
                <TooltipInfo
                  className="ml-1.5"
                  content="Maximum length is 64 characters. Use a descriptive name."
                />
              </label>
              <div className="relative">
                <input
                  className="flex h-7 w-full min-w-0 rounded border border-input bg-background px-2 py-1 pr-10 text-[11px] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  maxLength={64}
                  value={localDevice.name}
                  onChange={(e) => setLocalDevice({ ...localDevice, name: e.target.value })}
                />
                <span
                  className={cn(
                    'absolute right-2 top-1/2 -translate-y-1/2 text-[9px] pointer-events-none transition-colors',
                    localDevice.name.length >= 64
                      ? 'text-red-400 font-medium'
                      : 'text-muted-foreground/70',
                  )}
                >
                  {localDevice.name.length}/64
                </span>
              </div>
            </div>

            {isModbus && (
              <>
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                    Slave ID
                  </label>
                  <input
                    type="number"
                    className="flex h-7 w-full min-w-0 rounded border border-input bg-background px-2 py-1 text-[11px] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                    value={config.slaveId || 1}
                    onChange={(e) =>
                      setLocalDevice({
                        ...localDevice,
                        config: { ...config, slaveId: Number(e.target.value) },
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                    Polling Rate (ms)
                  </label>
                  <input
                    type="number"
                    step="100"
                    className="flex h-7 w-full min-w-0 rounded border border-input bg-background px-2 py-1 text-[11px] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                    value={config.pollingRateMs || 1000}
                    onChange={(e) =>
                      setLocalDevice({
                        ...localDevice,
                        config: { ...config, pollingRateMs: Number(e.target.value) },
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                    Timeout (ms)
                  </label>
                  <input
                    type="number"
                    step="100"
                    className="flex h-7 w-full min-w-0 rounded border border-input bg-background px-2 py-1 text-[11px] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                    value={config.timeoutMs || 500}
                    onChange={(e) =>
                      setLocalDevice({
                        ...localDevice,
                        config: { ...config, timeoutMs: Number(e.target.value) },
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                    Byte Order (Endianness)
                  </label>
                  <select
                    className="flex h-7 w-full min-w-0 rounded border border-input bg-background px-2 py-1 text-[11px] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                    value={config.byteOrder || 'ABCD'}
                    onChange={(e) =>
                      setLocalDevice({
                        ...localDevice,
                        config: { ...config, byteOrder: e.target.value as Endianness },
                      })
                    }
                  >
                    <option value="ABCD">Big Endian (ABCD)</option>
                    <option value="DCBA">Little Endian (DCBA)</option>
                    <option value="CDAB">Byte Swap (CDAB)</option>
                    <option value="BADC">Word Swap (BADC)</option>
                  </select>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Tag Mapping */}
        {isModbus && (
          <section className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/30">
              <h3 className="text-[11px] font-medium text-foreground uppercase tracking-wider">
                Data Point Mapping
              </h3>
              <button
                onClick={handleAddTag}
                className="flex items-center h-6 px-2 text-[10px] font-medium border border-border rounded hover:bg-secondary hover:text-foreground transition-colors shadow-sm bg-background"
              >
                <Plus className="w-3 h-3 mr-1" /> Add
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-secondary/20 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider">
                      Register
                    </th>
                    <th className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider">
                      Address
                    </th>
                    <th className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider">
                      Data Type
                    </th>
                    <th className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider">
                      Value
                    </th>
                    <th className="px-3 py-1.5 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(config.tags || []).map((tag) => {
                    const isOverlapping = overlappingTagIds.has(tag.id);
                    return (
                      <tr
                        key={tag.id}
                        className={cn(
                          'hover:bg-secondary/20 transition-colors text-[11px]',
                          isOverlapping ? 'bg-red-500/5' : '',
                        )}
                      >
                        <td className="px-3 py-1">
                          <input
                            className="bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none w-full min-w-0 py-0.5"
                            maxLength={64}
                            value={tag.name}
                            onChange={(e) => handleUpdateTag(tag.id, { name: e.target.value })}
                          />
                        </td>
                        <td className="px-3 py-1">
                          <select
                            className="bg-transparent border-none outline-none w-full min-w-0 text-muted-foreground focus:text-foreground py-0.5 cursor-pointer"
                            value={tag.registerType}
                            onChange={(e) => {
                              const newType = e.target.value as ModbusRegisterType;
                              const isBoolType = newType === 'coil' || newType === 'discrete';

                              // Auto-correct data type if changing between bit/word registers
                              let newDataType = tag.dataType;
                              if (isBoolType && newDataType !== 'bool') {
                                newDataType = 'bool';
                              } else if (!isBoolType && newDataType === 'bool') {
                                newDataType = 'uint16'; // default numeric
                              }

                              handleUpdateTag(tag.id, {
                                registerType: newType,
                                dataType: newDataType,
                              });
                            }}
                          >
                            <option value="coil">Coil (0x)</option>
                            <option value="discrete">Discrete Input (1x)</option>
                            <option value="input">Input Register (3x)</option>
                            <option value="holding">Holding Register (4x)</option>
                          </select>
                        </td>
                        <td className="px-3 py-1 relative">
                          <div className="flex items-center">
                            <input
                              type="number"
                              className={cn(
                                'bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none w-16 min-w-0 font-mono py-0.5',
                                isOverlapping ? 'text-red-400 border-red-500/50' : '',
                              )}
                              value={tag.address}
                              onChange={(e) =>
                                handleUpdateTag(tag.id, { address: Number(e.target.value) })
                              }
                            />
                            {isOverlapping && (
                              <span title="Address overlaps with another tag of the same type">
                                <AlertCircle className="w-3 h-3 text-red-500 ml-1" />
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-1">
                          <select
                            className="bg-transparent border-none outline-none w-full min-w-0 text-muted-foreground focus:text-foreground py-0.5 cursor-pointer"
                            value={tag.dataType}
                            onChange={(e) =>
                              handleUpdateTag(tag.id, { dataType: e.target.value as DataType })
                            }
                          >
                            {tag.registerType === 'coil' || tag.registerType === 'discrete' ? (
                              <option value="bool">Boolean</option>
                            ) : (
                              <>
                                <option value="int16">Int16</option>
                                <option value="uint16">UInt16</option>
                                <option value="int32">Int32</option>
                                <option value="uint32">UInt32</option>
                                <option value="float32">Float32</option>
                              </>
                            )}
                          </select>
                        </td>
                        <td className="px-3 py-1 font-mono text-emerald-400">
                          {editingTag === tag.id ? (
                            <input
                              type="text"
                              autoFocus
                              className="bg-background border border-primary outline-none w-full text-foreground px-1 py-0.5 rounded shadow-sm focus:ring-1 focus:ring-primary h-5 text-[11px]"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter')
                                  handleWriteTag(tag.id, editValue, tag.dataType);
                                if (e.key === 'Escape') setEditingTag(null);
                              }}
                              onBlur={() => setEditingTag(null)}
                            />
                          ) : (
                            <span
                              className={cn(
                                'py-0.5 block',
                                (tag.registerType === 'holding' || tag.registerType === 'coil') &&
                                  'cursor-pointer hover:underline underline-offset-2 decoration-primary/50 transition-all',
                              )}
                              title={
                                tag.registerType === 'holding' || tag.registerType === 'coil'
                                  ? 'Click to write value'
                                  : ''
                              }
                              onClick={() => {
                                if (tag.registerType === 'holding' || tag.registerType === 'coil') {
                                  setEditingTag(tag.id);
                                  setEditValue(
                                    tagsData[tag.id] ? String(tagsData[tag.id].value.value) : '',
                                  );
                                }
                              }}
                            >
                              {tagsData[tag.id] ? String(tagsData[tag.id].value.value) : '—'}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1 text-right">
                          <button
                            onClick={() => handleRemoveTag(tag.id)}
                            className="p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded transition-colors"
                            title="Remove Tag"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {(!config.tags || config.tags.length === 0) && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-8 text-center text-muted-foreground italic text-[11px]"
                      >
                        No data points defined. Click "Add" to map registers.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
