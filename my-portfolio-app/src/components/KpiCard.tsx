import React from 'react';
import { Kpi, TrafficLightStatus } from '../types';
import { TRAFFIC_LIGHT_COLORS, TRAFFIC_LIGHT_TEXT_COLORS } from '../constants';

interface KpiCardProps {
  kpi: Kpi;
  small?: boolean;
  maskPortfolioValue?: boolean;
  onToggleMaskPortfolioValue?: () => void;
  /** Optional color override for the card background (e.g., 'green', 'red') */
  color?: string;
}

const KpiCard: React.FC<KpiCardProps> = React.memo(({ kpi, small, maskPortfolioValue, onToggleMaskPortfolioValue, color }) => {
  // Use color override if provided, otherwise use traffic light color
  const bgColor = color
    ? `bg-${color}-600`
    : TRAFFIC_LIGHT_COLORS[kpi.status] || TRAFFIC_LIGHT_COLORS[TrafficLightStatus.NEUTRAL];
  const textColor = color
    ? 'text-white'
    : TRAFFIC_LIGHT_TEXT_COLORS[kpi.status] || TRAFFIC_LIGHT_TEXT_COLORS[TrafficLightStatus.NEUTRAL];
  
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
    <div className={`rounded-xl shadow-lg transition-transform hover:scale-105
                  flex flex-col justify-between items-center
                  ${small ? 'p-3 min-h-[100px] w-full h-[110px]' : 'p-6 min-h-[180px]'}
                  ${bgColor}`}>
      <div className="flex flex-col items-center w-full">
        <div className="flex items-center justify-between w-full">
          <div className="flex flex-col items-center gap-2 w-full">
            <h3 className={`font-semibold ${textColor} ${small ? 'text-base' : 'text-xl'} text-center`}>{kpi.name}</h3>
            {/* Mask toggle button only for portfolio value KPI, next to the title */}
            {kpi.id === 'portfolio_value' && typeof onToggleMaskPortfolioValue === 'function' && (
              <button
                className="ml-1 px-2 py-1 rounded bg-gray-600 text-white text-xs font-semibold hover:bg-gray-500 border border-gray-500"
                onClick={onToggleMaskPortfolioValue}
                aria-label={maskPortfolioValue ? 'Show portfolio value' : 'Hide portfolio value'}
                title={maskPortfolioValue ? 'Show portfolio value' : 'Hide portfolio value'}
                type="button"
              >
                {maskPortfolioValue ? 'Show' : 'Hide'}
              </button>
            )}
          </div>
          {/* Render the icon only if ResolvedIconComponent is a function */}
          {ResolvedIconComponent && typeof ResolvedIconComponent === 'function' ? (
            <ResolvedIconComponent className={`${textColor} opacity-70 ${small ? 'h-5 w-5' : 'h-8 w-8'}`} />
          ) : null}
        </div>
      </div>
      <div className="flex flex-col items-center gap-2 w-full">
        <p className={`font-bold ${textColor} ${small ? 'text-2xl' : 'text-4xl'} text-center`}>
          {/* Mask value for portfolio_value if maskPortfolioValue is true */}
          {kpi.id === 'portfolio_value' && maskPortfolioValue
            ? '**.***,**'
            : (typeof kpi.value === 'number' ? kpi.value.toLocaleString() : kpi.value)}
          {kpi.unit && <span className={`${small ? 'text-base' : 'text-2xl'} ml-1`}>{kpi.unit}</span>}
        </p>
      </div>
      {kpi.target && <p className={`text-sm mt-1 ${textColor} opacity-80 text-center`}>Target: {kpi.target}</p>}
      {kpi.description && <p className={`text-xs mt-2 ${textColor} opacity-70 text-center`}><strong>{kpi.description}</strong></p>}
    </div>
  );
});

export default KpiCard;
