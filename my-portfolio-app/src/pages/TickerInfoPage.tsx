import React, { useState, useEffect } from 'react';
import { MagnifyingGlassIcon, ExclamationTriangleIcon, ArrowPathIcon, ChartBarIcon } from '@heroicons/react/24/outline';
import { fetchTickerDetails } from '../services/marketDataService';
import PerformanceChart from '../components/PerformanceChart';
import { HistoricalDataPoint, BackendTickerHistoryItem, TickerInfoDetails, BackendTickerResponse } from '../types';
import { useAuth } from '../AuthContext';

const TickerInfoPage: React.FC = () => {
  const { idToken, isLoggedIn } = useAuth();

  const [symbolInput, setSymbolInput] = useState<string>('');
  const [tickerToFetch, setTickerToFetch] = useState<string | null>(null);
  const [data, setData] = useState<BackendTickerResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      if (!tickerToFetch) return;
      if (!isLoggedIn) {
        setError("Please sign in to fetch ticker data.");
        setLoading(false); setTickerToFetch(null);
        return;
      }
      if (!idToken && isLoggedIn) {
        setError("Authentication token is initializing. Please wait a moment.");
        return; 
      }
      setLoading(true); setError(null); setData(null);
      try {
        const result = await fetchTickerDetails(tickerToFetch);
        if (result) {
          // If result is an array, it's a suggestions list from backend (not a perfect match)
          if (Array.isArray(result)) {
            setError(`No exact match found for ticker: ${tickerToFetch}. Please select from the suggestions below.`);
            setData({ error: '', ticker: tickerToFetch, source: 'suggestions', data: undefined } as any);
            (setData as any)({ error: '', ticker: tickerToFetch, source: 'suggestions', data: undefined, suggestions: result });
          } else if (result.error) {
            setError(`Error for ${result.ticker}: ${result.error}. This could be an invalid symbol, or a backend/API issue.`);
            if ((result as any).suggestions) {
              (setData as any)({ ...result, suggestions: (result as any).suggestions });
            } else {
              setData(null);
            }
          } else if (!result.data || (!result.data.info && !result.data.history)) {
            setError(`No data found for ticker: ${result.ticker}. It might be invalid or delisted.`);
            if ((result as any).suggestions) {
              (setData as any)({ ...result, suggestions: (result as any).suggestions });
            } else {
              setData(null);
            }
          } else {
            setData(result);
          }
        } else {
          setError(`Failed to fetch information for ${tickerToFetch}. The backend might be unavailable or the symbol is invalid.`);
        }
      } catch (err) {
        console.error("[TickerInfoPage] Exception during fetchTickerDetails:", err);
        setError('An unexpected error occurred while fetching ticker data.');
      } finally {
        setLoading(false);
        setTickerToFetch(null);
      }
    };
    loadData();
  }, [tickerToFetch, isLoggedIn, idToken]);

  const handleGetInfoClick = () => {
    if (symbolInput.trim()) {
      setData(null); setError(null);
      setTickerToFetch(symbolInput.trim());
    } else {
      setError('Please enter a ticker symbol.');
    }
  };

  const transformDataForChart = (historyItems: BackendTickerHistoryItem[] | undefined): HistoricalDataPoint[] => {
    if (!historyItems) return [];
    return historyItems
      .map(item => {
        const safeDate = item.date ? new Date(item.date + 'T00:00:00Z') : null;
        return {
          date: safeDate ? safeDate.toISOString().split('T')[0] : '',
          value: item.close,
        };
      })
      .filter(item => !!item.date)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const getLatestPriceInfo = (historyItems: BackendTickerHistoryItem[] | undefined, companyInfo: TickerInfoDetails | undefined): { date: string, price: number, currency: string } | null => {
    if (!historyItems || historyItems.length === 0) return null;
    const sortedHistory = [...historyItems].sort(
      (a, b) => {
        const dateA = a.date ? new Date(a.date + 'T00:00:00Z').getTime() : 0;
        const dateB = b.date ? new Date(b.date + 'T00:00:00Z').getTime() : 0;
        return dateB - dateA;
      }
    );
    const latestItem = sortedHistory[0];
    if (latestItem) {
      return {
        date: latestItem.date ? new Date(latestItem.date + 'T00:00:00Z').toLocaleDateString() : '',
        price: latestItem.close,
        currency: companyInfo?.currency || 'USD'
      };
    }
    return null;
  }

  const historicalChartData = data?.data?.history ? transformDataForChart(data.data.history) : [];
  const companyInfo = data?.data?.info;
  const latestPriceInfo = data?.data?.history ? getLatestPriceInfo(data.data.history, companyInfo) : null;

  return (
    <div className="space-y-8">
      <div className="pb-6 border-b border-gray-700">
        <h1 className="text-4xl font-bold tracking-tight text-white flex items-center">
          <MagnifyingGlassIcon className="h-10 w-10 mr-3 text-indigo-400" />
          Ticker Lookup
        </h1>
        <p className="mt-2 text-lg text-gray-400">
          Enter a stock ticker symbol to fetch its data from the backend. (Sign-In Required)
        </p>
      </div>
      <section className="p-6 bg-gray-800 rounded-xl shadow-2xl">
        <div className="flex flex-col sm:flex-row items-end gap-4 mb-6">
          <div className="flex-grow">
            <label htmlFor="tickerInput" className="block text-sm font-medium text-gray-300 mb-1">
              Ticker Symbol (e.g., AAPL, MSFT, EVISO.MI)
            </label>
            <input
              id="tickerInput"
              type="text"
              value={symbolInput}
              onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
              placeholder="Enter ticker symbol"
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none placeholder-gray-400 text-gray-100"
              onKeyPress={(e) => e.key === 'Enter' && !loading && handleGetInfoClick()}
            />
          </div>
          <button
            onClick={handleGetInfoClick}
            disabled={loading || !symbolInput.trim()}
            className="w-full sm:w-auto flex items-center justify-center px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-800"
          >
            {loading ? (
              <><ArrowPathIcon className="h-5 w-5 mr-2 animate-spin" /> Fetching...</>
            ) : (
              <><MagnifyingGlassIcon className="h-5 w-5 mr-2" /> Get Info</>
            )}
          </button>
        </div>
        {error && (
          <div className="p-4 mb-6 rounded-md bg-red-700 border border-red-600 text-red-100 flex items-start">
            <ExclamationTriangleIcon className="h-6 w-6 mr-3 text-red-200 flex-shrink-0" />
            <div>
              <p className="text-sm mb-1">{error}</p>
              {/* Show suggestions if present in data (from backend) */}
              {data && Array.isArray((data as any).suggestions) && (data as any).suggestions.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm text-indigo-200 mb-2">Did you mean one of these tickers?</p>
                  <ul className="space-y-1">
                    {(data as any).suggestions.map((s: any) => (
                      <li key={s.symbol}>
                        <button
                          className="px-3 py-1 rounded bg-indigo-700 hover:bg-indigo-600 text-white text-sm font-semibold mr-2 mb-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                          onClick={() => {
                            setSymbolInput(s.symbol);
                            setData(null); setError(null);
                            setTickerToFetch(s.symbol);
                          }}
                        >
                          {s.symbol} <span className="text-indigo-200">{s.shortname || s.longname || s.name || ''} {s.exchDisp ? `(${s.exchDisp})` : ''}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
        {!loading && data && !data.error && data.data && (companyInfo || historicalChartData.length > 0) && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold text-white">
                {companyInfo?.shortName || data.ticker}
                <span className="text-lg text-gray-400 ml-2">({data.ticker})</span>
              </h2>
              <p className="text-sm text-gray-400">Data source: {data.source}</p>
              {latestPriceInfo && (
                <p className="text-xl text-indigo-300 mt-1">
                    Latest Close ({latestPriceInfo.date}): {latestPriceInfo.price.toLocaleString(undefined, {style: 'currency', currency: latestPriceInfo.currency})}
                </p>
              )}
               {companyInfo?.sector && companyInfo?.industry && (
                <p className="text-sm text-gray-400">
                    Sector: {companyInfo.sector} | Industry: {companyInfo.industry}
                </p>
              )}
            </div>
            {historicalChartData.length > 1 ? (
              <div className="p-4 bg-gray-750 rounded-lg">
                 <h3 className="text-xl font-semibold text-white mb-3 flex items-center">
                    <ChartBarIcon className="h-6 w-6 mr-2 text-indigo-400"/>
                    Historical Performance (Close Price)
                </h3>
                <PerformanceChart data={historicalChartData} dataKey="value" chartLabel={`${data.ticker} Close Price`} />
              </div>
            ) : (
                <p className="text-gray-400 p-4 bg-gray-750 rounded-lg">Not enough historical data points to display a chart for {data.ticker}.</p>
            )}
            {companyInfo && Object.keys(companyInfo).length > 0 && (
              <div className="p-4 bg-gray-750 rounded-lg">
                <h3 className="text-xl font-semibold text-white mb-3">Company Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {companyInfo.shortName && <div><span className="font-semibold text-gray-300">Name:</span> <span className="text-gray-200">{companyInfo.shortName}</span></div>}
                  {companyInfo.longName && <div><span className="font-semibold text-gray-300">Long Name:</span> <span className="text-gray-200">{companyInfo.longName}</span></div>}
                  {companyInfo.sector && <div><span className="font-semibold text-gray-300">Sector:</span> <span className="text-gray-200">{companyInfo.sector}</span></div>}
                  {companyInfo.industry && <div><span className="font-semibold text-gray-300">Industry:</span> <span className="text-gray-200">{companyInfo.industry}</span></div>}
                  {companyInfo.country && <div><span className="font-semibold text-gray-300">Country:</span> <span className="text-gray-200">{companyInfo.country}</span></div>}
                  {companyInfo.exchange && <div><span className="font-semibold text-gray-300">Exchange:</span> <span className="text-gray-200">{companyInfo.exchange}</span></div>}
                  {companyInfo.currency && <div><span className="font-semibold text-gray-300">Currency:</span> <span className="text-gray-200">{companyInfo.currency}</span></div>}
                  {companyInfo.marketCap !== undefined && companyInfo.marketCap !== null && <div><span className="font-semibold text-gray-300">Market Cap:</span> <span className="text-gray-200">{typeof companyInfo.marketCap === 'number' ? companyInfo.marketCap.toLocaleString() : companyInfo.marketCap}</span></div>}
                  {companyInfo.regularMarketPrice !== undefined && companyInfo.regularMarketPrice !== null && <div><span className="font-semibold text-gray-300">Current Price:</span> <span className="text-gray-200">{typeof companyInfo.regularMarketPrice === 'number' ? companyInfo.regularMarketPrice.toLocaleString() : companyInfo.regularMarketPrice}</span></div>}
                  {companyInfo.previousClose !== undefined && companyInfo.previousClose !== null && <div><span className="font-semibold text-gray-300">Previous Close:</span> <span className="text-gray-200">{typeof companyInfo.previousClose === 'number' ? companyInfo.previousClose.toLocaleString() : companyInfo.previousClose}</span></div>}
                  {companyInfo.open !== undefined && companyInfo.open !== null && <div><span className="font-semibold text-gray-300">Open:</span> <span className="text-gray-200">{typeof companyInfo.open === 'number' ? companyInfo.open.toLocaleString() : companyInfo.open}</span></div>}
                  {companyInfo.dayHigh !== undefined && companyInfo.dayHigh !== null && <div><span className="font-semibold text-gray-300">Day High:</span> <span className="text-gray-200">{typeof companyInfo.dayHigh === 'number' ? companyInfo.dayHigh.toLocaleString() : companyInfo.dayHigh}</span></div>}
                  {companyInfo.dayLow !== undefined && companyInfo.dayLow !== null && <div><span className="font-semibold text-gray-300">Day Low:</span> <span className="text-gray-200">{typeof companyInfo.dayLow === 'number' ? companyInfo.dayLow.toLocaleString() : companyInfo.dayLow}</span></div>}
                  {companyInfo.fiftyTwoWeekHigh !== undefined && companyInfo.fiftyTwoWeekHigh !== null && <div><span className="font-semibold text-gray-300">52W High:</span> <span className="text-gray-200">{typeof companyInfo.fiftyTwoWeekHigh === 'number' ? companyInfo.fiftyTwoWeekHigh.toLocaleString() : companyInfo.fiftyTwoWeekHigh}</span></div>}
                  {companyInfo.fiftyTwoWeekLow !== undefined && companyInfo.fiftyTwoWeekLow !== null && <div><span className="font-semibold text-gray-300">52W Low:</span> <span className="text-gray-200">{typeof companyInfo.fiftyTwoWeekLow === 'number' ? companyInfo.fiftyTwoWeekLow.toLocaleString() : companyInfo.fiftyTwoWeekLow}</span></div>}
                  {companyInfo.website && <div className="md:col-span-2"><span className="font-semibold text-gray-300">Website:</span> <a href={companyInfo.website} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">{companyInfo.website}</a></div>}
                </div>
                {companyInfo.longBusinessSummary && (
                  <div className="mt-4">
                    <h4 className="font-semibold text-gray-300 mb-1">Business Summary:</h4>
                    <p className="text-xs text-gray-300 whitespace-pre-wrap max-h-60 overflow-y-auto">{companyInfo.longBusinessSummary}</p>
                  </div>
                )}
              </div>
            )}
            {/*
            {/* --- Fundamental Analysis Section --- */}
            {/* --- Skipped as per user request --- */}
            {/*
            {/* --- Potential Benefits & Risks Section --- */}
            {/* --- Skipped as per user request --- */}
            {/*
            {/* --- Key Events Section --- */}
            {/* --- Skipped as per user request --- */}
            {/*
            {/* --- Recommendations & Analyst Analysis Section --- */}
            {/* --- Skipped as per user request --- */}
            {/* --- End of Skipped Sections --- */}
          </div>
        )}
      </section>
    </div>
  );
};

export default TickerInfoPage;
