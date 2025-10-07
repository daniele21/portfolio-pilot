import React from 'react';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';

interface ProjectOverviewProps {
  performanceDerived: any;
  maskPortfolioValue: boolean;
  returnsKpis: any;
  kpis?: any;
  toggleMaskPortfolioValue: () => void;
}

const ProjectOverview: React.FC<ProjectOverviewProps> = ({ performanceDerived, maskPortfolioValue, returnsKpis, kpis, toggleMaskPortfolioValue }) => {
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
    <div className="h-full">
  <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 h-full max-h-[547px]">
        {/* Compact Header Section */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-1 h-5 bg-gradient-to-b from-blue-400 to-blue-600 rounded-full"></div>
            <h2 className="text-lg font-bold text-white">Portfolio Overview</h2>
            {displayPerformance !== null && (
              <span className={`text-sm font-semibold px-2 py-1 rounded-full ${
                displayPerformance >= 0 
                  ? 'bg-emerald-500/20 text-emerald-400' 
                  : 'bg-red-500/20 text-red-400'
              }`}>
                {displayPerformance >= 0 ? '+' : ''}{displayPerformance.toFixed(2)}%
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMaskPortfolioValue}
              aria-label={maskPortfolioValue ? 'Show values' : 'Hide values'}
              className="group p-2 rounded-lg bg-slate-800/60 hover:bg-slate-700/80 border border-white/10 hover:border-white/20 text-white transition-all duration-200">
              {maskPortfolioValue ? (
                <EyeIcon className="h-4 w-4 group-hover:text-blue-400 transition-colors" />
              ) : (
                <EyeSlashIcon className="h-4 w-4 group-hover:text-blue-400 transition-colors" />
              )}
            </button>

            <div className="text-xs text-slate-400 bg-slate-800/60 border border-white/10 px-2 py-1 rounded-lg">
              {new Date().toLocaleDateString()}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Compact Portfolio Value Section */}
          <div className="bg-gradient-to-r from-slate-800/50 to-slate-700/30 rounded-xl p-4 border border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Total Portfolio Value</div>
                <div className="text-3xl font-bold text-white">
                  {maskPortfolioValue ? '••••••••' : (
                    performanceDerived.latestAbs !== null
                      ? `$${performanceDerived.latestAbs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : 'N/A'
                  )}
                </div>
                {/* Compact Net Value Display */}
                {(() => {
                  const netVal = (typeof kpis?.net_pl === 'number') ? kpis.net_pl : (typeof performanceDerived?.latestNet === 'number' ? performanceDerived.latestNet : null);
                  if (netVal === null) return null;
                  const formatted = netVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                  return (
                    <div className="text-sm text-slate-400 mt-1">
                      P&L: <span className={`font-semibold ${netVal >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {maskPortfolioValue ? '••••••' : `${netVal >= 0 ? '+' : ''}$${formatted}`}
                      </span>
                    </div>
                  );
                })()}
              </div>
              
              {/* Compact Performance Badge */}
              {displayPerformance !== null && (
                <div className={`px-3 py-2 rounded-lg font-bold text-base ${
                  displayPerformance >= 0 
                    ? 'bg-emerald-500/20 text-emerald-400' 
                    : 'bg-red-500/20 text-red-400'
                }`}>
                  {displayPerformance >= 0 ? '+' : ''}{displayPerformance.toFixed(2)}%
                </div>
              )}
            </div>
          </div>

          {/* Horizontally Scrollable Returns Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-4 bg-gradient-to-b from-blue-400 to-blue-600 rounded-full"></div>
              <h3 className="text-base font-semibold text-white">Returns</h3>
            </div>
            
            <div className="overflow-x-auto pb-2">
              <div className="flex gap-3 min-w-max">
              {/* 1-day */}
              {(() => {
                const v = returnsKpis?.daily?.portfolio?.return_pct;
                const has = typeof v === 'number';
                return (
                  <div key="daily" className="bg-white/5 hover:bg-white/10 rounded-lg p-3 border border-white/10 hover:border-white/20 transition-all duration-200 flex-shrink-0 w-20">
                    <div className="text-xs text-slate-400 mb-1">1D</div>
                    <div className={`text-sm font-bold ${
                      has ? (v >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-slate-500'
                    }`}>
                      {has ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : 'N/A'}
                    </div>
                  </div>
                );
              })()}

              {/* 1-week */}
              {(() => {
                const v = returnsKpis?.weekly?.portfolio?.return_pct;
                const has = typeof v === 'number';
                return (
                  <div key="weekly" className="bg-white/5 hover:bg-white/10 rounded-lg p-3 border border-white/10 hover:border-white/20 transition-all duration-200 flex-shrink-0 w-20">
                    <div className="text-xs text-slate-400 mb-1">1W</div>
                    <div className={`text-sm font-bold ${
                      has ? (v >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-slate-500'
                    }`}>
                      {has ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : 'N/A'}
                    </div>
                  </div>
                );
              })()}

              {/* 1-month */}
              {(() => {
                const v = returnsKpis?.monthly?.portfolio?.return_pct;
                const has = typeof v === 'number';
                return (
                  <div key="monthly" className="bg-white/5 hover:bg-white/10 rounded-lg p-3 border border-white/10 hover:border-white/20 transition-all duration-200 flex-shrink-0 w-20">
                    <div className="text-xs text-slate-400 mb-1">1M</div>
                    <div className={`text-sm font-bold ${
                      has ? (v >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-slate-500'
                    }`}>
                      {has ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : 'N/A'}
                    </div>
                  </div>
                );
              })()}

              {/* 3-month */}
              {(() => {
                const v = returnsKpis?.three_month?.portfolio?.return_pct;
                const has = typeof v === 'number';
                return (
                  <div key="three_month" className="bg-white/5 hover:bg-white/10 rounded-lg p-3 border border-white/10 hover:border-white/20 transition-all duration-200 flex-shrink-0 w-20">
                    <div className="text-xs text-slate-400 mb-1">3M</div>
                    <div className={`text-sm font-bold ${
                      has ? (v >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-slate-500'
                    }`}>
                      {has ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : 'N/A'}
                    </div>
                  </div>
                );
              })()}

              {/* YTD */}
              {(() => {
                const v = returnsKpis?.ytd?.portfolio?.return_pct;
                const has = typeof v === 'number';
                return (
                  <div key="ytd" className="bg-white/5 hover:bg-white/10 rounded-lg p-3 border border-white/10 hover:border-white/20 transition-all duration-200 flex-shrink-0 w-20">
                    <div className="text-xs text-slate-400 mb-1">YTD</div>
                    <div className={`text-sm font-bold ${
                      has ? (v >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-slate-500'
                    }`}>
                      {has ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : 'N/A'}
                    </div>
                  </div>
                );
              })()}

              {/* 1-year */}
              {(() => {
                const v = returnsKpis?.one_year?.portfolio?.return_pct;
                const has = typeof v === 'number';
                return (
                  <div key="one_year" className="bg-white/5 hover:bg-white/10 rounded-lg p-3 border border-white/10 hover:border-white/20 transition-all duration-200 flex-shrink-0 w-20">
                    <div className="text-xs text-slate-400 mb-1">1Y</div>
                    <div className={`text-sm font-bold ${
                      has ? (v >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-slate-500'
                    }`}>
                      {has ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : 'N/A'}
                    </div>
                  </div>
                );
              })()}
              </div>
            </div>
          </div>

          {/* Compact Top Performers Section */}
          {kpis?.net_performance_tickers?.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 bg-gradient-to-b from-amber-400 to-amber-600 rounded-full"></div>
                <h3 className="text-base font-semibold text-white">Top Performers</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Best Net Performance % */}
                {(() => {
                  const bestPerf = kpis.net_performance_tickers[0];
                  if (!bestPerf) return null;
                  return (
                    <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 rounded-lg p-4 border border-emerald-400/20">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs text-emerald-400 font-medium">Best %</div>
                        <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></div>
                      </div>
                      
                      <div className="space-y-1">
                        <h4 className="text-sm font-semibold text-white truncate">
                          {bestPerf.ticker_name || bestPerf.ticker}
                        </h4>
                        <div className={`text-lg font-bold ${bestPerf.pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {bestPerf.pct >= 0 ? '+' : ''}{bestPerf.pct.toFixed(1)}%
                        </div>
                        <div className="text-xs text-slate-400">
                          {maskPortfolioValue ? '••••••' : `€${bestPerf.net_value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Best Net Absolute Performance */}
                {(() => {
                  const bestAbs = kpis.net_value_tickers?.[0];
                  if (!bestAbs) return null;
                  return (
                    <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 rounded-lg p-4 border border-blue-400/20">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs text-blue-400 font-medium">Best €</div>
                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
                      </div>
                      
                      <div className="space-y-1">
                        <h4 className="text-sm font-semibold text-white truncate">
                          {bestAbs.ticker_name || bestAbs.ticker}
                        </h4>
                        <div className={`text-lg font-bold ${bestAbs.net_value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {maskPortfolioValue ? '••••••' : `${bestAbs.net_value >= 0 ? '+' : ''}€${bestAbs.net_value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                        </div>
                        <div className="text-xs text-slate-400">
                          {bestAbs.pct >= 0 ? '+' : ''}{bestAbs.pct.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectOverview;
