import React, { FC } from 'react';
import dayjs from 'dayjs';

type DateRange = { start: string; end: string };

export interface DateRangePickerProps {
  /** Earliest selectable date (YYYY-MM-DD) */
  minDate: string;
  /** Latest selectable date (YYYY-MM-DD) */
  maxDate: string;
  /** Current date range value, or null if unset */
  value: DateRange | null;
  /** Callback when date range changes (null to reset) */
  onChange: (range: DateRange | null) => void;
  /** Callback to set the range to year-to-date */
  onSetYtd: () => void;
  /** Optional className for container styling */
  className?: string;
}

/**
 * A reusable date-range picker with YTD button, two date inputs, and reset.
 */
const DateRangePicker: FC<DateRangePickerProps> = ({
  minDate,
  maxDate,
  value,
  onChange,
  onSetYtd,
  className = ''
}) => {
  const start = value?.start ?? minDate;
  const end = value?.end ?? maxDate;

  // Helper to determine if a quick-range button should be highlighted
  const isRangeActive = (computedStart: string) => {
    // active when start matches computedStart and end equals maxDate
    return start === computedStart && end === maxDate;
  };

  const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStart = e.target.value;
    onChange({ start: newStart, end });
  };

  const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEnd = e.target.value;
    onChange({ start, end: newEnd });
  };

  const handleReset = () => onChange(null);

  return (
    <div className={`flex flex-wrap items-center gap-4 mb-4 ${className}`}>
      {/* Date range inputs (styled) */}
      <div className="flex items-center gap-2">
        <label className="text-gray-300 text-sm">From</label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
            {/* calendar icon */}
            <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M7 11h10M7 15h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>
          <input
            type="date"
            className="pl-8 pr-3 py-1.5 bg-gray-800 text-gray-100 rounded-md border border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            min={minDate}
            max={maxDate}
            value={start}
            onChange={handleStartChange}
            aria-label="Start date"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-gray-300 text-sm">To</label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
            <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M7 11h10M7 15h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>
          <input
            type="date"
            className="pl-8 pr-3 py-1.5 bg-gray-800 text-gray-100 rounded-md border border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            min={minDate}
            max={maxDate}
            value={end}
            onChange={handleEndChange}
            aria-label="End date"
          />
        </div>
      </div>

      {/* Reset and YTD buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-transparent text-gray-300 border border-white/5 text-sm hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          onClick={handleReset}
          aria-label="Reset date range"
        >
          <svg className="w-4 h-4 mr-1 text-gray-300" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M6 6l12 12M6 18L18 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Reset
        </button>

        <button
          type="button"
          className="inline-flex items-center px-3 py-1.5 rounded-md bg-indigo-700 text-white text-sm font-semibold hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          onClick={onSetYtd}
          aria-label="Set Year to Date"
        >
          YTD
        </button>
      </div>

      {/* Quick range buttons (pills) */}
      <div className="flex items-center gap-2">
        {[
          { key: '1M', start: dayjs(maxDate).subtract(1, 'month').format('YYYY-MM-DD') },
          { key: '3M', start: dayjs(maxDate).subtract(3, 'month').format('YYYY-MM-DD') },
          { key: '6M', start: dayjs(maxDate).subtract(6, 'month').format('YYYY-MM-DD') },
          { key: '1Y', start: dayjs(maxDate).subtract(1, 'year').format('YYYY-MM-DD') }
        ].map(r => {
          const active = isRangeActive(r.start);
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => onChange({ start: r.start, end: maxDate })}
              aria-pressed={active}
              className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${active ? 'bg-indigo-600 text-white border border-indigo-400' : 'bg-transparent text-gray-200 border border-white/10 hover:bg-white/5'}`}
            >
              {r.key}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default DateRangePicker;
