import React from 'react';

interface ProjectOverviewProps {
  performanceDerived: any;
  maskPortfolioValue: boolean;
  returnsKpis: any;
  kpis?: any;
}

const ProjectOverview: React.FC<ProjectOverviewProps> = ({ performanceDerived, maskPortfolioValue, returnsKpis, kpis }) => {
  const pctFromFirst: number | null = React.useMemo(() => {
    const first = performanceDerived?.firstAbs;
    const latest = performanceDerived?.latestAbs;
    if (typeof first === 'number' && typeof latest === 'number' && first !== 0) {
      return ((latest - first) / first) * 100;
    }
    return null;
  }, [performanceDerived]);

  // Prefer KPI-provided net_performance if available (from /api/portfolio/<name>/kpis)
  const netPerformanceFromKpis: number | null = React.useMemo(() => {
    const np = kpis?.net_performance;
    if (typeof np === 'number') return np;
    return null;
  }, [kpis]);

  // Final performance to display: prefer netPerformanceFromKpis, fallback to pctFromFirst
  const displayPerformance: number | null = React.useMemo(() => {
    if (netPerformanceFromKpis !== null) return netPerformanceFromKpis;
    return pctFromFirst;
  }, [netPerformanceFromKpis, pctFromFirst]);

  return (
    <div className="lg:col-span-2">
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-white">Portfolio Overview</h2>
            <div className="text-xs text-slate-400 mt-1">
              Performance portfolio {displayPerformance !== null ? `(${displayPerformance >= 0 ? '+' : ''}${displayPerformance.toFixed(2)}%)` : ''}
            </div>
          </div>
          <div className="text-xs text-slate-400 bg-slate-800/50 px-3 py-1 rounded-full">
            Last Updated: {new Date().toLocaleDateString()}
          </div>
        </div>

        <div className="space-y-6">
          <div className="border-b border-white/10 pb-4">
            <div className="flex items-center justify-between">
              <span className="text-slate-300 text-sm font-medium">Total Portfolio Value</span>
              <div className="text-right">
                <div className="text-2xl font-bold text-white">
                  {maskPortfolioValue ? '••••••••' : (
                    performanceDerived.latestAbs !== null
                      ? `$${performanceDerived.latestAbs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : 'N/A'
                  )}
                </div>
                {/* Show Net performance % (total net value) - prefer KPI values if available */}
                { (displayPerformance !== null || performanceDerived?.latestNet !== null || kpis?.net_pl !== undefined) && (
                  <div className="mt-1 text-sm">
                    {displayPerformance !== null ? (
                      <span className={`font-semibold ${displayPerformance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {displayPerformance >= 0 ? '+' : ''}{displayPerformance.toFixed(2)}%
                      </span>
                    ) : null}

                    {/* Net value: prefer kpis.net_pl then performanceDerived.latestNet */}
                    {(() => {
                      const netVal = (typeof kpis?.net_pl === 'number') ? kpis.net_pl : (typeof performanceDerived?.latestNet === 'number' ? performanceDerived.latestNet : null);
                      if (netVal === null) return null;
                      const formatted = netVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                      return (
                        <span className="text-slate-300 ml-3">({maskPortfolioValue ? '••••••' : `${netVal >= 0 ? '+' : ''}$${formatted}`})</span>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {returnsKpis && Object.entries(returnsKpis).slice(0, 4).map(([period, data]: [string, any]) => {
              const returnPct = data?.portfolio?.return_pct;
              if (typeof returnPct !== 'number') return null;

              return (
                <div key={period} className="bg-white/5 rounded-lg p-3">
                  <div className="text-xs text-slate-400 uppercase tracking-wide">
                    {period.replace('_', ' ')}
                  </div>
                  <div className={`text-lg font-bold ${returnPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%
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

export default ProjectOverview;
