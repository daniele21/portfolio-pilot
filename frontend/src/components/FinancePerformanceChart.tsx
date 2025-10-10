import React from 'react';
import { Card, Group, Text, SegmentedControl, Button, Select } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import TimeSeriesChart from './charts/TimeSeriesChart';
import type { ValueType } from './PerformanceSection';

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
  const chartSeries = React.useMemo(() => {
    return series.map(s => ({
      ...s,
      data: s.data.map(point => ({
        time: point.date,
        value: point[valueType] || point.value || 0
      }))
    }));
  }, [series, valueType]);

  const valueTypeOptions = [
    { label: 'Absolute', value: 'abs_value' },
    { label: 'Net Value', value: 'value' },
    { label: 'Percentage', value: 'pct' },
    { label: '% from Start', value: 'pct_from_first' }
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
              onChange={(dates) => {
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
            valueFormatter={(value) => {
              if (valueType === 'pct' || valueType === 'pct_from_first') {
                return `${value.toFixed(2)}%`;
              }
              return value.toLocaleString(undefined, { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
              });
            }}
          />
        )}
      </Card.Section>
    </Card>
  );
};

export default FinancePerformanceChart;