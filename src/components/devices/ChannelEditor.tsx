import { useState, useEffect } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useLogStore } from '@/store/logStore';
import { TooltipInfo } from '@/components/ui/TooltipInfo';
import { ChannelNode, SerialTransportConfig, TcpTransportConfig } from '@/core/contracts/devices';
import { Save, Plug, Unplug, Settings2, Check, RotateCcw, Copy, Info } from 'lucide-react';
import { startChannel, stopChannel } from '@/core/ipc/bridge';
import { useDataStore } from '@/store/dataStore';
import { resetTelemetry } from '@/core/api';
import { cn } from '@/lib/utils';

export function ChannelEditor() {
  const {
    selectedChannelId,
    channels,
    updateChannel,
    updateDevicesInChannel,
    devices,
    editorIsDirty,
    setEditorDirty,
  } = useUIStore();
  const { addSystemLog } = useLogStore();
  const channel = channels.find((c) => c.id === selectedChannelId);

  const telemetryData = useDataStore((state) => state.telemetry);

  const [localChannel, setLocalChannel] = useState<ChannelNode | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [hasCopiedId, setHasCopiedId] = useState(false);

  const handleCopyId = () => {
    if (!localChannel) return;
    navigator.clipboard.writeText(localChannel.id);
    setHasCopiedId(true);
    setTimeout(() => setHasCopiedId(false), 2000);
  };

  useEffect(() => {
    if (channel) {
      setLocalChannel((prev) => {
        if (!prev || prev.id !== channel.id) {
          return JSON.parse(JSON.stringify(channel));
        }
        if (prev.status !== channel.status) {
          return { ...prev, status: channel.status };
        }
        return prev;
      });
    } else {
      setLocalChannel(null);
    }
  }, [channel]);

  useEffect(() => {
    if (channel && localChannel) {
      const isDirty = JSON.stringify(channel) !== JSON.stringify(localChannel);
      setEditorDirty(isDirty);
    }
  }, [channel, localChannel, setEditorDirty]);

  // Clean up dirty state on unmount
  useEffect(() => {
    return () => setEditorDirty(false);
  }, [setEditorDirty]);

  if (!channel || !localChannel) return null;

  const handleSave = () => {
    updateChannel(localChannel.id, localChannel);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleConnect = async (connect: boolean) => {
    try {
      if (connect) {
        // Auto-save to ensure backend uses the latest typed configuration (e.g. IP address)
        updateChannel(localChannel.id, localChannel);
        
        // Set connecting status BEFORE initiating the connection to prevent overriding the backend's response in case it connects instantly
        setLocalChannel(prev => prev ? { ...prev, status: 'connecting' } : prev);
        updateChannel(localChannel.id, { status: 'connecting' });
        updateDevicesInChannel(localChannel.id, { status: 'connecting' });
        
        await startChannel(channel.id);
      } else {
        // Set offline status BEFORE initiating disconnect
        setLocalChannel(prev => prev ? { ...prev, status: 'offline' } : prev);
        updateChannel(localChannel.id, { status: 'offline' });
        updateDevicesInChannel(localChannel.id, { status: 'offline' });
        
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

  const isRunning = channel.status !== 'offline';
  const isConnecting = channel.status === 'connecting';
  const isFaulted = channel.status === 'faulted';
  const isSerial = localChannel.transport === 'serial';
  const isTcp = localChannel.transport === 'tcp';

  // Aggregate telemetry for all devices in this channel
  const channelDevices = devices.filter((d) => d.channelId === selectedChannelId);
  const aggTelemetry = channelDevices.reduce(
    (acc, dev) => {
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
    },
    { requests: 0, ok: 0, timeouts: 0, crc_errors: 0, exceptions: 0, response_time_ms: 0 },
  );

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden relative w-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card/50 backdrop-blur-sm z-10 sticky top-0">
        <div className="flex flex-col min-w-0 flex-1 mr-4">
          <h2 className="text-xs font-semibold tracking-tight text-foreground flex items-center min-w-0">
            <Settings2 className="w-3.5 h-3.5 mr-1.5 text-primary shrink-0" />
            <span className="truncate">{localChannel.name}</span>
            <span className="ml-2 flex items-center shrink-0 text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded border border-border/50 font-mono text-[10px]">
              ID: {localChannel.id}
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
          </h2>
          <span className="text-[10px] text-muted-foreground mt-0.5 tracking-wider uppercase font-medium truncate">
            Channel • {localChannel.protocol.toUpperCase()} • {localChannel.transport.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center space-x-3 shrink-0">
          <label
            className="flex items-center space-x-1.5 cursor-pointer group"
            title="Automatically connect this channel when the application starts"
          >
            <input
              type="checkbox"
              className="w-3.5 h-3.5 rounded-sm border-input bg-background text-primary focus:ring-1 focus:ring-primary focus:ring-offset-0 cursor-pointer accent-primary"
              checked={!!localChannel.autoConnect}
              onChange={(e) => {
                const newVal = e.target.checked;
                setLocalChannel({ ...localChannel, autoConnect: newVal });
                updateChannel(localChannel.id, { autoConnect: newVal });
              }}
            />
            <span className="text-[10px] font-medium text-muted-foreground group-hover:text-foreground transition-colors uppercase tracking-wider">
              Auto-Connect
            </span>
          </label>

          <div className="w-px h-4 bg-border"></div>

          {isRunning ? (
            <button
              onClick={() => handleConnect(false)}
              className="flex items-center h-6 px-2.5 bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 rounded shadow-sm transition-all text-[11px] font-medium"
            >
              {isConnecting ? (
                <span className="w-3 h-3 mr-1.5 rounded-full border-2 border-destructive/30 border-t-destructive animate-spin"></span>
              ) : (
                <Unplug className="w-3 h-3 mr-1.5" />
              )}
              {isConnecting ? 'Stop' : isFaulted ? 'Stop (Faulted)' : 'Disconnect'}
            </button>
          ) : (
            <button
              onClick={() => handleConnect(true)}
              className="flex items-center h-6 px-2.5 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/20 rounded shadow-sm transition-all text-[11px] font-medium"
            >
              <Plug className="w-3 h-3 mr-1.5" />
              Connect
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
        </div>
      </div>

      {/* Telemetry Bar */}
      <div className="bg-[#111116] border-b border-border px-3 py-1.5 flex items-center justify-between text-[11px] font-mono text-zinc-400 select-none z-0 relative">
        <div className="flex items-center">
          <span>
            Req: <span className="text-zinc-300">{aggTelemetry.requests}</span>
          </span>
          <span className="mx-2">·</span>
          <span>
            OK: <span className="text-emerald-400">{aggTelemetry.ok}</span>
          </span>
          <span className="mx-2">·</span>
          <span>
            Timeouts: <span className="text-red-400">{aggTelemetry.timeouts}</span>
          </span>
          <span className="mx-2">·</span>
          <span>
            CRC: <span className="text-red-400">{aggTelemetry.crc_errors}</span>
          </span>
          <span className="mx-2">·</span>
          <span>
            Exceptions: <span className="text-yellow-500">{aggTelemetry.exceptions}</span>
          </span>
          <span className="mx-2">·</span>
          <span>
            Max:{' '}
            <span className="text-zinc-300">
              {aggTelemetry.requests > 0 ? `${aggTelemetry.response_time_ms}ms` : '—'}
            </span>
          </span>
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
          Reset
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-4">
        {/* General Configuration */}
        <section className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
          <div className="px-3 py-1.5 border-b border-border bg-muted/30">
            <h3 className="text-[11px] font-medium text-foreground uppercase tracking-wider">
              General Configuration
            </h3>
          </div>
          <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="flex items-center text-[11px] font-medium text-muted-foreground mb-1">
                Channel Name
                <TooltipInfo
                  className="ml-1.5"
                  content="Maximum length is 64 characters. Use a descriptive name."
                />
              </label>
              <div className="relative">
                <input
                  type="text"
                  maxLength={64}
                  value={localChannel.name}
                  onChange={(e) => setLocalChannel({ ...localChannel, name: e.target.value })}
                  className="flex h-7 w-full min-w-0 rounded border border-input bg-background px-2 py-1 pr-10 text-[11px] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                />
                <span
                  className={cn(
                    'absolute right-2 top-1/2 -translate-y-1/2 text-[9px] pointer-events-none transition-colors',
                    localChannel.name.length >= 64
                      ? 'text-red-400 font-medium'
                      : 'text-muted-foreground/70',
                  )}
                >
                  {localChannel.name.length}/64
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Transport Configuration */}
        <section className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
          <div className="px-3 py-1.5 border-b border-border bg-muted/30">
            <h3 className="text-[11px] font-medium text-foreground uppercase tracking-wider">
              Transport Configuration ({localChannel.transport})
            </h3>
          </div>
          <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            {isTcp && (
              <>
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                    IP Address
                  </label>
                  <input
                    type="text"
                    value={
                      (localChannel.transportConfig as TcpTransportConfig)?.ipAddress || '127.0.0.1'
                    }
                    onChange={(e) => {
                      const cfg = (localChannel.transportConfig || {}) as TcpTransportConfig;
                      setLocalChannel({
                        ...localChannel,
                        transportConfig: { ...cfg, ipAddress: e.target.value },
                      });
                    }}
                    className="flex h-7 w-full min-w-0 rounded border border-input bg-background px-2 py-1 text-[11px] font-mono shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                    placeholder="127.0.0.1"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                    TCP Port
                  </label>
                  <input
                    type="number"
                    value={(localChannel.transportConfig as TcpTransportConfig)?.tcpPort || 502}
                    onChange={(e) => {
                      const cfg = (localChannel.transportConfig || {}) as TcpTransportConfig;
                      setLocalChannel({
                        ...localChannel,
                        transportConfig: { ...cfg, tcpPort: parseInt(e.target.value) || 502 },
                      });
                    }}
                    className="flex h-7 w-full min-w-0 rounded border border-input bg-background px-2 py-1 text-[11px] font-mono shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                    Response Timeout (ms)
                  </label>
                  <input
                    type="number"
                    value={
                      (localChannel.transportConfig as TcpTransportConfig)?.responseTimeoutMs ?? 500
                    }
                    onChange={(e) => {
                      const cfg = (localChannel.transportConfig || {}) as TcpTransportConfig;
                      setLocalChannel({
                        ...localChannel,
                        transportConfig: {
                          ...cfg,
                          responseTimeoutMs: parseInt(e.target.value) || 500,
                        },
                      });
                    }}
                    className="flex h-7 w-full min-w-0 rounded border border-input bg-background px-2 py-1 text-[11px] font-mono shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  />
                </div>
              </>
            )}

            {isSerial && (
              <>
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                    COM Port
                  </label>
                  <input
                    type="text"
                    value={(localChannel.transportConfig as SerialTransportConfig)?.portName || ''}
                    onChange={(e) => {
                      const cfg = (localChannel.transportConfig || {}) as SerialTransportConfig;
                      setLocalChannel({
                        ...localChannel,
                        transportConfig: { ...cfg, portName: e.target.value },
                      });
                    }}
                    placeholder="e.g. COM1 or /dev/ttyUSB0"
                    className="flex h-7 w-full min-w-0 rounded border border-input bg-background px-2 py-1 text-[11px] font-mono shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                    Baud Rate
                  </label>
                  <select
                    value={
                      (localChannel.transportConfig as SerialTransportConfig)?.baudRate || 9600
                    }
                    onChange={(e) => {
                      const cfg = (localChannel.transportConfig || {}) as SerialTransportConfig;
                      setLocalChannel({
                        ...localChannel,
                        transportConfig: { ...cfg, baudRate: parseInt(e.target.value) || 9600 },
                      });
                    }}
                    className="flex h-7 w-full min-w-0 rounded border border-input bg-background px-2 py-1 text-[11px] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  >
                    <option value={9600}>9600</option>
                    <option value={19200}>19200</option>
                    <option value={38400}>38400</option>
                    <option value={57600}>57600</option>
                    <option value={115200}>115200</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                    Data Bits
                  </label>
                  <select
                    value={(localChannel.transportConfig as SerialTransportConfig)?.dataBits || 8}
                    onChange={(e) => {
                      const cfg = (localChannel.transportConfig || {}) as SerialTransportConfig;
                      setLocalChannel({
                        ...localChannel,
                        transportConfig: { ...cfg, dataBits: parseInt(e.target.value) || 8 },
                      });
                    }}
                    className="flex h-7 w-full min-w-0 rounded border border-input bg-background px-2 py-1 text-[11px] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  >
                    <option value={7}>7</option>
                    <option value={8}>8</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                    Stop Bits
                  </label>
                  <select
                    value={(localChannel.transportConfig as SerialTransportConfig)?.stopBits || 1}
                    onChange={(e) => {
                      const cfg = (localChannel.transportConfig || {}) as SerialTransportConfig;
                      setLocalChannel({
                        ...localChannel,
                        transportConfig: { ...cfg, stopBits: parseInt(e.target.value) || 1 },
                      });
                    }}
                    className="flex h-7 w-full min-w-0 rounded border border-input bg-background px-2 py-1 text-[11px] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  >
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                    Parity
                  </label>
                  <select
                    value={
                      (localChannel.transportConfig as SerialTransportConfig)?.parity || 'none'
                    }
                    onChange={(e) => {
                      const cfg = (localChannel.transportConfig || {}) as SerialTransportConfig;
                      setLocalChannel({
                        ...localChannel,
                        transportConfig: { ...cfg, parity: e.target.value as any },
                      });
                    }}
                    className="flex h-7 w-full min-w-0 rounded border border-input bg-background px-2 py-1 text-[11px] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  >
                    <option value="none">None</option>
                    <option value="even">Even</option>
                    <option value="odd">Odd</option>
                  </select>
                </div>
              </>
            )}

            {!isTcp && !isSerial && (
              <div className="col-span-1 md:col-span-2 text-center py-4 text-muted-foreground italic text-[11px]">
                No transport configuration needed for {localChannel.transport} transport.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
