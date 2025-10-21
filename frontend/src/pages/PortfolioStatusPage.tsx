import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import TargetAllocationPanel from '../components/TargetAllocationPanel';
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
  const [showTargetsModal, setShowTargetsModal] = useState(false);
  const [passedAssetTypes, setPassedAssetTypes] = useState<string[] | null>(null);
  const [passedRiskOptions, setPassedRiskOptions] = useState<string[] | null>(null);

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
  // support 'market_value' as preferred current valuation
  type SortableHoldingKey = 'quantity' | 'price' | 'value' | 'market_value';

  let holdings = status.holdings || [];
  if (sortBy) {
    const key = sortBy as SortableHoldingKey;
    holdings = [...holdings].sort((a, b) => {
      let aVal: any = a[key];
      let bVal: any = b[key];
      if (typeof aVal === 'string') aVal = parseFloat(aVal as string);
      if (typeof bVal === 'string') bVal = parseFloat(bVal as string);
      // coerce undefined/null to 0 for sorting safety
      aVal = (aVal === undefined || aVal === null) ? 0 : aVal;
      bVal = (bVal === undefined || bVal === null) ? 0 : bVal;
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
      <button
        className="mb-4 ml-3 px-3 py-2 rounded bg-gray-700 text-white font-medium hover:bg-gray-600 disabled:opacity-50"
        onClick={() => {
          // derive asset types and risk options from status holdings
          const types = new Set<string>();
          if (status && Array.isArray(status.holdings)) {
            status.holdings.forEach((h: any) => {
              if (h.asset_type) types.add(h.asset_type);
              if (h.category) types.add(h.category);
            });
          }
          let assetTypes = Array.from(types).filter(Boolean);
          if (assetTypes.length === 0 && status && Array.isArray(status.holdings)) {
            assetTypes = status.holdings.map((h:any) => h.ticker).slice(0,20);
          }
          const riskOptions = ['Low', 'Medium', 'High'];
          setPassedAssetTypes(assetTypes);
          setPassedRiskOptions(riskOptions);
          setShowTargetsModal(true);
        }}
      >
        Configure Targets
      </button>
      {/* No last_updated in PortfolioStatusResponse, so skip that */}
    <div className="mb-6 text-lg text-indigo-300 font-semibold">Market Value: {(status.total_market_value ?? status.total_value)?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} </div>
    <div className="mb-3 text-sm text-gray-400">Total Value (cost basis): {status.total_value?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} </div>
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
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-300 uppercase cursor-pointer select-none" onClick={() => handleSort('market_value')}>
              Market Value {sortBy === 'market_value' && (sortDir === 'asc' ? '▲' : '▼')}
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
                <td className="px-4 py-2 text-right text-indigo-200 font-semibold">{(h.market_value ?? h.value)?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {showTargetsModal && ReactDOM.createPortal(
        <TargetAllocationPanel
          open={showTargetsModal}
          onClose={() => { setShowTargetsModal(false); setPassedAssetTypes(null); setPassedRiskOptions(null); }}
          portfolioName={portfolioName!}
          idToken={idToken}
          assetTypes={passedAssetTypes || undefined}
          riskOptions={passedRiskOptions || undefined}
          onSaved={async () => {
            // refresh status after saving targets
            setPassedAssetTypes(null);
            setPassedRiskOptions(null);
            await loadStatus(true);
          }}
        />,
        document.getElementById('modal-root') as Element
      )}
    </div>
  );
};

export default PortfolioStatusPage;
