import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useAuth } from '../AuthContext';
import GenericPerformanceSection from '../components/PerformanceSection';
import MultiSelectListbox from '../components/MultiSelectListBox';
import TickerReturnsTable from '../components/TickerReturnsTable';
import CollapsibleSection from '../components/CollapsibleComponent';
import { fetchTickerPerformance } from '../services/portfolioService';

// --- Types ---
import type { HistoricalDataPoint } from '../types';

// Used for TickersReturnsTable
export interface ReturnMetrics {
  symbol: string;
  yesterday_return?: number;
  weekly_return?: number;
  monthly_return?: number;
  three_month_return?: number;
  ytd_return?: number;
  one_year_return?: number;
  [key: string]: string | number | undefined;
}

const API_BASE_URL = 'http://127.0.0.1:5000';

// -----------------------------------------------------
// Page: Asset Analysis
// -----------------------------------------------------
const AssetAnalysisPage: React.FC = () => {
  const { isLoggedIn, idToken } = useAuth();
  const [selectedPortfolio, setSelectedPortfolio] = useState<string | null>(null);
  const [tickersList, setTickersList] = useState<string[]>([]);
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);
  const [tickerDateRange, setTickerDateRange] = useState<{ start: string; end: string } | null>(null);
  const [tickerValueType, setTickerValueType] = useState<'value' | 'abs_value' | 'pct' | 'pct_from_first'>('pct_from_first');

  // Fetch all portfolios
  const fetchAllPortfolioNames = async () => {
    const res = await fetch(`${API_BASE_URL}/api/portfolios`, {
      headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
    });
    const json = await res.json();
    if (Array.isArray(json)) return json;
    if (json && Array.isArray(json.portfolios)) return json.portfolios;
    if (json && Array.isArray(json.names)) return json.names;
    return [];
  };

  const { data: portfolios = [] } = useQuery({
    queryKey: ['portfolioNames', idToken],
    queryFn: fetchAllPortfolioNames,
    enabled: isLoggedIn
  });

  // Fetch tickers for selected portfolio
  useEffect(() => {
    const fetchTickers = async () => {
      if (!selectedPortfolio || selectedPortfolio === '--select portfolio--' || !idToken) {
        setTickersList([]);
        return;
      }
      try {
        const res = await fetch(`${API_BASE_URL}/api/portfolio/${selectedPortfolio}/tickers`, {
          headers: idToken ? { Authorization: `Bearer ${idToken}` } : {}
        });
        const json = await res.json();
        let tickersList: string[] = [];
        if (Array.isArray(json)) tickersList = json;
        else if (json && Array.isArray(json.tickers)) tickersList = json.tickers;
        else if (json && Array.isArray(json.names)) tickersList = json.names;
        setTickersList(tickersList);
      } catch (e) {
        setTickersList([]);
      }
    };
    if (isLoggedIn && selectedPortfolio && selectedPortfolio !== '--select portfolio--') fetchTickers();
  }, [isLoggedIn, selectedPortfolio, idToken]);

  // Set default selector value
  useEffect(() => {
    if (portfolios.length > 0 && !selectedPortfolio) {
      setSelectedPortfolio('--select portfolio--');
    }
  }, [portfolios, selectedPortfolio]);

  // Remove the useQuery for tickersPerformance and all related safePerformanceData/tickerFiltered/tickerMinMax logic
  // Add multiTickerPerformance state and fetch logic as in HomePage
  const [multiTickerPerformance, setMultiTickerPerformance] = useState<Record<string, HistoricalDataPoint[]>>({});

  useEffect(() => {
    const fetchAll = async () => {
      if (selectedPortfolio && selectedTickers.length > 0) {
        const results: Record<string, HistoricalDataPoint[]> = {};
        await Promise.all(selectedTickers.map(async (ticker) => {
          // Use the same fetchTickerPerformance as HomePage
          const perf = await fetchTickerPerformance(selectedPortfolio, ticker);
          results[ticker] = perf;
        }));
        setMultiTickerPerformance(results);
      } else {
        setMultiTickerPerformance({});
      }
    };
    fetchAll();
  }, [selectedPortfolio, selectedTickers]);

  // Compute tickerMinMax and tickerFiltered as in HomePage
  const tickerMinMax = useMemo(() => {
    const all = Object.values(multiTickerPerformance).flat();
    if (!all.length) return { min: '', max: '' };
    const dates = all.map(d => d.date).sort();
    return { min: dates[0], max: dates[dates.length - 1] };
  }, [multiTickerPerformance]);

  const tickerFiltered = useMemo(() => {
    const flat = Object.values(multiTickerPerformance).flat();
    if (!tickerDateRange) return flat.map((d, i, arr) => {
      const prev = i > 0 ? arr[i-1] : undefined;
      return {
        ...d,
        pct: prev && prev.abs_value !== undefined && prev.abs_value !== 0 && d.abs_value !== undefined
          ? ((d.abs_value - prev.abs_value) / prev.abs_value) * 100
          : undefined,
      };
    });
    return flat.filter(d => d.date >= tickerDateRange.start && d.date <= tickerDateRange.end).map((d, i, arr) => {
      const prev = i > 0 ? arr[i-1] : undefined;
      return {
        ...d,
        pct: prev && prev.abs_value !== undefined && prev.abs_value !== 0 && d.abs_value !== undefined
          ? ((d.abs_value - prev.abs_value) / prev.abs_value) * 100
          : undefined,
      };
    });
  }, [multiTickerPerformance, tickerDateRange]);

  // Final value logic (like HomePage)
  const getFinalValue = (data: any[], valueType: string) => {
    if (!data || data.length === 0) return '-';
    const last = data[data.length - 1];
    if (!last) return '-';
    if (valueType === 'pct_from_first' && last.pct_from_first !== undefined) return last.pct_from_first.toFixed(2) + '%';
    if (valueType === 'value' && last.value !== undefined) return last.value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    if (valueType === 'abs_value' && last.abs_value !== undefined) return last.abs_value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    if (valueType === 'pct' && last.pct !== undefined) return last.pct.toFixed(2) + '%';
    return '-';
  };

  // --- YTD Button Handler for Ticker Performance ---
  const setTickerYTD = () => {
    const yearStart = dayjs().startOf('year').format('YYYY-MM-DD');
    setTickerDateRange({ start: yearStart, end: tickerMinMax.max });
  };

  // Fix GenericPerformanceSection usage: pass a default valueType and onValueTypeChange
  return (
    <div className="p-6 space-y-12">
      {/* Portfolio selector and prompt */}
      <div className="flex items-center gap-4">
        <label className="text-gray-300 font-semibold">Portfolio:</label>
        <select
          className="bg-gray-700 text-gray-100 rounded px-3 py-1"
          value={selectedPortfolio || ''}
          onChange={e => setSelectedPortfolio(e.target.value)}
        >
          <option value="--select portfolio--">--select portfolio--</option>
          {portfolios.map((p: string) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      {(!isLoggedIn || !selectedPortfolio || selectedPortfolio === '--select portfolio--') && (
        <div className="text-gray-400 mt-8">
          {isLoggedIn
            ? 'Please select a portfolio to view analysis.'
            : 'Please sign in to access portfolio analysis.'}
        </div>
      )}
      {/* Performance Section */}
      {selectedPortfolio && selectedPortfolio !== '--select portfolio--' && (
        <>
          <CollapsibleSection title="Asset Returns">
            <TickerReturnsTable
              portfolio={selectedPortfolio!}
              idToken={idToken}
            />
          </CollapsibleSection>
          <GenericPerformanceSection
            title="Ticker Performance"
            valueType={tickerValueType}
            onValueTypeChange={setTickerValueType}
            data={tickerFiltered}
            series={selectedTickers.map(symbol => {
              const raw = (multiTickerPerformance[symbol] || []).filter(d =>
                !tickerDateRange || (d.date >= tickerDateRange.start && d.date <= tickerDateRange.end)
              );
              let firstAbs = raw.length > 0 ? raw[0].abs_value ?? 1 : 1;
              const withPctFromFirst = raw.map(d => ({
                ...d,
                pct_from_first:
                  d.abs_value !== undefined && firstAbs !== 0
                    ? ((d.abs_value - firstAbs) / firstAbs) * 100
                    : undefined,
              }));
              return {
                id: symbol,
                name: symbol,
                data: withPctFromFirst,
              };
            })}
            dateRange={tickerDateRange}
            onDateRangeChange={setTickerDateRange}
            minDate={tickerMinMax.min}
            maxDate={tickerMinMax.max}
            onSetYTD={setTickerYTD}
            loading={false}
            notEnoughDataMessage="Not enough historical data for the selected tickers."
            finalValue={selectedTickers.length === 1
              ? (() => {
                  const raw = (multiTickerPerformance[selectedTickers[0]] || []).filter(d =>
                    !tickerDateRange || (d.date >= tickerDateRange.start && d.date <= tickerDateRange.end)
                  );
                  let firstAbs = raw.length > 0 ? raw[0].abs_value ?? 1 : 1;
                  const withPctFromFirst = raw.map(d => ({
                    ...d,
                    pct_from_first:
                      d.abs_value !== undefined && firstAbs !== 0
                        ? ((d.abs_value - firstAbs) / firstAbs) * 100
                        : undefined,
                  }));
                  return getFinalValue(withPctFromFirst, tickerValueType);
                })()
              : selectedTickers.length > 1
                ? 'Multiple'
                : '-'}
            selector={
              <MultiSelectListbox
                options={tickersList.map(symbol => ({ symbol, name: symbol }))}
                value={selectedTickers}
                onChange={setSelectedTickers}
                getValue={a => a.symbol}
                renderLabel={a => a.symbol}
                placeholder="Select Tickers"
                maxDisplayCount={3}
              />
            }
          />
        </>
      )}
    </div>
  );
};

export default AssetAnalysisPage;
