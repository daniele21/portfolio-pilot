import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/20/solid';
import { classNames } from '../utils/classNames';
import type { ReturnMetrics } from '../types';

export interface TickerReturnsTableProps {
  portfolio: string;
  idToken?: string | null;
  apiBaseUrl?: string;
}

/**
 * Cool-styled ticker returns table with sortable columns.
 */
const TickerReturnsTable: React.FC<TickerReturnsTableProps> = ({ portfolio, idToken, apiBaseUrl = 'http://127.0.0.1:5000' }) => {
  const [sortKey, setSortKey] = useState<keyof ReturnMetrics>('symbol');
  const [asc, setAsc] = useState(true);

  const { data: returnsData = [], isLoading, error } = useQuery({
    queryKey: ['tickerReturns', portfolio, idToken],
    queryFn: async () => {
      const res = await fetch(`${apiBaseUrl}/api/portfolio/${portfolio}/returns`, {
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : {}
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      const json = await res.json();
      const periods = ['yesterday', 'weekly', 'monthly', 'three_month', 'ytd', 'one_year'];
      const tickersSet = new Set<string>();
      periods.forEach(p => Object.keys(json[p]?.tickers || {}).forEach(t => tickersSet.add(t)));
      return Array.from(tickersSet).map(symbol => {
        const row: any = { symbol };
        periods.forEach(p => {
          row[`${p}_return`] = json[p]?.tickers?.[symbol]?.return_pct ?? 0;
        });
        return row as ReturnMetrics;
      });
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

  return (
    <div className="bg-gray-800 rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-white mb-4">Returns</h2>
      {isLoading ? (
        <div className="text-gray-400">Loading returns...</div>
      ) : error ? (
        <div className="text-red-500">Error loading returns.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead>
              <tr>
                {headers.map(h => (
                  <th
                    key={String(h.key)}
                    className="px-4 py-2 text-left text-gray-200 cursor-pointer select-none"
                    onClick={() => onSort(h.key)}
                  >
                    <div className="flex items-center gap-1">
                      <span>{h.label}</span>
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
            <tbody className="divide-y divide-gray-700">
              {sorted.map(row => (
                <tr key={row.symbol} className="hover:bg-gray-700 transition-colors">
                  <td className="px-4 py-3 font-medium text-white">{row.symbol}</td>
                  {headers.slice(1).map(h => {
                    const raw = row[h.key] as number;
                    const formatted = raw.toFixed(2) + '%';
                    const colorClass = raw > 0 ? 'text-green-400' : raw < 0 ? 'text-red-400' : 'text-gray-300';
                    return (
                      <td key={String(h.key)} className="px-4 py-3">
                        <span className={classNames(colorClass, 'font-semibold')}>{formatted}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TickerReturnsTable;
