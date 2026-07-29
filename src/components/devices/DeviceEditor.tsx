import { useUIStore } from "@/store/uiStore";
import { useLogStore } from "@/store/logStore";
import { useDataStore } from "@/store/dataStore";
import { startChannel, stopChannel } from "@/core/ipc/bridge";
import { X, Save, Plus, Trash2, AlertCircle, Play, Square, Plug, Unplug, RotateCcw, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { ModbusDeviceConfig, ModbusTag, DeviceNode, Endianness, ModbusRegisterType, DataType } from "@/core/contracts/devices";
import { writeTag, resetTelemetry } from "@/core/api";
import { TagValue } from "@/core/contracts";

export function DeviceEditor() {
  const { selectedDeviceId, setSelectedDevice, devices, channels, updateDevice } = useUIStore();
  const { addSystemLog } = useLogStore();
  const tagsData = useDataStore(state => state.tags);
  
  const device = devices.find(d => d.id === selectedDeviceId);
  const channel = channels.find(c => c.id === device?.channelId);
  const telemetry = useDataStore(state => selectedDeviceId ? state.telemetry[selectedDeviceId] : undefined);
  
  // Local state for edits
  const [localDevice, setLocalDevice] = useState<DeviceNode | null>(null);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (device) {
      setLocalDevice(JSON.parse(JSON.stringify(device))); // deep copy
    } else {
      setLocalDevice(null);
    }
  }, [device]);

  if (!device || !channel || !localDevice) {
    return null;
  }

  const isModbus = channel.protocol === "modbus";
  const config = localDevice.config as ModbusDeviceConfig;

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
      level: "info",
      source: "ui",
      message: `Device '${localDevice.name}' ${newEnabled ? "enabled" : "disabled"}`,
    });
  };

  const handleConnect = async (connect: boolean) => {
    try {
      if (connect) {
        await startChannel(channel.id);
        // We optimistically set it to connected for now.
        // In a complete implementation, we'd listen to Tauri events for the actual status.
        setLocalDevice({ ...localDevice, status: "ok" });
        updateDevice(localDevice.id, { status: "ok" });
      } else {
        await stopChannel(channel.id);
        setLocalDevice({ ...localDevice, status: "offline" });
        updateDevice(localDevice.id, { status: "offline" });
      }
      
      addSystemLog({
        level: connect ? "info" : "warn",
        source: "core",
        message: `Successfully sent ${connect ? "connect" : "disconnect"} command for channel '${channel.name}'`,
      });
    } catch (err: any) {
      addSystemLog({
        level: "error",
        source: "core",
        message: `Failed to ${connect ? "connect" : "disconnect"}: ${err.message || err}`,
      });
    }
  };

  const handleWriteTag = async (tagId: string, valueStr: string, dataType: string) => {
    if (!channel || !device) return;

    let val: TagValue;
    if (dataType === "float32" || dataType === "float64") {
      val = { type: "Float", value: parseFloat(valueStr) };
    } else if (dataType === "bool") {
      val = { type: "Integer", value: valueStr.toLowerCase() === "true" || valueStr === "1" ? 1 : 0 };
    } else {
      val = { type: "Integer", value: parseInt(valueStr, 10) };
    }

    try {
      await writeTag(channel.id, device.id, tagId, val);
      addSystemLog({ level: "info", source: "ui", message: `Sent write command to ${tagId}: ${valueStr}` });
    } catch (e) {
      addSystemLog({ level: "error", source: "ui", message: `Failed to write tag ${tagId}: ${e}` });
    }
    setEditingTag(null);
  };

  const handleAddTag = () => {
    if (isModbus) {
      const newTag: ModbusTag = {
        id: `tag_${Date.now()}`,
        name: `New Tag`,
        registerType: "holding",
        address: 40001 + (config.tags?.length || 0),
        dataType: "uint16"
      };
      setLocalDevice({
        ...localDevice,
        config: {
          ...config,
          tags: [...(config.tags || []), newTag]
        }
      });
    }
  };

  const handleRemoveTag = (tagId: string) => {
    if (isModbus) {
      setLocalDevice({
        ...localDevice,
        config: {
          ...config,
          tags: config.tags.filter(t => t.id !== tagId)
        }
      });
    }
  };

  const handleUpdateTag = (tagId: string, updates: Partial<ModbusTag>) => {
    if (isModbus) {
      setLocalDevice({
        ...localDevice,
        config: {
          ...config,
          tags: config.tags.map(t => t.id === tagId ? { ...t, ...updates } : t)
        }
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

        const size1 = (t1.dataType === "int32" || t1.dataType === "uint32" || t1.dataType === "float32") ? 2 : 1;
        const size2 = (t2.dataType === "int32" || t2.dataType === "uint32" || t2.dataType === "float32") ? 2 : 1;

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
      <div className="flex items-center justify-between border-b border-border p-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center">
            {localDevice.name}
            <span className="ml-3 px-2 py-0.5 text-xs bg-secondary text-secondary-foreground rounded-md font-mono uppercase">
              {channel.protocol}
            </span>
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Connected via {channel.name}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {localDevice.enabled ? (
            <button 
              onClick={handleToggleEnable}
              className="flex items-center px-3 py-1.5 bg-emerald-500/10 text-emerald-400 text-sm font-medium rounded-md hover:bg-emerald-500/20 transition-colors"
              title="Device is Enabled. Click to Disable (Stops Polling)"
            >
              <Play className="w-4 h-4 mr-2" />
              Enabled
            </button>
          ) : (
            <button 
              onClick={handleToggleEnable}
              className="flex items-center px-3 py-1.5 bg-zinc-500/10 text-zinc-400 text-sm font-medium rounded-md hover:bg-zinc-500/20 transition-colors"
              title="Device is Disabled. Click to Enable (Starts Polling)"
            >
              <Square className="w-4 h-4 mr-2" />
              Disabled
            </button>
          )}

          <div className="w-px h-6 bg-border mx-2"></div>

          {localDevice.status === "offline" ? (
            <button 
              onClick={() => handleConnect(true)}
              disabled={!localDevice.enabled}
              className={cn(
                "flex items-center px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                !localDevice.enabled ? "bg-secondary/50 text-secondary-foreground/50 cursor-not-allowed" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              )}
              title={!localDevice.enabled ? "Enable device first" : "Connect (Initialize Port)"}
            >
              <Plug className="w-4 h-4 mr-2" />
              Connect
            </button>
          ) : (
            <button 
              onClick={() => handleConnect(false)}
              disabled={!localDevice.enabled}
              className={cn(
                "flex items-center px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                !localDevice.enabled ? "bg-secondary/50 text-secondary-foreground/50 cursor-not-allowed" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              )}
              title="Disconnect (Close Port)"
            >
              <Unplug className="w-4 h-4 mr-2" />
              Disconnect
            </button>
          )}

          <div className="w-px h-6 bg-border mx-2"></div>

          <button 
            onClick={handleSave}
            className={`flex items-center px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${
              isSaved
                ? "bg-emerald-600 text-white"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            {isSaved ? (
              <><Check className="w-4 h-4 mr-2" />Saved!</>
            ) : (
              <><Save className="w-4 h-4 mr-2" />Save Changes</>
            )}
          </button>
          <button 
            onClick={() => setSelectedDevice(null)}
            className="p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground rounded-md transition-colors ml-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      
      {/* Telemetry Bar */}
      <div className="bg-[#111116] border-b border-border px-4 py-1.5 flex items-center justify-between text-[11px] font-mono text-zinc-400 select-none">
        <div className="flex items-center">
          <span>Requests: <span className="text-zinc-300">{telemetry?.requests || 0}</span></span>
          <span className="mx-2">·</span>
          <span>OK: <span className="text-emerald-400">{telemetry?.ok || 0}</span></span>
          <span className="mx-2">·</span>
          <span>Timeouts: <span className="text-red-400">{telemetry?.timeouts || 0}</span></span>
          <span className="mx-2">·</span>
          <span>CRC errors: <span className="text-red-400">{telemetry?.crc_errors || 0}</span></span>
          <span className="mx-2">·</span>
          <span>Exceptions: <span className="text-yellow-500">{telemetry?.exceptions || 0}</span></span>
          <span className="mx-2">·</span>
          <span>Response: <span className="text-zinc-300">{telemetry?.response_time_ms !== undefined ? `${telemetry.response_time_ms} ms` : "— ms"}</span></span>
        </div>
        <button 
          onClick={async () => {
            try {
              await resetTelemetry(device.id);
            } catch (e) {
              console.error(e);
            }
          }}
          className="flex items-center text-zinc-500 hover:text-zinc-300 transition-colors bg-zinc-800/50 hover:bg-zinc-700/50 px-2 py-0.5 rounded border border-zinc-700/50"
          title="Reset Counters"
        >
          <RotateCcw className="w-3 h-3 mr-1" />
          Reset
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        
        {/* General Settings */}
        <section>
          <h3 className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-wider">General Configuration</h3>
          <div className="grid grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Device Name</label>
              <input 
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                value={localDevice.name}
                onChange={e => setLocalDevice({ ...localDevice, name: e.target.value })}
              />
            </div>
            
            {isModbus && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Slave ID</label>
                  <input 
                    type="number"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                    value={config.slaveId || 1}
                    onChange={e => setLocalDevice({ ...localDevice, config: { ...config, slaveId: Number(e.target.value) }})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Polling Rate (ms)</label>
                  <input 
                    type="number"
                    step="100"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                    value={config.pollingRateMs || 1000}
                    onChange={e => setLocalDevice({ ...localDevice, config: { ...config, pollingRateMs: Number(e.target.value) }})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Timeout (ms)</label>
                  <input 
                    type="number"
                    step="100"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                    value={config.timeoutMs || 500}
                    onChange={e => setLocalDevice({ ...localDevice, config: { ...config, timeoutMs: Number(e.target.value) }})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Byte Order (Endianness)</label>
                  <select 
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                    value={config.byteOrder || "ABCD"}
                    onChange={e => setLocalDevice({ ...localDevice, config: { ...config, byteOrder: e.target.value as Endianness }})}
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
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Tag Mapping (Registers)</h3>
              <button 
                onClick={handleAddTag}
                className="flex items-center px-2 py-1 text-xs font-medium border border-border rounded-md hover:bg-secondary transition-colors"
              >
                <Plus className="w-3 h-3 mr-1" /> Add Tag
              </button>
            </div>
            
            <div className="border border-border rounded-md overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Tag Name</th>
                    <th className="px-4 py-2 font-medium">Register Type</th>
                    <th className="px-4 py-2 font-medium">Address</th>
                    <th className="px-4 py-2 font-medium">Data Type</th>
                    <th className="px-4 py-2 font-medium">Value</th>
                    <th className="px-4 py-2 font-medium w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(config.tags || []).map(tag => {
                    const isOverlapping = overlappingTagIds.has(tag.id);
                    return (
                    <tr key={tag.id} className={cn("hover:bg-secondary/20", isOverlapping ? "bg-red-500/10" : "")}>
                      <td className="px-4 py-2">
                        <input 
                          className="bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none w-full"
                          value={tag.name}
                          onChange={e => handleUpdateTag(tag.id, { name: e.target.value })}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <select 
                          className="bg-transparent border-none outline-none w-full text-muted-foreground focus:text-foreground"
                          value={tag.registerType}
                          onChange={e => {
                            const newType = e.target.value as ModbusRegisterType;
                            const isBoolType = newType === "coil" || newType === "discrete";
                            
                            // Auto-correct data type if changing between bit/word registers
                            let newDataType = tag.dataType;
                            if (isBoolType && newDataType !== "bool") {
                              newDataType = "bool";
                            } else if (!isBoolType && newDataType === "bool") {
                              newDataType = "uint16"; // default numeric
                            }

                            handleUpdateTag(tag.id, { 
                              registerType: newType,
                              dataType: newDataType
                            });
                          }}
                        >
                          <option value="coil">Coil (0x)</option>
                          <option value="discrete">Discrete Input (1x)</option>
                          <option value="input">Input Register (3x)</option>
                          <option value="holding">Holding Register (4x)</option>
                        </select>
                      </td>
                      <td className="px-4 py-2 relative">
                        <div className="flex items-center">
                          <input 
                            type="number"
                            className={cn("bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none w-24 font-mono", isOverlapping ? "text-red-400 border-red-500/50" : "")}
                            value={tag.address}
                            onChange={e => handleUpdateTag(tag.id, { address: Number(e.target.value) })}
                          />
                          {isOverlapping && (
                            <span title="Address overlaps with another tag of the same type">
                              <AlertCircle className="w-4 h-4 text-red-500 ml-2" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <select 
                          className="bg-transparent border-none outline-none w-full text-muted-foreground focus:text-foreground"
                          value={tag.dataType}
                          onChange={e => handleUpdateTag(tag.id, { dataType: e.target.value as DataType })}
                        >
                          { (tag.registerType === "coil" || tag.registerType === "discrete") ? (
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
                      <td className="px-4 py-2 font-mono text-emerald-400">
                        {editingTag === tag.id ? (
                          <input
                            type="text"
                            autoFocus
                            className="bg-background border border-primary/50 outline-none w-full text-foreground px-1 py-0.5 rounded"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleWriteTag(tag.id, editValue, tag.dataType);
                              if (e.key === "Escape") setEditingTag(null);
                            }}
                            onBlur={() => setEditingTag(null)}
                          />
                        ) : (
                          <span 
                            className={cn((tag.registerType === "holding" || tag.registerType === "coil") && "cursor-pointer hover:underline underline-offset-4 decoration-primary/50")}
                            title={(tag.registerType === "holding" || tag.registerType === "coil") ? "Click to write value" : ""}
                            onClick={() => {
                              if (tag.registerType === "holding" || tag.registerType === "coil") {
                                setEditingTag(tag.id);
                                setEditValue(tagsData[tag.id] ? String(tagsData[tag.id].value.value) : "");
                              }
                            }}
                          >
                            {tagsData[tag.id] ? String(tagsData[tag.id].value.value) : "—"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button 
                          onClick={() => handleRemoveTag(tag.id)}
                          className="text-muted-foreground hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )})}
                  {(!config.tags || config.tags.length === 0) && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground italic">
                        No tags defined. Click "Add Tag" to map registers.
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
