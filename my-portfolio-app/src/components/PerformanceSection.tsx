import React from 'react';
import { Listbox, Transition } from '@headlessui/react';
import { PresentationChartLineIcon } from '@heroicons/react/24/outline';
import { CheckIcon, ChevronUpDownIcon } from '@heroicons/react/20/solid';
import PerformanceChart from '../components/PerformanceChart';
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
  notEnoughDataMessage,
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
          {(['value', 'abs_value', 'pct', 'pct_from_first'] as ValueType[]).map(type => {
            const labels: Record<ValueType, string> = {
              value: 'Net Value',
              abs_value: 'Absolute Value',
              pct: 'Net Performance',
              pct_from_first: 'Performance'
            };
            return (
              <label key={type} className="flex items-center text-gray-300 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={valueType === type}
                  onChange={() => onValueTypeChange(type)}
                  className="form-radio h-4 w-4 text-indigo-600 mr-1"
                />
                {labels[type]}
              </label>
            );
          })}
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
        <PerformanceChart
          multiLine
          data={series ? series.flatMap(s => s.data) : []}
          lines={series!.map(s => ({
            data: s.data,
            name: s.name,
            color: undefined
          }))}
          dataKey={valueType}
          chartLabel={title}
        />
      ) : (
        <PerformanceChart
          data={data}
          dataKey={valueType}
          chartLabel={title}
          strokeColor="#4ade80"
        />
      ))}
    </div>
  );
};

export default GenericPerformanceSection;
