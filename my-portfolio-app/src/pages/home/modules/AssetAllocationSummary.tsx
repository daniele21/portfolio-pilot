import React from 'react';
import SunburstChart from '../../../components/SunburstChart';

interface AssetAllocationSummaryProps {
  allocationAssets: any[];
  allocationView: 'overall' | 'asset_type' | 'category' | 'risk';
  setAllocationView: (v: 'overall' | 'asset_type' | 'category' | 'risk') => void;
}

const AssetAllocationSummary: React.FC<AssetAllocationSummaryProps> = ({ 
  allocationAssets, 
  allocationView, 
  setAllocationView 
}) => {
  // Sort assets by allocation percentage in descending order
  const sortedAssets = [...allocationAssets].sort((a, b) => (b.allocation_pct || 0) - (a.allocation_pct || 0));
  const topAssets = sortedAssets.slice(0, 6);
  const totalValue = allocationAssets.reduce((sum, asset) => sum + (asset.value || 0), 0);

  const colorPalette = [
    'from-emerald-400 to-emerald-600',
    'from-blue-400 to-blue-600',
    'from-purple-400 to-purple-600',
    'from-amber-400 to-amber-600',
    'from-rose-400 to-rose-600',
    'from-cyan-400 to-cyan-600'
  ];

  return (
    <div className="bg-white/8 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow duration-300">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Asset Allocation</h2>
        <div>
          <label htmlFor="allocation-select-header" className="sr-only">Allocation grouping</label>
          <select
            id="allocation-select-header"
            value={allocationView}
            onChange={(e) => setAllocationView(e.target.value as 'overall' | 'asset_type' | 'category' | 'risk')}
            className="bg-gray-800 text-sm text-white px-3 py-1 rounded-md border border-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            aria-label="Select allocation grouping"
          >
            <option value="overall">By Asset</option>
            <option value="asset_type">By Type</option>
            <option value="category">By Category</option>
            <option value="risk">By Risk</option>
          </select>
        </div>
      </div>
      
      {totalValue > 0 ? (
        <>
          <div className="space-y-4 mb-6">
            {topAssets.map((asset, index) => {
              const percentage = asset.allocation_pct || 0;
              const value = asset.value || 0;
              
              return (
                <div key={asset.id} className="group">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-3">
                      <div className={`w-4 h-4 rounded-full bg-gradient-to-r ${colorPalette[index % colorPalette.length]} shadow-sm`} />
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-white group-hover:text-slate-200 transition-colors">
                          {asset.symbol}
                        </span>
                        <span className="text-xs text-slate-400">
                          ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-white">
                        {percentage.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                  
                  {/* Progress bar */}
                  <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full bg-gradient-to-r ${colorPalette[index % colorPalette.length]} transition-all duration-700 ease-out`}
                      style={{ width: `${Math.max(percentage, 2)}%` }}
                    />
                  </div>
                </div>
              );
            })}
            
            {allocationAssets.length > 6 && (
              <div className="text-center pt-2">
                <span className="text-xs text-slate-400">
                  +{allocationAssets.length - 6} more assets
                </span>
              </div>
            )}
          </div>
          
          <div className="border-t border-white/10 pt-6">
            <div className="flex items-center justify-between mb-4 gap-4">
              <div />
              <div className="text-xs text-slate-400">Total: ${totalValue.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</div>
            </div>

            {/* <div className="bg-gray-800 rounded-xl p-4">
              <SunburstChart assets={allocationAssets} grouping={allocationView} />
            </div> */}
          </div>
        </>
      ) : (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 bg-white/10 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" 
              />
            </svg>
          </div>
          <p className="text-slate-300 font-medium mb-2">No allocation data available</p>
          <p className="text-sm text-slate-400">
            Add some assets to your portfolio to see the allocation breakdown
          </p>
        </div>
      )}
    </div>
  );
};

export default AssetAllocationSummary;
