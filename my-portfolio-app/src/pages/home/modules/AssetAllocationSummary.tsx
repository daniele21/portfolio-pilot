import React from 'react';
import AllocationPanel from '../components/AllocationPanel';

interface AssetAllocationSummaryProps {
  allocationAssets: any[];
  allocationView: 'overall' | 'quoteType';
  setAllocationView: (v: 'overall' | 'quoteType') => void;
}

const AssetAllocationSummary: React.FC<AssetAllocationSummaryProps> = ({ allocationAssets, allocationView, setAllocationView }) => {
  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
      <h2 className="text-lg font-semibold text-white mb-6">Asset Allocation</h2>
      <div className="space-y-3">
        {allocationAssets.slice(0, 5).map((asset, index) => (
          <div key={asset.id} className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`w-3 h-3 rounded-full bg-gradient-to-r ${
                ['from-blue-400 to-blue-600', 'from-green-400 to-green-600', 'from-yellow-400 to-yellow-600', 'from-red-400 to-red-600', 'from-purple-400 to-purple-600'][index % 5]
              }`} />
              <span className="text-sm font-medium text-white">{asset.symbol}</span>
            </div>
            <span className="text-sm text-slate-300">{asset.allocation_pct?.toFixed(1)}%</span>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t border-white/10">
        <AllocationPanel assets={allocationAssets} grouping={allocationView} setGrouping={setAllocationView} />
      </div>
    </div>
  );
};

export default AssetAllocationSummary;
