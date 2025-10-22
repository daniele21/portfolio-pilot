import type { HistoricalDataPoint } from '../../types';
import type { ValueType } from './valueTypes';

export interface ChartPoint {
  time: string;
  value: number;
}

export interface ChartSeries {
  id: string;
  name: string;
  data: ChartPoint[];
}

export interface BuildPerformanceChartConfigArgs {
  valueType: ValueType;
  title: string;
  primaryData?: HistoricalDataPoint[];
  comparisonSeries?: Array<{ id: string; name: string; data: HistoricalDataPoint[] }>;
}

export interface PerformanceChartConfig {
  series: ChartSeries[];
  normalizeToPercent: boolean;
  normalizeToZero: boolean;
  valueFormatter: (value: number) => string;
}

const EPSILON = 1e-9;

const percentFormatter = (value: number) => `${value.toFixed(2)}%`;
const numberFormatter = (value: number) =>
  value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const toNumber = (value: unknown, fallback = 0): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const gatherSnapshotSources = (
  primaryData?: HistoricalDataPoint[],
  comparisonSeries?: Array<{ id: string; name: string; data: HistoricalDataPoint[] }>
) => {
  const sources: HistoricalDataPoint[][] = [];
  if (comparisonSeries && comparisonSeries.length > 0) {
    comparisonSeries.forEach(series => {
      sources.push(series.data ?? []);
    });
  }
  if (!sources.length && primaryData) {
    sources.push(primaryData);
  }
  return sources;
};

interface AggregatedSnapshot {
  netUnreal: number;
  costBasis: number;
  market: number;
}

const aggregateSnapshotsByDate = (
  sources: HistoricalDataPoint[][]
): Record<string, AggregatedSnapshot> => {
  const aggregated: Record<string, AggregatedSnapshot> = {};
  sources.forEach(points => {
    (points ?? []).forEach(point => {
      const date = point?.date;
      if (!date) return;
      const netUnreal = toNumber(
        (point as any).net_unrealised_pnl ??
          (point as any).net_unrealized_pnl ??
          (point as any).value,
        0
      );
      const costBasis = toNumber((point as any).total_value, 0);
      const market = toNumber(
        (point as any).total_market_value ?? costBasis + netUnreal,
        costBasis + netUnreal
      );
      if (!aggregated[date]) {
        aggregated[date] = { netUnreal: 0, costBasis: 0, market: 0 };
      }
      aggregated[date].netUnreal += netUnreal;
      aggregated[date].costBasis += costBasis;
      aggregated[date].market += market;
    });
  });
  return aggregated;
};

export const buildNormalizedTwrSeries = (
  points: HistoricalDataPoint[] | undefined,
  id: string,
  name: string
): ChartSeries | null => {
  if (!points || points.length === 0) {
    return null;
  }
  const sorted = [...points].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  let baseline: number | null = null;
  let runningIndex = 1;
  const usable: ChartPoint[] = [];
  sorted.forEach(point => {
    const indexRaw = point.twr_index;
    const dailyRaw = point.twr_daily_pct;
    const cumRaw = point.twr_cum_pct;
    let index: number | null = null;
    if (typeof indexRaw === 'number' && Number.isFinite(indexRaw)) {
      index = indexRaw;
      runningIndex = indexRaw;
    } else if (typeof cumRaw === 'number' && Number.isFinite(cumRaw)) {
      index = 1 + cumRaw / 100;
      runningIndex = index;
    } else if (typeof dailyRaw === 'number' && Number.isFinite(dailyRaw)) {
      const next = runningIndex * (1 + dailyRaw / 100);
      runningIndex = next;
      index = next;
    }
    if (index === null) return;
    if (baseline === null) {
      baseline = index;
    }
    const safeBaseline =
      baseline !== null && Math.abs(baseline) > EPSILON ? baseline : 1;
    usable.push({
      time: point.date,
      value: (index / safeBaseline - 1) * 100
    });
  });
  if (!usable.length) {
    return null;
  }
  return {
    id,
    name,
    data: usable
  };
};

export const extractValueForType = (valueType: ValueType, point: any): number => {
  switch (valueType) {
    case 'performance': {
      const realized = toNumber(point.realized ?? point.realised, 0);
      const unreal = toNumber(
        point.net_unrealised_pnl ?? point.net_unrealized_pnl ?? point.value,
        0
      );
      const spent = toNumber(point.total_cost_spent, 0);
      return spent > EPSILON ? ((realized + unreal) / spent) * 100 : 0;
    }
    case 'pct': {
      const netUnrealized = toNumber(
        point.net_unrealised_pnl ?? point.net_unrealized_pnl ?? point.value,
        0
      );
      const spent = toNumber(point.total_cost_spent, 0);
      return spent > EPSILON ? (netUnrealized / spent) * 100 : 0;
    }
    case 'twr': {
      const indexPct = toNumber(
        point.twr_index_pct ?? point.twr_cum_pct ?? point.twr_daily_pct,
        NaN
      );
      if (Number.isFinite(indexPct)) {
        return indexPct;
      }
      const index = toNumber(point.twr_index, NaN);
      if (Number.isFinite(index) && index > EPSILON) {
        return (index - 1) * 100;
      }
      return 0;
    }
    default:
      return toNumber(point?.[valueType] ?? point?.value, 0);
  }
};

export const selectValueFormatter = (
  valueType: ValueType,
  forcePercent = false
): ((value: number) => string) => {
  const isPercent =
    forcePercent ||
    valueType === 'pct' ||
    valueType === 'performance' ||
    valueType === 'twr';
  return isPercent ? percentFormatter : numberFormatter;
};

export const transformSeriesForValueType = (
  valueType: ValueType,
  rawSeries: Array<{ id: string; name: string; data: HistoricalDataPoint[] }>
): ChartSeries[] =>
  (rawSeries ?? []).map(series => ({
    id: series.id,
    name: series.name,
    data: (series.data ?? []).map(point => ({
      time: point.date,
      value: extractValueForType(valueType, point)
    }))
  }));

const buildPerformanceSeries = (
  aggregated: Record<string, AggregatedSnapshot>,
  title: string
): ChartSeries => {
  const dates = Object.keys(aggregated).sort();
  if (!dates.length) {
    return { id: 'portfolio', name: title, data: [] };
  }
  const firstDate = dates[0];
  const firstMarket = aggregated[firstDate].market;
  const data = dates.map(date => {
    const current = aggregated[date].market;
    const pct = firstMarket > EPSILON ? ((current - firstMarket) / firstMarket) * 100 : 0;
    return { time: date, value: pct };
  });
  return { id: 'portfolio', name: title, data };
};

const buildMarketSeries = (
  aggregated: Record<string, AggregatedSnapshot>,
  title: string
): ChartSeries => {
  const dates = Object.keys(aggregated).sort();
  const data = dates.map(date => ({
    time: date,
    value: aggregated[date].market
  }));
  return { id: 'portfolio', name: title, data };
};

export const buildPerformanceChartConfig = ({
  valueType,
  title,
  primaryData,
  comparisonSeries
}: BuildPerformanceChartConfigArgs): PerformanceChartConfig => {
  const baseFormatter = selectValueFormatter(valueType);
  const sources = gatherSnapshotSources(primaryData, comparisonSeries);

  if (valueType === 'performance' || valueType === 'twr') {
    const aggregated = aggregateSnapshotsByDate(sources);
    const normalizedSeries =
      valueType === 'twr'
        ? buildNormalizedTwrSeries(primaryData, 'portfolio', title)
        : null;
    if (valueType === 'twr' && normalizedSeries) {
      return {
        series: [normalizedSeries],
        normalizeToPercent: false,
        normalizeToZero: false,
        valueFormatter: percentFormatter
      };
    }

    const hasData = Object.keys(aggregated).length > 0;
    if (!hasData) {
      return {
        series: [],
        normalizeToPercent: valueType === 'twr',
        normalizeToZero: false,
        valueFormatter: percentFormatter
      };
    }

    if (valueType === 'twr') {
      const marketSeries = buildMarketSeries(aggregated, title);
      return {
        series: [marketSeries],
        normalizeToPercent: true,
        normalizeToZero: false,
        valueFormatter: percentFormatter
      };
    }

    const performanceSeries = buildPerformanceSeries(aggregated, title);
    return {
      series: [performanceSeries],
      normalizeToPercent: false,
      normalizeToZero: false,
      valueFormatter: percentFormatter
    };
  }

  const hasComparison = comparisonSeries && comparisonSeries.length > 0;
  const chartSeries = hasComparison
    ? transformSeriesForValueType(valueType, comparisonSeries ?? [])
    : [
        {
          id: 'portfolio',
          name: title,
          data: (primaryData ?? []).map(point => ({
            time: point.date,
            value: extractValueForType(valueType, point)
          }))
        }
      ];

  return {
    series: chartSeries,
    normalizeToPercent: false,
    normalizeToZero: false,
    valueFormatter: selectValueFormatter(valueType)
  };
};
