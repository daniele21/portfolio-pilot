import React from 'react';
import CollapsibleSection from '../../../components/CollapsibleComponent';
import SunburstChart from '../../../components/SunburstChart';

type Props = {
  assets: any[];
  grouping: 'overall' | 'quoteType';
  setGrouping: (g: 'overall' | 'quoteType') => void;
};

const AllocationPanel: React.FC<Props> = ({ assets, grouping, setGrouping }) => {
  return (
    <CollapsibleSection key="allocation" title="Asset Allocation" defaultOpen={true}>
      <div className="flex gap-6 mb-4">
        <label className="flex items-center text-gray-300 text-sm cursor-pointer">
          <input
            type="radio"
            checked={grouping === 'overall'}
            onChange={() => setGrouping('overall')}
            className="form-radio h-4 w-4 text-indigo-600 mr-1"
          />
          By Asset
        </label>
        <label className="flex items-center text-gray-300 text-sm cursor-pointer">
          <input
            type="radio"
            checked={grouping === 'quoteType'}
            onChange={() => setGrouping('quoteType')}
            className="form-radio h-4 w-4 text-indigo-600 mr-1"
          />
          By Asset Type
        </label>
      </div>
      {assets.length > 0 ? (
        <SunburstChart assets={assets} grouping={grouping} onEditCategory={undefined} />
      ) : (
        <div className="text-center text-gray-400 py-8">No allocation data available for this portfolio.</div>
      )}
    </CollapsibleSection>
  );
};

export default AllocationPanel;
