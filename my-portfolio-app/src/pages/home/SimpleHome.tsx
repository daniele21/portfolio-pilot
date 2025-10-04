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
import ReturnsPanel from './components/ReturnsPanel';
import AllocationPanel from './components/AllocationPanel';
import VolatilitySection from './components/VolatilitySection';
import TickerPerformanceSection from './components/TickerPerformanceSection';
import { ChartBarIcon, CurrencyDollarIcon, ArrowTrendingUpIcon } from '@heroicons/react/24/outline';
import { Kpi, TrafficLightStatus } from '../../types';
import KeyPortfolioKpis from '../../components/KeyPortfolioKpis';
import CollapsibleSection from '../../components/CollapsibleComponent';
import GenericPerformanceSection, { ValueType } from '../../components/PerformanceSection';
import { fetchBenchmarkPerformance } from '../../services/marketDataService';
import { Listbox, Transition } from '@headlessui/react';
import { CheckIcon, ChevronUpDownIcon } from '@heroicons/react/20/solid';

const SimpleHome: React.FC = () => {
  const { isLoggedIn, idToken } = useAuth();
  const [selectedPortfolio, setSelectedPortfolio] = React.useState<string | null>(null);
  const [maskPortfolioValue, setMaskPortfolioValue] = React.useState(true);
  const [allocationView, setAllocationView] = React.useState<'overall' | 'quoteType'>('overall');
  
  // Performance section state
  const [performanceValueType, setPerformanceValueType] = React.useState<ValueType>('abs_value');
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
    queryKey: ['portfolioVolatility', selectedPortfolio, isLoggedIn, idToken],
    queryFn: () => selectedPortfolio ? fetchPortfolioVolatility(selectedPortfolio) : null,
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

  // Derived performance metrics (returns and volatility) from historical series
  const performanceDerived = React.useMemo(() => {
    const data = Array.isArray(portfolioPerformance) ? portfolioPerformance : [];
    if (data.length === 0) return { latestAbs: null, latestNet: null, firstAbs: null, dailyReturns: [] };
    // Ensure sorted by date asc
    const sorted = [...data].sort((a: any, b: any) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));
    const last = sorted[sorted.length - 1] as any;
    const first = sorted[0] as any;
    const latestAbs = last.abs_value ?? last.value ?? null;
    const latestNet = last.value !== undefined ? last.value : (latestAbs !== null && first && first.abs_value !== undefined ? latestAbs - (first.abs_value ?? 0) : null);
    // compute daily returns series using abs_value where available, otherwise value
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

  // (returns are provided by backend; no client-side returns computation)

  // compute annualized volatility from daily returns for a rolling window of nDays
  const annualizedVolatility = (nDays: number) => {
    const returns = performanceDerived.dailyReturns || [];
    if (!returns || returns.length === 0) return null;
    const slice = returns.slice(-nDays);
    if (slice.length < 2) return null;
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (slice.length - 1);
    const dailyStd = Math.sqrt(variance);
    const annualized = dailyStd * Math.sqrt(252); // trading days
    return annualized * 100; // percent
  };

  // Map KPIs to card format: always include derived KPIs and then merge backend KPIs
  const kpiCards = React.useMemo(() => {
    const cards: Kpi[] = [];
    const k: any = (kpis && typeof kpis === 'object') ? kpis as any : null;

    // Derived portfolio value and P/L (from performance series)
    const latestAbs = performanceDerived.latestAbs;
    const latestNet = performanceDerived.latestNet;
    // If backend didn't provide a net P/L, derive it from first and last abs values when possible
    const derivedNet = (latestNet !== null && latestNet !== undefined)
      ? latestNet
      : (performanceDerived.firstAbs !== null && latestAbs !== null)
        ? (typeof performanceDerived.firstAbs === 'number' && typeof latestAbs === 'number' ? (latestAbs - performanceDerived.firstAbs) : null)
        : null;

    if (latestAbs !== null && latestAbs !== undefined) {
      cards.push({
        id: 'portfolio_value',
        name: 'Portfolio Value',
        value: maskPortfolioValue ? '**.***,**' : (typeof latestAbs === 'number' ? latestAbs.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : String(latestAbs)),
        unit: '',
        status: TrafficLightStatus.NEUTRAL,
        icon: CurrencyDollarIcon,
      });
    }
    if (derivedNet !== null && derivedNet !== undefined) {
      cards.push({
        id: 'portfolio_pl',
        name: 'P/L',
        value: (typeof derivedNet === 'number' ? derivedNet.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : String(derivedNet)),
        unit: '',
        status: (typeof derivedNet === 'number' ? (derivedNet > 0 ? TrafficLightStatus.GREEN : derivedNet < 0 ? TrafficLightStatus.RED : TrafficLightStatus.NEUTRAL) : TrafficLightStatus.NEUTRAL),
        description: 'Net profit / loss (latest)'
      });

      // Also add a Net Performance (%) card when we have a firstAbs baseline
      if (typeof performanceDerived.firstAbs === 'number' && typeof derivedNet === 'number' && performanceDerived.firstAbs !== 0) {
        const perfPct = (derivedNet / performanceDerived.firstAbs) * 100;
        cards.push({
          id: 'portfolio_performance',
          name: 'Net Performance',
          value: perfPct.toFixed(2) + '%',
          unit: '',
          status: perfPct > 0 ? TrafficLightStatus.GREEN : perfPct < 0 ? TrafficLightStatus.RED : TrafficLightStatus.NEUTRAL,
          description: 'Net performance relative to cost basis',
          icon: ArrowTrendingUpIcon
        });
      }
    }

    // Volatility cards: include derived vols plus any portfolioVolatility
  //   const vol30 = annualizedVolatility(30);
  //   const vol90 = annualizedVolatility(90);
    const vol365 = annualizedVolatility(365);
  //   if (typeof vol30 === 'number') cards.push({ id: 'vol_30', name: 'Volatility (30d)', value: vol30.toFixed(2) + '%', unit: '', status: TrafficLightStatus.NEUTRAL, description: '30-day annualized vol', icon: ChartBarIcon });
  //   if (typeof vol90 === 'number') cards.push({ id: 'vol_90', name: 'Volatility (90d)', value: vol90.toFixed(2) + '%', unit: '', status: TrafficLightStatus.NEUTRAL, description: '90-day annualized vol', icon: ChartBarIcon });
  if (typeof vol365 === 'number') cards.push({ id: 'vol_365', name: 'Volatility (1y)', value: vol365.toFixed(2) + '%', unit: '', status: TrafficLightStatus.NEUTRAL, description: '365-day annualized vol', icon: ChartBarIcon });

    // Merge backend KPIs (if present), avoid duplicating portfolio_value / volatility
    if (k && typeof k === 'object' && Object.keys(k).length > 0) {
      // portfolio_value / total_value
      if (!cards.find(c => c.id === 'portfolio_value')) {
        if (k.portfolio_value) {
          cards.push({
            id: 'portfolio_value',
            name: 'Portfolio Value',
            value: maskPortfolioValue ? '**.***,**' : (typeof k.portfolio_value === 'number' ? k.portfolio_value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : k.portfolio_value.abs_value?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})),
            unit: '',
            status: TrafficLightStatus.NEUTRAL,
            description: k.portfolio_value.net_value !== undefined ? `Net Value: ${maskPortfolioValue ? '**.***,**' : k.portfolio_value.net_value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : undefined,
            icon: CurrencyDollarIcon
          });
        } else if (typeof k.total_value === 'number') {
          cards.push({
            id: 'portfolio_value',
            name: 'Portfolio Value',
            value: maskPortfolioValue ? '**.***,**' : k.total_value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}),
            unit: '',
            status: TrafficLightStatus.NEUTRAL,
            description: typeof k.holdings_count === 'number' ? `Holdings: ${k.holdings_count}` : undefined,
            icon: CurrencyDollarIcon
          });
        }
      }

      // net_performance fallback
      const inferredNetPerf = typeof k.net_performance === 'number' ? k.net_performance : (returnsKpis?.ytd_return ?? returnsKpis?.one_year_return ?? null);
      if (typeof inferredNetPerf === 'number' && !cards.find(c => c.id === 'portfolio_performance')) {
        cards.push({
          id: 'portfolio_performance',
          name: 'Net Performance',
          value: inferredNetPerf.toFixed(2) + '%',
          unit: '',
          status: inferredNetPerf > 0 ? TrafficLightStatus.GREEN : inferredNetPerf < 0 ? TrafficLightStatus.RED : TrafficLightStatus.NEUTRAL,
          description: 'Net performance relative to cost basis',
          color: k.net_performance > 0 ? 'green' : k.net_performance < 0 ? 'red' : undefined,
          icon: ArrowTrendingUpIcon
        });
      }

      if (k.best_ticker) {
        cards.push({
          id: 'best_ticker',
          name: 'Best Asset',
          value: k.best_ticker.ticker_name || k.best_ticker.symbol,
          unit: '',
          status: TrafficLightStatus.GREEN,
          description: `Best performance: ${(k.best_ticker.pct ?? 0).toFixed(2)}%`,
          color: 'green'
        });
      }
      if (k.highest_value_ticker) {
        cards.push({
          id: 'highest_value_ticker',
          name: 'Highest Value Asset',
          value: k.highest_value_ticker.ticker_name || k.highest_value_ticker.symbol,
          unit: '',
          status: TrafficLightStatus.NEUTRAL,
          description: `Highest value: ${k.highest_value_ticker.abs_value?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
        });
      }
      if (k.worst_ticker) {
        cards.push({
          id: 'worst_ticker',
          name: 'Worst Asset',
          value: k.worst_ticker.ticker_name || k.worst_ticker.symbol,
          unit: '',
          status: TrafficLightStatus.RED,
          description: `Worst performance: ${(k.worst_ticker.pct ?? 0).toFixed(2)}%`,
          color: 'red'
        });
      }
    }

    return cards;
  }, [kpis, maskPortfolioValue, portfolioVolatility, performanceDerived, returnsKpis]);

  // Map returns KPIs to cards
  const returnsKpiCards = React.useMemo(() => {
    const cards: Kpi[] = [];

    // Prefer backend returns (if present)
    if (returnsKpis && typeof returnsKpis === 'object') {
      const safePct = (periodKey: string) => {
        try {
          const p = (returnsKpis as any)[periodKey];
          const val = p && p.portfolio ? p.portfolio.return_pct : null;
          if (typeof val === 'number' && Number.isFinite(val)) return val;
          // Fallback: compute portfolio-level return_pct from per-ticker start/end values
          const tickers = p && p.tickers ? p.tickers : null;
          if (tickers && typeof tickers === 'object') {
            let sumStart = 0;
            let sumEnd = 0;
            for (const tk of Object.keys(tickers)) {
              try {
                const item = (tickers as any)[tk];
                const s = item?.start_value;
                const e = item?.end_value;
                if (typeof s === 'number' && Number.isFinite(s)) sumStart += s;
                if (typeof e === 'number' && Number.isFinite(e)) sumEnd += e;
              } catch (e) {
                // ignore malformed ticker entries
              }
            }
            if (sumStart > 0 && Number.isFinite(sumEnd)) {
              return ((sumEnd - sumStart) / sumStart) * 100;
            }
          }
          return null;
        } catch (e) {
          return null;
        }
      };
      const mappingBackend: Array<[string, string, string]> = [
        ['daily', 'Return (1 Day)', '1d'],
        ['weekly', 'Return (1 Week)', '7d'],
        ['monthly', 'Return (1 Month)', '30d'],
        ['three_month', 'Return (3 Months)', '90d'],
        ['ytd', 'Return (YTD)', 'ytd'],
        ['one_year', 'Return (1 Year)', '1y']
      ];
      for (const [key, label, idSuffix] of mappingBackend) {
        const pct = safePct(key);
        if (typeof pct === 'number') {
          cards.push({ id: `return_${idSuffix}`, name: label, value: pct.toFixed(2) + '%', unit: '', status: pct > 0 ? TrafficLightStatus.GREEN : pct < 0 ? TrafficLightStatus.RED : TrafficLightStatus.NEUTRAL, description: label, icon: ChartBarIcon });
        }
      }
      // If backend provided any, return them
      if (cards.length > 0) return cards;
    }


    return cards;
  }, [returnsKpis]);

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
          // Normalize date format and numeric fields
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
    // Helper to filter benchmark data by selected performance date range
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
      <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-500"></div>
        <p className="ml-4 text-xl text-gray-300">Loading Dashboard...</p>
      </div>
    );
  }

  if (error && !kpis) {
    return <div className="text-center text-red-400 text-xl p-8">{String(error)}</div>;
  }

  if (!isLoggedIn && !loading) {
    return <div className="text-center text-yellow-400 text-xl p-8">Please sign in to access the dashboard.</div>;
  }

  return (
    <>
      {typeof window !== 'undefined' && (console.log('DEBUG SimpleHome kpis', { kpiCards, returnsKpiCards, portfolioPerformance }), console.log('DEBUG returnsKpis (raw)', returnsKpis))}
      <PortfolioSelector
        portfolioNames={portfolioNames}
        selectedPortfolio={selectedPortfolio}
        setSelectedPortfolio={setSelectedPortfolio}
        loading={portfolioNamesLoading}
      />

      {selectedPortfolio && (
        <div className="space-y-8 w-full">
          {/* Key Portfolio KPIs section */}
          <KeyPortfolioKpis
            kpis={kpiCards}
            maskPortfolioValue={maskPortfolioValue}
            onToggleMaskPortfolioValue={() => setMaskPortfolioValue(v => !v)}
          />

          {/* Dedicated Volatility section (moved out of Key KPIs) */}
          <VolatilitySection vol30={annualizedVolatility(30)} vol90={annualizedVolatility(90)} vol365={annualizedVolatility(365)} />

          {/* Recent Portfolio Returns */}
          {/* Pass raw returnsKpis first so ReturnsPanel can internally derive cards even if our mapping missed some shapes */}
          <ReturnsPanel kpis={returnsKpis || returnsKpiCards} />

          {/* Asset Allocation */}
          <AllocationPanel assets={allocationAssets} grouping={allocationView} setGrouping={setAllocationView} />

          {/* Portfolio Performance Chart */}
          <CollapsibleSection key="performance" title="Portfolio Performance" defaultOpen={false}>
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
              selector={benchmarksSelector}
            />
          </CollapsibleSection>

          {/* Individual Asset Performance */}
          <CollapsibleSection key="asset-performance" title="Individual Asset Performance" defaultOpen={false}>
            <TickerPerformanceSection
              selectedPortfolio={selectedPortfolio}
              availableTickers={availableTickers}
              selectedTickers={selectedTickers}
              onSelectedTickersChange={setSelectedTickers}
            />
          </CollapsibleSection>

          {/* Risk Analysis - Placeholder */}
          <CollapsibleSection key="risk-analysis" title="Risk Analysis" defaultOpen={false}>
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <div className="text-center text-gray-400 py-12">
                <ArrowTrendingUpIcon className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium mb-2">Risk Analysis Dashboard</h3>
                <p className="text-sm">Portfolio risk metrics, correlation analysis, and risk-adjusted returns will be displayed here.</p>
                <p className="text-xs mt-2 opacity-75">Components: Risk metrics cards, correlation heatmap, Sharpe ratio analysis</p>
              </div>
            </div>
          </CollapsibleSection>

          {/* AI Insights - Placeholder */}
          <CollapsibleSection key="ai-insights" title="AI Portfolio Insights" defaultOpen={false}>
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <div className="text-center text-gray-400 py-12">
                <CurrencyDollarIcon className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium mb-2">AI-Powered Portfolio Insights</h3>
                <p className="text-sm">Personalized recommendations, market analysis, and portfolio optimization suggestions.</p>
                <p className="text-xs mt-2 opacity-75">Component: ChatInterface for AI analysis and recommendations</p>
              </div>
            </div>
          </CollapsibleSection>

          {/* Client Summary Report - Placeholder */}
          <CollapsibleSection key="client-report" title="Client Summary Report" defaultOpen={false}>
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <div className="text-center text-gray-400 py-12">
                <ChartBarIcon className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium mb-2">Comprehensive Client Report</h3>
                <p className="text-sm">Detailed portfolio summary, performance attribution, and executive summary for client meetings.</p>
                <p className="text-xs mt-2 opacity-75">Component: Automated report generation with key insights and recommendations</p>
              </div>
            </div>
          </CollapsibleSection>
        </div>
      )}

      {!selectedPortfolio && !portfolioNamesLoading && (
        <div className="text-center text-gray-400 py-12">
          <CurrencyDollarIcon className="h-16 w-16 mx-auto mb-4 opacity-50" />
          <h2 className="text-xl font-medium mb-2">Financial Advisor Dashboard</h2>
          <p className="text-sm">Select a client portfolio to view comprehensive analysis and insights.</p>
        </div>
      )}
    </>
  );
};

export default SimpleHome;
