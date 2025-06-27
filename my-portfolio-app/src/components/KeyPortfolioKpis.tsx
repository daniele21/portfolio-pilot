import React from 'react';
import CollapsibleSection from './CollapsibleComponent';
import KpiCard from '../components/KpiCard';
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
      <div className="flex flex-row flex-wrap gap-6 justify-center items-center">
        {kpis.map(kpi => (
          kpi.id === 'portfolio_value' ? (
            <KpiCard
              key={kpi.id}
              kpi={kpi}
              maskPortfolioValue={maskPortfolioValue}
              onToggleMaskPortfolioValue={onToggleMaskPortfolioValue}
              color={kpi.color}
            />
          ) : (
            <KpiCard key={kpi.id} kpi={kpi} color={kpi.color} />
          )
        ))}
      </div>
    </CollapsibleSection>
  );
};

export default KeyPortfolioKpis;
