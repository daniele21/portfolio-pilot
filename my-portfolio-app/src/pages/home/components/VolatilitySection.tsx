import React from 'react';
import CollapsibleSection from '../../../components/CollapsibleComponent';
import KpiCard from '../../../components/KpiCard';
import { ChartBarIcon } from '@heroicons/react/24/outline';
import { Kpi, TrafficLightStatus } from '../../../types';

interface Props {
  vol30?: number | null;
  vol90?: number | null;
  vol365?: number | null;
}

const VolatilitySection: React.FC<Props> = ({ vol30, vol90, vol365 }) => {
  const cards: Kpi[] = [];
  if (typeof vol30 === 'number') {
    cards.push({ id: 'vol_30', name: 'Volatility (30d)', value: vol30.toFixed(2) + '%', unit: '', status: TrafficLightStatus.NEUTRAL, icon: ChartBarIcon });
  }
  if (typeof vol90 === 'number') {
    cards.push({ id: 'vol_90', name: 'Volatility (90d)', value: vol90.toFixed(2) + '%', unit: '', status: TrafficLightStatus.NEUTRAL, icon: ChartBarIcon });
  }
  if (typeof vol365 === 'number') {
    cards.push({ id: 'vol_365', name: 'Volatility (1y)', value: vol365.toFixed(2) + '%', unit: '', status: TrafficLightStatus.NEUTRAL, icon: ChartBarIcon });
  }

  return (
    <CollapsibleSection title="Volatility">
      <div className="flex flex-row flex-wrap gap-6 justify-center items-center">
        {cards.map(c => (
          <KpiCard key={c.id} kpi={c} />
        ))}
      </div>
    </CollapsibleSection>
  );
};

export default VolatilitySection;
