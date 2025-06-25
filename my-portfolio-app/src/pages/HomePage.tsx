import React, { useEffect, useState, Fragment } from 'react';
import KpiCard from '../components/KpiCard';
import PerformanceChart from '../components/PerformanceChart';
import SunburstChart from '../components/SunburstChart';
import { Kpi, HistoricalDataPoint, Asset, TrafficLightStatus } from '../types';
import { getAssets, processAndApplyMovements, fetchAllPortfolioNames, fetchPortfolioPerformance, fetchTickerPerformance, fetchPortfolioKpis, fetchPortfolioAllocation, fetchPortfolioReturnsKpis } from '../services/portfolioService';
import { PresentationChartLineIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../AuthContext';
import { ErrorBoundary } from '../components/ErrorBoundary';
import dayjs from 'dayjs';
import { Listbox, Transition } from '@headlessui/react';
import { CheckIcon, ChevronUpDownIcon, XMarkIcon } from '@heroicons/react/20/solid';
import { fetchBenchmarkPerformance } from '../services/marketDataService';


// --- KPI API response type ---
type PortfolioKpisApiResponse = {
  best_ticker: { pct: number, symbol: string },
  highest_value_ticker: { abs_value: number, symbol: string },
  net_performance: number,
  portfolio_value: { abs_value: number, net_value: number },
  worst_ticker: { pct: number, symbol: string }
};

const CollapsibleSection: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean }> = ({ title, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-4">
      <button
        className="w-full flex items-center justify-between px-4 py-2 bg-gray-700 rounded-t-lg focus:outline-none text-left text-white font-semibold text-lg hover:bg-gray-600 transition-colors"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls={`section-${title.replace(/\s+/g, '-')}`}
      >
        <span>{title}</span>
        <span className={`transform transition-transform duration-200 ${open ? '' : 'rotate-180'}`}>▼</span>
      </button>
      {open && (
        <div id={`section-${title.replace(/\s+/g, '-')}`} className="bg-gray-800 rounded-b-lg p-6 border-t border-gray-700">
          {children}
        </div>
      )}
    </div>
  );
};

const HomePage: React.FC = () => {
  const [kpis, setKpis] = useState<PortfolioKpisApiResponse | null>(null);
  const [assetsForSelector, setAssetsForSelector] = useState<Asset[]>([]); // Assets from portfolio status for dropdown
  const [loading, setLoading] = useState<boolean>(true);
  const [tickerLoading, setTickerLoading] = useState<boolean>(false);
  const [benchmarkLoading, setBenchmarkLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [transactionInput, setTransactionInput] = useState('');
  const [transactionError, setTransactionError] = useState<string | null>(null);
  const [transactionLoading, setTransactionLoading] = useState(false);
  const { isLoggedIn, idToken } = useAuth();
  const [selectedPortfolio, setSelectedPortfolio] = useState<string | null>(null);
  const [portfolioNames, setPortfolioNames] = useState<string[]>([]);
  const [portfolioPerformance, setPortfolioPerformance] = useState<HistoricalDataPoint[]>([]);
  const [returnsKpis, setReturnsKpis] = useState<any | null>(null);

  // --- Portfolio Performance Date Range State ---
  const [portfolioDateRange, setPortfolioDateRange] = useState<{start: string, end: string} | null>(null);
  // --- Value Type State ---
  const [portfolioValueType, setPortfolioValueType] = useState<'value' | 'abs_value' | 'pct' | 'pct_from_first'>('value');

  // --- Ticker Performance Date Range State ---
  const [tickerDateRange, setTickerDateRange] = useState<{start: string, end: string} | null>(null);
  // --- Ticker Value Type State ---
  const [tickerValueType, setTickerValueType] = useState<'value' | 'abs_value' | 'pct' | 'pct_from_first'>('value');
  // --- Multi-ticker selection state ---
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);
  const [multiTickerPerformance, setMultiTickerPerformance] = useState<Record<string, HistoricalDataPoint[]>>({});

  // --- Benchmark tickers ---
  const BENCHMARK_TICKERS = [
    { symbol: '^GSPC', name: 'S&P 500' },
    { symbol: '^NDX', name: 'NASDAQ 100' },
    { symbol: '^RUT', name: 'Russell 2000' },
    { symbol: '^DJI', name: 'Dow Jones' },
    { symbol: '^STOXX50E', name: 'Euro Stoxx 50' },
    { symbol: 'IMEU.L', name: 'iShares MSCI Europe' },
    { symbol: 'FTSEMIB.MI', name: 'FTSE MIB' }
  ];
  const [benchmarkPerformance, setBenchmarkPerformance] = useState<Record<string, HistoricalDataPoint[]>>({});
  const [selectedBenchmarks, setSelectedBenchmarks] = useState<string[]>([]);
  const [benchmarkNames, setBenchmarkNames] = useState<Record<string, string>>({});

  // Set selectedPortfolio to first available if not set and portfolios are available
  useEffect(() => {
    if (portfolioNames.length > 0 && !selectedPortfolio) {
      setSelectedPortfolio(portfolioNames[0]);
    }
  }, [portfolioNames]);

  useEffect(() => {
    const fetchData = async () => {
      if (!isLoggedIn || !idToken) {
        setLoading(false);
        setError("Please sign in to view portfolio data.");
        setKpis(null); setAssetsForSelector([]);
        setPortfolioNames([]);
        setPortfolioPerformance([]);
        setReturnsKpis(null);
        return;
      }
      try {
        setLoading(true);
        // Fetch all portfolio names from backend
        const uniquePortfolioNames = await fetchAllPortfolioNames();
        setPortfolioNames(uniquePortfolioNames);
        // If no portfolios, show transaction modal
        if (uniquePortfolioNames.length === 0) {
          setShowTransactionModal(true);
          setKpis(null); setAssetsForSelector([]);
          setSelectedPortfolio(null);
          setPortfolioPerformance([]);
          setReturnsKpis(null);
          setLoading(false);
          return;
        }
        setShowTransactionModal(false);
        // Only fetch data if selectedPortfolio is set and valid
        if (selectedPortfolio && uniquePortfolioNames.includes(selectedPortfolio)) {
          const [kpiData, assetData, perfData, returnsKpiData] = await Promise.all([
            fetchPortfolioKpis(selectedPortfolio),
            getAssets(selectedPortfolio),
            fetchPortfolioPerformance(selectedPortfolio),
            fetchPortfolioReturnsKpis(selectedPortfolio)
          ]);
          setKpis(kpiData);
          setPortfolioPerformance(perfData);
          setReturnsKpis(returnsKpiData);
          const eligibleAssets = Array.isArray(assetData) ? assetData.filter((a: any) => a.category !== 'Cash' && a.symbol) : [];
          setAssetsForSelector(eligibleAssets);
        }
        setError(null);
      } catch (err) {
        setError("Failed to load dashboard data. The backend might be unavailable or portfolio is not initialized.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [isLoggedIn, idToken, selectedPortfolio]); // Reload main data if auth state changes

  // Fetch performance for all selected tickers
  useEffect(() => {
    const fetchAll = async () => {
      if (selectedPortfolio && selectedTickers.length > 0) {
        setTickerLoading(true);
        const results: Record<string, HistoricalDataPoint[]> = {};
        await Promise.all(selectedTickers.map(async (ticker) => {
          const perf = await fetchTickerPerformance(selectedPortfolio, ticker);
          results[ticker] = perf;
        }));
        setMultiTickerPerformance(results);
        setTickerLoading(false);
      } else {
        setMultiTickerPerformance({});
        setTickerLoading(false);
      }
    };
    fetchAll();
  }, [selectedPortfolio, selectedTickers]);

  // Fetch performance for selected benchmarks only
  useEffect(() => {
    const fetchSelectedBenchmarks = async () => {
      if (selectedBenchmarks.length === 0) {
        setBenchmarkPerformance({});
        setBenchmarkLoading(false);
        return;
      }
      setBenchmarkLoading(true);
      const results: Record<string, HistoricalDataPoint[]> = {};
      await Promise.all(selectedBenchmarks.map(async (symbol) => {
        const perf = await fetchBenchmarkPerformance(symbol);
        results[symbol] = perf || [];
      }));
      setBenchmarkPerformance(results);
      setBenchmarkLoading(false);
    };
    fetchSelectedBenchmarks();
  }, [selectedBenchmarks]);

  // Fetch benchmark info at mount
  useEffect(() => {
    const fetchBenchmarkNames = async () => {
      const names: Record<string, string> = {};
      await Promise.all(BENCHMARK_TICKERS.map(async (b) => {
        try {
          // Call get_ticker API (fetchTickerPerformance returns perf, not info)
          const res = await fetch(`/api/ticker/${b.symbol}`);
          if (res.ok) {
            const data = await res.json();
            names[b.symbol] = data?.info?.shortName || b.name || b.symbol;
          } else {
            names[b.symbol] = b.name || b.symbol;
          }
        } catch {
          names[b.symbol] = b.name || b.symbol;
        }
      }));
      setBenchmarkNames(names);
    };
    fetchBenchmarkNames();
  }, []);

  const handleTransactionSubmit = async () => {
    setTransactionLoading(true);
    setTransactionError(null);
    try {
      const result = await processAndApplyMovements(transactionInput);
      if (!result.success) {
        setTransactionError(result.message || 'Failed to process transactions.');
      } else {
        setShowTransactionModal(false);
        setTransactionInput('');
        // Refresh dashboard data
        if (selectedPortfolio) {
          const [kpiData, assetData] = await Promise.all([
            fetchPortfolioKpis(selectedPortfolio),
            getAssets(selectedPortfolio)
          ]);
          setKpis(kpiData);
          const eligibleAssets = (assetData as any[]).filter((a: any) => a.category !== 'Cash' && a.symbol);
          setAssetsForSelector(eligibleAssets);
        }
      }
    } catch (err) {
      setTransactionError('An error occurred while uploading transactions.');
    } finally {
      setTransactionLoading(false);
    }
  };

  // Helper to get min/max dates from data
  const getMinMaxDates = (data: HistoricalDataPoint[]) => {
    if (!data || data.length === 0) return {min: '', max: ''};
    const dates = data.map(d => d.date).sort();
    return {min: dates[0], max: dates[dates.length-1]};
  };

  // --- Portfolio Performance: Filtered Data ---
  const portfolioMinMax = getMinMaxDates(portfolioPerformance);
  const portfolioFiltered = React.useMemo(() => {
    if (!portfolioDateRange) return portfolioPerformance;
    return portfolioPerformance.filter(d => d.date >= portfolioDateRange.start && d.date <= portfolioDateRange.end);
  }, [portfolioPerformance, portfolioDateRange]);

  // --- Portfolio % from first value (for charting like benchmarks) ---
  const portfolioPctFromFirst = React.useMemo(() => {
    return portfolioFiltered.map(d => ({
      date: d.date,
      pct_from_first: d.pct_from_first !== undefined ? d.pct_from_first : (
        portfolioFiltered.length > 0 && portfolioFiltered[0].abs_value !== undefined && d.abs_value !== undefined
          ? (((d.abs_value ?? 0) - (portfolioFiltered[0].abs_value ?? 0)) / (portfolioFiltered[0].abs_value ?? 1) * 100)
          : 0
      )
    }));
  }, [portfolioFiltered]);

  // --- Ticker Performance: Filtered Data ---
  const tickerMinMax = React.useMemo(() => {
    // Compute min/max from all selected tickers' data
    const all = selectedTickers.flatMap(t => multiTickerPerformance[t] || []);
    if (!all.length) return {min: '', max: ''};
    const dates = all.map(d => d.date).sort();
    return {min: dates[0], max: dates[dates.length-1]};
  }, [selectedTickers, multiTickerPerformance]);
  const tickerFiltered = React.useMemo(() => {
    // Filter all selected tickers' data by date range
    return selectedTickers.flatMap(t => (multiTickerPerformance[t] || []).filter((d: HistoricalDataPoint) => {
      if (!tickerDateRange) return true;
      return d.date >= tickerDateRange.start && d.date <= tickerDateRange.end;
    }));
  }, [selectedTickers, multiTickerPerformance, tickerDateRange]);

  // --- Benchmark Performance: Filtered Data ---
  const benchmarkFiltered = React.useMemo(() => {
    if (!portfolioDateRange) return benchmarkPerformance;
    const filtered: Record<string, HistoricalDataPoint[]> = {};
    for (const symbol of selectedBenchmarks) {
      filtered[symbol] = (benchmarkPerformance[symbol] || []).filter((d: HistoricalDataPoint) => d.date >= portfolioDateRange.start && d.date <= portfolioDateRange.end);
    }
    return filtered;
  }, [benchmarkPerformance, selectedBenchmarks, portfolioDateRange]);

  // --- Compute final value for portfolio trend ---
  const getFinalValue = (data: HistoricalDataPoint[], valueType: 'value' | 'abs_value' | 'pct' | 'pct_from_first') => {
    if (!data || data.length === 0) return null;
    const last = data[data.length - 1];
    if (valueType === 'pct') return last.pct?.toFixed(2) + '%';
    if (valueType === 'abs_value') return (last.abs_value ?? 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    if (valueType === 'pct_from_first') {
      if (last.pct_from_first !== undefined) return last.pct_from_first.toFixed(2) + '%';
      if (data[0]?.abs_value !== undefined && last.abs_value !== undefined) return (((last.abs_value ?? 0) - (data[0].abs_value ?? 0)) / (data[0].abs_value ?? 1) * 100).toFixed(2) + '%';
      return '0%';
    }
    return last.value?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
  };

  // --- YTD Button Handlers ---
  const setPortfolioYTD = () => {
    const yearStart = dayjs().startOf('year').format('YYYY-MM-DD');
    setPortfolioDateRange({start: yearStart, end: portfolioMinMax.max});
  };
  const setTickerYTD = () => {
    const yearStart = dayjs().startOf('year').format('YYYY-MM-DD');
    setTickerDateRange({start: yearStart, end: tickerMinMax.max});
  };

  // --- KPI Card Data ---
  // Map backend KPI API response to KpiCard format (handle both array and object)
  React.useEffect(() => {
    console.log('[DEBUG] Raw kpis state:', kpis);
  }, [kpis]);

  const kpiCards = React.useMemo(() => {
    // Debug log for mapping
    console.log('[DEBUG] Mapping kpis to kpiCards:', kpis);
    if (!kpis) return [];
    // If kpis is an array (old fallback), just return it
    if (Array.isArray(kpis)) return kpis;
    // If kpis is an object (from backend API), map to array
    if (kpis && typeof kpis === 'object' && Object.keys(kpis).length > 0) {
      const k: any = kpis as any;
      const cards: Kpi[] = [];
      if (k.portfolio_value) {
        cards.push({
          id: 'portfolio_value',
          name: 'Portfolio Value',
          value: k.portfolio_value.abs_value?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}),
          unit: '',
          status: TrafficLightStatus.NEUTRAL,
          description: k.portfolio_value.net_value !== undefined ? `Net Value: ${k.portfolio_value.net_value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : undefined
        });
      }
      if (typeof k.net_performance === 'number') {
        cards.push({
          id: 'portfolio_performance',
          name: 'Net Performance',
          value: k.net_performance.toFixed(2) + '%',
          unit: '',
          status: TrafficLightStatus.NEUTRAL,
          description: 'Net performance relative to cost basis'
        });
      }
      if (k.best_ticker) {
        cards.push({
          id: 'best_ticker',
          name: 'Best Ticker',
          value: k.best_ticker.symbol,
          unit: '',
          status: TrafficLightStatus.NEUTRAL,
          description: `Best performance: ${(k.best_ticker.pct ?? 0).toFixed(2)}%`
        });
      }
      if (k.highest_value_ticker) {
        cards.push({
          id: 'highest_value_ticker',
          name: 'Highest Value Ticker',
          value: k.highest_value_ticker.symbol,
          unit: '',
          status: TrafficLightStatus.NEUTRAL,
          description: `Highest value: ${k.highest_value_ticker.abs_value?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
        });
      }
      if (k.worst_ticker) {
        cards.push({
          id: 'worst_ticker',
          name: 'Worst Ticker',
          value: k.worst_ticker.symbol,
          unit: '',
          status: TrafficLightStatus.NEUTRAL,
          description: `Worst performance: ${(k.worst_ticker.pct ?? 0).toFixed(2)}%`
        });
      }
      console.log('[DEBUG] kpiCards array after mapping:', cards);
      return cards;
    }
    return [];
  }, [kpis]);

  // --- Returns KPI Card Data ---
  const returnsKpiCards = React.useMemo(() => {
    if (!returnsKpis) return [];
    // returnsKpis: { yesterday_return, weekly_return, monthly_return, three_month_return, ytd_return, ... }
    const cards: Kpi[] = [];
    if (typeof returnsKpis.yesterday_return === 'number') {
      cards.push({
        id: 'yesterday_return',
        name: 'Return (Yesterday)',
        value: returnsKpis.yesterday_return.toFixed(2) + '%',
        unit: '',
        status: returnsKpis.yesterday_return > 0 ? TrafficLightStatus.GREEN : returnsKpis.yesterday_return < 0 ? TrafficLightStatus.RED : TrafficLightStatus.NEUTRAL,
        description: 'Portfolio return for the previous trading day',
        icon: PresentationChartLineIcon
      });
    }
    if (typeof returnsKpis.weekly_return === 'number') {
      cards.push({
        id: 'weekly_return',
        name: 'Return (1 Week)',
        value: returnsKpis.weekly_return.toFixed(2) + '%',
        unit: '',
        status: returnsKpis.weekly_return > 0 ? TrafficLightStatus.GREEN : returnsKpis.weekly_return < 0 ? TrafficLightStatus.RED : TrafficLightStatus.NEUTRAL,
        description: 'Portfolio return over the last 7 days',
        icon: PresentationChartLineIcon
      });
    }
    if (typeof returnsKpis.monthly_return === 'number') {
      cards.push({
        id: 'monthly_return',
        name: 'Return (1 Month)',
        value: returnsKpis.monthly_return.toFixed(2) + '%',
        unit: '',
        status: returnsKpis.monthly_return > 0 ? TrafficLightStatus.GREEN : returnsKpis.monthly_return < 0 ? TrafficLightStatus.RED : TrafficLightStatus.NEUTRAL,
        description: 'Portfolio return over the last 30 days',
        icon: PresentationChartLineIcon
      });
    }
    if (typeof returnsKpis.three_month_return === 'number') {
      cards.push({
        id: 'three_month_return',
        name: 'Return (3 Months)',
        value: returnsKpis.three_month_return.toFixed(2) + '%',
        unit: '',
        status: returnsKpis.three_month_return > 0 ? TrafficLightStatus.GREEN : returnsKpis.three_month_return < 0 ? TrafficLightStatus.RED : TrafficLightStatus.NEUTRAL,
        description: 'Portfolio return over the last 3 months',
        icon: PresentationChartLineIcon
      });
    }
    if (typeof returnsKpis.ytd_return === 'number') {
      cards.push({
        id: 'ytd_return',
        name: 'Return (YTD)',
        value: returnsKpis.ytd_return.toFixed(2) + '%',
        unit: '',
        status: returnsKpis.ytd_return > 0 ? TrafficLightStatus.GREEN : returnsKpis.ytd_return < 0 ? TrafficLightStatus.RED : TrafficLightStatus.NEUTRAL,
        description: 'Portfolio return year-to-date',
        icon: PresentationChartLineIcon
      });
    }
    return cards;
  }, [returnsKpis]);

  // Allocation view state: 'overall' or 'quoteType'
  const [allocationView, setAllocationView] = useState<'overall' | 'quoteType'>('overall');
  const [allocationData, setAllocationData] = useState<any>(null);

  // Fetch allocation data from backend API when allocationView or selectedPortfolio changes
  useEffect(() => {
    if (!selectedPortfolio) return;
    fetchPortfolioAllocation(selectedPortfolio, allocationView).then(res => {
      setAllocationData(res?.allocation || null);
    });
  }, [selectedPortfolio, allocationView]);

  // For SunburstChart, convert allocationData to assets-like array for compatibility
  const allocationAssets = React.useMemo(() => {
    if (!allocationData) return [];
    if (allocationView === 'overall') {
      if (!Array.isArray(allocationData)) return [];
      return allocationData.map((item: any) => ({
        id: item.ticker,
        symbol: item.ticker,
        name: item.name,
        value: item.value,
        quantity: item.quantity,
        allocation_pct: item.allocation_pct,
        category: item.category || 'Unknown', // Ensure Asset type compatibility
        region: item.region || 'Unknown',
      }));
    } else {
      if (typeof allocationData !== 'object' || Array.isArray(allocationData)) return [];
      return Object.entries(allocationData).map(([quoteType, pct]: [string, number]) => ({
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

  if (loading && !kpis) { // Show main loader only if initial data isn't there yet
    return (
      <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-500"></div>
        <p className="ml-4 text-xl text-gray-300">Loading Dashboard...</p>
      </div>
    );
  }

  if (error && !kpis) { // Show main error only if critical data failed
    return <div className="text-center text-red-400 text-xl p-8">{error}</div>;
  }
  
  if (!isLoggedIn && !loading) {
     return <div className="text-center text-yellow-400 text-xl p-8">Please sign in to access the dashboard.</div>;
  }
  return (
    <>
      {showTransactionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
          <div className="bg-gray-900 p-8 rounded-xl shadow-2xl w-full max-w-lg">
            <h2 className="text-2xl font-bold text-white mb-4">Add Transactions to Get Started</h2>
            <p className="text-gray-300 mb-4">Paste your transactions in free text format below. This is required to initialize your portfolio.</p>
            <textarea
              className="w-full h-40 p-3 rounded-lg bg-gray-800 text-gray-100 border border-gray-700 focus:ring-2 focus:ring-indigo-500 mb-4"
              value={transactionInput}
              onChange={e => setTransactionInput(e.target.value)}
              placeholder="e.g. Buy 10 AAPL at $150 on 2024-01-01\nSell 5 TSLA at $700 on 2024-02-15\n..."
              disabled={transactionLoading}
            />
            {transactionError && <div className="text-red-400 mb-2">{transactionError}</div>}
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded bg-gray-700 text-gray-200 hover:bg-gray-600"
                onClick={() => setShowTransactionModal(false)}
                disabled={transactionLoading}
              >Cancel</button>
              <button
                className="px-4 py-2 rounded bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:opacity-50"
                onClick={handleTransactionSubmit}
                disabled={transactionLoading || !transactionInput.trim()}
              >{transactionLoading ? 'Processing...' : 'Submit Transactions'}</button>
            </div>
          </div>
        </div>
      )}
      <div className="space-y-8">
        <CollapsibleSection key="kpi" title="Key Portfolio KPIs">
          <div className="flex flex-row flex-wrap gap-6 justify-center">
            {(() => { console.log('[DEBUG] Rendering KPI cards:', kpiCards); return null; })()}
            {kpiCards.map(kpi => (
              <KpiCard key={kpi.id} kpi={kpi} />
            ))}
          </div>
        </CollapsibleSection>
        {/* Distinct section for returns KPIs */}
        {returnsKpiCards.length > 0 && (
          <CollapsibleSection key="returns" title="Recent Portfolio Returns">
            <div className="flex flex-row gap-6 w-full">
              {returnsKpiCards.map((kpi) => (
                <div key={kpi.id} className="flex-1 min-w-0">
                  <KpiCard
                    kpi={{
                      ...kpi,
                      status: parseFloat((kpi.value as string).replace('%','')) > 0 ? TrafficLightStatus.GREEN : parseFloat((kpi.value as string).replace('%','')) < 0 ? TrafficLightStatus.RED : TrafficLightStatus.NEUTRAL
                    }}
                    small
                  />
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}
        <CollapsibleSection key="allocation" title="Asset Allocation">
          {/* Radio button group for allocation view */}
          <div className="flex gap-6 mb-4">
            <label className="flex items-center text-gray-300 text-sm cursor-pointer">
              <input
                type="radio"
                checked={allocationView === 'overall'}
                onChange={() => setAllocationView('overall')}
                className="form-radio h-4 w-4 text-indigo-600 mr-1"
              />
              Overall
            </label>
            <label className="flex items-center text-gray-300 text-sm cursor-pointer">
              <input
                type="radio"
                checked={allocationView === 'quoteType'}
                onChange={() => setAllocationView('quoteType')}
                className="form-radio h-4 w-4 text-indigo-600 mr-1"
              />
              Asset Type
            </label>
          </div>
          <SunburstChart
            assets={allocationAssets}
            grouping={allocationView}
            onEditCategory={undefined}
          />
        </CollapsibleSection>
        <CollapsibleSection key="portfolio-performance" title="Portfolio Performance">
          <h2 className="text-2xl font-semibold text-white mb-4 flex items-center">
            <PresentationChartLineIcon className="h-7 w-7 mr-2 text-indigo-400" />
            Portfolio Performance Trend
          </h2>
          <div className="flex items-center gap-4 mb-4 justify-between">
            {/* Value Type Radio Buttons */}
            <div className="flex items-center gap-4">
              <label className="flex items-center text-gray-300 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={portfolioValueType === 'value'}
                  onChange={() => setPortfolioValueType('value')}
                  className="form-radio h-4 w-4 text-indigo-600 mr-1"
                />
                Net Value
              </label>
              <label className="flex items-center text-gray-300 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={portfolioValueType === 'abs_value'}
                  onChange={() => setPortfolioValueType('abs_value')}
                  className="form-radio h-4 w-4 text-indigo-600 mr-1"
                />
                Absolute Value
              </label>
              <label className="flex items-center text-gray-300 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={portfolioValueType === 'pct'}
                  onChange={() => setPortfolioValueType('pct')}
                  className="form-radio h-4 w-4 text-indigo-600 mr-1"
                />
                Net Performance
              </label>
              <label className="flex items-center text-gray-300 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={portfolioValueType === 'pct_from_first'}
                  onChange={() => setPortfolioValueType('pct_from_first')}
                  className="form-radio h-4 w-4 text-indigo-600 mr-1"
                />
                Performance
              </label>
            </div>
            <span className="ml-2 px-3 py-1 rounded-lg bg-indigo-700 text-white text-base font-bold shadow-md border border-indigo-400">
              {getFinalValue(portfolioFiltered, portfolioValueType)}
            </span>
            <div className="flex-1 flex justify-end min-w-[260px]">
              <div className="flex flex-col items-end w-full max-w-xs">
                <label className="block text-xs text-gray-400 mb-1">Compare to Benchmarks:</label>
                {/* ...existing Listbox for benchmarks... */}
                <Listbox value={selectedBenchmarks} onChange={setSelectedBenchmarks} multiple>
                  <div className="relative">
                    <Listbox.Button className="relative w-full cursor-default rounded-lg bg-gray-700 py-1 pl-3 pr-10 text-left border border-gray-600 text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm min-h-[36px]">
                      {selectedBenchmarks.length > 1 ? (
                        <span className="text-indigo-200 font-semibold">{selectedBenchmarks.length} benchmarks selected</span>
                      ) : (
                        <span className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                          {selectedBenchmarks.length === 0 && <span className="text-gray-400">Choose benchmarks...</span>}
                          {selectedBenchmarks.map((symbol) => (
                            <span key={symbol} className="flex items-center bg-indigo-700 text-white rounded px-2 py-0.5 text-xs font-semibold mr-1 mb-1">
                              {benchmarkNames[symbol] || symbol}
                              <span
                                role="button"
                                tabIndex={0}
                                className="ml-1 text-indigo-200 hover:text-white focus:outline-none cursor-pointer"
                                onClick={e => {
                                  e.stopPropagation();
                                  setSelectedBenchmarks(selectedBenchmarks.filter(t => t !== symbol));
                                }}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    setSelectedBenchmarks(selectedBenchmarks.filter(t => t !== symbol));
                                  }
                                }}
                                aria-label={`Remove ${benchmarkNames[symbol] || symbol}`}
                              >
                                <XMarkIcon className="h-3 w-3" />
                              </span>
                            </span>
                          ))}
                        </span>
                      )}
                      <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                        <ChevronUpDownIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                      </span>
                    </Listbox.Button>
                    <Transition as={Fragment} leave="transition ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0">
                      <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-gray-800 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm border border-gray-700">
                        {BENCHMARK_TICKERS.map((b) => (
                          <Listbox.Option
                            key={b.symbol}
                            className={({ active }) =>
                              `relative cursor-pointer select-none py-2 pl-10 pr-4 ${active ? 'bg-indigo-600 text-white' : 'text-gray-100'}`
                            }
                            value={b.symbol}
                          >
                            {({ selected }) => (
                              <>
                                <span className={`block truncate ${selected ? 'font-semibold' : 'font-normal'}`}>{benchmarkNames[b.symbol] || b.name || b.symbol}</span>
                                {selected ? (
                                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-indigo-300">
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
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <button
              className="px-4 py-1 rounded bg-indigo-600 text-white font-semibold hover:bg-indigo-500 text-sm"
              onClick={setPortfolioYTD}
              disabled={!portfolioMinMax.min}
            >
              YTD
            </button>
            {portfolioMinMax.min && portfolioMinMax.max && (
              <>
                <label className="text-gray-300 text-sm">From:</label>
                <input
                  type="date"
                  min={portfolioMinMax.min}
                  max={portfolioMinMax.max}
                  value={portfolioDateRange?.start || portfolioMinMax.min}
                  onChange={e => setPortfolioDateRange({start: e.target.value, end: portfolioDateRange?.end || portfolioMinMax.max})}
                  className="bg-gray-700 text-gray-100 rounded px-2 py-1 border border-gray-600"
                />
                <label className="text-gray-300 text-sm">To:</label>
                <input
                  type="date"
                  min={portfolioMinMax.min}
                  max={portfolioMinMax.max}
                  value={portfolioDateRange?.end || portfolioMinMax.max}
                  onChange={e => setPortfolioDateRange({start: portfolioDateRange?.start || portfolioMinMax.min, end: e.target.value})}
                  className="bg-gray-700 text-gray-100 rounded px-2 py-1 border border-gray-600"
                />
                <button
                  className="px-2 py-1 rounded bg-gray-600 text-white text-xs ml-2"
                  onClick={() => setPortfolioDateRange(null)}
                >Reset</button>
              </>
            )}
          </div>
          {portfolioFiltered.length > 1 ? (
            benchmarkLoading ? (
              <div className="mt-6 h-64 bg-gray-700 rounded-lg flex items-center justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-t-4 border-b-4 border-indigo-500"></div>
                <p className="ml-4 text-lg text-gray-300">Loading benchmarks...</p>
              </div>
            ) : (
              <PerformanceChart 
                data={portfolioFiltered} 
                dataKey={portfolioValueType} 
                chartLabel={
                  portfolioValueType === 'pct'
                    ? 'Portfolio Performance (%)'
                    : portfolioValueType === 'abs_value'
                      ? 'Total Portfolio Value (Absolute)'
                      : portfolioValueType === 'pct_from_first'
                        ? 'Portfolio % from First Value'
                        : 'Total Portfolio Value (Net)'
                }
                strokeColor="#4ade80"
                multiLine={selectedBenchmarks.length > 0}
                lines={[
                  portfolioValueType === 'pct_from_first'
                    ? { data: portfolioPctFromFirst.map(d => ({ date: d.date, pct_from_first: d.pct_from_first, value: undefined, abs_value: undefined, pct: undefined })), name: 'Portfolio % from First', color: '#4ade80' }
                    : { data: portfolioFiltered, name: 'Portfolio', color: '#4ade80' },
                  ...selectedBenchmarks.map((symbol) => (
                    portfolioValueType === 'pct_from_first'
                      ? {
                          data: (benchmarkFiltered[symbol] || []).map(d => ({
                            date: d.date,
                            pct_from_first: d.pct !== undefined ? d.pct : 0,
                            value: undefined,
                            abs_value: undefined,
                            pct: undefined
                          })),
                          name: benchmarkNames[symbol] || symbol,
                          color: undefined
                        }
                      : {
                          data: benchmarkFiltered[symbol] || [],
                          name: benchmarkNames[symbol] || symbol,
                          color: undefined
                        }
                  ))
                ]}
              />
            )
          ) : (
            <div className="mt-6 h-64 bg-gray-700 rounded-lg flex items-center justify-center">
              <p className="text-gray-500 text-lg">Not enough historical data from backend to display portfolio trend.</p>
            </div>
          )}
        </CollapsibleSection>
        <CollapsibleSection key="ticker-performance" title="Ticker Performance" defaultOpen={false}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <h2 className="text-2xl font-semibold text-white flex items-center mb-0">
              <PresentationChartLineIcon className="h-7 w-7 mr-2 text-indigo-400" />
              Individual Ticker Performance
            </h2>
            {assetsForSelector.length > 0 && (
              <div className="flex-shrink-0 min-w-[250px]">
                <label htmlFor="tickerSelect" className="block text-sm font-medium text-gray-300 mb-1 md:mb-0 md:mr-2 md:inline">Select Ticker(s):</label>
                <Listbox value={selectedTickers} onChange={setSelectedTickers} multiple>
                  <div className="relative mt-1 w-full max-w-xs">
                    <Listbox.Button className="relative w-full cursor-default rounded-lg bg-gray-700 py-2 pl-3 pr-10 text-left border border-gray-600 text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm min-h-[44px] max-w-xs">
                      {selectedTickers.length > 1 ? (
                        <span className="text-indigo-200 font-semibold">{selectedTickers.length} tickers selected</span>
                      ) : (
                        <span className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                          {selectedTickers.length === 0 && <span className="text-gray-400">Choose tickers...</span>}
                          {selectedTickers.map((symbol) => {
                            const asset = assetsForSelector.find(a => a.symbol === symbol);
                            return (
                              <span key={symbol} className="flex items-center bg-indigo-700 text-white rounded px-2 py-0.5 text-xs font-semibold mr-1 mb-1">
                                {asset ? `${asset.name} (${asset.symbol})` : symbol}
                                <button
                                  type="button"
                                  className="ml-1 text-indigo-200 hover:text-white focus:outline-none"
                                  onClick={e => {
                                    e.stopPropagation();
                                    setSelectedTickers(selectedTickers.filter(t => t !== symbol));
                                  }}
                                >
                                  <XMarkIcon className="h-3 w-3" />
                                </button>
                              </span>
                            );
                          })}
                        </span>
                      )}
                      <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                        <ChevronUpDownIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                      </span>
                    </Listbox.Button>
                    <Transition as={Fragment} leave="transition ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0">
                      <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-gray-800 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm border border-gray-700">
                        {assetsForSelector.map((asset) => (
                          <Listbox.Option
                            key={asset.symbol}
                            className={({ active }) =>
                              `relative cursor-pointer select-none py-2 pl-10 pr-4 ${active ? 'bg-indigo-600 text-white' : 'text-gray-100'}`
                            }
                            value={asset.symbol}
                          >
                            {({ selected }) => (
                              <>
                                <span className={`block truncate ${selected ? 'font-semibold' : 'font-normal'}`}>
                                  {asset.name} ({asset.symbol})
                                </span>
                                {selected ? (
                                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-indigo-300">
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
            )}
          </div>
          <div className="flex items-center gap-4 mb-4">
            <label className="flex items-center text-gray-300 text-sm cursor-pointer">
              <input
                type="radio"
                checked={tickerValueType === 'value'}
                onChange={() => setTickerValueType('value')}
                className="form-radio h-4 w-4 text-indigo-600 mr-1"
              />
              Net Value
            </label>
            <label className="flex items-center text-gray-300 text-sm cursor-pointer">
              <input
                type="radio"
                checked={tickerValueType === 'abs_value'}
                onChange={() => setTickerValueType('abs_value')}
                className="form-radio h-4 w-4 text-indigo-600 mr-1"
              />
              Absolute Value
            </label>
            <label className="flex items-center text-gray-300 text-sm cursor-pointer">
              <input
                type="radio"
                checked={tickerValueType === 'pct'}
                onChange={() => setTickerValueType('pct')}
                className="form-radio h-4 w-4 text-indigo-600 mr-1"
              />
              Net Performance
            </label>
            <label className="flex items-center text-gray-300 text-sm cursor-pointer">
              <input
                type="radio"
                checked={tickerValueType === 'pct_from_first'}
                onChange={() => setTickerValueType('pct_from_first')}
                className="form-radio h-4 w-4 text-indigo-600 mr-1"
              />
              Performance
            </label>
            <span className="ml-4 px-3 py-1 rounded-lg bg-indigo-700 text-white text-base font-bold shadow-md border border-indigo-400">
              {getFinalValue(tickerFiltered, tickerValueType)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <button
              className="px-4 py-1 rounded bg-indigo-600 text-white font-semibold hover:bg-indigo-500 text-sm"
              onClick={setTickerYTD}
              disabled={!tickerMinMax.min}
            >
              YTD
            </button>
            {tickerMinMax.min && tickerMinMax.max && (
              <>
                <label className="text-gray-300 text-sm">From:</label>
                <input
                  type="date"
                  min={tickerMinMax.min}
                  max={tickerMinMax.max}
                  value={tickerDateRange?.start || tickerMinMax.min}
                  onChange={e => setTickerDateRange({start: e.target.value, end: tickerDateRange?.end || tickerMinMax.max})}
                  className="bg-gray-700 text-gray-100 rounded px-2 py-1 border border-gray-600"
                />
                <label className="text-gray-300 text-sm">To:</label>
                <input
                  type="date"
                  min={tickerMinMax.min}
                  max={tickerMinMax.max}
                  value={tickerDateRange?.end || tickerMinMax.max}
                  onChange={e => setTickerDateRange({start: tickerDateRange?.start || tickerMinMax.min, end: e.target.value})}
                  className="bg-gray-700 text-gray-100 rounded px-2 py-1 border border-gray-600"
                />
                <button
                  className="px-2 py-1 rounded bg-gray-600 text-white text-xs ml-2"
                  onClick={() => setTickerDateRange(null)}
                >Reset</button>
              </>
            )}
          </div>
          {tickerLoading ? (
            <div className="mt-6 h-64 bg-gray-700 rounded-lg flex items-center justify-center">
              <div className="animate-spin rounded-full h-10 w-10 border-t-4 border-b-4 border-orange-400"></div>
              <p className="ml-4 text-lg text-gray-300">Loading ticker data...</p>
            </div>
          ) : selectedTickers.length > 0 && Object.keys(multiTickerPerformance).length > 0 ? (
            <PerformanceChart
              data={tickerFiltered}
              dataKey={tickerValueType}
              chartLabel={
                tickerValueType === 'pct'
                  ? `Performance (%)`
                  : tickerValueType === 'abs_value'
                    ? `Absolute Value`
                    : `Net Value`
              }
              strokeColor="#f59e42"
              multiLine={true}
              lines={selectedTickers.map(ticker => ({
                data: (multiTickerPerformance[ticker] || []).filter(d => {
                  if (!tickerDateRange) return true;
                  return d.date >= tickerDateRange.start && d.date <= tickerDateRange.end;
                }),
                name: ticker,
                color: undefined // Let chart assign color
              }))}
            />
          ) : (
            <div className="mt-6 h-64 bg-gray-700 rounded-lg flex items-center justify-center">
              <p className="text-gray-500 text-lg">Not enough historical data for the selected tickers.</p>
            </div>
          )}
        </CollapsibleSection>
      </div>
    </>
  );
};

export default function HomePageWithBoundary() {
  return (
    <ErrorBoundary>
      <HomePage />
    </ErrorBoundary>
  );
}
