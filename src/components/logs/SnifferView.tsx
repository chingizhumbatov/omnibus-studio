import { useState, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import { SnifferFrame } from "@/core/contracts";
import { startSniffer, stopSniffer, listenToSnifferUpdates } from "@/core/api";
import { Play, Pause, Trash2, Filter } from "lucide-react";
import { useUIStore } from "@/store/uiStore";

const MAX_FRAMES = 2000; // Ring buffer limit

export function SnifferView() {
  const [frames, setFrames] = useState<SnifferFrame[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [filterConnectionId, setFilterConnectionId] = useState<string>("");
  const parentRef = useRef<HTMLDivElement>(null);
  
  const { selectedChannelId, selectedDeviceId, devices } = useUIStore();

  // Auto-sync filter with active tree selection
  useEffect(() => {
    if (selectedChannelId) {
      setFilterConnectionId(selectedChannelId);
    } else if (selectedDeviceId) {
      const dev = devices.find(d => d.id === selectedDeviceId);
      if (dev) {
        setFilterConnectionId(dev.channelId);
      }
    }
  }, [selectedChannelId, selectedDeviceId, devices]);

  // Use refs to access latest state in the listener without re-binding
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  useEffect(() => {
    // Start backend sniffer service
    startSniffer().catch(console.error);

    const setupListener = async () => {
      return await listenToSnifferUpdates((event) => {
        if (isPausedRef.current) return;
        
        setFrames(prev => {
          const newFrames = [...prev, ...event.frames];
          if (newFrames.length > MAX_FRAMES) {
            return newFrames.slice(newFrames.length - MAX_FRAMES);
          }
          return newFrames;
        });
      });
    };

    let unlistenFn: (() => void) | null = null;
    setupListener().then(fn => { unlistenFn = fn; });

    return () => {
      if (unlistenFn) unlistenFn();
      // Stop backend sniffer service
      stopSniffer().catch(console.error);
    };
  }, []);

  const filteredFrames = filterConnectionId 
    ? frames.filter(f => f.connection_id.toLowerCase().includes(filterConnectionId.toLowerCase()))
    : frames;

  const rowVirtualizer = useVirtualizer({
    count: filteredFrames.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 20,
  });

  // Auto-scroll to bottom
  useEffect(() => {
    if (!isPaused && filteredFrames.length > 0) {
      rowVirtualizer.scrollToIndex(filteredFrames.length - 1, { align: 'end' });
    }
  }, [filteredFrames.length, isPaused, rowVirtualizer]);

  // Utility to format raw byte array to HEX string
  const toHex = (payload: number[]) => {
    return payload.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  };

  // Utility to format raw byte array to ASCII
  const toAscii = (payload: number[]) => {
    return payload.map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join('');
  };

  return (
    <div className="h-full w-full bg-[#0d0d0d] font-mono text-[11px] flex flex-col relative overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center px-4 py-2 bg-zinc-900/80 border-b border-zinc-800 shrink-0">
        <button 
          onClick={() => setIsPaused(!isPaused)}
          className={cn(
            "flex items-center px-3 py-1.5 rounded text-xs transition-colors font-semibold",
            isPaused ? "bg-amber-500/20 text-amber-400" : "hover:bg-zinc-800 text-zinc-300 hover:text-white"
          )}
        >
          {isPaused ? <Play className="w-4 h-4 mr-1.5" /> : <Pause className="w-4 h-4 mr-1.5" />}
          {isPaused ? "Paused" : "Pause"}
        </button>
        
        <div className="w-px h-5 bg-zinc-800 mx-4"></div>
        
        <button 
          onClick={() => setFrames([])}
          className="flex items-center px-3 py-1.5 hover:bg-zinc-800 rounded text-xs text-zinc-400 hover:text-red-400 transition-colors font-medium"
        >
          <Trash2 className="w-4 h-4 mr-1.5" />
          Clear
        </button>

        <div className="w-px h-5 bg-zinc-800 mx-4"></div>

        <div className="flex items-center bg-zinc-950 rounded px-3 py-1.5 border border-zinc-800 focus-within:border-primary/50 transition-colors">
          <Filter className="w-3.5 h-3.5 text-zinc-500 mr-2" />
          <input 
            type="text" 
            placeholder="Filter connection ID..." 
            value={filterConnectionId}
            onChange={(e) => setFilterConnectionId(e.target.value)}
            className="bg-transparent border-none outline-none text-zinc-200 w-48 placeholder:text-zinc-600"
          />
        </div>
        
        <div className="ml-auto flex items-center space-x-2">
          <div className={cn("w-2 h-2 rounded-full", isPaused ? "bg-amber-500" : "bg-emerald-500 animate-pulse")}></div>
          <span className="text-zinc-500 font-medium">{filteredFrames.length} frames</span>
        </div>
      </div>

      {/* Table Header */}
      <div className="flex items-center px-4 py-2 bg-zinc-900/40 border-b border-zinc-800/80 text-zinc-500 font-semibold tracking-wider text-[10px] select-none uppercase">
        <div className="w-40 shrink-0">Timestamp</div>
        <div className="w-40 shrink-0 pr-4">Connection</div>
        <div className="w-12 shrink-0">Dir</div>
        <div className="flex-1 min-w-[200px]">Hex Data</div>
        <div className="w-48 shrink-0 ml-4 hidden xl:block">Ascii</div>
      </div>

      {/* Virtualized Log Table */}
      <div 
        ref={parentRef} 
        className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const frame = filteredFrames[virtualRow.index];
            const ts_us = frame.timestamp_us;
            const ts_ms = Math.floor(ts_us / 1000);
            const us_part = ts_us % 1000;
            const date = new Date(ts_ms);
            const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}.${date.getMilliseconds().toString().padStart(3, '0')}${us_part.toString().padStart(3, '0')}`;
            
            return (
              <div
                key={virtualRow.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className={cn(
                  "flex items-center px-4 hover:bg-white/5 transition-colors group leading-tight border-b border-zinc-800/30",
                  frame.direction === "tx" ? "bg-emerald-500/[0.02]" : "bg-cyan-500/[0.02]"
                )}
              >
                <span className="text-zinc-500 w-40 shrink-0 select-none">[{timeStr}]</span>
                <span className="text-zinc-300 w-40 shrink-0 truncate select-none pr-4" title={frame.connection_id}>{frame.connection_id}</span>
                <span className={cn(
                  "w-12 shrink-0 font-bold select-none",
                  frame.direction === "tx" ? "text-emerald-500" : "text-cyan-500"
                )}>
                  {frame.direction.toUpperCase()}
                </span>
                <span className={cn(
                  "flex-1 tracking-widest truncate font-medium",
                  frame.direction === "tx" ? "text-emerald-300" : "text-cyan-300"
                )}>
                  {toHex(frame.payload)}
                </span>
                <span className="w-48 shrink-0 ml-4 truncate text-zinc-500 hidden xl:block group-hover:text-zinc-400 transition-colors">
                  {toAscii(frame.payload)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      
      {filteredFrames.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600 pointer-events-none select-none">
          <div className="w-16 h-16 mb-4 rounded-full border border-dashed border-zinc-700 flex items-center justify-center">
             <div className="w-2 h-2 rounded-full bg-zinc-700 animate-ping"></div>
          </div>
          <p>Listening for traffic...</p>
        </div>
      )}
    </div>
  );
}
