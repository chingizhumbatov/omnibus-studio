import { useState, useEffect } from "react";
import { useUIStore } from "@/store/uiStore";
import { useLogStore } from "@/store/logStore";
import { ChannelNode, SerialTransportConfig, TcpTransportConfig } from "@/core/contracts/devices";
import { Save, Plug, Unplug, Settings2, Check, RotateCcw } from "lucide-react";
import { startChannel, stopChannel } from "@/core/ipc/bridge";
import { useDataStore } from "@/store/dataStore";
import { resetTelemetry } from "@/core/api";

export function ChannelEditor() {
  const { selectedChannelId, channels, updateChannel, updateDevicesInChannel, devices } = useUIStore();
  const { addSystemLog } = useLogStore();
  const channel = channels.find(c => c.id === selectedChannelId);
  
  const telemetryData = useDataStore(state => state.telemetry);
  
  const [localChannel, setLocalChannel] = useState<ChannelNode | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (channel) {
      setLocalChannel(JSON.parse(JSON.stringify(channel)));
    } else {
      setLocalChannel(null);
    }
  }, [channel]);

  if (!channel || !localChannel) return null;

  const handleSave = () => {
    updateChannel(localChannel.id, localChannel);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleConnect = async (connect: boolean) => {
    try {
      if (connect) {
        await startChannel(channel.id);
        setLocalChannel({ ...localChannel, status: "ok" });
        updateChannel(localChannel.id, { status: "ok" });
        updateDevicesInChannel(localChannel.id, { status: "ok" });
      } else {
        await stopChannel(channel.id);
        setLocalChannel({ ...localChannel, status: "offline" });
        updateChannel(localChannel.id, { status: "offline" });
        updateDevicesInChannel(localChannel.id, { status: "offline" });
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

  const isConnected = channel.status === "ok" || channel.status === "timeout";
  const isSerial = localChannel.transport === "serial";
  const isTcp = localChannel.transport === "tcp";

  // Aggregate telemetry for all devices in this channel
  const channelDevices = devices.filter(d => d.channelId === selectedChannelId);
  const aggTelemetry = channelDevices.reduce((acc, dev) => {
    const t = telemetryData[dev.id];
    if (t) {
      acc.requests += t.requests || 0;
      acc.ok += t.ok || 0;
      acc.timeouts += t.timeouts || 0;
      acc.crc_errors += t.crc_errors || 0;
      acc.exceptions += t.exceptions || 0;
      // Just take the max response time
      if (t.response_time_ms !== undefined && t.response_time_ms > acc.response_time_ms) {
        acc.response_time_ms = t.response_time_ms;
      }
    }
    return acc;
  }, { requests: 0, ok: 0, timeouts: 0, crc_errors: 0, exceptions: 0, response_time_ms: 0 });

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden relative">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/50 backdrop-blur-sm z-10 sticky top-0">
        <div className="flex flex-col">
          <h2 className="text-xl font-semibold tracking-tight text-foreground flex items-center">
            <Settings2 className="w-5 h-5 mr-3 text-primary" />
            {localChannel.name}
          </h2>
          <span className="text-xs text-muted-foreground mt-1 tracking-wider uppercase font-medium">
            Channel • {localChannel.protocol.toUpperCase()} • {localChannel.transport.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center space-x-3">
          {isConnected ? (
            <button
              onClick={() => handleConnect(false)}
              className="flex items-center px-4 py-2 bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 rounded-md shadow-sm transition-all text-sm font-medium"
            >
              <Unplug className="w-4 h-4 mr-2" />
              Disconnect
            </button>
          ) : (
            <button
              onClick={() => handleConnect(true)}
              className="flex items-center px-4 py-2 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-md shadow-sm transition-all text-sm font-medium"
            >
              <Plug className="w-4 h-4 mr-2" />
              Connect
            </button>
          )}

          <button
            onClick={handleSave}
            className={`flex items-center px-4 py-2 rounded-md shadow-md transition-all text-sm font-medium ${
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
        </div>
      </div>

      {/* Telemetry Bar */}
      <div className="bg-[#111116] border-b border-border px-6 py-1.5 flex items-center justify-between text-[11px] font-mono text-zinc-400 select-none z-0 relative">
        <div className="flex items-center">
          <span>Requests: <span className="text-zinc-300">{aggTelemetry.requests}</span></span>
          <span className="mx-2">·</span>
          <span>OK: <span className="text-emerald-400">{aggTelemetry.ok}</span></span>
          <span className="mx-2">·</span>
          <span>Timeouts: <span className="text-red-400">{aggTelemetry.timeouts}</span></span>
          <span className="mx-2">·</span>
          <span>CRC errors: <span className="text-red-400">{aggTelemetry.crc_errors}</span></span>
          <span className="mx-2">·</span>
          <span>Exceptions: <span className="text-yellow-500">{aggTelemetry.exceptions}</span></span>
          <span className="mx-2">·</span>
          <span>Max Response: <span className="text-zinc-300">{aggTelemetry.requests > 0 ? `${aggTelemetry.response_time_ms} ms` : "— ms"}</span></span>
        </div>
        <button 
          onClick={async () => {
            try {
              for (const dev of channelDevices) {
                await resetTelemetry(dev.id);
              }
            } catch (e) {
              console.error(e);
            }
          }}
          className="flex items-center text-zinc-500 hover:text-zinc-300 transition-colors bg-zinc-800/50 hover:bg-zinc-700/50 px-2 py-0.5 rounded border border-zinc-700/50"
          title="Reset Counters for all devices in this channel"
        >
          <RotateCcw className="w-3 h-3 mr-1" />
          Reset All
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-muted/20">
            <h3 className="font-medium text-foreground">General Configuration</h3>
          </div>
          <div className="p-6 grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Channel Name</label>
              <input
                type="text"
                value={localChannel.name}
                onChange={(e) => setLocalChannel({ ...localChannel, name: e.target.value })}
                className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
              />
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-muted/20">
            <h3 className="font-medium text-foreground">Transport Configuration ({localChannel.transport.toUpperCase()})</h3>
          </div>
          <div className="p-6 grid grid-cols-2 gap-6">
            
            {isTcp && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">IP Address</label>
                  <input
                    type="text"
                    value={(localChannel.transportConfig as TcpTransportConfig)?.ipAddress || "127.0.0.1"}
                    onChange={(e) => {
                      const cfg = (localChannel.transportConfig || {}) as TcpTransportConfig;
                      setLocalChannel({
                        ...localChannel,
                        transportConfig: { ...cfg, ipAddress: e.target.value }
                      });
                    }}
                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono"
                    placeholder="127.0.0.1"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">TCP Port</label>
                  <input
                    type="number"
                    value={(localChannel.transportConfig as TcpTransportConfig)?.tcpPort || 502}
                    onChange={(e) => {
                      const cfg = (localChannel.transportConfig || {}) as TcpTransportConfig;
                      setLocalChannel({
                        ...localChannel,
                        transportConfig: { ...cfg, tcpPort: parseInt(e.target.value) || 502 }
                      });
                    }}
                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Response Timeout (ms)</label>
                  <input
                    type="number"
                    value={(localChannel.transportConfig as TcpTransportConfig)?.responseTimeoutMs ?? 500}
                    onChange={(e) => {
                      const cfg = (localChannel.transportConfig || {}) as TcpTransportConfig;
                      setLocalChannel({
                        ...localChannel,
                        transportConfig: { ...cfg, responseTimeoutMs: parseInt(e.target.value) || 500 }
                      });
                    }}
                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono"
                  />
                </div>
              </>
            )}

            {isSerial && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Baud Rate</label>
                  <select
                    value={(localChannel.transportConfig as SerialTransportConfig)?.baudRate || 9600}
                    onChange={(e) => {
                      const cfg = (localChannel.transportConfig || {}) as SerialTransportConfig;
                      setLocalChannel({
                        ...localChannel,
                        transportConfig: { ...cfg, baudRate: parseInt(e.target.value) || 9600 }
                      });
                    }}
                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                  >
                    <option value={9600}>9600</option>
                    <option value={19200}>19200</option>
                    <option value={38400}>38400</option>
                    <option value={57600}>57600</option>
                    <option value={115200}>115200</option>
                  </select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Data Bits</label>
                  <select
                    value={(localChannel.transportConfig as SerialTransportConfig)?.dataBits || 8}
                    onChange={(e) => {
                      const cfg = (localChannel.transportConfig || {}) as SerialTransportConfig;
                      setLocalChannel({
                        ...localChannel,
                        transportConfig: { ...cfg, dataBits: parseInt(e.target.value) || 8 }
                      });
                    }}
                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                  >
                    <option value={7}>7</option>
                    <option value={8}>8</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Stop Bits</label>
                  <select
                    value={(localChannel.transportConfig as SerialTransportConfig)?.stopBits || 1}
                    onChange={(e) => {
                      const cfg = (localChannel.transportConfig || {}) as SerialTransportConfig;
                      setLocalChannel({
                        ...localChannel,
                        transportConfig: { ...cfg, stopBits: parseInt(e.target.value) || 1 }
                      });
                    }}
                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                  >
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Parity</label>
                  <select
                    value={(localChannel.transportConfig as SerialTransportConfig)?.parity || "none"}
                    onChange={(e) => {
                      const cfg = (localChannel.transportConfig || {}) as SerialTransportConfig;
                      setLocalChannel({
                        ...localChannel,
                        transportConfig: { ...cfg, parity: e.target.value as any }
                      });
                    }}
                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                  >
                    <option value="none">None</option>
                    <option value="even">Even</option>
                    <option value="odd">Odd</option>
                  </select>
                </div>
              </>
            )}

            {!isTcp && !isSerial && (
              <div className="col-span-2 text-center py-8 text-muted-foreground italic text-sm">
                No transport configuration needed for {localChannel.transport} transport.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
