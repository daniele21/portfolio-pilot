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
      <ResponsiveContainer width="100%" height={300}>
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
            formatter={(value: number, name: string, props: any) => isPct ? [`${value?.toFixed(2)}%`, name] : [value?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}), name]}
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
  const sortedData = [...data].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const isPct = dataKey === 'pct';
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
    <ResponsiveContainer width="100%" height={300}>
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
  );
};

export default PerformanceChart;
