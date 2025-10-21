import React from 'react';
// PresentationChartLineIcon intentionally unused here; remove import to avoid lint warnings
import TimeSeriesChart from './charts/TimeSeriesChart';
import DateRangePicker from '../components/DateRangePicker';
import type { HistoricalDataPoint } from '../types';

const buildNormalizedTwrSeries = (
  points: HistoricalDataPoint[] | undefined,
  id: string,
  name: string
) => {
  if (!points || points.length === 0) return null;
  const sorted = [...points].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  let baseline: number | null = null;
  let runningIndex = 1;
  const usable = [];
  // Rebuild cumulative TWR by preferring backend-provided index, falling back to daily or cumulative pct
  for (const point of sorted) {
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
    if (index === null) {
      continue;
    }
    if (baseline === null) {
      baseline = index;
    }
    const safeBaseline =
      baseline !== null && Math.abs(baseline) > 1e-12 ? baseline : 1;
    usable.push({
      time: point.date,
      value: (index / safeBaseline - 1) * 100
    });
  }
  if (usable.length === 0) return null;
  return {
    id,
    name,
    data: usable
  };
};

export type ValueType = 'value' | 'abs_value' | 'pct' | 'performance' | 'twr';

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
  finalValue,
  selector
}) => {
  const hasMulti = series && series.length > 0;
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 640); // sm breakpoint
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);

    return () => {
      window.removeEventListener('resize', checkScreenSize);
    };
  }, []);

  return (
    <div className="mb-8">
      {/* <h2 className="text-2xl font-semibold text-white mb-4 flex items-center">
        <PresentationChartLineIcon className="h-7 w-7 mr-2 text-indigo-400" />
        {title}
      </h2> */}

      {/* Controls: Value Type radios, final badge, extra selector */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-4 mb-3 sm:mb-4 sm:justify-between">
        {/* Top row on mobile: Value type selector and final value */}
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          {/* Compact dropdown to select the value type */}
          {(() => {
            const labels: Record<ValueType, string> = {
              value: 'Net Value',
              abs_value: 'Absolute Value',
              pct: 'Net Performance',
              performance: 'Performance',
              twr: 'TWR'
            };
            const mobileLabels: Record<ValueType, string> = {
              value: 'Net Value',
              abs_value: 'Abs Value',
              pct: 'Net Perf',
              performance: 'Performance',
              twr: 'TWR'
            };
            return (
              <div className="flex items-center gap-1 sm:gap-3">
                <label htmlFor="valueTypeSelect" className="text-xs sm:text-sm text-gray-400 hidden sm:inline">View</label>

                <div className="relative">
                  <select
                    id="valueTypeSelect"
                    value={valueType}
                    onChange={(e) => onValueTypeChange(e.target.value as ValueType)}
                    className="appearance-none bg-gray-800 text-gray-100 rounded px-2 py-1 sm:px-3 sm:py-1.5 border border-white/10 text-xs sm:text-sm pr-6 sm:pr-8 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400"
                    aria-label="Select value type"
                    title="Select view"
                  >
                    {(Object.keys(labels) as ValueType[]).map(key => (
                      <option key={key} value={key}>
                        {isMobile ? mobileLabels[key] : labels[key]}
                      </option>
                    ))}
                  </select>

                  {/* Chevron */}
                  <div className="pointer-events-none absolute inset-y-0 right-1 sm:right-2 flex items-center">
                    <svg className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400" viewBox="0 0 20 20" fill="none" aria-hidden>
                      <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
              </div>
            );
          })()}

          <span className="px-2 py-0.5 sm:px-3 sm:py-1 rounded sm:rounded-lg bg-indigo-700 text-white text-sm sm:text-base font-bold shadow-md border border-indigo-400">
            {finalValue}
          </span>
        </div>

        {/* Selector row */}
        {selector && (
          <div className="flex justify-center sm:justify-end sm:flex-1 sm:min-w-[260px]">
            {selector}
          </div>
        )}
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
        <div className="mt-6 bg-gray-800/50 rounded-lg border border-white/10 p-4">{
            (() => {
              // Build series for chart: 'pct' uses backend pct; 'performance' is computed client-side and normalized per series
              if (valueType === 'performance' || valueType === 'twr') {
                // Calculate true investment performance: net_unrealised / cost_basis
                // This isolates investment gains/losses from cash flow effects (buys/sells)
                const aggByDate: Record<string, { netUnreal: number; costBasis: number }> = {};
                
                if (series && series.length > 0) {
                  series.forEach(s => {
                    s.data.forEach((p: any) => {
                      const d = p.date;
                      const netUnreal = Number(p.net_unrealised_pnl ?? p.net_unrealized_pnl ?? 0) || 0;
                      const totalVal = Number(p.total_value ?? 0) || 0;
                      if (!aggByDate[d]) aggByDate[d] = { netUnreal: 0, costBasis: 0 };
                      aggByDate[d].netUnreal += netUnreal;
                      aggByDate[d].costBasis += totalVal;
                    });
                  });
                } else {
                  data.forEach((p: any) => {
                    const d = p.date;
                    const netUnreal = Number(p.net_unrealised_pnl ?? p.net_unrealized_pnl ?? 0) || 0;
                    const totalVal = Number(p.total_value ?? 0) || 0;
                    if (!aggByDate[d]) aggByDate[d] = { netUnreal: 0, costBasis: 0 };
                    aggByDate[d].netUnreal += netUnreal;
                    aggByDate[d].costBasis += totalVal;
                  });
                }

                  const dates = Object.keys(aggByDate).sort();
                
                // Calculate portfolio market value performance (same as KPI calculation)
                // This matches the backend's compute_returns_since() logic
                let firstMarketValue = 0;
                
                if (dates.length > 0) {
                  const firstDate = dates[0];
                  const { netUnreal, costBasis } = aggByDate[firstDate];
                  firstMarketValue = costBasis + netUnreal; // total_market_value = cost_basis + net_unrealised
                }
                
                // If backend provided per-date twr_cum_pct in the flattened `data` series, prefer that exact series
                if (valueType === 'twr') {
                  const normalized = buildNormalizedTwrSeries(data as HistoricalDataPoint[] | undefined, 'portfolio', title);
                  if (normalized) {
                    return (
                      <TimeSeriesChart
                        series={[normalized]}
                        height={320}
                        valueFormatter={(value) => `${value.toFixed(2)}%`}
                        normalizeToZero={false}
                        normalizeToPercent={false}
                      />
                    );
                  }
                }

                const built = [{ 
                  id: 'portfolio', 
                  name: title, 
                  data: dates.map(d => {
                    const { netUnreal, costBasis } = aggByDate[d];
                    const currentMarketValue = costBasis + netUnreal;
                    // Calculate performance as: (current_market_value - first_market_value) / first_market_value * 100
                    const performancePct = firstMarketValue > 1e-9 ? ((currentMarketValue - firstMarketValue) / firstMarketValue * 100.0) : 0.0;
                    // For 'twr' fallback we will let the chart normalize the market values to percent-from-first
                    return { time: d, value: performancePct };
                  })
                }];

                return (
                  <TimeSeriesChart
                    series={built}
                    height={320}
                    valueFormatter={(value) => `${value.toFixed(2)}%`}
                    // No normalization needed for performance, but when valueType==='twr' we may want percent-from-first
                    normalizeToZero={false}
                    normalizeToPercent={valueType === 'twr'}
                  />
                );
              }
              // non-performance: normal mapping
              return (
                <TimeSeriesChart
                  series={series!.map(s => ({
                    id: s.id,
                    name: s.name,
                    data: s.data.map(point => ({ 
                      time: point.date, 
                      // For 'pct' use the backend-provided pct value
                      value: valueType === 'pct' ? Number((point as any).pct ?? 0) : ((point as any)[valueType] ?? (point as any).value ?? 0)
                    }))
                  }))}
                  height={320}
                  valueFormatter={(value) => {
                    if (valueType === 'pct') return `${value.toFixed(2)}%`;
                    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                  }}
                />
              );
            })()
        }</div>
      ) : (
        <div className="mt-6 bg-gray-800/50 rounded-lg border border-white/10 p-4">{
            (() => {
              if (valueType === 'performance' || valueType === 'twr') {

                  if (valueType === 'twr') {
                    const normalized = buildNormalizedTwrSeries(data as HistoricalDataPoint[] | undefined, 'portfolio', title);
                    if (normalized) {
                      return (
                        <TimeSeriesChart
                          series={[normalized]}
                          height={320}
                          valueFormatter={(value) => `${value.toFixed(2)}%`}
                          normalizeToZero={false}
                          normalizeToPercent={false}
                        />
                      );
                    }
                  }

                  // Compute per-date portfolio market value from available fields and
                  // aggregate across series (or from single data). Prefer provided
                  // total_market_value; otherwise reconstruct as total_value + net_unrealised.
                  const aggByDate: Record<string, number> = {};
                  if (series && series.length > 0) {
                    series.forEach(s => {
                      s.data.forEach((p: any) => {
                        const d = p.date;
                        const netUnreal = Number(p.net_unrealised_pnl ?? p.net_unrealized_pnl ?? 0) || 0;
                        const totalVal = Number(p.total_value ?? 0) || 0;
                        const market = Number(p.total_market_value ?? (totalVal + netUnreal)) || 0;
                        if (!aggByDate[d]) aggByDate[d] = 0;
                        aggByDate[d] += market;
                      });
                    });
                  } else {
                    data.forEach((p: any) => {
                      const d = p.date;
                      const netUnreal = Number(p.net_unrealised_pnl ?? p.net_unrealized_pnl ?? 0) || 0;
                      const totalVal = Number(p.total_value ?? 0) || 0;
                      const market = Number(p.total_market_value ?? (totalVal + netUnreal)) || 0;
                      if (!aggByDate[d]) aggByDate[d] = 0;
                      aggByDate[d] += market;
                    });
                  }

                  const dates = Object.keys(aggByDate).sort();

                  // If 'twr' requested, prefer backend-provided twr_cum_pct when available.
                  if (valueType === 'twr') {
                    // We cannot access backend twr directly here because fetchPortfolioPerformance currently maps to HistoricalDataPoint.
                    // Instead, pass market values and let TimeSeriesChart normalize to percent-from-first which approximates cumulative TWR when flows are excluded.
                    const builtMarket = [{ id: 'portfolio', name: title, data: dates.map(d => ({ time: d, value: aggByDate[d] })) }];
                    return (
                      <TimeSeriesChart
                        series={builtMarket}
                        height={320}
                        valueFormatter={(value) => `${value.toFixed(2)}%`}
                        normalizeToZero={false}
                        normalizeToPercent={true}
                      />
                    );
                  }

                  const built = [{ id: 'portfolio', name: title, data: dates.map(d => ({ time: d, value: aggByDate[d] })) }];

                  return (
                    <TimeSeriesChart
                      series={built}
                      height={320}
                      valueFormatter={(value) => `${value.toFixed(2)}%`}
                      // percent-from-first applied to portfolio market values yields
                      // the period percent change ((end - start)/start*100) matching KPIs
                      normalizeToZero={false}
                      normalizeToPercent={true}
                    />
                  );
              }
              // non-performance
              return (
                <TimeSeriesChart
                  series={[{ id: 'portfolio', name: title, data: data.map(point => ({ 
                    time: point.date, 
                    value: valueType === 'pct' 
                      ? (() => {
                          // For 'pct' valueType, compute net unrealized percentage: net_unrealized / total_cost_spent
                          const netUnrealized = Number((point as any).net_unrealised_pnl ?? (point as any).net_unrealized_pnl ?? (point as any).value ?? 0) || 0;
                          const spent = Number((point as any).total_cost_spent ?? 0) || 0;
                          return spent > 1e-9 ? (netUnrealized / spent * 100.0) : 0.0;
                        })()
                      : ((point as any)[valueType] ?? (point as any).value ?? 0)
                  })) }]}
                  height={320}
                  valueFormatter={(value) => {
                    if (valueType === 'pct') return `${value.toFixed(2)}%`;
                    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                  }}
                />
              );
            })()
        }</div>
      ))}
    </div>
  );
};

export default GenericPerformanceSection;
