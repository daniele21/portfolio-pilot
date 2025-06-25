import React, { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';
import { useParams } from 'react-router-dom';
import { fetchPortfolioStatus, fetchPortfolioStatusLive, savePortfolioStatus } from '../services/portfolioService';
import { PortfolioStatusResponse } from '../types';

const PortfolioStatusPage: React.FC = () => {
  const { isLoggedIn, idToken } = useAuth();
  const { portfolioName } = useParams<{ portfolioName: string }>();
  const [status, setStatus] = useState<PortfolioStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [updating, setUpdating] = useState(false);

  // Helper to load status: try saved, if not found, compute and save
  const loadStatus = async (forceUpdate = false) => {
    setLoading(true);
    setError(null);
    try {
      let data: PortfolioStatusResponse | null = null;
      let savedError: any = null;
      if (!forceUpdate) {
        try {
          data = await fetchPortfolioStatus(portfolioName!);
        } catch (e: any) {
          savedError = e;
        }
      }
      // Extract status if present in API response
      const statusData = data && (data as any).status ? (data as any).status : data;
      if (statusData && statusData.holdings) {
        setStatus(statusData);
        setError(null);
      } else if (savedError && savedError.status === 404) {
        // Only if no saved status at all (404), call live
        const live = await fetchPortfolioStatusLive(portfolioName!);
        const liveStatus = live && (live as any).status ? (live as any).status : live;
        if (liveStatus && liveStatus.holdings && liveStatus.holdings.length > 0) {
          await savePortfolioStatus(portfolioName!); // Save to DB
          setStatus(liveStatus);
          setError(null);
        } else {
          setStatus(null);
          setError('No status found and cannot compute live status.');
        }
      } else {
        // If error is not 404, show error
        setStatus(null);
        setError('Failed to fetch portfolio status.');
      }
    } catch (e) {
      setError('Failed to fetch portfolio status.');
      setStatus(null);
    } finally {
      setLoading(false);
      setUpdating(false);
    }
  };

  useEffect(() => {
    if (!portfolioName) {
      setError('No portfolio selected.');
      setLoading(false);
      setStatus(null);
      return;
    }
    loadStatus();
    // eslint-disable-next-line
  }, [portfolioName, isLoggedIn, idToken]);

  const handleUpdateStatus = async () => {
    setUpdating(true);
    await loadStatus(true);
  };

  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  if (!isLoggedIn) return <div className="text-center text-yellow-400 text-xl p-8">Please sign in to view portfolio status.</div>;
  if (loading) return <div className="text-center text-gray-400 text-xl p-8">Loading portfolio status...</div>;
  if (error) return <div className="text-center text-red-400 text-xl p-8">{error}</div>;
  if (!status || !status.holdings) {
    return <div className="text-center text-red-400 text-xl p-8">No portfolio status data available.</div>;
  }

  // Allowed sort keys for PortfolioHolding
  type SortableHoldingKey = 'quantity' | 'price' | 'value';

  let holdings = status.holdings || [];
  if (sortBy) {
    const key = sortBy as SortableHoldingKey;
    holdings = [...holdings].sort((a, b) => {
      let aVal = a[key];
      let bVal = b[key];
      if (typeof aVal === 'string') aVal = parseFloat(aVal);
      if (typeof bVal === 'string') bVal = parseFloat(bVal);
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  return (
    <div className="max-w-3xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-4 text-white">Portfolio Status: {portfolioName}</h1>
      <button
        className="mb-4 px-4 py-2 rounded bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:opacity-50"
        onClick={handleUpdateStatus}
        disabled={updating}
      >
        {updating ? 'Updating...' : 'Update Status'}
      </button>
      {/* No last_updated in PortfolioStatusResponse, so skip that */}
      <div className="mb-6 text-lg text-indigo-300 font-semibold">Total Value: {status.total_value?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} </div>
      <table className="min-w-full divide-y divide-gray-700 bg-gray-800 rounded-xl">
        <thead className="bg-gray-750">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Ticker</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Name</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-300 uppercase cursor-pointer select-none" onClick={() => handleSort('quantity')}>
              Quantity {sortBy === 'quantity' && (sortDir === 'asc' ? '▲' : '▼')}
            </th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-300 uppercase cursor-pointer select-none" onClick={() => handleSort('price')}>
              Price {sortBy === 'price' && (sortDir === 'asc' ? '▲' : '▼')}
            </th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-300 uppercase cursor-pointer select-none" onClick={() => handleSort('value')}>
              Value {sortBy === 'value' && (sortDir === 'asc' ? '▲' : '▼')}
            </th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h: any) => (
            <tr key={h.ticker}>
              <td className="px-4 py-2 text-white">{h.ticker}</td>
              <td className="px-4 py-2 text-white">{h.name}</td>
              <td className="px-4 py-2 text-right text-gray-300">{h.quantity}</td>
              <td className="px-4 py-2 text-right text-gray-300">{h.price}</td>
              <td className="px-4 py-2 text-right text-indigo-200 font-semibold">{h.value?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default PortfolioStatusPage;
