import { useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useLogStore } from '@/store/logStore';
import { cn } from '@/lib/utils';

export function SystemLogView() {
  const { systemLogs } = useLogStore();
  const parentRef = useRef<HTMLDivElement>(null);

  // Virtualizer for high-performance rendering of massive log streams
  const rowVirtualizer = useVirtualizer({
    count: systemLogs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 20, // 20px per row estimated for tighter density
    overscan: 10,
  });

  useEffect(() => {
    if (systemLogs.length > 0) {
      rowVirtualizer.scrollToIndex(systemLogs.length - 1, { align: 'end' });
    }
  }, [systemLogs.length, rowVirtualizer]);

  return (
    <div className="h-full w-full bg-[#0d0d0d] font-mono text-[11px] flex flex-col">
      <div
        ref={parentRef}
        className="flex-1 overflow-auto p-1 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const log = systemLogs[virtualRow.index];
            const date = new Date(log.timestamp);
            const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}.${date.getMilliseconds().toString().padStart(3, '0')}`;

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
                className="flex items-center px-2 hover:bg-white/5 transition-colors group leading-tight"
              >
                <span className="text-zinc-500 w-28 shrink-0 select-none">[{timeStr}]</span>
                <span
                  className={cn(
                    'w-12 shrink-0 font-semibold select-none',
                    log.level === 'info' && 'text-blue-400',
                    log.level === 'warn' && 'text-yellow-400',
                    log.level === 'error' && 'text-red-500',
                  )}
                >
                  {log.level.toUpperCase()}
                </span>
                <span className="text-zinc-400 w-24 shrink-0 truncate select-none">
                  [{log.source}]
                </span>
                <span
                  className={cn(
                    'flex-1 ml-2',
                    log.level === 'info' && 'text-zinc-300',
                    log.level === 'warn' && 'text-yellow-200',
                    log.level === 'error' && 'text-red-400',
                  )}
                >
                  {log.message}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {systemLogs.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-zinc-600 pointer-events-none select-none">
          No system events
        </div>
      )}
    </div>
  );
}
