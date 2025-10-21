import React from 'react';

interface AssetAllocationSummaryProps {
  allocationAssets: any[];
  allocationView: 'overall' | 'asset_type' | 'category' | 'risk';
  setAllocationView: (v: 'overall' | 'asset_type' | 'category' | 'risk') => void;
  targets?: Record<string, Record<string, number>>;
}

const AssetAllocationSummary: React.FC<AssetAllocationSummaryProps> = ({ 
  allocationAssets, 
  allocationView, 
  setAllocationView,
  targets
}) => {
  // Sort assets by allocation percentage in descending order
  const sortedAssets = [...allocationAssets].sort((a, b) => (b.allocation_pct || 0) - (a.allocation_pct || 0));
  const totalValue = allocationAssets.reduce((sum, asset) => sum + (asset.value || 0), 0);

  const colorPalette = [
    'from-emerald-400 to-emerald-600',
    'from-blue-400 to-blue-600',
    'from-purple-400 to-purple-600',
    'from-amber-400 to-amber-600',
    'from-rose-400 to-rose-600',
    'from-cyan-400 to-cyan-600'
  ];

  // Determine relevant target map based on view (only for grouped views asset_type or risk)
  const activeTargetMap: Record<string, number> | null = React.useMemo(() => {
    if (!targets) return null;
    if (allocationView === 'asset_type' && targets.asset_type) return targets.asset_type;
    if (allocationView === 'risk' && targets.risk) return targets.risk;
    return null;
  }, [targets, allocationView]);

  const showTargets = !!activeTargetMap && allocationView !== 'overall' && (Object.keys(activeTargetMap).length > 0);

  return (
  <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-4 sm:p-6 shadow-lg hover:shadow-xl transition-all duration-300 h-full flex flex-col max-h-[547px]">
      {/* Compact Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3 sm:gap-0">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 bg-gradient-to-b from-emerald-400 to-emerald-600 rounded-full"></div>
          <h2 className="text-lg sm:text-xl font-bold text-white">Asset Allocation</h2>
        </div>
        
        <div className="flex items-center gap-2">
          {/* <label htmlFor="allocation-select-header" className="text-xs text-slate-400 hidden sm:inline">View:</label> */}
          <select
            id="allocation-select-header"
            value={allocationView}
            onChange={(e) => setAllocationView(e.target.value as 'overall' | 'asset_type' | 'category' | 'risk')}
            className="bg-slate-800/60 border border-white/20 text-white px-2 py-1 rounded-md text-xs w-24 sm:w-28 leading-tight focus:outline-none focus:ring-1 focus:ring-emerald-500"
            aria-label="Select allocation grouping"
          >
            <option value="overall">Assets</option>
            <option value="asset_type">Types</option>
            <option value="category">Categories</option>
            <option value="risk">Risk</option>
          </select>
        </div>
      </div>
      {/* Content area: make scrollable when long */}
      {showTargets && (
        <div className="mb-3 bg-slate-800/40 rounded-lg p-3 border border-white/10">
          <div className="flex items-center justify-center gap-4 text-xs">
            <span className="inline-flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-emerald-500/80" /> 
              <span className="text-slate-300">Current</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-amber-400/80" /> 
              <span className="text-slate-300">Target</span>
            </span>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto pr-2">
      {totalValue > 0 ? (
        <>
          <div className="space-y-4 mb-4">
            {sortedAssets.map((asset, index) => {
              const percentage = asset.allocation_pct || 0;
              const value = asset.value || 0;
              const targetPct = activeTargetMap ? (activeTargetMap[asset.symbol] ?? activeTargetMap[asset.name] ?? activeTargetMap[asset.id] ?? null) : null;
              const diff = targetPct != null ? (percentage - targetPct) : null;
              // Color logic: within ±5% -> white (neutral), beyond ±5% -> red (alert)
              const diffClass = diff != null
                ? (Math.abs(diff) <= 5 ? 'text-emerald-400' : 'text-rose-400')
                : '';
              
              return (
                <div key={asset.id} className="bg-white/5 hover:bg-white/10 rounded-lg p-4 border border-white/10 hover:border-white/20 transition-all duration-200">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full bg-gradient-to-r ${colorPalette[index % colorPalette.length]}`} />
                      <div>
                        <div className="text-base font-bold text-white">
                          {asset.name || asset.symbol}
                        </div>
                        <div className="text-xs text-slate-400">
                          ${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-white">
                        {percentage.toFixed(1)}%
                      </div>
                      {targetPct != null && (
                        <div className="flex items-center gap-1 justify-end">
                          <span className="text-xs text-slate-400">→ {targetPct.toFixed(1)}%</span>
                          {diff != null && Math.abs(diff) >= 0.1 && (
                            <span className={`text-xs font-semibold px-1 py-0.5 rounded ${diffClass} ${
                              Math.abs(diff) <= 5 ? 'bg-emerald-500/20' : 'bg-rose-500/20'
                            }`}>
                              {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Compact Progress bar */}
                  {showTargets && targetPct != null ? (
                    <div className="relative h-3 bg-white/10 rounded-full overflow-hidden">
                      {/* Current allocation bar */}
                      <div
                        className={`absolute left-0 top-0 h-full bg-gradient-to-r ${colorPalette[index % colorPalette.length]} transition-all duration-700 ease-out`}
                        style={{ width: `${Math.min(Math.max(percentage, 0), 100)}%` }}
                      />
                      {/* Target marker line */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-amber-300"
                        style={{ left: `${Math.min(Math.max(targetPct, 0), 100)}%` }}
                      />
                    </div>
                  ) : (
                    <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full bg-gradient-to-r ${colorPalette[index % colorPalette.length]} transition-all duration-700 ease-out`}
                        style={{ width: `${Math.max(percentage, 2)}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
            
            {/* all assets are shown in the scrollable list */}
          </div>
        </>
      ) : (
        <div className="text-center py-8">
          <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-slate-700/50 to-slate-800/50 rounded-2xl flex items-center justify-center border border-white/10">
            <svg className="w-10 h-10 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} 
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" 
              />
            </svg>
          </div>
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-white">No allocation data available</h3>
            <p className="text-slate-400 max-w-md mx-auto leading-relaxed">
              Start building your portfolio by adding assets to see a detailed allocation breakdown and analysis.
            </p>
            <div className="inline-flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 px-4 py-2 rounded-full border border-emerald-500/20">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
              Ready to track your investments
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Compact Summary Footer (fixed) */}
      {/* <div className="mt-4 border-t border-white/10 pt-4">
        <div className="bg-gradient-to-r from-slate-800/50 to-slate-700/30 rounded-lg p-4 border border-white/10">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400">Total Value</div>
              <div className="text-xl font-bold text-white">
                ${totalValue.toLocaleString(undefined, {minimumFractionDigits:0, maximumFractionDigits:0})}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400">Shown</div>
              <div className="text-lg font-bold text-emerald-400">
                {Math.min(allocationAssets.length, 6)}/{allocationAssets.length}
              </div>
            </div>
          </div>
        </div>
      </div> */}
    </div>
  );
};

export default AssetAllocationSummary;
