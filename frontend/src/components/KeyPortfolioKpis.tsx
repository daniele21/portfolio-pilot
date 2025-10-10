import React from 'react';
import CollapsibleSection from './CollapsibleComponent';
import KpiCard from './KpiCard';
import type { Kpi } from '../types';

export interface KeyPortfolioKpisProps {
  /** Array of KPI items to display */
  kpis: Kpi[];
  /** Whether to mask the portfolio value */
  maskPortfolioValue: boolean;
  /** Toggle handler for masking portfolio value */
  onToggleMaskPortfolioValue: () => void;
}

/**
 * Displays the "Key Portfolio KPIs" section inside a collapsible wrapper.
 */
const KeyPortfolioKpis: React.FC<KeyPortfolioKpisProps> = ({ kpis, maskPortfolioValue, onToggleMaskPortfolioValue }) => {
  return (
    <CollapsibleSection title="Key Portfolio KPIs">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {kpis.map(kpi => (
          kpi.id === 'portfolio_value' ? (
            <KpiCard
              key={kpi.id}
              kpi={kpi}
              maskPortfolioValue={maskPortfolioValue}
              onToggleMaskPortfolioValue={onToggleMaskPortfolioValue}
              color={kpi.color}
              small={true}
            />
          ) : (
            <KpiCard key={kpi.id} kpi={kpi} color={kpi.color} small={true} />
          )
        ))}
      </div>
    </CollapsibleSection>
  );
};

export default KeyPortfolioKpis;
