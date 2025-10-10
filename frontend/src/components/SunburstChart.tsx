import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Asset } from '../types';

interface SunburstChartProps {
  assets: Asset[];
  grouping?: 'overall' | 'asset_type' | 'category' | 'risk';
  onEditCategory?: undefined;
}

const CATEGORY_COLORS = [
  '#10b981', // emerald-500
  '#3b82f6', // blue-500
  '#8b5cf6', // violet-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#06b6d4', // cyan-500
  '#84cc16', // lime-500
  '#ec4899', // pink-500
  '#6366f1', // indigo-500
  '#f97316'  // orange-500
];

const getTotals = (assets: Asset[], grouping: 'overall' | 'asset_type' | 'category' | 'risk') => {
  if (grouping === 'overall') {
    // For overall, each asset is a slice (not a single group)
    return assets.map(asset => ({
      group: asset.name || asset.symbol || asset.id,
      value: asset.value,
      assetIds: [asset.id],
    }));
  }

  const totals: Record<string, { value: number; assetIds: string[] }> = {};
  assets.forEach(asset => {
    let groupKey = 'Unknown';
    if (grouping === 'asset_type') {
      groupKey = (asset.asset_type as string) || asset.category || asset.name || asset.symbol || asset.id || 'Unknown';
    } else if (grouping === 'category') {
      groupKey = (asset.category as string) || (asset.asset_type as string) || 'Uncategorized';
    } else if (grouping === 'risk') {
      groupKey = (asset.risk as string) || 'Unknown';
    }
    if (!totals[groupKey]) totals[groupKey] = { value: 0, assetIds: [] };
    totals[groupKey].value += asset.value || 0;
    if (asset.id && !totals[groupKey].assetIds.includes(asset.id)) totals[groupKey].assetIds.push(asset.id);
  });
  return Object.entries(totals).map(([group, { value, assetIds }]) => ({ group, value, assetIds }));
};

const SunburstChart: React.FC<SunburstChartProps> = ({ assets, grouping = 'overall' }) => {
  const chartAssets = assets.filter(asset => asset.value > 0);
  const data = getTotals(chartAssets, grouping);
  const totalValue = chartAssets.reduce((sum, asset) => sum + asset.value, 0);

  if (!chartAssets || chartAssets.length === 0 || data.length === 0) {
    return <p className="text-center text-gray-400 py-10">No asset data available for chart. Please upload movements.</p>;
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      const percentage = totalValue > 0 ? ((data.value / totalValue) * 100).toFixed(1) : 0;
      return (
        <div className="bg-gray-900/95 backdrop-blur-sm border border-white/20 rounded-lg p-3 shadow-xl">
          <p className="text-white font-semibold text-sm mb-1">{data.name}</p>
          <p className="text-emerald-400 font-medium">
            ${data.value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
          </p>
          <p className="text-slate-300 text-xs">{percentage}% of portfolio</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-white">
          {grouping === 'overall' ? 'Asset Distribution' : 'Category Distribution'}
        </h3>
        <div className="text-sm text-slate-400">
          Total: ${totalValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
        </div>
      </div>
      
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1">
          <ResponsiveContainer width="100%" height={400}>
            <PieChart>
              <Tooltip content={<CustomTooltip />} />
              <Pie
                data={data}
                dataKey="value"
                nameKey="group"
                cx="50%"
                cy="50%"
                outerRadius="85%"
                innerRadius="40%"
                fill="#8884d8"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth={2}
                label={({ percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ''}
                labelLine={false}
              >
                {data.map((_, index) => (
                  <Cell 
                    key={`cell-group-${index}`} 
                    fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                    className="hover:opacity-80 transition-opacity cursor-pointer" 
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        
        {/* Legend */}
        <div className="lg:w-64">
          <h4 className="text-sm font-semibold text-slate-200 mb-3">Legend</h4>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {data.map((item, index) => {
              const percentage = totalValue > 0 ? ((item.value / totalValue) * 100).toFixed(1) : 0;
              return (
                <div key={item.group} className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors">
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <div 
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }}
                    />
                    <span className="text-sm text-white truncate font-medium">
                      {item.group}
                    </span>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <div className="text-xs font-medium text-slate-200">{percentage}%</div>
                    <div className="text-xs text-slate-400">
                      ${item.value.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SunburstChart;