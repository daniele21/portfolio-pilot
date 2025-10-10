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
import { Container, Grid, Stack, Group, Title, Text, Paper, Button, Divider, rem } from '@mantine/core';
import { Kpi, TrafficLightStatus } from '../../types';
import KeyPortfolioKpis from '../../components/KeyPortfolioKpis';
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

// Professional layout constants
const SECTION_GAP = rem(32);
const SHADOW_LIGHT = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
const SHADOW_MEDIUM = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';

const SimpleHome: React.FC = () => {
  const { isLoggedIn, idToken } = useAuth();
  const [selectedPortfolio, setSelectedPortfolio] = React.useState<string | null>(null);
  const [maskPortfolioValue, setMaskPortfolioValue] = React.useState(true);
  const [allocationView, setAllocationView] = React.useState<'overall' | 'quoteType'>('overall');
  const [volatilityWindow, setVolatilityWindow] = React.useState<string>(VOLATILITY_PRESETS[0].value);
  
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
  const annualizedVolatility = React.useCallback((nDays: number) => {
    const returns = performanceDerived.dailyReturns || [];
    if (!returns || returns.length === 0) return null;
    const slice = returns.slice(-nDays);
    if (slice.length < 2) return null;
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (slice.length - 1);
    const dailyStd = Math.sqrt(variance);
    const annualized = dailyStd * Math.sqrt(252); // trading days
    return annualized * 100; // percent
  }, [performanceDerived]);

  const derivedVolatility = React.useMemo(() => ({
    '30': annualizedVolatility(30),
    '90': annualizedVolatility(90),
    '252': annualizedVolatility(252)
  }), [annualizedVolatility]);

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

    const selectedVolOption = VOLATILITY_PRESETS.find(opt => opt.value === volatilityWindow);
    const backendVolValue = portfolioVolatility?.volatility;
    const backendVolMethod = portfolioVolatility?.method;
    const fallbackVolValue = (derivedVolatility as Record<string, number | null | undefined>)[volatilityWindow];
    if (typeof backendVolValue === 'number') {
      cards.push({
        id: 'portfolio_volatility',
        name: `Volatility (${selectedVolOption?.label || volatilityWindow})`,
        value: backendVolValue.toFixed(2) + '%',
        unit: '',
        status: TrafficLightStatus.NEUTRAL,
        description: backendVolMethod === 'ewm' ? 'Exponentially weighted volatility (EWMA)' : 'Rolling annualized volatility',
        icon: ChartBarIcon
      });
    } else if (typeof fallbackVolValue === 'number') {
      cards.push({
        id: 'portfolio_volatility',
        name: `Volatility (${selectedVolOption?.label || volatilityWindow})`,
        value: fallbackVolValue.toFixed(2) + '%',
        unit: '',
        status: TrafficLightStatus.NEUTRAL,
        description: 'Derived locally from performance history',
        icon: ChartBarIcon
      });
    }

    // Volatility cards: include derived vols plus any portfolioVolatility
  //   const vol30 = annualizedVolatility(30);
  //   const vol90 = annualizedVolatility(90);
    // const vol365 = annualizedVolatility(365);
  //   if (typeof vol30 === 'number') cards.push({ id: 'vol_30', name: 'Volatility (30d)', value: vol30.toFixed(2) + '%', unit: '', status: TrafficLightStatus.NEUTRAL, description: '30-day annualized vol', icon: ChartBarIcon });
  //   if (typeof vol90 === 'number') cards.push({ id: 'vol_90', name: 'Volatility (90d)', value: vol90.toFixed(2) + '%', unit: '', status: TrafficLightStatus.NEUTRAL, description: '90-day annualized vol', icon: ChartBarIcon });
  // if (typeof vol365 === 'number') cards.push({ id: 'vol_365', name: 'Volatility (1y)', value: vol365.toFixed(2) + '%', unit: '', status: TrafficLightStatus.NEUTRAL, description: '365-day annualized vol', icon: ChartBarIcon });

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
  }, [kpis, maskPortfolioValue, portfolioVolatility, performanceDerived, returnsKpis, volatilityWindow, derivedVolatility]);

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
    <div style={{ 
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', 
      minHeight: '100vh', 
      paddingBottom: SECTION_GAP 
    }}>
      <Container size="xl" py="xl" px="lg" style={{ color: '#e2e8f0' }}>
        <Stack gap={SECTION_GAP}>
          {/* Enhanced Professional Header */}
          <Paper 
            radius="lg" 
            p="xl" 
            withBorder 
            style={{ 
              background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.95) 100%)',
              borderColor: 'rgba(148, 163, 184, 0.25)',
              boxShadow: SHADOW_MEDIUM,
              backdropFilter: 'blur(8px)'
            }}
          >
            <Group justify="space-between" align="flex-end">
              <Stack gap={rem(8)} style={{ flex: 1, minWidth: 0 }}>
                <Group gap="md" align="center">
                  <div style={{
                    padding: rem(12),
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.2) 0%, rgba(129, 140, 248, 0.15) 100%)',
                    border: '1px solid rgba(79, 70, 229, 0.3)'
                  }}>
                    <ChartBarIcon style={{ width: rem(28), height: rem(28), color: '#818cf8' }} />
                  </div>
                  <Stack gap={rem(2)}>
                    <Title order={1} c="#f8fafc" fw={700} style={{ letterSpacing: '-0.025em' }}>
                      Portfolio Command Center
                    </Title>
                    <Text size="lg" c="#94a3b8" fw={500}>
                      Professional Investment Management Platform
                    </Text>
                  </Stack>
                </Group>
                <Text size="sm" c="dimmed" mt="xs">
                  {selectedPortfolio 
                    ? `Currently monitoring ${selectedPortfolio} • Real-time analytics and insights` 
                    : 'Select a client portfolio to access comprehensive investment analytics'}
                </Text>
              </Stack>
              <Group gap="md">
                <Button 
                  variant="light" 
                  color="gray" 
                  size="md"
                  radius="md"
                  style={{ fontWeight: 500 }}
                >
                  Export Report
                </Button>
                <Button 
                  variant="light" 
                  color="teal" 
                  size="md"
                  radius="md"
                  style={{ fontWeight: 500 }}
                >
                  Rebalance
                </Button>
                <Button 
                  variant="filled" 
                  color="indigo" 
                  size="md"
                  radius="md"
                  style={{ fontWeight: 600 }}
                >
                  Add Note
                </Button>
              </Group>
            </Group>
          </Paper>

          {/* Enhanced Portfolio Selector */}
          <Paper 
            radius="lg" 
            p="lg" 
            withBorder 
            style={{ 
              background: 'rgba(15, 23, 42, 0.95)', 
              borderColor: 'rgba(148, 163, 184, 0.25)',
              boxShadow: SHADOW_LIGHT,
              backdropFilter: 'blur(4px)'
            }}
          >
            <Stack gap="md">
              <Group justify="space-between" align="center">
                <Stack gap={rem(2)}>
                  <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ letterSpacing: '0.05em' }}>
                    Client Portfolio Selection
                  </Text>
                  <Text size="sm" c="#e2e8f0" fw={500}>
                    Choose a portfolio to analyze
                  </Text>
                </Stack>
                {selectedPortfolio && (
                  <div style={{
                    padding: `${rem(4)} ${rem(12)}`,
                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(20, 184, 166, 0.1) 100%)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: rem(20),
                    color: '#6ee7b7',
                    fontSize: rem(12),
                    fontWeight: 600
                  }}>
                    Active
                  </div>
                )}
              </Group>
              <PortfolioSelector
                portfolioNames={portfolioNames}
                selectedPortfolio={selectedPortfolio}
                setSelectedPortfolio={setSelectedPortfolio}
                loading={portfolioNamesLoading}
              />
            </Stack>
          </Paper>

          {selectedPortfolio ? (
            <Stack gap={SECTION_GAP}>
              <Grid gutter={SECTION_GAP} align="stretch">
                <Grid.Col span={{ base: 12, xl: 8 }}>
                  <Stack gap={SECTION_GAP}>
                    {/* Enhanced KPI Section */}
                    <Paper 
                      radius="lg" 
                      p="xl" 
                      withBorder 
                      style={{ 
                        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.95) 100%)',
                        borderColor: 'rgba(148, 163, 184, 0.25)',
                        boxShadow: SHADOW_LIGHT,
                        backdropFilter: 'blur(4px)'
                      }}
                    >
                      <Stack gap="lg">
                        <Group justify="space-between" align="flex-start">
                          <Stack gap={rem(4)}>
                            <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ letterSpacing: '0.05em' }}>
                              Executive Dashboard
                            </Text>
                            <Title order={3} c="#f8fafc" fw={700}>
                              Key Performance Indicators
                            </Title>
                            <Text size="sm" c="#94a3b8" fw={400}>
                              Real-time portfolio metrics and performance summary
                            </Text>
                          </Stack>
                          <Button 
                            variant="subtle" 
                            color="gray" 
                            size="sm"
                            radius="md"
                            onClick={() => setMaskPortfolioValue(v => !v)}
                            style={{ fontWeight: 500 }}
                          >
                            {maskPortfolioValue ? 'Reveal Values' : 'Mask Values'}
                          </Button>
                        </Group>
                        <Divider color="rgba(148, 163, 184, 0.25)" size="sm" />
                        <KeyPortfolioKpis
                          kpis={kpiCards}
                          maskPortfolioValue={maskPortfolioValue}
                          onToggleMaskPortfolioValue={() => setMaskPortfolioValue(v => !v)}
                        />
                      </Stack>
                    </Paper>

                    {/* Enhanced Performance Section */}
                    <Paper 
                      radius="lg" 
                      p="xl" 
                      withBorder 
                      style={{ 
                        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.95) 100%)',
                        borderColor: 'rgba(148, 163, 184, 0.25)',
                        boxShadow: SHADOW_LIGHT,
                        backdropFilter: 'blur(4px)'
                      }}
                    >
                      <Stack gap="md">
                        <Group justify="space-between" align="center">
                          <Stack gap={rem(4)}>
                            <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ letterSpacing: '0.05em' }}>
                              Performance Analytics
                            </Text>
                            <Title order={4} c="#f8fafc" fw={600}>
                              Portfolio Performance Tracking
                            </Title>
                          </Stack>
                        </Group>
                        <Divider color="rgba(148, 163, 184, 0.25)" size="sm" />
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
                      </Stack>
                    </Paper>

                    {/* Enhanced Asset Analysis Section */}
                    <Paper 
                      radius="lg" 
                      p="xl" 
                      withBorder 
                      style={{ 
                        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.95) 100%)',
                        borderColor: 'rgba(148, 163, 184, 0.25)',
                        boxShadow: SHADOW_LIGHT,
                        backdropFilter: 'blur(4px)'
                      }}
                    >
                      <Stack gap="lg">
                        <Stack gap={rem(4)}>
                          <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ letterSpacing: '0.05em' }}>
                            Asset Analysis
                          </Text>
                          <Title order={4} c="#f8fafc" fw={600}>
                            Individual Asset Performance
                          </Title>
                          <Text size="sm" c="#94a3b8" fw={400}>
                            Detailed performance metrics for portfolio holdings
                          </Text>
                        </Stack>
                        <Divider color="rgba(148, 163, 184, 0.25)" size="sm" />
                        <TickerPerformanceSection
                          selectedPortfolio={selectedPortfolio}
                          availableTickers={availableTickers}
                          selectedTickers={selectedTickers}
                          onSelectedTickersChange={setSelectedTickers}
                        />
                      </Stack>
                    </Paper>
                  </Stack>
                </Grid.Col>

                <Grid.Col span={{ base: 12, xl: 4 }}>
                  <Stack gap={SECTION_GAP}>
                    {/* Enhanced Volatility Section */}
                    <Paper 
                      radius="lg" 
                      p="lg" 
                      withBorder 
                      style={{ 
                        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.95) 100%)',
                        borderColor: 'rgba(148, 163, 184, 0.25)',
                        boxShadow: SHADOW_LIGHT,
                        backdropFilter: 'blur(4px)'
                      }}
                    >
                      <VolatilitySection
                        options={VOLATILITY_PRESETS}
                        selectedWindow={volatilityWindow}
                        onWindowChange={(value) => setVolatilityWindow(value)}
                        backendVolatility={portfolioVolatility?.volatility ?? null}
                        backendMethod={portfolioVolatility?.method}
                        fallbackValues={{ ...derivedVolatility, ewm: null }}
                      />
                    </Paper>

                    {/* Enhanced Returns Panel */}
                    <Paper 
                      radius="lg" 
                      p="lg" 
                      withBorder 
                      style={{ 
                        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.95) 100%)',
                        borderColor: 'rgba(148, 163, 184, 0.25)',
                        boxShadow: SHADOW_LIGHT,
                        backdropFilter: 'blur(4px)'
                      }}
                    >
                      <ReturnsPanel kpis={returnsKpis || returnsKpiCards} />
                    </Paper>

                    {/* Enhanced Allocation Panel */}
                    <Paper 
                      radius="lg" 
                      p="lg" 
                      withBorder 
                      style={{ 
                        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.95) 100%)',
                        borderColor: 'rgba(148, 163, 184, 0.25)',
                        boxShadow: SHADOW_LIGHT,
                        backdropFilter: 'blur(4px)'
                      }}
                    >
                      <Stack gap="md">
                        <Stack gap={rem(4)}>
                          <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ letterSpacing: '0.05em' }}>
                            Asset Allocation
                          </Text>
                          <Title order={5} c="#f8fafc" fw={600}>
                            Portfolio Composition
                          </Title>
                          <Text size="sm" c="#94a3b8" fw={400}>
                            Current exposure and diversification metrics
                          </Text>
                        </Stack>
                        <Divider color="rgba(148, 163, 184, 0.25)" size="sm" />
                        <AllocationPanel
                          assets={allocationAssets}
                          grouping={allocationView}
                          setGrouping={setAllocationView}
                        />
                      </Stack>
                    </Paper>

                    {/* Enhanced Advisor Actions Panel */}
                    <Paper 
                      radius="lg" 
                      p="lg" 
                      withBorder 
                      style={{ 
                        background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.08) 0%, rgba(129, 140, 248, 0.05) 100%)',
                        borderColor: 'rgba(79, 70, 229, 0.25)',
                        boxShadow: SHADOW_LIGHT,
                        backdropFilter: 'blur(4px)'
                      }}
                    >
                      <Stack gap="md">
                        <Stack gap={rem(4)}>
                          <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ letterSpacing: '0.05em' }}>
                            Advisor Actions
                          </Text>
                          <Title order={5} c="#f8fafc" fw={600}>
                            Client Management
                          </Title>
                          <Text size="sm" c="#94a3b8" fw={400}>
                            Quick access to essential advisor tools and workflows
                          </Text>
                        </Stack>
                        <Divider color="rgba(148, 163, 184, 0.25)" size="sm" />
                        <Stack gap="md">
                          <Button 
                            variant="light" 
                            color="indigo" 
                            fullWidth
                            size="md"
                            radius="md"
                            style={{ fontWeight: 500, height: rem(44) }}
                          >
                            Schedule Review Meeting
                          </Button>
                          <Button 
                            variant="light" 
                            color="teal" 
                            fullWidth
                            size="md"
                            radius="md"
                            style={{ fontWeight: 500, height: rem(44) }}
                          >
                            Generate Executive Summary
                          </Button>
                          <Button 
                            variant="outline" 
                            color="gray" 
                            fullWidth
                            size="md"
                            radius="md"
                            style={{ fontWeight: 500, height: rem(44) }}
                          >
                            Log Client Note
                          </Button>
                        </Stack>
                      </Stack>
                    </Paper>
                  </Stack>
                </Grid.Col>
              </Grid>

              {/* Enhanced Feature Cards Section */}
              <Stack gap="md" mt="xl">
                <Stack gap={rem(4)} align="center">
                  <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ letterSpacing: '0.05em' }}>
                    Advanced Analytics Suite
                  </Text>
                  <Title order={3} c="#f8fafc" fw={700} ta="center">
                    Professional Investment Tools
                  </Title>
                  <Text size="md" c="#94a3b8" fw={400} ta="center" maw={600}>
                    Comprehensive analytics and reporting capabilities for sophisticated portfolio management
                  </Text>
                </Stack>
                
                <Grid gutter="xl" mt="lg">
                  <Grid.Col span={{ base: 12, md: 4 }}>
                    <Paper 
                      radius="xl" 
                      p="xl" 
                      withBorder 
                      style={{ 
                        background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.12) 0%, rgba(217, 119, 6, 0.08) 100%)', 
                        borderColor: 'rgba(251, 191, 36, 0.3)',
                        boxShadow: '0 8px 32px rgba(251, 191, 36, 0.15)',
                        backdropFilter: 'blur(8px)',
                        transition: 'all 0.3s ease',
                        cursor: 'pointer'
                      }}
                      className="hover:scale-105"
                    >
                      <Stack gap="lg" align="center">
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          width: rem(64), 
                          height: rem(64), 
                          borderRadius: '20px', 
                          background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.25) 0%, rgba(217, 119, 6, 0.15) 100%)',
                          border: '1px solid rgba(251, 191, 36, 0.4)'
                        }}>
                          <ArrowTrendingUpIcon style={{ width: rem(32), height: rem(32), color: '#fbbf24' }} />
                        </div>
                        <Stack gap="sm" align="center">
                          <Title order={4} c="#fef3c7" fw={600}>Risk Analytics</Title>
                          <Text size="sm" c="#fde68a" ta="center" fw={400} lh={1.6}>
                            Advanced risk modeling with stress tests, correlation analysis, and Sharpe ratio calculations for comprehensive portfolio assessment.
                          </Text>
                        </Stack>
                      </Stack>
                    </Paper>
                  </Grid.Col>

                  <Grid.Col span={{ base: 12, md: 4 }}>
                    <Paper 
                      radius="xl" 
                      p="xl" 
                      withBorder 
                      style={{ 
                        background: 'linear-gradient(135deg, rgba(129, 140, 248, 0.12) 0%, rgba(139, 92, 246, 0.08) 100%)', 
                        borderColor: 'rgba(129, 140, 248, 0.3)',
                        boxShadow: '0 8px 32px rgba(129, 140, 248, 0.15)',
                        backdropFilter: 'blur(8px)',
                        transition: 'all 0.3s ease',
                        cursor: 'pointer'
                      }}
                      className="hover:scale-105"
                    >
                      <Stack gap="lg" align="center">
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          width: rem(64), 
                          height: rem(64), 
                          borderRadius: '20px', 
                          background: 'linear-gradient(135deg, rgba(129, 140, 248, 0.25) 0%, rgba(139, 92, 246, 0.15) 100%)',
                          border: '1px solid rgba(129, 140, 248, 0.4)'
                        }}>
                          <CurrencyDollarIcon style={{ width: rem(32), height: rem(32), color: '#a5b4fc' }} />
                        </div>
                        <Stack gap="sm" align="center">
                          <Title order={4} c="#e0e7ff" fw={600}>AI-Powered Insights</Title>
                          <Text size="sm" c="#c7d2fe" ta="center" fw={400} lh={1.6}>
                            Leverage advanced AI analytics and Gemini insights to surface actionable investment opportunities tailored to each client.
                          </Text>
                        </Stack>
                      </Stack>
                    </Paper>
                  </Grid.Col>

                  <Grid.Col span={{ base: 12, md: 4 }}>
                    <Paper 
                      radius="xl" 
                      p="xl" 
                      withBorder 
                      style={{ 
                        background: 'linear-gradient(135deg, rgba(45, 212, 191, 0.12) 0%, rgba(20, 184, 166, 0.08) 100%)', 
                        borderColor: 'rgba(45, 212, 191, 0.3)',
                        boxShadow: '0 8px 32px rgba(45, 212, 191, 0.15)',
                        backdropFilter: 'blur(8px)',
                        transition: 'all 0.3s ease',
                        cursor: 'pointer'
                      }}
                      className="hover:scale-105"
                    >
                      <Stack gap="lg" align="center">
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          width: rem(64), 
                          height: rem(64), 
                          borderRadius: '20px', 
                          background: 'linear-gradient(135deg, rgba(45, 212, 191, 0.25) 0%, rgba(20, 184, 166, 0.15) 100%)',
                          border: '1px solid rgba(45, 212, 191, 0.4)'
                        }}>
                          <ChartBarIcon style={{ width: rem(32), height: rem(32), color: '#2dd4bf' }} />
                        </div>
                        <Stack gap="sm" align="center">
                          <Title order={4} c="#ccfbf1" fw={600}>Executive Reporting</Title>
                          <Text size="sm" c="#99f6e4" ta="center" fw={400} lh={1.6}>
                            Generate professional, branded client reports and executive summaries with one-click automation and customizable templates.
                          </Text>
                        </Stack>
                      </Stack>
                    </Paper>
                  </Grid.Col>
                </Grid>
              </Stack>
            </Stack>
          ) : (
            /* Enhanced Empty State */
            <Paper 
              radius="xl" 
              p="xl" 
              withBorder 
              style={{ 
                background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.95) 100%)',
                borderColor: 'rgba(148, 163, 184, 0.25)',
                boxShadow: SHADOW_MEDIUM,
                backdropFilter: 'blur(8px)',
                textAlign: 'center',
                minHeight: rem(400)
              }}
            >
              <Stack gap="xl" align="center" justify="center" style={{ minHeight: rem(300) }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: rem(80),
                  height: rem(80),
                  borderRadius: '24px',
                  background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.15) 0%, rgba(129, 140, 248, 0.1) 100%)',
                  border: '1px solid rgba(79, 70, 229, 0.3)'
                }}>
                  <ChartBarIcon style={{ width: rem(40), height: rem(40), color: '#818cf8' }} />
                </div>
                
                <Stack gap="md" align="center" maw={500}>
                  <Title order={2} c="#f8fafc" fw={700}>
                    Professional Portfolio Analytics
                  </Title>
                  <Text size="lg" c="#94a3b8" fw={500} ta="center" lh={1.6}>
                    Welcome to your comprehensive investment management platform. Select a client portfolio above to access:
                  </Text>
                  
                  <Stack gap="sm" mt="md" align="flex-start" style={{ textAlign: 'left' }}>
                    <Text size="md" c="#e2e8f0" fw={400}>
                      • Real-time performance tracking and analytics
                    </Text>
                    <Text size="md" c="#e2e8f0" fw={400}>
                      • Advanced risk metrics and volatility analysis
                    </Text>
                    <Text size="md" c="#e2e8f0" fw={400}>
                      • AI-powered insights and recommendations
                    </Text>
                    <Text size="md" c="#e2e8f0" fw={400}>
                      • Professional client reporting tools
                    </Text>
                  </Stack>
                </Stack>
                
                <Button 
                  size="lg" 
                  variant="gradient"
                  gradient={{ from: '#4f46e5', to: '#818cf8' }}
                  radius="xl"
                  style={{ 
                    fontWeight: 600,
                    paddingLeft: rem(24),
                    paddingRight: rem(24),
                    height: rem(48)
                  }}
                >
                  Get Started
                </Button>
              </Stack>
            </Paper>
          )}
        </Stack>
      </Container>
    </div>
  );
};

export default SimpleHome;
