import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Listbox } from '@headlessui/react';
import { CheckIcon, ChevronUpDownIcon } from '@heroicons/react/20/solid';
import PerformanceChart from '../components/PerformanceChart';
import { useAuth } from '../AuthContext';

const API_BASE_URL = 'http://127.0.0.1:5000';

const AssetsPage: React.FC = () => {
  const { idToken: token } = useAuth();
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>('');
  const [selectedTickers, setSelectedTickers] = useState<any[]>([]);
  const [valueType, setValueType] = useState<'value' | 'abs_value' | 'pct' | 'pct_from_first'>('value');
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);
  const [ytdMin, setYtdMin] = useState<string>("");
  const [ytdMax, setYtdMax] = useState<string>("");

  // --- API helpers for portfolios and tickers ---
  async function fetchAllPortfolioNames() {
    const res = await fetch(`${API_BASE_URL}/api/portfolios`, { credentials: 'include' });
    const data = await res.json();
    return data.portfolios || [];
  }

  async function fetchPortfolioTickers(portfolio: string) {
    if (!portfolio) return [];
    const res = await fetch(`${API_BASE_URL}/api/portfolio/${encodeURIComponent(portfolio)}/status/view`, {
      credentials: 'include',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    const data = await res.json();
    return (data?.status?.holdings || []).map((h: any) => ({ ticker: h.ticker, name: h.name }));
  }

  // Fetch all portfolio names
  const { data: portfolioNames = [], isLoading: portfoliosLoading } = useQuery({
    queryKey: ['portfolioNames'],
    queryFn: fetchAllPortfolioNames,
  });

  // Fetch all assets for selected portfolio (for ticker selector)
  const { data: allAssets = [] } = useQuery({
    queryKey: ['assets', selectedPortfolio, token],
    queryFn: () => fetchPortfolioTickers(selectedPortfolio),
    enabled: !!selectedPortfolio && !!token
  });

  // Fetch performance for all selected tickers
  const { data: performance = {} } = useQuery({
    queryKey: ['multiTickerPerformance', selectedPortfolio, selectedTickers.map(a => a.ticker), token],
    queryFn: async () => {
      if (!selectedPortfolio || selectedTickers.length === 0) return {};
      const result: Record<string, any[]> = {};
      // Use /api/portfolio/<portfolio>/ticker/<ticker>/performance for each ticker
      for (const asset of selectedTickers) {
        const ticker = asset.ticker;
        const res = await fetch(`${API_BASE_URL}/api/portfolio/${encodeURIComponent(selectedPortfolio)}/ticker/${encodeURIComponent(ticker)}/performance`, {
          credentials: 'include',
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        result[ticker] = await res.json();
      }
      return result;
    },
    enabled: !!selectedPortfolio && selectedTickers.length > 0 && !!token
  });

  // Fetch returns KPIs for selected portfolio
  const { data: returnsKpis = {} } = useQuery({
    queryKey: ['returnsKpis', selectedPortfolio, token],
    queryFn: async () => {
      if (!selectedPortfolio) return {};
      // Use /api/portfolio/<portfolio>/kpis/returns
      const res = await fetch(`${API_BASE_URL}/api/portfolio/${encodeURIComponent(selectedPortfolio)}/kpis/returns`, {
        credentials: 'include',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      return await res.json();
    },
    enabled: !!selectedPortfolio && !!token
  });

  // Memoize assets for selector (filter out Cash and missing symbol)
  const assetsForSelector = useMemo(
    () => (allAssets as any[]).filter((a: any) => a.ticker && a.ticker !== 'Cash'),
    [allAssets]
  );

  // Debug: Log portfolioNames to verify API response
  React.useEffect(() => {
    console.log('[DEBUG] portfolioNames:', portfolioNames);
  }, [portfolioNames]);

  // Debug: Log token and selectedPortfolio to verify query conditions
  React.useEffect(() => {
    console.log('[DEBUG] token:', token);
    console.log('[DEBUG] selectedPortfolio:', selectedPortfolio);
  }, [token, selectedPortfolio]);

  // After fetching performance, set ytdMin/ytdMax based on available data:
  React.useEffect(() => {
    if (selectedTickers.length > 0 && Object.keys(performance).length > 0) {
      let minDate: string | null = null;
      let maxDate: string | null = null;
      selectedTickers.forEach(asset => {
        const perf = performance[asset.ticker] || [];
        if (perf.length > 0) {
          const dates = perf.map((d: any) => d.date).filter(Boolean);
          if (dates.length > 0) {
            const localMin = dates[0];
            const localMax = dates[dates.length - 1];
            if (!minDate || (localMin && localMin < minDate)) minDate = localMin;
            if (!maxDate || (localMax && localMax > maxDate)) maxDate = localMax;
          }
        }
      });
      setYtdMin(minDate || "");
      setYtdMax(maxDate || "");
      if (!dateRange && minDate && maxDate) setDateRange({ start: minDate, end: maxDate });
    } else {
      setYtdMin("");
      setYtdMax("");
      setDateRange(null);
    }
  }, [selectedTickers, performance]);

  // --- Sorting state for returns table ---
  const [returnsSort, setReturnsSort] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: '', direction: 'desc' });

  // --- Sorted tickers for returns table ---
  const kpiKeys = [
    'yesterday_ticker_returns',
    'weekly_ticker_returns',
    'monthly_ticker_returns',
    'three_month_ticker_returns',
    'ytd_ticker_returns',
  ];
  const kpiLabels = [
    'Yesterday',
    'Weekly',
    'Monthly',
    '3 Month',
    'YTD',
  ];
  const sortedTickers = React.useMemo(() => {
    if (!returnsSort.key) return selectedTickers;
    const key = returnsSort.key;
    const dir = returnsSort.direction;
    return [...selectedTickers].sort((a, b) => {
      const aVal = returnsKpis?.[key]?.[a.ticker]?.return_pct;
      const bVal = returnsKpis?.[key]?.[b.ticker]?.return_pct;
      if (typeof aVal !== 'number' && typeof bVal !== 'number') return 0;
      if (typeof aVal !== 'number') return 1;
      if (typeof bVal !== 'number') return -1;
      return dir === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [selectedTickers, returnsKpis, returnsSort]);

  return (
    <div className="max-w-6xl mx-auto p-6">
      {!token && (
        <div className="mb-4 p-3 bg-yellow-100 text-yellow-800 rounded">
          You must be signed in to view portfolio assets and returns.
        </div>
      )}
      <h1 className="text-3xl font-bold mb-6 text-indigo-700">Assets Comparison</h1>
      {/* Filter & Controls Section */}
      <div className="bg-white rounded-2xl shadow-lg p-6 mb-8 flex flex-col gap-4 md:flex-row md:items-end md:gap-8 border border-gray-100">
        {/* Portfolio Selector */}
        <div className="flex flex-col min-w-[180px]">
          <label className="block text-xs font-semibold text-gray-500 mb-1">Portfolio</label>
          <select
            className="bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
            value={selectedPortfolio}
            onChange={e => {
              setSelectedPortfolio(e.target.value);
              setSelectedTickers([]);
            }}
          >
            <option value="">-- Select Portfolio --</option>
            {portfolioNames.map((name: string) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        {/* Divider */}
        <div className="hidden md:block h-12 w-px bg-gray-200 mx-2" />
        {/* Ticker Selector */}
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs font-semibold text-gray-500 mb-1">Assets</label>
          <div className="flex gap-2 items-center">
            <Listbox value={selectedTickers} onChange={setSelectedTickers} multiple disabled={assetsForSelector.length === 0}>
              <div className="relative w-full max-w-xs">
                <Listbox.Button className="relative w-full cursor-default rounded-lg bg-gray-50 py-2 pl-3 pr-10 text-left border border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 sm:text-sm min-h-[44px]">
                  {selectedTickers.length > 1 ? (
                    <span className="text-indigo-700 font-semibold">{selectedTickers.length} selected</span>
                  ) : (
                    <span className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                      {selectedTickers.length === 0 && <span className="text-gray-400">Choose assets...</span>}
                      {selectedTickers.map((a: any) => (
                        <span key={a.ticker} className="bg-indigo-100 text-indigo-700 rounded px-2 py-0.5 text-xs font-semibold mr-1 mb-1 flex items-center">
                          {a.ticker}
                          <span
                            role="button"
                            tabIndex={0}
                            aria-label={`Remove ${a.ticker}`}
                            className="ml-1 text-indigo-400 hover:text-indigo-700 focus:outline-none cursor-pointer"
                            onClick={e => {
                              e.stopPropagation();
                              setSelectedTickers(selectedTickers.filter((t: any) => t.ticker !== a.ticker));
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setSelectedTickers(selectedTickers.filter((t: any) => t.ticker !== a.ticker));
                              }
                            }}
                          >
                            <CheckIcon className="h-3 w-3" />
                          </span>
                        </span>
                      ))}
                    </span>
                  )}
                  <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                    <ChevronUpDownIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                  </span>
                </Listbox.Button>
                <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm border border-gray-300">
                  {assetsForSelector.map((asset: any) => (
                    <Listbox.Option
                      key={asset.ticker}
                      className={({ active }) =>
                        `relative cursor-pointer select-none py-2 pl-10 pr-4 ${active ? 'bg-indigo-100 text-indigo-900' : 'text-gray-900'}`
                      }
                      value={asset}
                    >
                      {({ selected }) => (
                        <>
                          <span className={`block truncate ${selected ? 'font-semibold' : 'font-normal'}`}>{asset.ticker} {asset.name ? `- ${asset.name}` : ''}</span>
                          {selected ? (
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-indigo-600">
                              <CheckIcon className="h-5 w-5" aria-hidden="true" />
                            </span>
                          ) : null}
                        </>
                      )}
                    </Listbox.Option>
                  ))}
                </Listbox.Options>
              </div>
            </Listbox>
            <button
              type="button"
              className="ml-2 px-3 py-2 bg-indigo-500 text-white rounded-lg font-semibold hover:bg-indigo-600 text-xs shadow-sm transition"
              disabled={assetsForSelector.length === 0}
              onClick={() => setSelectedTickers(assetsForSelector)}
            >
              All Assets
            </button>
          </div>
        </div>
        {/* Divider */}
        <div className="hidden md:block h-12 w-px bg-gray-200 mx-2" />
        {/* Value Type Radios */}
        <div className="flex flex-col min-w-[180px]">
          <label className="block text-xs font-semibold text-gray-500 mb-1">Value Type</label>
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center text-gray-600 text-xs cursor-pointer">
              <input
                type="radio"
                checked={valueType === 'value'}
                onChange={() => setValueType('value')}
                className="form-radio h-4 w-4 text-indigo-600 mr-1"
              />
              Net Value
            </label>
            <label className="flex items-center text-gray-600 text-xs cursor-pointer">
              <input
                type="radio"
                checked={valueType === 'abs_value'}
                onChange={() => setValueType('abs_value')}
                className="form-radio h-4 w-4 text-indigo-600 mr-1"
              />
              Absolute Value
            </label>
            <label className="flex items-center text-gray-600 text-xs cursor-pointer">
              <input
                type="radio"
                checked={valueType === 'pct'}
                onChange={() => setValueType('pct')}
                className="form-radio h-4 w-4 text-indigo-600 mr-1"
              />
              Net Performance
            </label>
            <label className="flex items-center text-gray-600 text-xs cursor-pointer">
              <input
                type="radio"
                checked={valueType === 'pct_from_first'}
                onChange={() => setValueType('pct_from_first')}
                className="form-radio h-4 w-4 text-indigo-600 mr-1"
              />
              Performance
            </label>
          </div>
        </div>
        {/* Divider */}
        <div className="hidden md:block h-12 w-px bg-gray-200 mx-2" />
        {/* Date Range Controls */}
        <div className="flex flex-col min-w-[260px]">
          <label className="block text-xs font-semibold text-gray-500 mb-1">Date Range</label>
          <div className="flex flex-wrap gap-2 items-center">
            <button
              className="px-3 py-1 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 text-xs shadow-sm transition"
              onClick={() => ytdMin && ytdMax && setDateRange({ start: ytdMin, end: ytdMax })}
              disabled={!ytdMin || !ytdMax}
            >
              YTD
            </button>
            <label className="text-gray-600 text-xs">From</label>
            <input
              type="date"
              className="bg-gray-50 text-gray-900 rounded border border-gray-300 text-xs px-2 py-1 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
              min={ytdMin}
              max={ytdMax}
              value={dateRange?.start || ytdMin}
              onChange={e => setDateRange({ start: e.target.value, end: dateRange?.end || ytdMax })}
              disabled={!ytdMin || !ytdMax}
            />
            <label className="text-gray-600 text-xs">To</label>
            <input
              type="date"
              className="bg-gray-50 text-gray-900 rounded border border-gray-300 text-xs px-2 py-1 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
              min={ytdMin}
              max={ytdMax}
              value={dateRange?.end || ytdMax}
              onChange={e => setDateRange({ start: dateRange?.start || ytdMin, end: e.target.value })}
              disabled={!ytdMin || !ytdMax}
            />
            <button
              className="px-2 py-1 rounded-lg bg-gray-500 text-white text-xs font-semibold ml-1 hover:bg-gray-600 transition"
              onClick={() => setDateRange(ytdMin && ytdMax ? { start: ytdMin, end: ytdMax } : null)}
              disabled={!ytdMin || !ytdMax}
            >Reset</button>
          </div>
        </div>
      </div>
      {/* Chart Section */}
      <div className="bg-white rounded-xl shadow-md p-6 mb-8">
        {selectedTickers.length > 0 && Object.keys(performance).length > 0 ? (
          <PerformanceChart
            data={[]}
            dataKey={valueType}
            chartLabel={
              valueType === 'pct'
                ? `Performance (%)`
                : valueType === 'abs_value'
                  ? `Absolute Value`
                  : `Net Value`
            }
            strokeColor="#6366f1"
            multiLine={true}
            lines={selectedTickers.map(asset => ({
              data: (performance[asset.ticker] || []).filter(d => {
                if (!dateRange || !dateRange.start || !dateRange.end) return true;
                return d.date >= dateRange.start && d.date <= dateRange.end;
              }),
              name: asset.ticker,
              color: undefined // Let chart assign color
            }))}
          />
        ) : (
          <div className="h-64 flex items-center justify-center text-gray-400 text-lg">Select tickers to compare their performance.</div>
        )}
      </div>
      {/* Returns Table Section */}
      <div className="bg-white rounded-xl shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4 text-indigo-700">Returns Comparison</h2>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-2 text-left">Ticker</th>
              {kpiKeys.map((kpiKey, idx) => (
                <th
                  key={kpiKey}
                  className="px-4 py-2 text-left cursor-pointer select-none group"
                  onClick={() => setReturnsSort(s => s.key === kpiKey ? { key: kpiKey, direction: s.direction === 'asc' ? 'desc' : 'asc' } : { key: kpiKey, direction: 'desc' })}
                >
                  <span className="flex items-center gap-1">
                    {kpiLabels[idx]}
                    {returnsSort.key === kpiKey && (
                      <span className="inline-block text-xs">
                        {returnsSort.direction === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedTickers.map(asset => (
              <tr key={asset.ticker}>
                <td className="px-4 py-2 font-semibold">{asset.ticker}</td>
                {kpiKeys.map((kpiKey) => {
                  const value = returnsKpis?.[kpiKey]?.[asset.ticker]?.return_pct;
                  let className = 'px-4 py-2';
                  if (typeof value === 'number') {
                    if (value > 0) className += ' text-green-600 font-bold';
                    else if (value < 0) className += ' text-red-600 font-bold';
                  }
                  return <td key={kpiKey} className={className}>{typeof value === 'number' ? value.toFixed(2) + ' %' : '-'}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AssetsPage;
