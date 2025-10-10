import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronUpIcon, ChevronDownIcon, CheckIcon } from '@heroicons/react/20/solid';
import { classNames } from '../utils/classNames';
import type { ReturnMetrics } from '../types';
import { API_BASE_URL, cleanApiBaseUrl } from '../apiBase';

export interface TickerReturnsTableProps {
  portfolio: string;
  idToken?: string | null;
  apiBaseUrl?: string;
  selectedTickers?: string[];
  onSelectedTickersChange?: (tickers: string[]) => void;
}

/**
 * Cool-styled ticker returns table with sortable columns.
 */
const TickerReturnsTable: React.FC<TickerReturnsTableProps> = ({ portfolio, idToken, apiBaseUrl, selectedTickers = [], onSelectedTickersChange }) => {
  const resolvedApiBase = apiBaseUrl ? apiBaseUrl.replace(/\/+$/,'') : cleanApiBaseUrl(API_BASE_URL);
  const [sortKey, setSortKey] = useState<keyof ReturnMetrics>('symbol');
  const [asc, setAsc] = useState(true);

  const { data: returnsData = [], isLoading, error } = useQuery({
    queryKey: ['tickerReturns', portfolio, idToken],
    queryFn: async () => {
  const res = await fetch(`${resolvedApiBase}/api/portfolio/${portfolio}/kpis/returns`, {
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : {}
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      const json = await res.json();
      // Map backend period names to frontend period names
      const periodMapping: Record<string, string> = {
        'daily': 'yesterday_return',
        'weekly': 'weekly_return', 
        'monthly': 'monthly_return',
        'three_month': 'three_month_return',
        'ytd': 'ytd_return',
        'one_year': 'one_year_return'
      };
      
      // The backend returns data with keys like 'daily', 'weekly', etc.
      // Each period has a 'tickers' object with ticker data
      const tickerRows: ReturnMetrics[] = [];
      
      // Get all unique tickers across all periods
      const allTickers = new Set<string>();
      Object.keys(json).forEach(period => {
        const tickersObj = json[period]?.tickers || {};
        Object.keys(tickersObj).forEach(ticker => allTickers.add(ticker));
      });
      
      // Create a row for each ticker
      allTickers.forEach(symbol => {
        let name = symbol; // fallback
        const rowData: ReturnMetrics = { 
          symbol,
          name: symbol, // will be updated below
          yesterday_return: 0,
          three_days_return: 0,
          weekly_return: 0,
          monthly_return: 0,
          three_month_return: 0,
          ytd_return: 0,
          one_year_return: 0
        };
        
        // Extract data for each period
        Object.entries(periodMapping).forEach(([backendPeriod, frontendKey]) => {
          const tickerData = json[backendPeriod]?.tickers?.[symbol];
          if (tickerData) {
            // Use ticker_name from any available period
            if (tickerData.ticker_name && typeof tickerData.ticker_name === 'string') {
              name = tickerData.ticker_name;
            }
            rowData[frontendKey as keyof ReturnMetrics] = tickerData.return_pct ?? 0;
          } else {
            rowData[frontendKey as keyof ReturnMetrics] = 0;
          }
        });
        
  // Note: 3-day returns column removed per UX request
        
        rowData.name = name;
        tickerRows.push(rowData);
      });
      return tickerRows;
    },
    enabled: !!portfolio
  });

  const sorted = useMemo(() => {
    return [...returnsData].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (typeof va === 'string') {
        return (va as string).localeCompare(vb as string) * (asc ? 1 : -1);
      }
      return (((va as number) - (vb as number)) * (asc ? 1 : -1));
    });
  }, [returnsData, sortKey, asc]);

  const headers: { key: keyof ReturnMetrics; label: string }[] = [
    { key: 'name', label: 'Asset' },
    { key: 'symbol', label: 'Ticker' },
    { key: 'yesterday_return', label: '1D' },
    { key: 'weekly_return', label: '1W' },
    { key: 'monthly_return', label: '1M' },
    { key: 'three_month_return', label: '3M' },
    { key: 'ytd_return', label: 'YTD' },
    { key: 'one_year_return', label: '1Y' },
  ];

  const onSort = (key: keyof ReturnMetrics) => {
    if (key === sortKey) setAsc(!asc);
    else { setSortKey(key); setAsc(true); }
  };

  // Selection helpers
  const selectAllRef = useRef<HTMLInputElement | null>(null);
  const allVisibleSelected = sorted.length > 0 && sorted.every(r => selectedTickers.includes(r.symbol));
  const someSelected = sorted.some(r => selectedTickers.includes(r.symbol));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = !allVisibleSelected && someSelected;
    }
  }, [allVisibleSelected, someSelected]);

  const handleToggleRow = (symbol: string) => {
    if (!onSelectedTickersChange) return;
    if (selectedTickers.includes(symbol)) {
      onSelectedTickersChange(selectedTickers.filter(s => s !== symbol));
    } else {
      onSelectedTickersChange([...selectedTickers, symbol]);
    }
  };

  const handleSelectAll = () => {
    if (!onSelectedTickersChange) return;
    if (allVisibleSelected) {
      // clear only visible
      const visibleSymbols = new Set(sorted.map(r => r.symbol));
      onSelectedTickersChange(selectedTickers.filter(s => !visibleSymbols.has(s)));
    } else {
      // add all visible (avoid duplicates)
      const visible = sorted.map(r => r.symbol);
      const merged = Array.from(new Set([...selectedTickers, ...visible]));
      onSelectedTickersChange(merged);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-1 h-5 bg-gradient-to-b from-indigo-400 to-indigo-600 rounded-full" />
          <h2 className="text-lg font-bold text-white whitespace-nowrap">Returns</h2>
        </div>
      </div>
      {isLoading ? (
        <div className="text-slate-400">Loading returns...</div>
      ) : error ? (
        <div className="text-red-400">Error loading returns.</div>
      ) : (
        <>
        <div className="hidden sm:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700 relative">
            <thead className="bg-gray-900/85 backdrop-blur sticky top-0 z-20 shadow-sm">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    className="h-4 w-4 text-indigo-400 rounded bg-gray-700"
                    checked={allVisibleSelected}
                    onChange={handleSelectAll}
                    aria-label="Select all visible tickers"
                  />
                </th>
                {headers.map(h => (
                  <th
                    key={String(h.key)}
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-700"
                    onClick={() => onSort(h.key)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="">{h.label}</span>
                      {sortKey === h.key && (
                        asc
                          ? <ChevronUpIcon className="w-4 h-4 text-indigo-400" />
                          : <ChevronDownIcon className="w-4 h-4 text-indigo-400" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {sorted.map(row => {
                const isSelected = selectedTickers.includes(row.symbol);
                return (
                  <tr
                    key={row.symbol}
                    className={classNames('hover:bg-gray-750 transition-colors', isSelected ? 'bg-gray-700' : 'cursor-pointer')}
                    onClick={() => handleToggleRow(row.symbol)}
                    tabIndex={0}
                    role="button"
                    aria-pressed={isSelected}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToggleRow(row.symbol); } }}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      {isSelected ? <CheckIcon className="w-4 h-4 text-indigo-400" /> : <div className="w-4 h-4" />}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-white font-medium max-w-[220px] truncate" title={row.name}>{row.name}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-indigo-200 tracking-wide">{row.symbol}</td>
                    {headers.slice(2).map(h => {
                      const raw = row[h.key] as number;
                      const formatted = raw.toFixed(2) + '%';
                      const colorClass = raw > 0 ? 'text-green-400' : raw < 0 ? 'text-red-400' : 'text-gray-300';
                      return (
                        <td key={String(h.key)} className="px-4 py-3 whitespace-nowrap text-sm text-right">
                          <span className={classNames(colorClass, 'font-semibold')}>{formatted}</span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
  </div>
  {/* Mobile fallback: simple responsive table */}
  <div className="sm:hidden overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left">
                  <input
                    type="checkbox"
                    ref={selectAllRef}
                    className="h-4 w-4 text-indigo-400 rounded bg-gray-700"
                    checked={allVisibleSelected}
                    onChange={handleSelectAll}
                    aria-label="Select all visible tickers"
                  />
                </th>
                {headers.map(h => (
                  <th key={String(h.key)} className="px-3 py-2 text-left text-xs font-medium text-gray-300" onClick={() => onSort(h.key)}>
                      <div className="flex items-center gap-2">
                        <span className="">{h.label}</span>
                        {sortKey === h.key && (
                          asc
                            ? <ChevronUpIcon className="w-3 h-3 text-indigo-400" />
                            : <ChevronDownIcon className="w-3 h-3 text-indigo-400" />
                        )}
                      </div>
                    </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {sorted.map(row => {
                const isSelected = selectedTickers.includes(row.symbol);
                return (
                  <tr
                    key={row.symbol}
                    className={classNames('hover:bg-gray-750 transition-colors', isSelected ? 'bg-gray-700' : 'cursor-pointer')}
                    onClick={() => handleToggleRow(row.symbol)}
                    tabIndex={0}
                    role="button"
                    aria-pressed={isSelected}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToggleRow(row.symbol); } }}
                  >
                    <td className="px-3 py-2">
                      {isSelected ? <CheckIcon className="w-4 h-4 text-indigo-400" /> : <div className="w-4 h-4" />}
                    </td>
                    <td className="px-3 py-2 font-medium text-white max-w-[180px] truncate" title={row.name}>{row.name}</td>
                    <td className="px-3 py-2 font-mono text-indigo-200">{row.symbol}</td>
                    {headers.slice(2).map(h => {
                      const raw = row[h.key] as number;
                      const formatted = raw.toFixed(2) + '%';
                      const colorClass = raw > 0 ? 'text-green-400' : raw < 0 ? 'text-red-400' : 'text-gray-300';
                      return (
                        <td key={String(h.key)} className="px-3 py-2 text-right text-sm">
                          <span className={classNames(colorClass, 'font-semibold')}>{formatted}</span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </>
  );
};

export default TickerReturnsTable;
