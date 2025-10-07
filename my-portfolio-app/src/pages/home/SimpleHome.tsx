import React, { useEffect } from 'react';
import { useAuth } from '../../AuthContext';
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
import PortfolioSelector from './components/PortfolioSelector';
import TickerPerformanceSection from './components/TickerPerformanceSection';
import ProjectOverview from './modules/ProjectOverview';
import RiskAnalysis from './modules/RiskAnalysis';
import AssetAllocationSummary from './modules/AssetAllocationSummary';
import PerformanceChartSection from './modules/PerformanceChartSection';
import { ChartBarIcon, CurrencyDollarIcon, ArrowTrendingUpIcon } from '@heroicons/react/24/outline';
import { ValueType } from '../../components/PerformanceSection';
import { fetchBenchmarkPerformance } from '../../services/marketDataService';
import { Listbox, Transition } from '@headlessui/react';
import { CheckIcon, ChevronUpDownIcon } from '@heroicons/react/20/solid';

const VOLATILITY_PRESETS = [
  { label: '30 days', value: '30' },
  { label: '90 days', value: '90' },
  { label: '1 year', value: '252' },
  { label: 'EWMA', value: 'ewm' }
];

const SimpleHome: React.FC = () => {
  const { isLoggedIn, idToken } = useAuth();
  const [selectedPortfolio, setSelectedPortfolio] = React.useState<string | null>(null);
  const [maskPortfolioValue, setMaskPortfolioValue] = React.useState(true);
  // allocationView options (quoteType removed): overall | asset_type | category | risk
  const [allocationView, setAllocationView] = React.useState<'overall' | 'asset_type' | 'category' | 'risk'>('overall');
  const [volatilityWindow, setVolatilityWindow] = React.useState<string>(VOLATILITY_PRESETS[0].value);
  const [showVolatility, setShowVolatility] = React.useState<boolean>(false);
  
  // Performance section state
  // Default the value type to 'Performance' view (pct_from_first) so the select shows "Performance" by default
  const [performanceValueType, setPerformanceValueType] = React.useState<ValueType>('pct_from_first');
  const [performanceDateRange, setPerformanceDateRange] = React.useState<{start: string; end: string} | null>(null);
  const [selectedTickers, setSelectedTickers] = React.useState<string[]>([]);
  
  // Benchmarks
  const BENCHMARK_TICKERS = [
    { symbol: '^GSPC', name: 'S&P 500' },
    { symbol: '^NDX', name: 'NASDAQ 100' },
    { symbol: '^RUT', name: 'Russell 2000' },
    { symbol: '^STOXX50E', name: 'Euro Stoxx 50' },
    { symbol: 'FTSEMIB.MI', name: 'FTSE MIB' }
  ];
  const [selectedBenchmarks, setSelectedBenchmarks] = React.useState<string[]>([]);
  const [benchmarkPerformance, setBenchmarkPerformance] = React.useState<Record<string, any[]>>({});

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
  }, [portfolioNames, selectedPortfolio]);

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

  // Performance section logic
  const availableTickers = React.useMemo(() => {
    if (!allocationAssets || allocationView !== 'overall') return [];
    return allocationAssets.map(asset => ({ id: asset.symbol, name: asset.name || asset.symbol }));
  }, [allocationAssets, allocationView]);

  // Set best performing ticker as default selection
  React.useEffect(() => {
    if (kpis?.net_performance_tickers?.length > 0 && selectedTickers.length === 0 && availableTickers.length > 0) {
      const bestPerformer = kpis.net_performance_tickers[0];
      if (bestPerformer && availableTickers.some(ticker => ticker.id === bestPerformer.ticker)) {
        setSelectedTickers([bestPerformer.ticker]);
      }
    }
  }, [kpis?.net_performance_tickers, selectedTickers.length, availableTickers]);

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

  // Benchmarks selector UI
  const benchmarksSelector = (
    <div className="flex items-center gap-1">
      <span className="text-xs text-gray-300 hidden sm:inline">Benchmarks:</span>
      <Listbox value={selectedBenchmarks} onChange={setSelectedBenchmarks} multiple>
        <div className="relative">
          <Listbox.Button className="relative w-32 cursor-default rounded-md bg-gray-700 py-1 pl-2 pr-8 text-left shadow-md text-xs">
            <span className="block truncate text-white">
              {selectedBenchmarks.length === 0 ? 'Benchmarks' : `${selectedBenchmarks.length} selected`}
            </span>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-1">
              <ChevronUpDownIcon className="h-4 w-4 text-gray-400" aria-hidden="true" />
            </span>
          </Listbox.Button>
          <Transition as={React.Fragment} leave="transition ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0">
            <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-gray-700 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
              {BENCHMARK_TICKERS.map((b) => (
                <Listbox.Option
                  key={b.symbol}
                  className={({ active }) => `relative cursor-default select-none py-2 pl-10 pr-4 ${active ? 'bg-indigo-600 text-white' : 'text-gray-200'}`}
                  value={b.symbol}
                >
                  {({ selected }) => (
                    <>
                      <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>{b.name}</span>
                      {selected ? (
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-indigo-400">
                          <CheckIcon className="h-5 w-5" aria-hidden="true" />
                        </span>
                      ) : null}
                    </>
                  )}
                </Listbox.Option>
              ))}
            </Listbox.Options>
          </Transition>
        </div>
      </Listbox>
    </div>
  );

  // Loading and Error State
  const loading = portfolioNamesLoading || kpisLoading || returnsKpisLoading;
  const error = portfolioNamesError || kpisError;

  if (loading && !kpis) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex justify-center items-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-500 mx-auto"></div>
          <p className="mt-4 text-xl text-gray-300">Loading Portfolio Dashboard...</p>
        </div>
      </div>
    );
  }

  if (error && !kpis) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex justify-center items-center">
        <div className="text-center text-red-400 text-xl p-8">
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-2">Error Loading Dashboard</h2>
            <p>{String(error)}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isLoggedIn && !loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex justify-center items-center">
        <div className="text-center text-yellow-400 text-xl p-8">
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-2">Authentication Required</h2>
            <p>Please sign in to access the portfolio dashboard.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Compact Header */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-1.5 rounded-md">
                <ChartBarIcon className="h-4 w-4 text-white" />
              </div>
              <h1 className="text-lg font-semibold text-white">Portfolio Dashboard</h1>
            </div>
            
            {/* Inline Portfolio Selector */}
            <PortfolioSelector
              portfolioNames={portfolioNames}
              selectedPortfolio={selectedPortfolio}
              setSelectedPortfolio={setSelectedPortfolio}
              loading={portfolioNamesLoading}
            />
          </div>
        </div>

        {selectedPortfolio && (
          <div className="space-y-6">
            {/* Portfolio Summary Dashboard - 5-Column Layout */}
            <div className="grid grid-cols-1 xl:grid-cols-7 gap-4 items-stretch">
              {/* Project Overview - 2/5 width (half) */}
              <div className="xl:col-span-3">
                <ProjectOverview
                  performanceDerived={performanceDerived}
                  maskPortfolioValue={maskPortfolioValue}
                  returnsKpis={returnsKpis}
                  kpis={kpis}
                  toggleMaskPortfolioValue={() => setMaskPortfolioValue(v => !v)}
                />
              </div>

              {/* Risk Analysis - 1/5 width */}
              <div className="xl:col-span-2">
                <RiskAnalysis
                  volatilityWindow={volatilityWindow}
                  volatilityValue={portfolioVolatility?.volatility}
                  setVolatilityWindow={setVolatilityWindow}
                  presets={VOLATILITY_PRESETS}
                  llmRisk={portfolioRisk?.report}
                />
              </div>

              {/* Asset Allocation - 2/5 width */}
              <div className="xl:col-span-2">
                <AssetAllocationSummary
                  allocationAssets={allocationAssets}
                  allocationView={allocationView as any}
                  setAllocationView={(v) => setAllocationView(v)}
                  targets={savedTargets || undefined}
                />
              </div>
            </div>

            {/* Compact Performance Chart Section */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-4 shadow-lg hover:shadow-xl transition-all duration-300 min-h-[420px]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 bg-gradient-to-b from-blue-400 to-blue-600 rounded-full"></div>
                  <h2 className="text-lg font-bold text-white">Performance</h2>
                </div>
                <div className="flex items-center gap-2">
                  {benchmarksSelector}
                </div>
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
              />
            </div>

            {/* Compact Holdings Analysis */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-6 shadow-lg hover:shadow-xl transition-all duration-300">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-1 h-5 bg-gradient-to-b from-purple-400 to-purple-600 rounded-full"></div>
                <h2 className="text-lg font-bold text-white">Holdings Analysis</h2>
              </div>
              
              <div className="bg-gradient-to-br from-slate-800/30 to-slate-700/20 rounded-xl p-4 border border-white/10">
                <TickerPerformanceSection
                  selectedPortfolio={selectedPortfolio}
                  availableTickers={availableTickers}
                  selectedTickers={selectedTickers}
                  onSelectedTickersChange={setSelectedTickers}
                />
              </div>
            </div>

            {/* Compact Advisory Tools */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-1 h-5 bg-gradient-to-b from-cyan-400 to-cyan-600 rounded-full"></div>
                <h2 className="text-xl font-bold text-white">Advisory Tools</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Client Management */}
                <div className="bg-gradient-to-br from-blue-500/10 to-indigo-600/10 backdrop-blur-xl border border-blue-500/20 rounded-xl p-6 shadow-lg hover:shadow-xl transition-all duration-300">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="bg-blue-500/20 p-2 rounded-lg">
                      <CurrencyDollarIcon className="h-5 w-5 text-blue-400" />
                    </div>
                    <h3 className="text-lg font-bold text-white">Client Actions</h3>
                  </div>
                  <div className="space-y-3">
                    <button className="w-full text-left bg-white/5 hover:bg-white/15 rounded-lg p-3 transition-all duration-200 border border-white/10">
                      <div className="text-sm font-semibold text-white">Schedule Review</div>
                      <div className="text-xs text-slate-400">Plan meeting</div>
                    </button>
                    <button className="w-full text-left bg-white/5 hover:bg-white/15 rounded-lg p-3 transition-all duration-200 border border-white/10">
                      <div className="text-sm font-semibold text-white">Generate Report</div>
                      <div className="text-xs text-slate-400">Create summary</div>
                    </button>
                  </div>
                </div>

                {/* Risk Metrics */}
                <div className="bg-gradient-to-br from-amber-500/10 to-orange-600/10 backdrop-blur-xl border border-amber-500/20 rounded-xl p-6 shadow-lg hover:shadow-xl transition-all duration-300">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="bg-amber-500/20 p-2 rounded-lg">
                      <ArrowTrendingUpIcon className="h-5 w-5 text-amber-400" />
                    </div>
                    <h3 className="text-lg font-bold text-white">Risk Metrics</h3>
                  </div>
                  <div className="space-y-3">
                    <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                      <div className="text-xs text-slate-400">Portfolio Beta</div>
                      <div className="text-xl font-bold text-amber-400">1.2</div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                      <div className="text-xs text-slate-400">Sharpe Ratio</div>
                      <div className="text-xl font-bold text-amber-400">0.85</div>
                    </div>
                  </div>
                </div>

                {/* AI Insights */}
                <div className="bg-gradient-to-br from-green-500/10 to-emerald-600/10 backdrop-blur-xl border border-green-500/20 rounded-xl p-6 shadow-lg hover:shadow-xl transition-all duration-300">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="bg-green-500/20 p-2 rounded-lg">
                      <ChartBarIcon className="h-5 w-5 text-green-400" />
                    </div>
                    <h3 className="text-lg font-bold text-white">AI Insights</h3>
                  </div>
                  <div className="space-y-3">
                    <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-1.5 h-1.5 bg-green-400 rounded-full"></div>
                        <div className="text-xs font-semibold text-green-400">Rebalancing</div>
                      </div>
                      <div className="text-xs text-slate-300">Tech allocation drift detected</div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
                        <div className="text-xs font-semibold text-blue-400">Tax Harvesting</div>
                      </div>
                      <div className="text-xs text-slate-300">$2,400 potential savings</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {!selectedPortfolio && !portfolioNamesLoading && (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-12 text-center">
            <div className="bg-blue-500/20 p-4 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
              <ChartBarIcon className="h-10 w-10 text-blue-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Financial Advisor Dashboard</h2>
            <p className="text-slate-400">Select a client portfolio above to access comprehensive analysis and professional insights.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SimpleHome;