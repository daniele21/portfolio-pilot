export type ValueType = 'value' | 'abs_value' | 'pct' | 'performance' | 'twr';

export const VALUE_TYPE_LABELS: Record<ValueType, string> = {
  value: 'Net Value',
  abs_value: 'Absolute Value',
  pct: 'Net Performance',
  performance: 'Performance',
  twr: 'TWR'
};

export const MOBILE_VALUE_TYPE_LABELS: Record<ValueType, string> = {
  value: 'Net Value',
  abs_value: 'Abs Value',
  pct: 'Net Perf',
  performance: 'Performance',
  twr: 'TWR'
};

const PERCENT_TYPES: ValueType[] = ['pct', 'performance', 'twr'];

export const isPercentValueType = (valueType: ValueType): boolean =>
  PERCENT_TYPES.includes(valueType);
