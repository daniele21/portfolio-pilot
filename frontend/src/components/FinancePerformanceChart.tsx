import React from 'react';
import { Card, Group, Text, SegmentedControl, Button } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import TimeSeriesChart from './charts/TimeSeriesChart';
import {
  selectValueFormatter,
  transformSeriesForValueType
} from '../features/performance/chartBuilders';
import type { ValueType } from '../features/performance/valueTypes';
import { VALUE_TYPE_LABELS } from '../features/performance/valueTypes';

export interface FinancePerformanceChartProps {
  title: string;
  valueType: ValueType;
  onValueTypeChange: (type: ValueType) => void;
  series: Array<{ id: string; name: string; data: any[] }>;
  dateRange: { start: string; end: string } | null;
  onDateRangeChange: (range: { start: string; end: string } | null) => void;
  minDate?: string;
  maxDate?: string;
  onSetYTD?: () => void;
  loading?: boolean;
  finalValue?: string;
  selector?: React.ReactNode;
}

const FinancePerformanceChart: React.FC<FinancePerformanceChartProps> = ({
  title,
  valueType,
  onValueTypeChange,
  series,
  dateRange,
  onDateRangeChange,
  minDate,
  maxDate,
  onSetYTD,
  loading = false,
  finalValue,
  selector
}) => {
  // Transform series data for TimeSeriesChart
  const chartSeries = React.useMemo(
    () => transformSeriesForValueType(valueType, series),
    [series, valueType]
  );

  const valueFormatter = React.useMemo(
    () => selectValueFormatter(valueType),
    [valueType]
  );

  const valueTypeOptions = [
    { label: VALUE_TYPE_LABELS.abs_value, value: 'abs_value' },
    { label: VALUE_TYPE_LABELS.value, value: 'value' },
    { label: VALUE_TYPE_LABELS.pct, value: 'pct' },
    { label: '% from Start', value: 'performance' }
  ];

  return (
    <Card withBorder padding="lg" radius="md">
      <Card.Section p="md" withBorder>
        <Group justify="space-between" align="center">
          <Text size="lg" fw={600} style={{ fontFamily: 'Inter, sans-serif' }}>
            {title}
          </Text>
          <Group gap="md">
            {selector}
            <SegmentedControl
              size="sm"
              value={valueType}
              onChange={(value) => onValueTypeChange(value as ValueType)}
              data={valueTypeOptions}
              style={{ fontFamily: 'Inter, sans-serif' }}
            />
          </Group>
        </Group>
      </Card.Section>

      <Card.Section p="md" withBorder>
        <Group justify="space-between" align="center">
          <Group gap="sm">
              <DatePickerInput
              type="range"
              placeholder="Select date range"
              value={dateRange ? [new Date(dateRange.start), new Date(dateRange.end)] : [null, null]}
              onChange={(dates: [Date | null, Date | null]) => {
                if (dates[0] && dates[1]) {
                  onDateRangeChange({
                    start: dates[0].toISOString().split('T')[0],
                    end: dates[1].toISOString().split('T')[0]
                  });
                } else {
                  onDateRangeChange(null);
                }
              }}
              size="sm"
              style={{ fontFamily: 'Inter, sans-serif' }}
            />
            {onSetYTD && (
              <Button size="sm" variant="light" onClick={onSetYTD}>
                YTD
              </Button>
            )}
          </Group>
          {finalValue && (
            <Text 
              size="lg" 
              fw={600} 
              style={{ 
                fontFamily: 'Inter, sans-serif',
                fontVariantNumeric: 'tabular-nums' 
              }}
            >
              {finalValue}
            </Text>
          )}
        </Group>
      </Card.Section>

      <Card.Section p="md">
        {loading ? (
          <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Text c="dimmed">Loading chart data...</Text>
          </div>
        ) : (
            <TimeSeriesChart 
            series={chartSeries}
            height={300}
            // Values are already percent when valueType === 'performance'
            valueFormatter={valueFormatter}
            normalizeToZero={false}
            normalizeToPercent={false}
          />
        )}
      </Card.Section>
    </Card>
  );
};

export default FinancePerformanceChart;
