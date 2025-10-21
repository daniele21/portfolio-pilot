import React from 'react';
import GenericPerformanceSection, { ValueType } from '../../../components/PerformanceSection';
import TimeSeriesChart from '../../../components/charts/TimeSeriesChart';

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
  benchmarkSelector?: React.ReactNode;
}

const PerformanceChartSection: React.FC<PerformanceChartSectionProps> = (props) => {
  const [showLandscapeHint, setShowLandscapeHint] = React.useState(false);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);
  const chartContainerRef = React.useRef<HTMLDivElement>(null);
  
  // Detect mobile portrait mode and show landscape suggestion
  React.useEffect(() => {
    const checkOrientation = () => {
      const mobile = window.innerWidth < 768; // md breakpoint
      const isPortrait = window.innerHeight > window.innerWidth;
      setIsMobile(mobile);
      setShowLandscapeHint(mobile && isPortrait && !isFullscreen);
    };
    
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, [isFullscreen]);

  // Handle fullscreen mode
  const toggleFullscreen = async () => {
    if (!chartContainerRef.current) return;

    try {
      if (!isFullscreen) {
        // Enter fullscreen
        if (chartContainerRef.current.requestFullscreen) {
          await chartContainerRef.current.requestFullscreen();
        } else if ((chartContainerRef.current as any).webkitRequestFullscreen) {
          await (chartContainerRef.current as any).webkitRequestFullscreen();
        } else if ((chartContainerRef.current as any).msRequestFullscreen) {
          await (chartContainerRef.current as any).msRequestFullscreen();
        }
        
        // Try to lock orientation to landscape
        if (screen.orientation && (screen.orientation as any).lock) {
          try {
            await (screen.orientation as any).lock('landscape');
          } catch (e) {
            console.log('Orientation lock not supported or failed');
          }
        }
        
        setIsFullscreen(true);
      } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen();
        }
        
        // Unlock orientation
        if (screen.orientation && (screen.orientation as any).unlock) {
          (screen.orientation as any).unlock();
        }
        
        setIsFullscreen(false);
      }
    } catch (error) {
      console.error('Fullscreen operation failed:', error);
    }
  };

  // Listen for fullscreen changes
  React.useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isCurrentlyFullscreen);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Determine whether the currently selected date range corresponds to YTD
  const isYTDSelected = React.useMemo(() => {
    if (!props.dateRange) return false;
    try {
      const start = new Date(props.dateRange.start);
      const end = new Date(props.dateRange.end);
      const max = new Date(props.maxDate);
      const startOfYear = new Date(max.getFullYear(), 0, 1);

      // Consider YTD if start is Jan 1 of the same year as maxDate and end equals maxDate
      return (
        start.getFullYear() === max.getFullYear() &&
        start.getMonth() === startOfYear.getMonth() &&
        start.getDate() === startOfYear.getDate() &&
        end.getTime() === max.getTime()
      );
    } catch (e) {
      return false;
    }
  }, [props.dateRange, props.maxDate]);

  // This component intentionally does not render any outer layout containers.
  // The parent (page) should provide the outer "card" wrappers so the
  // DOM structure matches other sections (e.g. Holdings Analysis).
  return (
    <div 
      ref={chartContainerRef}
      className={`relative ${isFullscreen ? 'bg-gray-900 p-4' : ''}`}
    >
      {/* Mobile fullscreen button */}
      {isMobile && (
        <div className="absolute top-2 right-2 z-10">
          <button
            onClick={toggleFullscreen}
            className="p-2 bg-gray-800/80 hover:bg-gray-700/80 rounded-lg border border-white/10 transition-colors backdrop-blur-sm"
            title={isFullscreen ? "Exit fullscreen" : "View in fullscreen landscape"}
            aria-label={isFullscreen ? "Exit fullscreen" : "View in fullscreen landscape"}
          >
            {isFullscreen ? (
              <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            )}
          </button>
        </div>
      )}
      
      {/* Landscape mode hint for mobile portrait */}
      {showLandscapeHint && (
        <div className="mb-3 p-3 bg-blue-500/10 border border-blue-400/20 rounded-lg flex items-center gap-3">
          <div className="flex-shrink-0">
            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-blue-200 leading-relaxed">
              💡 <strong>Tip:</strong> Rotate your device for a better chart viewing experience
            </p>
          </div>
          <button
            onClick={() => setShowLandscapeHint(false)}
            className="flex-shrink-0 p-1 rounded-full hover:bg-blue-400/20 transition-colors"
            aria-label="Dismiss hint"
          >
            <svg className="w-4 h-4 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      
      <div className={isFullscreen ? 'h-screen flex flex-col' : ''}>
        {/* Custom mobile-optimized layout */}
        {isMobile && !isFullscreen ? (
          <div className="space-y-3">
            {/* Simplified Date Range Picker for Mobile */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <label className="text-gray-300 text-xs min-w-[28px]">From</label>
                <input
                  type="date"
                  className="bg-gray-800 text-gray-100 rounded px-2 py-1 border border-white/10 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 flex-1"
                  min={props.minDate}
                  max={props.maxDate}
                  value={props.dateRange?.start ?? props.minDate}
                  onChange={(e) => props.onDateRangeChange({ 
                    start: e.target.value, 
                    end: props.dateRange?.end ?? props.maxDate 
                  })}
                />
              </div>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <label className="text-gray-300 text-xs min-w-[16px]">To</label>
                <input
                  type="date"
                  className="bg-gray-800 text-gray-100 rounded px-2 py-1 border border-white/10 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 flex-1"
                  min={props.minDate}
                  max={props.maxDate}
                  value={props.dateRange?.end ?? props.maxDate}
                  onChange={(e) => props.onDateRangeChange({ 
                    start: props.dateRange?.start ?? props.minDate, 
                    end: e.target.value 
                  })}
                />
              </div>
            </div>

            {/* Row with View Mode and Benchmark Selector */}
            <div className="flex items-center justify-between gap-2">
              {/* View Mode Dropdown */}
              <div className="flex items-center gap-1 flex-1">
                <label className="text-xs text-gray-400 min-w-[28px]">View</label>
                <select
                  value={props.valueType}
                  onChange={(e) => props.onValueTypeChange(e.target.value as any)}
                  className="bg-gray-800 text-gray-100 rounded px-2 py-1 border border-white/10 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 flex-1"
                >
                  <option value="value">Net Value</option>
                  <option value="abs_value">Abs Value</option>
                  <option value="pct">Net Perf</option>
                  <option value="performance">Performance</option>
                </select>
              </div>

              {/* Benchmark Selector (simplified for mobile) */}
              <div className="flex items-center gap-1 flex-1">
                {/* <label className="text-xs text-gray-400 min-w-[32px]">Bench</label> */}
                {props.benchmarkSelector}
              </div>
            </div>

            {/* Row with Final Value and Time Frame Buttons */}
            <div className="flex items-center justify-between gap-2">
              <div className="px-2 py-1 rounded bg-indigo-700 text-white text-sm font-bold">
                {props.finalValue}
              </div>

              {/* Scrollable timeframe buttons for small screens; wrap on larger */}
              <div className="flex-1 min-w-0">
                <div className="overflow-x-auto sm:overflow-visible -mx-2 px-2">
                  <div className="flex items-center gap-1.5 whitespace-nowrap sm:whitespace-normal sm:flex-wrap">
                    <button
                      onClick={props.onSetYTD}
                      aria-pressed={isYTDSelected}
                      className={
                        `flex-shrink-0 px-2.5 py-1 rounded-md text-[10px] font-medium transition-all duration-200 shadow-sm backdrop-blur-sm ` +
                        (isYTDSelected
                          ? 'bg-indigo-600/90 text-white hover:bg-indigo-500'
                          : 'bg-gray-800/40 text-gray-300 hover:bg-gray-700/60 hover:text-white')
                      }
                    >
                      YTD
                    </button>

                    <button
                      onClick={() => {
                        const today = props.maxDate;
                        const oneMonth = new Date(today);
                        oneMonth.setMonth(oneMonth.getMonth() - 1);
                        props.onDateRangeChange({ start: oneMonth.toISOString().split('T')[0], end: today });
                      }}
                      className="flex-shrink-0 px-2.5 py-1 rounded-md bg-gray-800/40 text-gray-300 text-[10px] font-medium hover:bg-gray-700/60 hover:text-white transition-all duration-200 shadow-sm backdrop-blur-sm"
                    >
                      1M
                    </button>

                    <button
                      onClick={() => {
                        const today = props.maxDate;
                        const threeMonths = new Date(today);
                        threeMonths.setMonth(threeMonths.getMonth() - 3);
                        props.onDateRangeChange({ start: threeMonths.toISOString().split('T')[0], end: today });
                      }}
                      className="flex-shrink-0 px-2.5 py-1 rounded-md bg-gray-800/40 text-gray-300 text-[10px] font-medium hover:bg-gray-700/60 hover:text-white transition-all duration-200 shadow-sm backdrop-blur-sm"
                    >
                      3M
                    </button>

                    <button
                      onClick={() => {
                        const today = props.maxDate;
                        const sixMonths = new Date(today);
                        sixMonths.setMonth(sixMonths.getMonth() - 6);
                        props.onDateRangeChange({ start: sixMonths.toISOString().split('T')[0], end: today });
                      }}
                      className="flex-shrink-0 px-2.5 py-1 rounded-md bg-gray-800/40 text-gray-300 text-[10px] font-medium hover:bg-gray-700/60 hover:text-white transition-all duration-200 shadow-sm backdrop-blur-sm"
                    >
                      6M
                    </button>

                    <button
                      onClick={() => {
                        const today = props.maxDate;
                        const oneYear = new Date(today);
                        oneYear.setFullYear(oneYear.getFullYear() - 1);
                        props.onDateRangeChange({ start: oneYear.toISOString().split('T')[0], end: today });
                      }}
                      className="flex-shrink-0 px-2.5 py-1 rounded-md bg-gray-800/40 text-gray-300 text-[10px] font-medium hover:bg-gray-700/60 hover:text-white transition-all duration-200 shadow-sm backdrop-blur-sm"
                    >
                      1Y
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Chart */}
            <div className="bg-gray-800/50 rounded-lg border border-white/10 p-3">{
              (() => {
                // (previously inspected sample data; no longer needed)

                if (props.valueType === 'performance') {
                  // Calculate true investment performance: net_unrealised / cost_basis
                  // This measures how well investments performed, isolated from cash flows (buys/sells)
                  const aggByDate: Record<string, { netUnreal: number; costBasis: number }> = {};

                  if (props.series && props.series.length > 0) {
                    props.series.forEach(s => {
                      s.data.forEach((p: any) => {
                        const date = p.date;
                        const netUnreal = Number(p.net_unrealised_pnl ?? p.net_unrealized_pnl ?? 0) || 0;
                        const totalVal = Number(p.total_value ?? 0) || 0;
                        if (!aggByDate[date]) aggByDate[date] = { netUnreal: 0, costBasis: 0 };
                        aggByDate[date].netUnreal += netUnreal;
                        aggByDate[date].costBasis += totalVal;
                      });
                    });
                  } else {
                    (props.data || []).forEach((p: any) => {
                      const date = p.date;
                      const netUnreal = Number(p.net_unrealised_pnl ?? p.net_unrealized_pnl ?? 0) || 0;
                      const totalVal = Number(p.total_value ?? 0) || 0;
                      if (!aggByDate[date]) aggByDate[date] = { netUnreal: 0, costBasis: 0 };
                      aggByDate[date].netUnreal += netUnreal;
                      aggByDate[date].costBasis += totalVal;
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
                  
                  // Prefer backend-provided twr_cum_pct if available
                  if ((props.valueType as any) === 'twr' && props.data && Array.isArray(props.data) && props.data.some((p: any) => typeof p.twr_cum_pct === 'number')) {
                    const builtFromBackend = [{ id: 'portfolio', name: 'Portfolio', data: (props.data || []).map((p: any) => ({ time: p.date, value: Number(p.twr_cum_pct ?? 0) })) }];
                    return (
                      <TimeSeriesChart
                        series={builtFromBackend}
                        height={280}
                        normalizeToZero={false}
                        normalizeToPercent={false}
                        valueFormatter={(value) => `${value.toFixed(2)}%`}
                      />
                    );
                  }

                  const built = [{ 
                    id: 'portfolio', 
                    name: 'Portfolio', 
                    data: dates.map(d => {
                      const { netUnreal, costBasis } = aggByDate[d];
                      const currentMarketValue = costBasis + netUnreal;
                      const performancePct = firstMarketValue > 1e-9 ? 
                        ((currentMarketValue - firstMarketValue) / firstMarketValue * 100.0) : 0.0;
                      return { time: d, value: performancePct };
                    })
                  }];

                  return (
                    <TimeSeriesChart
                      series={built}
                      height={280}
                      // If TWR requested and backend twr not available, let chart normalize market values to percent-from-first
                      normalizeToZero={false}
                      normalizeToPercent={(props.valueType as any) === 'twr'}
                      valueFormatter={(value) => `${value.toFixed(2)}%`}
                    />
                  );
                }

                // non-performance
                return (
                  <TimeSeriesChart
                    series={props.series?.map(s => ({ 
                      id: s.id, 
                      name: s.name, 
                      data: s.data.map((point: any) => ({ 
                        time: point.date, 
                        value: props.valueType === 'pct' 
                          ? (() => {
                              // For 'pct' valueType, compute net unrealized percentage: net_unrealized / total_value
                              const netUnrealized = Number(point.net_unrealised_pnl ?? point.net_unrealized_pnl ?? point.value ?? 0) || 0;
                              const totalVal = Number(point.total_value ?? 0) || 0;
                              return totalVal > 1e-9 ? (netUnrealized / totalVal * 100.0) : 0.0;
                            })()
                          : ((point as any)[props.valueType] ?? point.value ?? 0)
                      })) 
                    })) || [{ 
                      id: 'portfolio', 
                      name: 'Portfolio', 
                      data: props.data.map((point: any) => ({ 
                        time: point.date, 
                        value: props.valueType === 'pct' 
                          ? (() => {
                              // For 'pct' valueType, compute net unrealized percentage: net_unrealized / total_value
                              const netUnrealized = Number(point.net_unrealised_pnl ?? point.net_unrealized_pnl ?? point.value ?? 0) || 0;
                              const totalVal = Number(point.total_value ?? 0) || 0;
                              return totalVal > 1e-9 ? (netUnrealized / totalVal * 100.0) : 0.0;
                            })()
                          : ((point as any)[props.valueType] ?? point.value ?? 0)
                      })) 
                    }]}
                    height={280}
                    valueFormatter={(value) => {
                      if (props.valueType === 'pct') return `${value.toFixed(2)}%`;
                      return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    }}
                    normalizeToZero={false}
                    normalizeToPercent={false}
                  />
                );
              })()
            }</div>

            {/* Volatility Controls After Chart */}
            {props.showVolatility !== undefined && props.setShowVolatility && (
              <div className="flex items-center justify-between gap-2 p-3 bg-gray-800/30 rounded-lg border border-white/5">
                <label className="flex items-center gap-2 text-xs text-gray-300">
                  <input 
                    type="checkbox" 
                    checked={!!props.showVolatility} 
                    onChange={(e) => props.setShowVolatility!(e.target.checked)} 
                    className="rounded w-3 h-3" 
                  />
                  Volatility Overlay
                </label>
                <select 
                  value={props.volatilityWindow} 
                  onChange={(e) => props.setVolatilityWindow && props.setVolatilityWindow(e.target.value)} 
                  className="bg-gray-700 text-gray-100 rounded px-2 py-1 text-xs border border-white/10"
                >
                  <option value="30">30 days</option>
                  <option value="90">90 days</option>
                  <option value="252">1 year</option>
                  <option value="ewm">EWMA</option>
                </select>
              </div>
            )}
          </div>
        ) : (
          /* Desktop/Fullscreen Layout - Use GenericPerformanceSection */
          <GenericPerformanceSection
            title=""
            valueType={props.valueType}
            onValueTypeChange={props.onValueTypeChange}
            data={props.data}
            series={props.series}
            selector={(
              <div className={`flex gap-1 ${isFullscreen ? 'flex-row items-center flex-wrap' : 'flex-col sm:flex-row sm:items-center'} sm:gap-3`}>
                {/* Volatility controls for desktop */}
                {props.showVolatility !== undefined && props.setShowVolatility && (
                  <div className="flex items-center gap-1 sm:gap-2">
                    <label className="flex items-center gap-1 text-xs text-gray-300">
                      <input 
                        type="checkbox" 
                        checked={!!props.showVolatility} 
                        onChange={(e) => props.setShowVolatility!(e.target.checked)} 
                        className="rounded w-3 h-3 sm:w-4 sm:h-4" 
                      />
                      <span>Volatility</span>
                    </label>
                    <select 
                      value={props.volatilityWindow} 
                      onChange={(e) => props.setVolatilityWindow && props.setVolatilityWindow(e.target.value)} 
                      className="bg-gray-700 text-gray-100 rounded px-1 py-0.5 sm:px-2 sm:py-1 text-xs border border-white/10"
                    >
                      <option value="30">30d</option>
                      <option value="90">90d</option>
                      <option value="252">1y</option>
                      <option value="ewm">EWMA</option>
                    </select>
                  </div>
                )}
                
                {/* Benchmark selector for desktop */}
                {props.benchmarkSelector}
                
                {isFullscreen && (
                  <div className="flex items-center gap-2 text-xs text-gray-400 ml-auto">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2-2v14a2 2 0 002 2z" />
                    </svg>
                    <span>Fullscreen Mode</span>
                  </div>
                )}
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
        )}
      </div>
    </div>
  );
};

export default PerformanceChartSection;
