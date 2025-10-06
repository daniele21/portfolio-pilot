import React, { useEffect } from 'react';
import { useAuth } from '../../AuthContext';
import { useQuery } from '@tanstack/react-query';
import { 
  fetchAllPortfolioNames, 
  fetchPortfolioKpis, 
  fetchPortfolioAllocation,
  fetchPortfolioReturnsKpis,
  fetchPortfolioVolatility,
  fetchPortfolioPerformance
} from '../../services/portfolioService';
import PortfolioSelector from './components/PortfolioSelector';
import AllocationPanel from './components/AllocationPanel';
import TickerPerformanceSection from './components/TickerPerformanceSection';
import { ChartBarIcon, CurrencyDollarIcon, ArrowTrendingUpIcon } from '@heroicons/react/24/outline';
import GenericPerformanceSection, { ValueType } from '../../components/PerformanceSection';
import { fetchBenchmarkPerformance } from '../../services/marketDataService';
import { Listbox, Transition } from '@headlessui/react';
import { CheckIcon, ChevronUpDownIcon } from '@heroicons/react/20/solid';

const VOLATILITY_PRESETS = [
  { label: '30d', value: '30' },
  { label: '90d', value: '90' },
  { label: '252d', value: '252' },
  { label: 'EWMA', value: 'ewm' }
];

const SimpleHome: React.FC = () => {
  const { isLoggedIn, idToken } = useAuth();
  const [selectedPortfolio, setSelectedPortfolio] = React.useState<string | null>(null);
  const [maskPortfolioValue, setMaskPortfolioValue] = React.useState(true);
  const [allocationView, setAllocationView] = React.useState<'overall' | 'quoteType'>('overall');
  const [volatilityWindow, setVolatilityWindow] = React.useState<string>(VOLATILITY_PRESETS[0].value);
  
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
  const {
    data: allocationData
  } = useQuery({
    queryKey: ['portfolioAllocation', selectedPortfolio, allocationView, isLoggedIn, idToken],
    queryFn: () => selectedPortfolio ? fetchPortfolioAllocation(selectedPortfolio, allocationView) : null,
    enabled: !!selectedPortfolio && !!isLoggedIn && !!idToken
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
    
    if (allocationView === 'overall') {
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
    } else {
      if (typeof allocationData.allocation !== 'object' || Array.isArray(allocationData.allocation)) return [];
      return Object.entries(allocationData.allocation).map(([quoteType, pct]: [string, any]) => ({
        id: quoteType,
        symbol: quoteType,
        name: quoteType,
        value: pct,
        quantity: 1,
        allocation_pct: pct,
        category: 'Type',
        region: 'Unknown',
      }));
    }
  }, [allocationData, allocationView]);

  // Performance section logic
  const availableTickers = React.useMemo(() => {
    if (!allocationAssets || allocationView !== 'overall') return [];
    return allocationAssets.map(asset => ({ id: asset.symbol, name: asset.name || asset.symbol }));
  }, [allocationAssets, allocationView]);

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
    return portfolioSeries.concat(benchmarkSeries);
  }, [filteredPerformanceData, benchmarkSeries]);

  // Benchmarks selector UI
  const benchmarksSelector = (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-300">Benchmarks:</span>
      <Listbox value={selectedBenchmarks} onChange={setSelectedBenchmarks} multiple>
        <div className="relative">
          <Listbox.Button className="relative w-64 cursor-default rounded-lg bg-gray-700 py-2 pl-3 pr-10 text-left shadow-md sm:text-sm">
            <span className="block truncate text-white">
              {selectedBenchmarks.length === 0 ? 'Select benchmarks...' : `${selectedBenchmarks.length} selected`}
            </span>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
              <ChevronUpDownIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
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
      <div className="max-w-7xl mx-auto p-6 space-y-8">
        {/* Professional Header with Client Info */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-3 rounded-xl">
                <ChartBarIcon className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Portfolio Analysis</h1>
                <p className="text-slate-300 mt-1">Professional Investment Management Dashboard</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setMaskPortfolioValue(v => !v)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm font-medium transition-colors"
              >
                {maskPortfolioValue ? 'Show Values' : 'Hide Values'}
              </button>
            </div>
          </div>
          
          {/* Portfolio Selector */}
          <div className="mt-6 p-4 bg-white/5 rounded-xl">
            <PortfolioSelector
              portfolioNames={portfolioNames}
              selectedPortfolio={selectedPortfolio}
              setSelectedPortfolio={setSelectedPortfolio}
              loading={portfolioNamesLoading}
            />
          </div>
        </div>

        {selectedPortfolio && (
          <div className="space-y-8">
            {/* Portfolio Summary Dashboard */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Portfolio Value & Performance */}
              <div className="lg:col-span-2 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold text-white">Portfolio Overview</h2>
                  <div className="text-xs text-slate-400 bg-slate-800/50 px-3 py-1 rounded-full">
                    Last Updated: {new Date().toLocaleDateString()}
                  </div>
                </div>
                
                <div className="space-y-6">
                  {/* Portfolio Value */}
                  <div className="border-b border-white/10 pb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300 text-sm font-medium">Total Portfolio Value</span>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-white">
                          {maskPortfolioValue ? '••••••••' : (
                            performanceDerived.latestAbs !== null 
                              ? `$${performanceDerived.latestAbs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : 'N/A'
                          )}
                        </div>
                        {performanceDerived.latestNet !== null && (
                          <div className={`text-sm font-medium ${performanceDerived.latestNet >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {performanceDerived.latestNet >= 0 ? '+' : ''}${performanceDerived.latestNet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Performance Metrics */}
                  <div className="grid grid-cols-2 gap-4">
                    {returnsKpis && Object.entries(returnsKpis).slice(0, 4).map(([period, data]: [string, any]) => {
                      const returnPct = data?.portfolio?.return_pct;
                      if (typeof returnPct !== 'number') return null;
                      
                      return (
                        <div key={period} className="bg-white/5 rounded-lg p-3">
                          <div className="text-xs text-slate-400 uppercase tracking-wide">
                            {period.replace('_', ' ')}
                          </div>
                          <div className={`text-lg font-bold ${returnPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Risk Metrics */}
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-white mb-6">Risk Analysis</h2>
                <div className="space-y-4">
                  <div className="bg-white/5 rounded-lg p-4">
                    <div className="text-xs text-slate-400 uppercase tracking-wide mb-2">
                      Volatility ({VOLATILITY_PRESETS.find(opt => opt.value === volatilityWindow)?.label})
                    </div>
                    <div className="text-xl font-bold text-white">
                      {portfolioVolatility?.volatility?.toFixed(2) ?? 'N/A'}%
                    </div>
                  </div>
                  
                  {/* Volatility selector */}
                  <div className="space-y-2">
                    <div className="text-xs text-slate-400 uppercase tracking-wide">Period</div>
                    <div className="grid grid-cols-2 gap-2">
                      {VOLATILITY_PRESETS.map(preset => (
                        <button
                          key={preset.value}
                          onClick={() => setVolatilityWindow(preset.value)}
                          className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                            volatilityWindow === preset.value
                              ? 'bg-blue-500 text-white'
                              : 'bg-white/5 text-slate-300 hover:bg-white/10'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Asset Allocation Summary */}
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-white mb-6">Asset Allocation</h2>
                <div className="space-y-3">
                  {allocationAssets.slice(0, 5).map((asset, index) => (
                    <div key={asset.id} className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full bg-gradient-to-r ${
                          ['from-blue-400 to-blue-600', 'from-green-400 to-green-600', 'from-yellow-400 to-yellow-600', 'from-red-400 to-red-600', 'from-purple-400 to-purple-600'][index % 5]
                        }`} />
                        <span className="text-sm font-medium text-white">{asset.symbol}</span>
                      </div>
                      <span className="text-sm text-slate-300">{asset.allocation_pct?.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-white/10">
                  <AllocationPanel assets={allocationAssets} grouping={allocationView} setGrouping={setAllocationView} />
                </div>
              </div>
            </div>

            {/* Performance Chart Section */}
            <div className="lg:col-span-4 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-white">Portfolio Performance</h2>
                <div className="flex items-center space-x-4">
                  {benchmarksSelector}
                </div>
              </div>
              
              <div className="bg-white/5 rounded-xl p-4">
                <GenericPerformanceSection
                  title="Portfolio Performance"
                  valueType={performanceValueType}
                  onValueTypeChange={setPerformanceValueType}
                  data={filteredPerformanceData}
                  series={combinedSeriesForChart}
                  dateRange={performanceDateRange}
                  onDateRangeChange={setPerformanceDateRange}
                  minDate={performanceDateBounds.minDate}
                  maxDate={performanceDateBounds.maxDate}
                  onSetYTD={setPerformanceYTD}
                  loading={false}
                  notEnoughDataMessage="Not enough portfolio data to display performance chart"
                  finalValue={finalPerformanceValue}
                  selector={null}
                />
              </div>
            </div>

            {/* Holdings Analysis */}
            <div className="lg:col-span-4 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-white mb-6">Holdings Analysis</h2>
              
              <div className="bg-white/5 rounded-xl p-4">
                <TickerPerformanceSection
                  selectedPortfolio={selectedPortfolio}
                  availableTickers={availableTickers}
                  selectedTickers={selectedTickers}
                  onSelectedTickersChange={setSelectedTickers}
                />
              </div>
            </div>

            {/* Professional Advisor Actions */}
            <div className="lg:col-span-4 grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Client Management */}
              <div className="bg-gradient-to-br from-blue-500/10 to-indigo-600/10 backdrop-blur-xl border border-blue-500/20 rounded-2xl p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="bg-blue-500/20 p-2 rounded-lg">
                    <CurrencyDollarIcon className="h-5 w-5 text-blue-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">Client Actions</h3>
                </div>
                <div className="space-y-3">
                  <button className="w-full text-left bg-white/5 hover:bg-white/10 rounded-lg p-3 transition-colors">
                    <div className="text-sm font-medium text-white">Schedule Review</div>
                    <div className="text-xs text-slate-400">Plan client meeting</div>
                  </button>
                  <button className="w-full text-left bg-white/5 hover:bg-white/10 rounded-lg p-3 transition-colors">
                    <div className="text-sm font-medium text-white">Generate Report</div>
                    <div className="text-xs text-slate-400">Create client summary</div>
                  </button>
                  <button className="w-full text-left bg-white/5 hover:bg-white/10 rounded-lg p-3 transition-colors">
                    <div className="text-sm font-medium text-white">Add Note</div>
                    <div className="text-xs text-slate-400">Log interaction</div>
                  </button>
                </div>
              </div>

              {/* Risk Assessment */}
              <div className="bg-gradient-to-br from-amber-500/10 to-orange-600/10 backdrop-blur-xl border border-amber-500/20 rounded-2xl p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="bg-amber-500/20 p-2 rounded-lg">
                    <ArrowTrendingUpIcon className="h-5 w-5 text-amber-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">Risk Analysis</h3>
                </div>
                <div className="space-y-3">
                  <div className="bg-white/5 rounded-lg p-3">
                    <div className="text-sm font-medium text-white">Beta</div>
                    <div className="text-lg font-bold text-amber-400">1.2</div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <div className="text-sm font-medium text-white">Sharpe Ratio</div>
                    <div className="text-lg font-bold text-amber-400">0.85</div>
                  </div>
                </div>
              </div>

              {/* AI Insights */}
              <div className="bg-gradient-to-br from-green-500/10 to-emerald-600/10 backdrop-blur-xl border border-green-500/20 rounded-2xl p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="bg-green-500/20 p-2 rounded-lg">
                    <ChartBarIcon className="h-5 w-5 text-green-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">AI Insights</h3>
                </div>
                <div className="space-y-3">
                  <div className="bg-white/5 rounded-lg p-3">
                    <div className="text-sm font-medium text-green-400">Rebalancing Opportunity</div>
                    <div className="text-xs text-slate-400 mt-1">Portfolio drift detected in tech allocation</div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <div className="text-sm font-medium text-blue-400">Tax Harvesting</div>
                    <div className="text-xs text-slate-400 mt-1">Potential $2,400 tax savings available</div>
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