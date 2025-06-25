import React from 'react';
import { Kpi, TrafficLightStatus } from '../types';
import { TRAFFIC_LIGHT_COLORS, TRAFFIC_LIGHT_TEXT_COLORS } from '../constants';

interface KpiCardProps {
  kpi: Kpi;
  small?: boolean;
}

const KpiCard: React.FC<KpiCardProps> = React.memo(({ kpi, small }) => {
  const bgColor = TRAFFIC_LIGHT_COLORS[kpi.status] || TRAFFIC_LIGHT_COLORS[TrafficLightStatus.NEUTRAL];
  const textColor = TRAFFIC_LIGHT_TEXT_COLORS[kpi.status] || TRAFFIC_LIGHT_TEXT_COLORS[TrafficLightStatus.NEUTRAL];
  
  const IconFromProp = kpi.icon;
  let ResolvedIconComponent: React.ElementType | undefined | null = null;

  if (IconFromProp) {
    // If IconFromProp is an object and has a 'default' property, use that.
    // This handles modules that might be imported as { default: Component }.
    if (typeof IconFromProp === 'object' && (IconFromProp as any).default) {
      ResolvedIconComponent = (IconFromProp as any).default;
    } else {
      ResolvedIconComponent = IconFromProp;
    }
  }

  return (
    <div className={`rounded-xl shadow-2xl transition-all duration-300 ease-in-out hover:scale-105 ${bgColor} flex flex-col justify-between ${small ? 'p-3 min-h-[100px] w-[140px] h-[110px]' : 'p-6 min-h-[180px]'}`}>
      <div className="flex items-center justify-between">
        <h3 className={`font-semibold ${textColor} ${small ? 'text-base' : 'text-xl'}`}>{kpi.name}</h3>
        {/* Render the icon only if ResolvedIconComponent is a function */}
        {ResolvedIconComponent && typeof ResolvedIconComponent === 'function' ? (
          <ResolvedIconComponent className={`${textColor} opacity-70 ${small ? 'h-5 w-5' : 'h-8 w-8'}`} />
        ) : null}
      </div>
      <div>
        <p className={`font-bold ${textColor} ${small ? 'text-2xl' : 'text-4xl'}`}>
          {typeof kpi.value === 'number' ? kpi.value.toLocaleString() : kpi.value}
          {kpi.unit && <span className={`${small ? 'text-base' : 'text-2xl'} ml-1`}>{kpi.unit}</span>}
        </p>
        {kpi.target && <p className={`text-sm mt-1 ${textColor} opacity-80`}>Target: {kpi.target}</p>}
      </div>
      {kpi.description && <p className={`text-xs mt-2 ${textColor} opacity-70`}>{kpi.description}</p>}
    </div>
  );
});

export default KpiCard;
