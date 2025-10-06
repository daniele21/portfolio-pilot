import React from 'react';
import { Kpi, TrafficLightStatus } from '../types';


interface KpiCardProps {
  kpi: Kpi;
  small?: boolean;
  maskPortfolioValue?: boolean;
  onToggleMaskPortfolioValue?: () => void;
  /** Optional color override for the card background (e.g., 'green', 'red') */
  color?: string;
}

const KpiCard: React.FC<KpiCardProps> = React.memo(({ kpi, small, maskPortfolioValue, onToggleMaskPortfolioValue, color }) => {
  // Professional color schemes with subtle gradients and refined palette
  const COLOR_SCHEMES: Record<string, { bg: string; text: string; accent: string; dot: string }> = {
    green: { 
      bg: 'bg-gradient-to-br from-emerald-500 to-emerald-600', 
      text: 'text-white', 
      accent: 'text-emerald-100',
      dot: 'bg-emerald-200'
    },
    red: { 
      bg: 'bg-gradient-to-br from-rose-500 to-rose-600', 
      text: 'text-white', 
      accent: 'text-rose-100',
      dot: 'bg-rose-200'
    },
    indigo: { 
      bg: 'bg-gradient-to-br from-indigo-500 to-indigo-600', 
      text: 'text-white', 
      accent: 'text-indigo-100',
      dot: 'bg-indigo-200'
    },
    gray: { 
      bg: 'bg-gradient-to-br from-slate-700 to-slate-800', 
      text: 'text-white', 
      accent: 'text-slate-200',
      dot: 'bg-slate-300'
    },
    yellow: { 
      bg: 'bg-gradient-to-br from-amber-400 to-amber-500', 
      text: 'text-slate-900', 
      accent: 'text-amber-900',
      dot: 'bg-amber-800'
    },
    blue: { 
      bg: 'bg-gradient-to-br from-blue-500 to-blue-600', 
      text: 'text-white', 
      accent: 'text-blue-100',
      dot: 'bg-blue-200'
    }
  };

  // Default professional scheme
  const DEFAULT_SCHEME = { 
    bg: 'bg-gradient-to-br from-slate-700 to-slate-800', 
    text: 'text-white', 
    accent: 'text-slate-200',
    dot: 'bg-slate-300'
  };

  // Get color scheme based on color override or status
  const colorScheme = color ? (COLOR_SCHEMES[color] || DEFAULT_SCHEME) : 
    (kpi.status === TrafficLightStatus.GREEN ? COLOR_SCHEMES.green :
     kpi.status === TrafficLightStatus.RED ? COLOR_SCHEMES.red :
     DEFAULT_SCHEME);

  const bgColor = colorScheme.bg;
  const textColor = colorScheme.text;
  const accentColor = colorScheme.accent;
  const dotColor = colorScheme.dot;
  
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
    <div
      role="group"
      aria-label={kpi.name}
      className={`rounded-xl shadow-md shadow-black/10 backdrop-blur-sm border border-white/10
                  transform transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-black/15
                  focus-within:-translate-y-1 focus-within:shadow-lg focus-within:ring-2 focus-within:ring-white/20
                  flex flex-col justify-between overflow-hidden
                  ${small ? 'p-2.5 min-h-[80px] max-h-[90px]' : 'p-3.5 min-h-[100px] max-h-[120px]'} ${bgColor}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {/* refined status indicator */}
            <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${dotColor} shadow-sm`} />
            <h3 className={`font-medium tracking-tight truncate ${textColor} ${small ? 'text-xs' : 'text-sm'}`}>
              {kpi.name}
            </h3>
          </div>
          {kpi.description && (
            <p className={`truncate mt-1 ${accentColor} text-xs leading-tight opacity-80`}>
              {kpi.description}
            </p>
          )}
        </div>

        {/* Icon with subtle styling */}
        {ResolvedIconComponent && typeof ResolvedIconComponent === 'function' ? (
          <div className="flex-shrink-0 ml-2">
            <div className="p-1 rounded-md bg-white/10 backdrop-blur-sm">
              <ResolvedIconComponent 
                className={`${textColor} opacity-90 ${small ? 'h-3 w-3' : 'h-4 w-4'}`} 
                aria-hidden 
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className={`font-bold tabular-nums ${textColor} ${small ? 'text-lg' : 'text-xl'} leading-none tracking-tight`}>
            {/* Mask value for portfolio_value if maskPortfolioValue is true */}
            {kpi.id === 'portfolio_value' && maskPortfolioValue
              ? '••••••'
              : (typeof kpi.value === 'number'
                  ? new Intl.NumberFormat(undefined, { 
                      minimumFractionDigits: 0, 
                      maximumFractionDigits: 2,
                      notation: Math.abs(kpi.value) >= 1000000 ? 'compact' : 'standard',
                      compactDisplay: 'short'
                    }).format(kpi.value)
                  : kpi.value)}
          </p>
          {kpi.unit && (
            <span className={`block ${accentColor} ${small ? 'text-xs' : 'text-xs'} mt-0.5 font-medium`}>
              {kpi.unit}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mt-2">
        <div className="flex-1">
          {kpi.target && (
            <p className={`text-xs ${accentColor} font-medium opacity-80`}>
              Target: <span className={`${textColor}`}>{kpi.target}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Compact mask toggle button */}
          {kpi.id === 'portfolio_value' && typeof onToggleMaskPortfolioValue === 'function' && (
            <button
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/10 backdrop-blur-sm
                         text-white text-xs font-medium
                         hover:bg-white/20 hover:scale-105 active:scale-95
                         focus:outline-none focus:ring-1 focus:ring-white/30
                         transition-all duration-200 shadow-sm"
              onClick={onToggleMaskPortfolioValue}
              aria-pressed={maskPortfolioValue}
              aria-label={maskPortfolioValue ? 'Show portfolio value' : 'Hide portfolio value'}
              title={maskPortfolioValue ? 'Show portfolio value' : 'Hide portfolio value'}
              type="button"
            >
              <span className="text-xs">👁</span>
              {maskPortfolioValue ? 'Show' : 'Hide'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

export default KpiCard;
