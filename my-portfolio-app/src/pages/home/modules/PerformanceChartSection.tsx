import React from 'react';
import GenericPerformanceSection, { ValueType } from '../../../components/PerformanceSection';

interface PerformanceChartSectionProps {
  title: string;
  valueType: ValueType;
  onValueTypeChange: (v: ValueType) => void;
  data: any[];
  series: any[];
  showVolatility?: boolean;
  setShowVolatility?: (v: boolean) => void;
  volatilityWindow?: string;
  setVolatilityWindow?: (v: string) => void;
  dateRange: { start: string; end: string } | null;
  onDateRangeChange: (r: { start: string; end: string } | null) => void;
  minDate: string;
  maxDate: string;
  onSetYTD: () => void;
  loading: boolean;
  finalValue: string;
}

const PerformanceChartSection: React.FC<PerformanceChartSectionProps> = (props) => {
  // This component intentionally does not render any outer layout containers.
  // The parent (page) should provide the outer "card" wrappers so the
  // DOM structure matches other sections (e.g. Holdings Analysis).
  return (
    <GenericPerformanceSection
      title=""
      valueType={props.valueType}
      onValueTypeChange={props.onValueTypeChange}
      data={props.data}
      series={props.series}
      selector={(
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={!!props.showVolatility} onChange={(e) => props.setShowVolatility && props.setShowVolatility(e.target.checked)} className="rounded" />
            <span>Volatility</span>
          </label>
          <select value={props.volatilityWindow} onChange={(e) => props.setVolatilityWindow && props.setVolatilityWindow(e.target.value)} className="bg-gray-700 text-gray-100 rounded-md px-2 py-1 text-sm border border-white/10">
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="252">1 year</option>
            <option value="ewm">EWMA</option>
          </select>
        </div>
      )}
      dateRange={props.dateRange}
      onDateRangeChange={props.onDateRangeChange}
      minDate={props.minDate}
      maxDate={props.maxDate}
      onSetYTD={props.onSetYTD}
      loading={props.loading}
      notEnoughDataMessage="Not enough portfolio data to display performance chart"
      finalValue={props.finalValue}
    />
  );
};

export default PerformanceChartSection;
