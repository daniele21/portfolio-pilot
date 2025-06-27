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
      {/* Date range inputs */}
      <label className="text-gray-300 text-sm">From:</label>
      <input
        type="date"
        className="bg-gray-700 text-gray-100 rounded px-2 py-1 border border-gray-600"
        min={minDate}
        max={maxDate}
        value={start}
        onChange={handleStartChange}
      />

      <label className="text-gray-300 text-sm">To:</label>
      <input
        type="date"
        className="bg-gray-700 text-gray-100 rounded px-2 py-1 border border-gray-600"
        min={minDate}
        max={maxDate}
        value={end}
        onChange={handleEndChange}
      />

      <button
        type="button"
        className="px-2 py-1 rounded bg-gray-600 text-white text-xs ml-2"
        onClick={handleReset}
      >
        Reset
      </button>

      {/* Quick range buttons */}
      <button
        type="button"
        className="px-2 py-1 rounded bg-indigo-700 text-white text-xs font-semibold hover:bg-indigo-600 border border-indigo-400"
        onClick={() => onChange({ start: dayjs(maxDate).subtract(1, 'month').format('YYYY-MM-DD'), end: maxDate })}
      >
        1M
      </button>
      <button
        type="button"
        className="px-2 py-1 rounded bg-indigo-700 text-white text-xs font-semibold hover:bg-indigo-600 border border-indigo-400"
        onClick={() => onChange({ start: dayjs(maxDate).subtract(3, 'month').format('YYYY-MM-DD'), end: maxDate })}
      >
        3M
      </button>
      <button
        type="button"
        className="px-2 py-1 rounded bg-indigo-700 text-white text-xs font-semibold hover:bg-indigo-600 border border-indigo-400"
        onClick={() => onChange({ start: dayjs(maxDate).subtract(6, 'month').format('YYYY-MM-DD'), end: maxDate })}
      >
        6M
      </button>
      <button
        type="button"
        className="px-2 py-1 rounded bg-indigo-700 text-white text-xs font-semibold hover:bg-indigo-600 border border-indigo-400"
        onClick={() => onChange({ start: dayjs(maxDate).subtract(1, 'year').format('YYYY-MM-DD'), end: maxDate })}
      >
        1Y
      </button>
      <button
        type="button"
        className="px-2 py-1 rounded bg-indigo-700 text-white text-xs font-semibold hover:bg-indigo-600 border border-indigo-400"
        onClick={onSetYtd}
      >
        YTD
      </button>
    </div>
  );
};

export default DateRangePicker;
