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

  // Determine if YTD is the active selection (start = Jan 1 of maxDate year and end = maxDate)
  const isYTDActive = React.useMemo(() => {
    const ytdStart = dayjs(maxDate).startOf('year').format('YYYY-MM-DD');
    return isRangeActive(ytdStart);
  }, [maxDate, start, end]);

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
    <div className={`flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-4 mb-3 sm:mb-4 ${className}`}>
      {/* Date range inputs - stacked on mobile */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <div className="flex items-center gap-1 sm:gap-2">
          <label className="text-gray-300 text-xs sm:text-sm min-w-[32px] sm:min-w-auto">From</label>
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-1 sm:pl-2 flex items-center pointer-events-none">
              <svg className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M7 11h10M7 15h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </div>
            <input
              type="date"
              className="pl-6 sm:pl-8 pr-2 sm:pr-3 py-1 sm:py-1.5 bg-gray-800 text-gray-100 rounded border border-white/10 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full"
              min={minDate}
              max={maxDate}
              value={start}
              onChange={handleStartChange}
              aria-label="Start date"
            />
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <label className="text-gray-300 text-xs sm:text-sm min-w-[32px] sm:min-w-auto">To</label>
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-1 sm:pl-2 flex items-center pointer-events-none">
              <svg className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M7 11h10M7 15h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </div>
            <input
              type="date"
              className="pl-6 sm:pl-8 pr-2 sm:pr-3 py-1 sm:py-1.5 bg-gray-800 text-gray-100 rounded border border-white/10 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full"
              min={minDate}
              max={maxDate}
              value={end}
              onChange={handleEndChange}
              aria-label="End date"
            />
          </div>
        </div>
      </div>

      {/* Combined buttons row - Reset, YTD, and Quick range buttons */}
      <div className="flex items-center justify-between sm:justify-start gap-1 sm:gap-2 flex-wrap">
        {/* Reset and YTD buttons */}
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            className="inline-flex items-center px-1.5 py-1 sm:px-2.5 sm:py-1.5 rounded bg-transparent text-gray-300 border border-white/5 text-xs sm:text-sm hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            onClick={handleReset}
            aria-label="Reset date range"
          >
            <svg className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-1 text-gray-300" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M6 18L18 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="hidden sm:inline">Reset</span>
          </button>

          <button
            type="button"
            onClick={onSetYtd}
            aria-label="Set Year to Date"
            aria-pressed={isYTDActive}
            className={`inline-flex items-center px-2 py-1 sm:px-3 sm:py-1.5 rounded text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors ${isYTDActive ? 'bg-indigo-600 text-white border border-indigo-400' : 'bg-transparent text-gray-300 border border-white/5 hover:bg-white/5'}`}
          >
            YTD
          </button>
        </div>

        {/* Quick range buttons (pills) - same row on mobile */}
        <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
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
                className={`px-2 py-1 sm:px-3 sm:py-1.5 rounded sm:rounded-full text-xs sm:text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${active ? 'bg-indigo-600 text-white border border-indigo-400' : 'bg-transparent text-gray-200 border border-white/10 hover:bg-white/5'}`}
              >
                {r.key}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default DateRangePicker;
