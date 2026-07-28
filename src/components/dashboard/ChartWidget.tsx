import { useEffect, useRef, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { useAppStore } from '../../store';
import { getTagHistory } from '../../core/api';
import { TagState } from '../../core/contracts';

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

// Maximum number of data points to keep in memory for the chart
const MAX_CHART_POINTS = 200;

interface ChartWidgetProps {
  tagId: string;
}

export function ChartWidget({ tagId }: ChartWidgetProps) {
  const liveTag = useAppStore((state) => state.tags[tagId]);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const lastTimestampRef = useRef<number>(0);

  // On mount: fetch historical snapshot from DataHub ring buffer
  useEffect(() => {
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
        console.error(`[ChartWidget] Failed to load history for ${tagId}:`, err);
      });
  }, [tagId]);

  // On each live update: append new point to the chart data
  useEffect(() => {
    if (!liveTag) return;
    const point = tagStateToPoint(liveTag);
    if (!point) return;
    // Avoid duplicates from the initial history fetch
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

  if (chartData.length === 0) {
    return (
      <div
        style={{
          height: '120px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-muted)',
          fontSize: 'var(--font-size-sm)',
          fontStyle: 'italic',
        }}
      >
        Awaiting data...
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis
          dataKey="timestamp_ms"
          tickFormatter={formatTime}
          tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--color-bg-sidebar)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '12px',
          }}
          labelFormatter={(label: unknown) =>
            typeof label === 'number' ? formatTime(label) : String(label)
          }
          formatter={(value: unknown) => [
            typeof value === 'number' ? value.toFixed(3) : String(value),
            tagId,
          ]}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="var(--color-accent)"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
