import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Asset } from '../types';

interface SunburstChartProps {
  assets: Asset[];
  grouping?: 'overall' | 'quoteType';
  onEditCategory?: undefined;
}

const CATEGORY_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82Ca9D', '#FF5733', '#C70039', '#900C3F', '#581845'];

const getTotals = (assets: Asset[], grouping: 'overall' | 'quoteType') => {
  if (grouping === 'overall') {
    // For overall, each asset is a slice (not a single group)
    return assets.map(asset => ({
      group: asset.name || asset.symbol || asset.id,
      value: asset.value,
      assetIds: [asset.id],
    }));
  } else {
    // For quoteType, group by asset.name (which is quoteType in this case)
    const totals: Record<string, { value: number; assetIds: string[] }> = {};
    assets.forEach(asset => {
      const group = asset.name || asset.symbol || asset.id || 'Unknown';
      if (!totals[group]) {
        totals[group] = { value: 0, assetIds: [] };
      }
      totals[group].value += asset.value;
      totals[group].assetIds.push(asset.id);
    });
    return Object.entries(totals).map(([group, { value, assetIds }]) => ({ group, value, assetIds }));
  }
};

const SunburstChart: React.FC<SunburstChartProps> = ({ assets, grouping = 'overall' }) => {
  const chartAssets = assets.filter(asset => asset.value > 0);
  const data = getTotals(chartAssets, grouping);
  const totalValue = chartAssets.reduce((sum, asset) => sum + asset.value, 0);

  if (!chartAssets || chartAssets.length === 0 || data.length === 0) {
    return <p className="text-center text-gray-400 py-10">No asset data available for chart. Please upload movements.</p>;
  }

  return (
    <div className="bg-gray-800 p-6 rounded-xl shadow-2xl">
      <h3 className="text-xl font-semibold text-white mb-4">
        Asset Allocation {grouping === 'overall' ? '' : 'by Quote Type'}
      </h3>
      <ResponsiveContainer width="100%" height={350}>
        <PieChart>
          <Tooltip
            formatter={(value: number, name: string) => {
              const percentage = totalValue > 0 ? ((value / totalValue) * 100).toFixed(2) : 0;
              return [`${value.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})} (${percentage}%)`, name];
            }}
            contentStyle={{ backgroundColor: 'rgba(31, 41, 55, 0.9)', border: '1px solid #4B5563', borderRadius: '0.5rem' }}
            labelStyle={{ color: '#E5E7EB' }}
            itemStyle={{ color: '#E5E7EB' }}
          />
          <Pie
            data={data}
            dataKey="value"
            nameKey="group"
            cx="50%"
            cy="50%"
            outerRadius="80%"
            fill="#8884d8"
            label={({ group, percent }) => percent > 0.03 ? `${group} (${(percent * 100).toFixed(0)}%)` : ''}
          >
            {data.map((_, index) => (
              <Cell key={`cell-group-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SunburstChart;