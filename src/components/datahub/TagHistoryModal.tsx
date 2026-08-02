import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { useDataStore } from '@/store/dataStore';
import { getTagHistory } from '@/core/api';
import { TagState } from '@/core/contracts/ipc';
import { Activity } from 'lucide-react';

interface ChartDataPoint {
  timestamp_ms: number;
  value: number | null;
}

function tagStateToPoint(state: TagState): ChartDataPoint | null {
  if (state.value.type === 'Integer' || state.value.type === 'Float') {
    return { timestamp_ms: state.timestamp_ms, value: state.value.value as number };
  }
  return null;
}

const MAX_CHART_POINTS = 500;

interface TagHistoryModalProps {
  tagId: string | null;
  onClose: () => void;
}

export function TagHistoryModal({ tagId, onClose }: TagHistoryModalProps) {
  const liveTag = useDataStore((state) => (tagId ? state.tags[tagId] : undefined));
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const lastTimestampRef = useRef<number>(0);

  useEffect(() => {
    if (!tagId) {
      setChartData([]);
      lastTimestampRef.current = 0;
      return;
    }

    getTagHistory(tagId)
      .then((history) => {
        const points = history
          .map(tagStateToPoint)
          .filter((p): p is ChartDataPoint => p !== null)
          .slice(-MAX_CHART_POINTS);

        if (points.length > 0) {
          lastTimestampRef.current = points[points.length - 1].timestamp_ms;
        }
        setChartData(points);
      })
      .catch((err) => {
        console.error(`[TagHistoryModal] Failed to load history for ${tagId}:`, err);
      });
  }, [tagId]);

  useEffect(() => {
    if (!liveTag) return;
    const point = tagStateToPoint(liveTag);
    if (!point) return;
    if (point.timestamp_ms <= lastTimestampRef.current) return;

    lastTimestampRef.current = point.timestamp_ms;
    setChartData((prev) => {
      const next = [...prev, point];
      return next.length > MAX_CHART_POINTS ? next.slice(-MAX_CHART_POINTS) : next;
    });
  }, [liveTag]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  };

  return (
    <Dialog open={!!tagId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[700px] bg-[#111116] border-zinc-800">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Quick Trend:{' '}
            <span className="font-mono text-zinc-400 bg-zinc-900/50 px-2 py-0.5 rounded">
              {tagId}
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="py-4 h-[350px]">
          {chartData.length === 0 ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-xs text-zinc-500 italic space-y-2">
              <Activity className="w-8 h-8 opacity-20" />
              <span>Awaiting numeric data...</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis
                  dataKey="timestamp_ms"
                  tickFormatter={formatTime}
                  tick={{ fill: '#a1a1aa', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={30}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fill: '#a1a1aa', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={60}
                />
                <Tooltip
                  contentStyle={{
                    background: '#18181b',
                    border: '1px solid #27272a',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#e4e4e7',
                  }}
                  labelFormatter={(label: unknown) =>
                    typeof label === 'number' ? formatTime(label) : String(label)
                  }
                  formatter={(value: unknown) => [
                    typeof value === 'number' ? value.toFixed(3) : String(value),
                    'Value',
                  ]}
                />
                <Line
                  type="stepAfter"
                  dataKey="value"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
