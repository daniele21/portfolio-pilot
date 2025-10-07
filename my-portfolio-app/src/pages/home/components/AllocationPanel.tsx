import React from 'react';
import CollapsibleSection from '../../../components/CollapsibleComponent';
import SunburstChart from '../../../components/SunburstChart';

type Props = {
  assets: any[];
  grouping: 'overall' | 'asset_type';
  setGrouping: (g: 'overall' | 'asset_type') => void;
};

const AllocationPanel: React.FC<Props> = ({ assets, grouping, setGrouping }) => {
  return (
    <CollapsibleSection key="allocation" title="Detailed Allocation View" defaultOpen={true}>
      <div className="mb-6">
        <div className="flex items-center gap-1 mb-3">
          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span className="text-sm font-medium text-slate-200">View Mode</span>
        </div>
        
        <div className="flex gap-4">
          <label className="flex items-center text-slate-300 text-sm cursor-pointer group hover:text-white transition-colors">
            <div className="relative">
              <input
                type="radio"
                checked={grouping === 'overall'}
                onChange={() => setGrouping('overall')}
                className="sr-only"
              />
              <div className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                grouping === 'overall' 
                  ? 'border-emerald-400 bg-emerald-400' 
                  : 'border-slate-400 group-hover:border-slate-300'
              }`}>
                {grouping === 'overall' && (
                  <div className="w-2 h-2 bg-white rounded-full absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
                )}
              </div>
            </div>
            <span className="ml-3 font-medium">By Individual Asset</span>
          </label>
          
          <label className="flex items-center text-slate-300 text-sm cursor-pointer group hover:text-white transition-colors">
            <div className="relative">
              <input
                type="radio"
                checked={grouping === 'asset_type'}
                onChange={() => setGrouping('asset_type')}
                className="sr-only"
              />
              <div className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                grouping === 'asset_type' 
                  ? 'border-emerald-400 bg-emerald-400' 
                  : 'border-slate-400 group-hover:border-slate-300'
              }`}>
                {grouping === 'asset_type' && (
                  <div className="w-2 h-2 bg-white rounded-full absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
                )}
              </div>
            </div>
            <span className="ml-3 font-medium">By Asset Category</span>
          </label>
        </div>
      </div>
      
      <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
        {assets.length > 0 ? (
          <SunburstChart assets={assets} grouping={grouping} onEditCategory={undefined} />
        ) : (
          <div className="text-center py-16">
            <div className="w-20 h-20 mx-auto mb-4 bg-white/10 rounded-full flex items-center justify-center">
              <svg className="w-10 h-10 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" 
                />
              </svg>
            </div>
            <p className="text-slate-300 font-semibold mb-2">No allocation data available</p>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              Start by adding some assets to your portfolio to see a detailed breakdown of your allocation distribution.
            </p>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
};

export default AllocationPanel;
