import React, { useEffect } from 'react';
import { useAuth } from '../../AuthContext';
import { useSelectedPortfolio } from '../../SelectedPortfolioContext';
import { useQuery } from '@tanstack/react-query';
import { 
  fetchAllPortfolioNames, 
  fetchPortfolioKpis, 
  fetchPortfolioAllocation,
  fetchPortfolioReturnsKpis,
  fetchPortfolioVolatility,
  fetchPortfolioVolatilitySeries,
  fetchPortfolioPerformance,
  fetchPortfolioTargets
} from '../../services/portfolioService';
import { fetchPortfolioRisk } from '../../services/portfolioService';
import PageShell from '../../components/PageShell';
import ProjectOverview from './modules/ProjectOverview';
import RiskAnalysis from './modules/RiskAnalysis';
import AssetAllocationSummary from './modules/AssetAllocationSummary';
import MiniSummary from './modules/MiniSummary';
import PerformanceChartSection from './modules/PerformanceChartSection';
import { ChartBarIcon } from '@heroicons/react/24/outline';
import { ValueType } from '../../components/PerformanceSection';
import { fetchBenchmarkPerformance } from '../../services/marketDataService';
import { idbGet } from '../../utils/idbCache';

const VOLATILITY_PRESETS = [
  { label: '30 days', value: '30' },
  { label: '90 days', value: '90' },
  { label: '1 year', value: '252' },
  // { label: 'EWMA', value: 'ewm' }
];

const SimpleHome: React.FC = () => {
  const { isLoggedIn, idToken } = useAuth();
  const { selectedPortfolio, setSelectedPortfolio } = useSelectedPortfolio();
  const [maskPortfolioValue, setMaskPortfolioValue] = React.useState(true);
  // allocationView options (quoteType removed): overall | asset_type | category | risk
  const [allocationView, setAllocationView] = React.useState<'overall' | 'asset_type' | 'category' | 'risk'>('overall');
  const [volatilityWindow, setVolatilityWindow] = React.useState<string>(VOLATILITY_PRESETS[0].value);
  const [showVolatility, setShowVolatility] = React.useState<boolean>(false);
  
  // Performance section state
  // Default the value type to 'Performance' view (pct_from_first) so the select shows "Performance" by default
  const [performanceValueType, setPerformanceValueType] = React.useState<ValueType>('pct_from_first');
  const [performanceDateRange, setPerformanceDateRange] = React.useState<{start: string; end: string} | null>(null);
  
  // Benchmarks: load a persisted list from IndexedDB if available, otherwise fallback to defaults
  const DEFAULT_BENCHMARKS = [
    { symbol: '^GSPC', name: 'S&P 500' },
    { symbol: '^NDX', name: 'NASDAQ 100' },
    { symbol: '^RUT', name: 'Russell 2000' },
    { symbol: '^STOXX50E', name: 'Euro Stoxx 50' },
    { symbol: 'FTSEMIB.MI', name: 'FTSE MIB' }
  ];
  const [BENCHMARK_TICKERS, setBenchmarkTickers] = React.useState<{ symbol: string; name: string }[]>(DEFAULT_BENCHMARKS);
  const [selectedBenchmarks, setSelectedBenchmarks] = React.useState<string[]>([]);
  const [benchmarkPerformance, setBenchmarkPerformance] = React.useState<Record<string, any[]>>({});

  // CollapsibleSection - mobile-only collapsible wrapper
  const CollapsibleSection: React.FC<{
    title?: string;
    className?: string;
    children?: React.ReactNode;
  }> = ({ title, className = '', children }) => {
    const [isMobile, setIsMobile] = React.useState(false);
    const [open, setOpen] = React.useState(true); // Default expanded
    const contentRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
      const mq = window.matchMedia('(max-width: 640px)');
      const onChange = (e: MediaQueryListEvent | MediaQueryList) => setIsMobile('matches' in e ? e.matches : (e as MediaQueryList).matches);
      setIsMobile(mq.matches);
      // Always start expanded
      setOpen(true);
      if (mq.addEventListener) mq.addEventListener('change', onChange as any);
      else mq.addListener(onChange as any);
      return () => {
        if (mq.removeEventListener) mq.removeEventListener('change', onChange as any);
        else mq.removeListener(onChange as any);
      };
    }, []);

    // Handle clicks on card titles for mobile collapse and style them
    React.useEffect(() => {
      if (!contentRef.current) return;

      const content = contentRef.current;
      const titles = content.querySelectorAll('h2.font-bold.text-white');

      if (isMobile) {
        // Add mobile-specific styling and click handler
        const handleTitleClick = (e: Event) => {
          e.preventDefault();
          setOpen(prev => !prev);
        };

        titles.forEach(title => {
          (title as HTMLElement).style.cursor = 'pointer';
          (title as HTMLElement).style.transition = 'opacity 0.2s ease';
          (title as HTMLElement).addEventListener('click', handleTitleClick);
          
          // Add hover effect
          const addHover = () => (title as HTMLElement).style.opacity = '0.8';
          const removeHover = () => (title as HTMLElement).style.opacity = '1';
          title.addEventListener('mouseenter', addHover);
          title.addEventListener('mouseleave', removeHover);
        });

        return () => {
          titles.forEach(title => {
            (title as HTMLElement).style.cursor = '';
            (title as HTMLElement).style.transition = '';
            (title as HTMLElement).style.opacity = '';
            title.removeEventListener('click', handleTitleClick);
          });
        };
      } else {
        // Reset styles for desktop
        titles.forEach(title => {
          (title as HTMLElement).style.cursor = '';
          (title as HTMLElement).style.transition = '';
          (title as HTMLElement).style.opacity = '';
        });
      }
    }, [isMobile, open]);

    return (
      <div className={`w-full ${className}`}> 
        {/* Show title only when collapsed and on mobile */}
        {!open && isMobile && title && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full text-left mb-2 p-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl hover:bg-white/10 transition-colors"
          >
            <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
          </button>
        )}

        <div 
          ref={contentRef}
          className={`transition-[max-height,opacity] duration-300 overflow-hidden ${open ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}
        >
          {children}
        </div>
      </div>
    );
  };

  // Fetch all portfolio names
  const {
    data: portfolioNames = [],
    isLoading: portfolioNamesLoading,
    error: portfolioNamesError
  } = useQuery({
    queryKey: ['portfolioNames', isLoggedIn, idToken],
    queryFn: fetchAllPortfolioNames,
    enabled: !!isLoggedIn && !!idToken
  });

  // Set selectedPortfolio to first available if not set and portfolios are available
  useEffect(() => {
    if (portfolioNames.length > 0 && !selectedPortfolio) {
      setSelectedPortfolio(portfolioNames[0]);
    }
  }, [portfolioNames, selectedPortfolio, setSelectedPortfolio]);

  // Fetch KPIs for selected portfolio
  const {
    data: kpis,
    isLoading: kpisLoading,
    error: kpisError
  } = useQuery({
    queryKey: ['portfolioKpis', selectedPortfolio, isLoggedIn, idToken],
    queryFn: () => selectedPortfolio ? fetchPortfolioKpis(selectedPortfolio) : null,
    enabled: !!selectedPortfolio && !!isLoggedIn && !!idToken
  });

  // Fetch allocation data
  const backendGrouping = allocationView === 'asset_type' ? 'asset_type' : allocationView;
  const {
    data: allocationData
  } = useQuery({
    queryKey: ['portfolioAllocation', selectedPortfolio, backendGrouping, isLoggedIn, idToken],
    queryFn: () => selectedPortfolio ? fetchPortfolioAllocation(selectedPortfolio, backendGrouping as any) : null,
    enabled: !!selectedPortfolio && !!isLoggedIn && !!idToken
  });

  // Fetch saved targets (asset_type & risk) for selected portfolio for comparison overlay
  const { data: savedTargets } = useQuery({
    queryKey: ['portfolioTargets', selectedPortfolio, isLoggedIn, idToken],
    queryFn: () => selectedPortfolio ? fetchPortfolioTargets(selectedPortfolio) : null,
    enabled: !!selectedPortfolio && !!isLoggedIn && !!idToken,
    staleTime: 5 * 60 * 1000
  });

  // Fetch returns KPIs
  const {
    data: returnsKpis,
    isLoading: returnsKpisLoading
  } = useQuery({
    queryKey: ['returnsKpis', selectedPortfolio, isLoggedIn, idToken],
    queryFn: () => selectedPortfolio ? fetchPortfolioReturnsKpis(selectedPortfolio) : null,
    enabled: !!selectedPortfolio && !!isLoggedIn && !!idToken
  });

  // Fetch portfolio volatility
  const {
    data: portfolioVolatility
  } = useQuery({
    queryKey: ['portfolioVolatility', selectedPortfolio, volatilityWindow, isLoggedIn, idToken],
    queryFn: () => selectedPortfolio ? fetchPortfolioVolatility(selectedPortfolio, { window: volatilityWindow }) : null,
    enabled: !!selectedPortfolio && !!isLoggedIn && !!idToken
  });

  // Fetch volatility time-series for plotting alongside performance (series param)
  const {
    data: portfolioVolatilitySeries = []
  } = useQuery({
    queryKey: ['portfolioVolatilitySeries', selectedPortfolio, volatilityWindow, isLoggedIn, idToken],
    queryFn: () => selectedPortfolio ? fetchPortfolioVolatilitySeries(selectedPortfolio, { window: volatilityWindow }) : [],
    enabled: !!selectedPortfolio && !!isLoggedIn && !!idToken
  });

  const { data: portfolioRisk } = useQuery({
    queryKey: ['portfolioRisk', selectedPortfolio, isLoggedIn, idToken],
    queryFn: () => selectedPortfolio ? fetchPortfolioRisk(selectedPortfolio) : null,
    enabled: !!selectedPortfolio && !!isLoggedIn && !!idToken,
    staleTime: 24 * 60 * 60 * 1000 // 24 hours
  });

  // Fetch portfolio performance (historical series)
  const {
    data: portfolioPerformance = []
  } = useQuery({
    queryKey: ['portfolioPerformance', selectedPortfolio, isLoggedIn, idToken],
    queryFn: () => selectedPortfolio ? fetchPortfolioPerformance(selectedPortfolio) : [],
    enabled: !!selectedPortfolio && !!isLoggedIn && !!idToken
  });

  // Derived performance metrics from historical series
  const performanceDerived = React.useMemo(() => {
    const data = Array.isArray(portfolioPerformance) ? portfolioPerformance : [];
    if (data.length === 0) return { latestAbs: null, latestNet: null, firstAbs: null, dailyReturns: [] };
    
    const sorted = [...data].sort((a: any, b: any) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));
    const last = sorted[sorted.length - 1] as any;
    const first = sorted[0] as any;
    const latestAbs = last.abs_value ?? last.value ?? null;
    const latestNet = last.value !== undefined ? last.value : (latestAbs !== null && first && first.abs_value !== undefined ? latestAbs - (first.abs_value ?? 0) : null);
    
    const dailyReturns: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1] as any;
      const curr = sorted[i] as any;
      const prevVal = prev.abs_value ?? prev.value ?? null;
      const currVal = curr.abs_value ?? curr.value ?? null;
      if (prevVal !== null && prevVal !== 0 && currVal !== null) {
        dailyReturns.push((currVal - prevVal) / prevVal);
      }
    }
    return { latestAbs, latestNet, firstAbs: first.abs_value ?? first.value ?? null, dailyReturns, series: sorted };
  }, [portfolioPerformance]);

  // For SunburstChart, convert allocationData to assets-like array for compatibility
  const allocationAssets = React.useMemo(() => {
    if (!allocationData?.allocation) return [];
    const viewKey = backendGrouping; // actual backend grouping used
    if (viewKey === 'overall') {
      if (!Array.isArray(allocationData.allocation)) return [];
      return allocationData.allocation.map((item: any) => ({
        id: item.ticker,
        symbol: item.ticker,
        name: item.name,
        value: item.value,
        quantity: item.quantity,
        allocation_pct: item.allocation_pct,
        category: item.category || 'Unknown',
        region: item.region || 'Unknown',
      }));
    }
    if (typeof allocationData.allocation !== 'object' || Array.isArray(allocationData.allocation)) return [];
    return Object.entries(allocationData.allocation).map(([key, val]: [string, any]) => {
      const isObj = val && typeof val === 'object' && ('pct' in val || 'value' in val);
      const pct = isObj ? (typeof val.pct === 'number' ? val.pct : (val.value ?? 0)) : (typeof val === 'number' ? val : 0);
      const value = isObj ? (typeof val.value === 'number' ? val.value : pct) : pct;
      return {
        id: key,
        symbol: key,
        name: key,
        value: value,
        quantity: 1,
        allocation_pct: pct,
        category: viewKey === 'asset_type' ? 'Type' : (viewKey === 'category' ? 'Category' : (viewKey === 'risk' ? 'Risk' : 'Group')),
        region: 'Unknown',
        meta: isObj ? val : undefined,
      };
    });
  }, [allocationData, backendGrouping]);

  // (Holdings Analysis removed from SimpleHome; selection moved to Assets page)

  // Filter portfolio performance data by date range
  const filteredPerformanceData = React.useMemo(() => {
    if (!Array.isArray(portfolioPerformance)) return [];
    let data = [...portfolioPerformance];
    
    if (performanceDateRange) {
      const startDate = new Date(performanceDateRange.start);
      const endDate = new Date(performanceDateRange.end);
      data = data.filter(point => {
        const pointDate = new Date(point.date);
        return pointDate >= startDate && pointDate <= endDate;
      });
    }
    
    return data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [portfolioPerformance, performanceDateRange]);

  // Compute date range bounds for performance section
  const performanceDateBounds = React.useMemo(() => {
    if (!Array.isArray(portfolioPerformance) || portfolioPerformance.length === 0) {
      const today = new Date().toISOString().split('T')[0];
      return { minDate: today, maxDate: today };
    }
    const dates = portfolioPerformance.map(p => p.date).sort();
    return { minDate: dates[0], maxDate: dates[dates.length - 1] };
  }, [portfolioPerformance]);

  // Set YTD function for performance section
  const setPerformanceYTD = React.useCallback(() => {
    const now = new Date();
    const ytdStart = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];
    setPerformanceDateRange({ start: ytdStart, end: today });
  }, []);

  // Fetch performance for selected benchmarks
  React.useEffect(() => {
    const fetchSelectedBenchmarks = async () => {
      if (selectedBenchmarks.length === 0) {
        setBenchmarkPerformance({});
        return;
      }
      const results: Record<string, any[]> = {};
      await Promise.all(selectedBenchmarks.map(async (symbol) => {
        try {
          const perf = await fetchBenchmarkPerformance(symbol);
          let normalized: any[] = [];
          if (Array.isArray(perf)) {
            normalized = perf.map((pt: any) => ({
              date: pt && pt.date ? new Date(pt.date).toISOString().split('T')[0] : null,
              value: typeof pt.value === 'number' ? pt.value : (pt.abs_value ?? null),
              abs_value: typeof pt.abs_value === 'number' ? pt.abs_value : (pt.value ?? null),
              pct: typeof pt.pct === 'number' ? pt.pct : null,
              pct_from_first: typeof pt.pct_from_first === 'number' ? pt.pct_from_first : (typeof pt.pct === 'number' ? pt.pct : null)
            })).filter((pt: any) => pt.date !== null);
          }
          results[symbol] = normalized;
        } catch (e) {
          results[symbol] = [];
        }
      }));
      setBenchmarkPerformance(results);
    };
    fetchSelectedBenchmarks();
  }, [selectedBenchmarks]);

  // Load persisted benchmark tickers from cache once
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stored = await idbGet('benchmarks_list_v1');
        if (mounted && Array.isArray(stored) && stored.length > 0) {
          setBenchmarkTickers(stored.map((b: any) => ({ symbol: String(b.symbol), name: String(b.name || b.symbol) })));
        }
      } catch (e) {
        // ignore and use defaults
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Compute final performance value for display
  const finalPerformanceValue = React.useMemo(() => {
    if (!filteredPerformanceData || filteredPerformanceData.length === 0) return 'N/A';
    const latest = filteredPerformanceData[filteredPerformanceData.length - 1];
    
    switch (performanceValueType) {
      case 'value':
        return typeof latest.value === 'number' ? latest.value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : 'N/A';
      case 'abs_value':
        return typeof latest.abs_value === 'number' ? latest.abs_value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : 'N/A';
      case 'pct':
        return typeof latest.pct === 'number' ? `${latest.pct.toFixed(2)}%` : 'N/A';
      case 'pct_from_first':
        return typeof latest.pct_from_first === 'number' ? `${latest.pct_from_first.toFixed(2)}%` : 'N/A';
      default:
        return 'N/A';
    }
  }, [filteredPerformanceData, performanceValueType]);

  // Prepare benchmark series for chart
  const benchmarkSeries = React.useMemo(() => {
    const filterAndSort = (dataArr: any[]) => {
      if (!Array.isArray(dataArr)) return [];
      let arr = [...dataArr];
      if (performanceDateRange) {
        const start = performanceDateRange.start;
        const end = performanceDateRange.end;
        arr = arr.filter(pt => pt && pt.date && pt.date >= start && pt.date <= end);
      }
      return arr.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    };

    return Object.keys(benchmarkPerformance).map((sym) => ({
      id: sym,
      name: BENCHMARK_TICKERS.find(b => b.symbol === sym)?.name || sym,
      data: filterAndSort(benchmarkPerformance[sym] || [])
    }));
  }, [benchmarkPerformance, performanceDateRange]);

  // Combined series: portfolio + benchmarks
  const combinedSeriesForChart = React.useMemo(() => {
    const portfolioSeries = [{ id: 'portfolio', name: 'Portfolio', data: filteredPerformanceData }];
    const base = portfolioSeries.concat(benchmarkSeries);
    // Append volatility series as an overlay (converted to percentage values)
    if (showVolatility && Array.isArray(portfolioVolatilitySeries) && portfolioVolatilitySeries.length > 0) {
      // align by date range and map to chart point shape { time, value }
      const volData = portfolioVolatilitySeries.map(pt => ({ date: pt.date, volatility: pt.volatility }));
      // Create a series compatible with GenericPerformanceSection: data points use date+pct-like name
      base.push({
        id: 'volatility',
        name: `Volatility (${volatilityWindow})`,
        data: volData.map(p => ({
          date: p.date,
          // Chart expects numeric 'value' (required). Provide 0 when no value to satisfy type.
          value: p.volatility !== null && typeof p.volatility === 'number' ? p.volatility * 100 : 0,
          pct: p.volatility !== null && typeof p.volatility === 'number' ? p.volatility * 100 : 0,
          pct_from_first: p.volatility !== null && typeof p.volatility === 'number' ? p.volatility * 100 : 0
        }))
      });
    }
    return base;
  }, [filteredPerformanceData, benchmarkSeries, portfolioVolatilitySeries, volatilityWindow, showVolatility]);

  // Benchmarks selector UI - Mobile-optimized dropdown
  const benchmarksSelector = (
    <select
      value={selectedBenchmarks[0] || ''}
      onChange={(e) => {
        const value = e.target.value;
        setSelectedBenchmarks(value ? [value] : []);
      }}
      className="bg-gray-800 text-gray-100 rounded px-2 py-1 border border-white/10 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 flex-1"
    >
      <option value="">Benchmark</option>
      {BENCHMARK_TICKERS.map((b) => (
        <option key={b.symbol} value={b.symbol}>
          {b.name}
        </option>
      ))}
    </select>
  );

  // Loading and Error State
  const loading = portfolioNamesLoading || kpisLoading || returnsKpisLoading;
  const error = portfolioNamesError || kpisError;

  if (loading && !kpis) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex justify-center items-center px-4">
        <div className="text-center max-w-sm w-full">
          <div className="animate-spin rounded-full h-12 w-12 sm:h-16 sm:w-16 border-t-4 border-b-4 border-indigo-500 mx-auto"></div>
          <p className="mt-4 text-lg sm:text-xl text-gray-300 font-medium">Loading Portfolio Dashboard...</p>
          <div className="mt-2 w-32 h-1 bg-gray-700 rounded-full mx-auto overflow-hidden">
            <div className="h-full bg-gradient-to-r from-indigo-500 to-blue-500 rounded-full animate-pulse"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !kpis) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex justify-center items-center px-4">
        <div className="text-center text-red-400 max-w-md w-full">
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 sm:p-8 shadow-2xl">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 sm:w-8 sm:h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold mb-3">Error Loading Dashboard</h2>
            <p className="text-sm sm:text-base text-red-300/80 leading-relaxed">{String(error)}</p>
            <button 
              onClick={() => window.location.reload()} 
              className="mt-4 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-sm font-medium transition-colors duration-200"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isLoggedIn && !loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex justify-center items-center px-4">
        <div className="text-center text-yellow-400 max-w-md w-full">
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-6 sm:p-8 shadow-2xl">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 sm:w-8 sm:h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0h-2M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold mb-3">Authentication Required</h2>
            <p className="text-sm sm:text-base text-yellow-300/80 leading-relaxed">Please sign in to access the portfolio dashboard.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PageShell
      title="Portfolio Dashboard"
      icon={<ChartBarIcon className="h-4 w-4 text-white" />}
    >
      {selectedPortfolio && (
        <div className="space-y-4 sm:space-y-6">
            {/* Mini summary card (assistant-generated) */}
            <div className="px-1 sm:px-0">
              <CollapsibleSection title="Summary">
                <MiniSummary portfolioName={selectedPortfolio} />
              </CollapsibleSection>
            </div>
            
            {/* Portfolio Summary Dashboard - Mobile-First Responsive Layout */}
            <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-7 gap-3 sm:gap-4 px-1 sm:px-0">
              {/* Project Overview - Prioritized on mobile */}
              <div className="order-1 md:order-1 lg:col-span-2 xl:col-span-3">
                <CollapsibleSection title="Overview">
                  <ProjectOverview
                    performanceDerived={performanceDerived}
                    maskPortfolioValue={maskPortfolioValue}
                    returnsKpis={returnsKpis}
                    kpis={kpis}
                    toggleMaskPortfolioValue={() => setMaskPortfolioValue(v => !v)}
                  />
                </CollapsibleSection>
              </div>

              {/* Risk Analysis - Second priority on mobile */}
              <div className="order-2 md:order-2 lg:col-span-1 xl:col-span-2">
                <CollapsibleSection title="Risk">
                  <RiskAnalysis
                    volatilityWindow={volatilityWindow}
                    volatilityValue={portfolioVolatility?.volatility}
                    setVolatilityWindow={setVolatilityWindow}
                    presets={VOLATILITY_PRESETS}
                    llmRisk={portfolioRisk?.report}
                  />
                </CollapsibleSection>
              </div>

              {/* Asset Allocation - Third priority on mobile */}
              <div className="order-3 md:order-3 lg:col-span-1 xl:col-span-2">
                <CollapsibleSection title="Allocation">
                  <AssetAllocationSummary
                    allocationAssets={allocationAssets}
                    allocationView={allocationView as any}
                    setAllocationView={(v) => setAllocationView(v)}
                    targets={savedTargets || undefined}
                  />
                </CollapsibleSection>
              </div>
            </div>

            {/* Performance Chart Section - Mobile Optimized */}
            <div className="mx-1 sm:mx-0">
              <CollapsibleSection title="Performance">
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-3 sm:p-4 md:p-6 shadow-lg hover:shadow-xl transition-all duration-300 min-h-[320px] sm:min-h-[380px] md:min-h-[420px]">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-base sm:text-lg font-bold text-white">Performance</h2>
                  </div>
                  <PerformanceChartSection
                    title=""
                    valueType={performanceValueType}
                    onValueTypeChange={setPerformanceValueType}
                    data={filteredPerformanceData}
                    series={combinedSeriesForChart}
                    showVolatility={showVolatility}
                    setShowVolatility={setShowVolatility}
                    volatilityWindow={volatilityWindow}
                    setVolatilityWindow={setVolatilityWindow}
                    dateRange={performanceDateRange}
                    onDateRangeChange={setPerformanceDateRange}
                    minDate={performanceDateBounds.minDate}
                    maxDate={performanceDateBounds.maxDate}
                    onSetYTD={setPerformanceYTD}
                    loading={false}
                    finalValue={finalPerformanceValue}
                    benchmarkSelector={benchmarksSelector}
                  />
                </div>
              </CollapsibleSection>
            </div>

            {/* Holdings Analysis removed - moved to Assets page */}

            {/* Compact Advisory Tools */}
            
          </div>
      )}

      {!selectedPortfolio && !portfolioNamesLoading && (
        <div className="mx-1 sm:mx-0">
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 sm:p-8 md:p-12 text-center shadow-2xl">
            <div className="bg-blue-500/20 p-3 sm:p-4 rounded-full w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6 flex items-center justify-center">
              <ChartBarIcon className="h-8 w-8 sm:h-10 sm:w-10 text-blue-400" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 leading-tight">Financial Advisor Dashboard</h2>
            <p className="text-sm sm:text-base text-slate-400 leading-relaxed max-w-md mx-auto">Select a client portfolio above to access comprehensive analysis and professional insights.</p>
            <div className="mt-6 flex justify-center">
              <div className="px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-300 text-sm">
                Ready to get started
              </div>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
};

export default SimpleHome;