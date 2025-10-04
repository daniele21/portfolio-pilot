import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { HistoricalDataPoint } from '../types';

interface MultiLineConfig {
  data: HistoricalDataPoint[];
  name: string;
  color?: string;
}

interface PerformanceChartProps {
  data: HistoricalDataPoint[];
  dataKey: string; // e.g., 'value'
  chartLabel: string; // e.g., 'Total Portfolio Value'
  strokeColor?: string;
  multiLine?: boolean;
  lines?: MultiLineConfig[];
}

const COLORS = [
  '#4ade80', '#f59e42', '#60a5fa', '#f472b6', '#f87171', '#a78bfa', '#34d399', '#fbbf24', '#38bdf8', '#c084fc', '#facc15', '#fb7185', '#818cf8', '#fcd34d', '#6ee7b7', '#fca5a5', '#a3e635', '#fda4af', '#fef08a', '#f9a8d4'
];

const PerformanceChart: React.FC<PerformanceChartProps> = ({ data, dataKey, chartLabel, strokeColor = "#8884d8", multiLine = false, lines = [] }) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [sizeKey, setSizeKey] = React.useState(0);

  // Container size tracking for responsiveness
  React.useEffect(() => {
    // Initial setup completed
  }, []);

  // ResizeObserver to detect parent/container size changes and trigger remount
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let rafId: number | null = null;
    const ro = new ResizeObserver(() => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setSizeKey(k => k + 1);
        rafId = null;
      });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);
  // Also listen to the desktop breakpoint crossing to force a remount (covers cases where ResizeObserver
  // doesn't fire early enough when layout becomes desktop-permanent)
  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia === 'undefined') return;
    const mq = window.matchMedia('(min-width:900px)');
    const onChange = () => {
      setSizeKey(k => k + 1);
    };
    // Initial trigger
    try { setSizeKey(k => k + 1); } catch (e) {}
    mq.addEventListener?.('change', onChange);
    // legacy
    if ((mq as any).addListener && !(mq as any).addEventListener) (mq as any).addListener(onChange);
    return () => {
      mq.removeEventListener?.('change', onChange);
      if ((mq as any).removeListener && !(mq as any).removeEventListener) (mq as any).removeListener(onChange);
    };
  }, []);
  // Multi-line mode
  if (multiLine && lines.length > 0) {

    // Merge all dates for X axis
    const allDates = Array.from(new Set(lines.flatMap(line => line.data.map(d => d.date)))).sort();
    
    // Build merged data for X axis
    const mergedData = allDates.map(date => {
      const entry: any = { date };
      lines.forEach((line, idx) => {
        // For pct_from_first, use pct_from_first if present, else fallback to pct
        const point = line.data.find(d => d.date === date);
        if (dataKey === 'pct_from_first') {
          entry[`line_${idx}`] = point && (point.pct_from_first !== undefined ? point.pct_from_first : point.pct !== undefined ? point.pct : null);
        } else {
          entry[`line_${idx}`] = point ? point[dataKey as keyof HistoricalDataPoint] : null;
        }
      });
      return entry;
    });

    // Normalize pct_from_first to start at 0 for each line
    if (dataKey === 'pct_from_first') {
      lines.forEach((_, idx) => {
        const lineKey = `line_${idx}`;
        // Find the first non-null value for this line
        const firstPoint = mergedData.find(d => d[lineKey] !== null && d[lineKey] !== undefined);
        if (firstPoint) {
          const firstValue = firstPoint[lineKey];
          // Adjust all values by subtracting the first value
          mergedData.forEach(d => {
            if (d[lineKey] !== null && d[lineKey] !== undefined) {
              d[lineKey] = d[lineKey] - firstValue;
            }
          });
        }
      });
    }
    const isPct = dataKey === 'pct' || dataKey === 'pct_from_first';
    const formatYAxisTick = (value: number) => {
      if (isPct) return `${value.toFixed(1)}%`;
      if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
      if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
      return value?.toString();
    };
    const formatDateTick = (dateStr: string) => {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };
    return (
      <div ref={containerRef} style={{ minHeight: 300 }}>
      <ResponsiveContainer key={sizeKey} width="100%" height={300}>
        <LineChart data={mergedData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#4A5568" />
          <XAxis 
            dataKey="date" 
            stroke="#9CA3AF"
            tick={{ fill: '#D1D5DB', fontSize: 12 }}
            tickFormatter={formatDateTick}
            interval={Math.max(0, Math.floor(mergedData.length / 10) - 1)}
          />
          <YAxis 
            stroke="#9CA3AF"
            tick={{ fill: '#D1D5DB', fontSize: 12 }}
            tickFormatter={formatYAxisTick}
            domain={['auto', 'auto']}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: 'rgba(31, 41, 55, 0.9)', border: '1px solid #4B5563', borderRadius: '0.5rem' }}
            labelStyle={{ color: '#E5E7EB', fontWeight: 'bold' }}
            formatter={(value: number, name: string) => isPct ? [`${value?.toFixed(2)}%`, name] : [value?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}), name]}
            labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          />
          <Legend wrapperStyle={{ color: '#D1D5DB', paddingTop: '10px' }} />
          {lines.map((line, idx) => (
            <Line
              key={line.name}
              type="monotone"
              dataKey={`line_${idx}`}
              name={line.name}
              stroke={line.color || COLORS[idx % COLORS.length]}
              strokeWidth={2}
              activeDot={{ r: 6, fill: line.color || COLORS[idx % COLORS.length], stroke: '#FFFFFF', strokeWidth: 2 }}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      </div>
    );
  }
  // Single-line mode (default)
  if (!data || data.length < 2) {
    return (
        <div className="h-64 flex items-center justify-center bg-gray-750 rounded-lg">
            <p className="text-gray-400">Not enough data points to display trend for {chartLabel}.</p>
        </div>
    );
  }
  let sortedData = [...data].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  // Normalize pct_from_first to start at 0
  if (dataKey === 'pct_from_first') {
    const firstPoint = sortedData.find(d => d.pct_from_first !== null && d.pct_from_first !== undefined);
    if (firstPoint && typeof firstPoint.pct_from_first === 'number') {
      const firstValue = firstPoint.pct_from_first;
      sortedData = sortedData.map(d => ({
        ...d,
        pct_from_first: d.pct_from_first !== null && d.pct_from_first !== undefined && typeof d.pct_from_first === 'number'
          ? d.pct_from_first - firstValue 
          : d.pct_from_first
      }));
    }
  }
  
  const isPct = dataKey === 'pct' || dataKey === 'pct_from_first';
  const formatYAxisTick = (value: number) => {
    if (isPct) return `${value.toFixed(1)}%`;
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
    return value.toString();
  };
  const formatDateTick = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  return (
  <div ref={containerRef} style={{ minHeight: 300 }}>
  <ResponsiveContainer key={sizeKey} width="100%" height={300}>
      <LineChart
        data={sortedData}
        margin={{
          top: 5, right: 30, left: 20, bottom: 5,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#4A5568" />
        <XAxis 
            dataKey="date" 
            stroke="#9CA3AF"
            tick={{ fill: '#D1D5DB', fontSize: 12 }}
            tickFormatter={formatDateTick}
            interval={Math.max(0, Math.floor(sortedData.length / 10) -1 )} 
        />
        <YAxis 
            stroke="#9CA3AF"
            tick={{ fill: '#D1D5DB', fontSize: 12 }}
            tickFormatter={formatYAxisTick}
            domain={['auto', 'auto']}
        />
    <Tooltip 
      contentStyle={{ backgroundColor: 'rgba(31, 41, 55, 0.9)', border: '1px solid #4B5563', borderRadius: '0.5rem' }}
      labelStyle={{ color: '#E5E7EB', fontWeight: 'bold' }}
      itemStyle={{ color: strokeColor }}
      formatter={(value: number) => isPct ? [`${value.toFixed(2)}%`, chartLabel] : [value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}), chartLabel]}
      labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
    />
        <Legend wrapperStyle={{ color: '#D1D5DB', paddingTop: '10px' }} />
        <Line 
            type="monotone" 
            dataKey={dataKey} 
            name={chartLabel}
            stroke={strokeColor} 
            strokeWidth={2}
            activeDot={{ r: 6, fill: strokeColor, stroke: '#FFFFFF', strokeWidth: 2 }} 
            dot={{ r: 3, fill: strokeColor, strokeWidth:0 }}
        />
      </LineChart>
    </ResponsiveContainer>
    </div>
  );
};

export default PerformanceChart;
