import React, { useEffect, useState } from 'react';
import { fetchPortfolioStatus } from '../services/portfolioService';
import { PortfolioStatusResponse } from '../types';
import { ArrowUpIcon, ArrowDownIcon } from '@heroicons/react/24/outline';

interface PortfolioStatusCardProps {
  portfolioName: string;
}

const PortfolioStatusCard: React.FC<PortfolioStatusCardProps> = ({ portfolioName }) => {
  const [status, setStatus] = useState<PortfolioStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  useEffect(() => {
    if (!portfolioName) return;
    setLoading(true);
    setError(null);
    fetchPortfolioStatus(portfolioName)
      .then((data) => {
        setStatus(data);
        setError(null);
      })
      .catch(() => {
        setStatus(null);
        setError('Failed to fetch portfolio status.');
      })
      .finally(() => setLoading(false));
  }, [portfolioName]);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <span className="opacity-50"><ArrowUpIcon className="h-3 w-3 inline-block" /><ArrowDownIcon className="h-3 w-3 inline-block -ml-1" /></span>;
    }
    return sortConfig.direction === 'asc' ? <ArrowUpIcon className="h-4 w-4 inline-block" /> : <ArrowDownIcon className="h-4 w-4 inline-block" />;
  };

  // Sort holdings
  const sortedHoldings = React.useMemo(() => {
    if (!status?.holdings) return [];
    if (!sortConfig) return status.holdings;
    const sorted = [...status.holdings];
    sorted.sort((a, b) => {
      let valA: any, valB: any;
      switch (sortConfig.key) {
        case 'ticker':
          valA = a.ticker;
          valB = b.ticker;
          break;
        case 'name':
          valA = 'name' in a ? (a as any).name : a.ticker;
          valB = 'name' in b ? (b as any).name : b.ticker;
          break;
        case 'quantity':
          valA = a.quantity;
          valB = b.quantity;
          break;
        case 'price':
          valA = a.price;
          valB = b.price;
          break;
        case 'value':
          valA = a.value;
          valB = b.value;
          break;
        default:
          valA = '';
          valB = '';
      }
      if (['quantity', 'price', 'value'].includes(sortConfig.key)) {
        return sortConfig.direction === 'asc'
          ? (Number(valA) - Number(valB))
          : (Number(valB) - Number(valA));
      }
      return sortConfig.direction === 'asc'
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });
    return sorted;
  }, [status, sortConfig]);

  if (!portfolioName) return <div className="text-red-400 text-sm">No portfolio selected.</div>;
  if (loading) return <div className="text-gray-400 text-sm">Loading portfolio status...</div>;
  if (error) return <div className="text-red-400 text-sm">{error}</div>;
  if (!status) return <div className="text-red-400 text-sm">No portfolio status data available (empty response).</div>;
  if (!status.holdings || status.holdings.length === 0) return <div className="text-yellow-400 text-sm">No holdings found for this portfolio. Try importing transactions or check your data.</div>;

  return (
    <div className="bg-gray-800 rounded-xl shadow-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-700" id="portfolio-status-table">
          <caption className="caption-top text-left text-xs text-gray-400 mb-2">
            {status.last_updated && (
              <>Last updated: {new Date(status.last_updated).toLocaleString()}<br /></>
            )}
          </caption>
          <thead className="bg-gray-750">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-700" onClick={() => requestSort('ticker')}>
                Ticker {getSortIcon('ticker')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-700" onClick={() => requestSort('name')}>
                Name {getSortIcon('name')}
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-700" onClick={() => requestSort('quantity')}>
                Qty {getSortIcon('quantity')}
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-700" onClick={() => requestSort('price')}>
                Price {getSortIcon('price')}
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-700" onClick={() => requestSort('value')}>
                Value {getSortIcon('value')}
              </th>
            </tr>
          </thead>
          <tbody className="bg-gray-800 divide-y divide-gray-700">
            {sortedHoldings.map((h) => (
              <tr key={h.ticker}>
                <td className="px-4 py-3 text-white whitespace-nowrap">{h.ticker}</td>
                <td className="px-4 py-3 text-white whitespace-nowrap">{'name' in h ? (h as any).name : h.ticker}</td>
                <td className="px-4 py-3 text-right text-gray-300 whitespace-nowrap">{h.quantity}</td>
                <td className="px-4 py-3 text-right text-gray-300 whitespace-nowrap">{h.price}</td>
                <td className="px-4 py-3 text-right text-indigo-200 font-semibold whitespace-nowrap">{h.value?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={4} className="px-4 py-3 text-right text-gray-300 font-bold uppercase">Total Value</td>
              <td className="px-4 py-3 text-right text-indigo-200 font-bold">{status.total_value?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PortfolioStatusCard;
