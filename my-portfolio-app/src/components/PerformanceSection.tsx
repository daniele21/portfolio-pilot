import React from 'react';
import { PresentationChartLineIcon } from '@heroicons/react/24/outline';
import TimeSeriesChart from './charts/TimeSeriesChart';
import DateRangePicker from '../components/DateRangePicker';
import type { HistoricalDataPoint } from '../types';

export type ValueType = 'value' | 'abs_value' | 'pct' | 'pct_from_first';

export interface GenericPerfSectionProps {
  /** Section heading */
  title: string;
  /** Current selected value type */
  valueType: ValueType;
  onValueTypeChange: (next: ValueType) => void;

  /** Single series data (flattened) */
  data: HistoricalDataPoint[];
  /** Optional multiple series */
  series?: Array<{
    id: string;
    name: string;
    data: HistoricalDataPoint[];
  }>;

  /** Current date range selection */
  dateRange: { start: string; end: string } | null;
  onDateRangeChange: (r: { start: string; end: string } | null) => void;
  minDate: string;
  maxDate: string;
  onSetYTD: () => void;

  /** Loading state */
  loading: boolean;
  /** Message when not enough data */
  notEnoughDataMessage: string;

  /** Displayed final value badge */
  finalValue: string;

  /** Optional extra selector UI (e.g. benchmarks or tickers) */
  selector?: React.ReactNode;
}

const GenericPerformanceSection: React.FC<GenericPerfSectionProps> = ({
  title,
  valueType,
  onValueTypeChange,
  data,
  series,
  dateRange,
  onDateRangeChange,
  minDate,
  maxDate,
  onSetYTD,
  loading,
  finalValue,
  selector
}) => {
  const hasMulti = series && series.length > 0;

  return (
    <div className="mb-8">
      <h2 className="text-2xl font-semibold text-white mb-4 flex items-center">
        <PresentationChartLineIcon className="h-7 w-7 mr-2 text-indigo-400" />
        {title}
      </h2>

      {/* Controls: Value Type radios, final badge, extra selector */}
      <div className="flex flex-wrap items-center gap-4 mb-4 justify-between">
        <div className="flex items-center gap-4">
          {/* Compact dropdown to select the value type */}
          {(() => {
            const labels: Record<ValueType, string> = {
              value: 'Net Value',
              abs_value: 'Absolute Value',
              pct: 'Net Performance',
              pct_from_first: 'Performance'
            };
            return (
              <div className="flex items-center gap-3">
                <label htmlFor="valueTypeSelect" className="text-sm text-gray-400 mr-1">View</label>

                <div className="relative">
                  <select
                    id="valueTypeSelect"
                    value={valueType}
                    onChange={(e) => onValueTypeChange(e.target.value as ValueType)}
                    className="appearance-none bg-gray-800 text-gray-100 rounded-md px-3 py-1.5 border border-white/10 text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400"
                    aria-label="Select value type"
                    title="Select view"
                  >
                    {(Object.keys(labels) as ValueType[]).map(key => (
                      <option key={key} value={key}>{labels[key]}</option>
                    ))}
                  </select>

                  {/* Chevron */}
                  <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                    <svg className="w-4 h-4 text-gray-400" viewBox="0 0 20 20" fill="none" aria-hidden>
                      <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        <span className="ml-2 px-3 py-1 rounded-lg bg-indigo-700 text-white text-base font-bold shadow-md border border-indigo-400">
          {finalValue}
        </span>

        <div className="flex-1 flex justify-end min-w-[260px]">
          {selector}
        </div>
      </div>

      {/* Date range pickers */}
      <div className="flex items-center gap-2 mb-4">
        <DateRangePicker
          minDate={minDate}
          maxDate={maxDate}
          value={dateRange}
          onChange={onDateRangeChange}
          onSetYtd={onSetYTD}
        />
      </div>

      {/* Chart or states */}
      {loading ? (
        <div className="mt-6 h-64 bg-gray-700 rounded-lg flex items-center justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-t-4 border-indigo-500"></div>
          <p className="ml-4 text-lg text-gray-300">Loading data...</p>
        </div>
      ) : (hasMulti ? (
        <div className="mt-6 bg-gray-800/50 rounded-lg border border-white/10 p-4">
          <TimeSeriesChart
            series={series!.map(s => ({
              id: s.id,
              name: s.name,
              data: s.data.map(point => ({
                time: point.date,
                // Use nullish coalescing so explicit 0 values are preserved (0 is falsy with ||)
                value: (point as any)[valueType] ?? point.value ?? 0
              }))
            }))}
            height={320}
            normalizeToZero={valueType === 'pct_from_first'}
            valueFormatter={(value) => {
              if (valueType === 'pct') {
                return `${value.toFixed(2)}%`;
              } else if (valueType === 'pct_from_first') {
                // When normalized, the chart already shows percentage values
                return `${value.toFixed(2)}%`;
              }
              return value.toLocaleString(undefined, { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
              });
            }}
          />
        </div>
      ) : (
        <div className="mt-6 bg-gray-800/50 rounded-lg border border-white/10 p-4">
          <TimeSeriesChart
            series={[{
              id: 'portfolio',
              name: title,
              data: data.map(point => ({
                time: point.date,
                // Preserve 0 values; use nullish coalescing
                value: (point as any)[valueType] ?? point.value ?? 0
              }))
            }]}
            height={320}
            normalizeToZero={valueType === 'pct_from_first'}
            valueFormatter={(value) => {
              if (valueType === 'pct') {
                return `${value.toFixed(2)}%`;
              } else if (valueType === 'pct_from_first') {
                // When normalized, the chart already shows percentage values
                return `${value.toFixed(2)}%`;
              }
              return value.toLocaleString(undefined, { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
              });
            }}
          />
        </div>
      ))}
    </div>
  );
};

export default GenericPerformanceSection;
