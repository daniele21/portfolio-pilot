import React from 'react';
import GenericPerformanceSection, { ValueType } from '../../../components/PerformanceSection';

interface PerformanceChartSectionProps {
  title: string;
  valueType: ValueType;
  onValueTypeChange: (v: ValueType) => void;
  data: any[];
  series: any[];
  dateRange: { start: string; end: string } | null;
  onDateRangeChange: (r: { start: string; end: string } | null) => void;
  minDate: string;
  maxDate: string;
  onSetYTD: () => void;
  loading: boolean;
  finalValue: string;
}

const PerformanceChartSection: React.FC<PerformanceChartSectionProps> = (props) => {
  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-white">{props.title}</h2>
      </div>
      <div className="bg-white/5 rounded-xl p-4">
        <GenericPerformanceSection
          title={props.title}
          valueType={props.valueType}
          onValueTypeChange={props.onValueTypeChange}
          data={props.data}
          series={props.series}
          dateRange={props.dateRange}
          onDateRangeChange={props.onDateRangeChange}
          minDate={props.minDate}
          maxDate={props.maxDate}
          onSetYTD={props.onSetYTD}
          loading={props.loading}
          notEnoughDataMessage="Not enough portfolio data to display performance chart"
          finalValue={props.finalValue}
        />
      </div>
    </div>
  );
};

export default PerformanceChartSection;
