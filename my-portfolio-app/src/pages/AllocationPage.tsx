import React, { useEffect, useState } from 'react';
import SunburstChart from '../components/SunburstChart';
import { Asset } from '../types';
import { getAssets, isPortfolioInitialized, initialLoad as initialPortfolioLoad } from '../services/portfolioService';
import { TableCellsIcon, DocumentMagnifyingGlassIcon, ArrowUpIcon, ArrowDownIcon, ShieldCheckIcon, ShieldExclamationIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../AuthContext';
import { ErrorBoundary } from '../components/ErrorBoundary';

type SortableAssetKeys = 'name' | 'category' | 'region' | 'quantity' | 'averageCostPrice' | 'value' | 'qualitativeRisk';

const AllocationPage: React.FC = () => {
  const [assets, setAssets] = useState<Asset[]>([]); // Non-cash assets for table
  const [allAssetsForSunburst, setAllAssetsForSunburst] = useState<Asset[]>([]); // All assets for sunburst
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: SortableAssetKeys; direction: 'ascending' | 'descending' } | null>(null);
  const { isLoggedIn, idToken } = useAuth();

  useEffect(() => {
    const fetchData = async () => {
      if (!isLoggedIn || !idToken) {
        setLoading(false);
        setError("Please sign in to view allocation data.");
        setAssets([]); setAllAssetsForSunburst([]);
        return;
      }
      try {
        setLoading(true);
        if(!isPortfolioInitialized()) {
            await initialPortfolioLoad();
        }
        const assetData = await getAssets(); // Fetches from /portfolio/status
        
        setAllAssetsForSunburst(assetData); // Sunburst can include cash if it's a holding

        // Filter for table: non-cash, positive quantity, positive value
        setAssets(assetData.filter(asset => asset.category !== 'Cash' && (asset.quantity ?? 0) > 0 && asset.value > 0)); 
        setError(null);
      } catch (err) {
        setError("Failed to load asset allocation data from backend.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [isLoggedIn, idToken]);

  const sortedAssets = React.useMemo(() => {
    let sortableItems = [...assets];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        const valA = a[sortConfig.key];
        const valB = b[sortConfig.key];

        let comparison = 0;
        if (valA === null || valA === undefined) comparison = (sortConfig.key === 'averageCostPrice' || typeof valA === 'number') ? -Infinity : -1; // Push nulls to one end
        else if (valB === null || valB === undefined) comparison = (sortConfig.key === 'averageCostPrice' || typeof valB === 'number') ? Infinity : 1;
        else if (typeof valA === 'number' && typeof valB === 'number') {
          comparison = valA - valB;
        } else {
          comparison = String(valA).toLowerCase().localeCompare(String(valB).toLowerCase());
        }
        
        return sortConfig.direction === 'ascending' ? comparison : comparison * -1;
      });
    }
    return sortableItems;
  }, [assets, sortConfig]);

  const requestSort = (key: SortableAssetKeys) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: SortableAssetKeys) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <span className="opacity-50"><ArrowUpIcon className="h-3 w-3 inline-block" /><ArrowDownIcon className="h-3 w-3 inline-block -ml-1" /></span>;
    }
    return sortConfig.direction === 'ascending' ? <ArrowUpIcon className="h-4 w-4 inline-block" /> : <ArrowDownIcon className="h-4 w-4 inline-block" />;
  };

  const getRiskIcon = (risk?: 'Low' | 'Medium' | 'High' | 'Unknown') => {
    switch (risk) {
      case 'Low': return <ShieldCheckIcon className="h-5 w-5 text-green-400 inline-block mr-1" title="Low Risk"/>;
      case 'Medium': return <ShieldCheckIcon className="h-5 w-5 text-yellow-400 inline-block mr-1" title="Medium Risk"/>;
      case 'High': return <ShieldExclamationIcon className="h-5 w-5 text-red-400 inline-block mr-1" title="High Risk"/>;
      default: return <ShieldExclamationIcon className="h-5 w-5 text-gray-500 inline-block mr-1" title="Unknown Risk"/>;
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-500"></div>
        <p className="ml-4 text-xl text-gray-300">Loading Allocation Data...</p>
      </div>
    );
  }

  if (error) {
    return <div className="text-center text-red-400 text-xl p-8">{error}</div>;
  }
  
  if (!isLoggedIn && !loading) {
     return <div className="text-center text-yellow-400 text-xl p-8">Please sign in to access allocation data.</div>;
  }

  const totalPortfolioValueExcludingCash = assets.reduce((sum, asset) => sum + asset.value, 0);

  const tableHeaders: { label: string; key: SortableAssetKeys | string; sortable: boolean; align?: string, minWidth?: string }[] = [
    { label: 'Asset Name (Symbol)', key: 'name', sortable: true, minWidth: '200px' },
    { label: 'Category', key: 'category', sortable: true, minWidth: '120px' },
    { label: 'Region', key: 'region', sortable: true, minWidth: '120px' },
    { label: 'Risk (Est.)', key: 'qualitativeRisk', sortable: true, minWidth: '100px' },
    { label: 'Quantity', key: 'quantity', sortable: true, align: 'text-right', minWidth: '100px' },
    { label: 'Avg. Cost', key: 'averageCostPrice', sortable: true, align: 'text-right', minWidth: '120px' },
    { label: 'Total Value', key: 'value', sortable: true, align: 'text-right', minWidth: '130px' },
    { label: '% of Non-Cash', key: 'percentage', sortable: false, align: 'text-right', minWidth: '100px' },
  ];

  return (
    <div className="space-y-8">
      <div className="pb-6 border-b border-gray-700">
        <h1 className="text-4xl font-bold tracking-tight text-white">Asset Allocation</h1>
        <p className="mt-2 text-lg text-gray-400">Visualize your portfolio distribution and view detailed holdings from the backend.</p>
      </div>
      
      <SunburstChart assets={allAssetsForSunburst} />

      <div className="mt-8 p-6 bg-gray-800 rounded-xl shadow-2xl">
        <h2 className="text-2xl font-semibold text-white mb-4 flex items-center">
          <TableCellsIcon className="h-7 w-7 mr-2 text-indigo-400" />
          Current Portfolio Holdings (Excluding Cash with 0 value/quantity)
        </h2>
        {sortedAssets.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-750">
              <tr>
                {tableHeaders.map(col => (
                    <th 
                        key={col.key} 
                        scope="col" 
                        style={{minWidth: col.minWidth}}
                        className={`px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider ${col.sortable ? 'cursor-pointer hover:bg-gray-700' : ''} ${col.align || ''}`}
                        onClick={() => col.sortable && requestSort(col.key as SortableAssetKeys)}
                    >
                      {col.label} {col.sortable && getSortIcon(col.key as SortableAssetKeys)}
                    </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {sortedAssets.map((asset) => (
                <tr key={asset.id} className="hover:bg-gray-750 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-white">{asset.name} ({asset.symbol || 'N/A'})</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">{asset.category}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">{asset.region}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300 flex items-center">
                    {getRiskIcon(asset.qualitativeRisk)}
                    {asset.qualitativeRisk || 'Unknown'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300 text-right">{asset.quantity?.toLocaleString() || '-'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300 text-right">
                    {asset.averageCostPrice != null ? asset.averageCostPrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : 'N/A'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300 text-right">{asset.value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} {asset.currency}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300 text-right">
                    {totalPortfolioValueExcludingCash > 0 ? ((asset.value / totalPortfolioValueExcludingCash) * 100).toFixed(2) : '0.00'}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-500 mt-2">Note: 'Avg. Cost' is 'N/A' as it's not provided by the current backend summary. Risk is an estimate.</p>
        </div>
        ) : (
          <p className="text-gray-400 p-4 text-center">No non-cash assets with quantity/value to display in holdings table. Data is sourced from the backend.</p>
        )}
      </div>

       <div className="mt-8 p-6 bg-gray-800 rounded-xl shadow-2xl">
        <h2 className="text-2xl font-semibold text-white mb-4 flex items-center">
          <DocumentMagnifyingGlassIcon className="h-7 w-7 mr-2 text-indigo-400" />
          Advanced Risk & Factor Views (Placeholder)
        </h2>
        <p className="text-gray-400">
          This section is a placeholder for future enhancements.
        </p>
        <div className="mt-6 h-40 bg-gray-700 rounded-lg flex items-center justify-center">
          <p className="text-gray-500 text-lg">Advanced Risk Analytics Coming Soon</p>
        </div>
      </div>

    </div>
  );
};

export default function AllocationPageWithBoundary() {
  return (
    <ErrorBoundary>
      <AllocationPage />
    </ErrorBoundary>
  );
}
