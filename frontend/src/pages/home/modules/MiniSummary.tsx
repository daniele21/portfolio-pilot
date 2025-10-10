import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchPortfolioSummary } from '../../../services/portfolioService';
import AlertMonitor from '../../../components/AlertMonitor';

interface Props {
  portfolioName?: string | null;
}

const MiniSummary: React.FC<Props> = ({ portfolioName }) => {
  const [currentHighlightIndex, setCurrentHighlightIndex] = React.useState(0);
  
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['portfolioSummary', portfolioName],
    queryFn: () => (portfolioName ? fetchPortfolioSummary(portfolioName) : null),
    enabled: !!portfolioName,
    staleTime: 5 * 60 * 1000,
  });

  if (!portfolioName) return null;

  const sumup = data && (data.sumup ?? data) ? (data.sumup ?? data) : null;

  // Try to extract common fields with safe fallbacks
  let headline: string | null = null;
  let subheadline: string | null = null;
  let highlights: string[] = [];
  let nextAction: string | null = null;
  let urgency: string | null = null;

  try {
    if (typeof sumup === 'string') {
      // Try parse JSON if possible
      try {
        const parsed = JSON.parse(sumup);
        if (parsed && typeof parsed === 'object') {
          headline = parsed.headline || parsed.title || null;
          subheadline = parsed.subheadline || parsed.subtitle || null;
          highlights = Array.isArray(parsed.highlights) ? parsed.highlights : (parsed.highlights?.split?.('\n') || []);
          nextAction = parsed.next_best_action || null;
          urgency = parsed.urgency || parsed.priority || null;
        }
      } catch (e) {
        // plain string summary - put it in highlights
        highlights = [sumup];
      }
    } else if (sumup && typeof sumup === 'object') {
      headline = sumup.headline || sumup.title || null;
      subheadline = sumup.subheadline || sumup.subtitle || null;
      if (Array.isArray(sumup.highlights)) highlights = sumup.highlights.map((h: any) => String(h));
  else if (typeof sumup.highlights === 'string') highlights = sumup.highlights.split('\n').map((s: string) => s.trim()).filter(Boolean);
      else if (sumup.highlight) highlights = [String(sumup.highlight)];
      nextAction = sumup.next_best_action || null;
      urgency = sumup.urgency || sumup.priority || null;
    }
  } catch (e) {
    // swallow
  }

  const hasAny = headline || subheadline || (highlights && highlights.length > 0) || nextAction || urgency;

  // Reset highlight index when the number of highlights changes (avoid resetting on every render)
  React.useEffect(() => {
    setCurrentHighlightIndex(0);
  }, [highlights.length]);

  // Ensure current index is within bounds if highlights shrink
  const safeHighlightIndex = React.useMemo(() => {
    if (!highlights || highlights.length === 0) return 0;
    return Math.min(currentHighlightIndex, highlights.length - 1);
  }, [currentHighlightIndex, highlights.length]);

  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-3 sm:p-4 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-2 sm:gap-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-5 h-5 sm:w-6 sm:h-6 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h3 className="text-base sm:text-lg font-semibold text-white">AI Summary</h3>
          
          {/* Urgency Badge */}
          {urgency && (
            <div className="group/urgency-badge flex-shrink-0">
              {(() => {
                const u = (urgency || '').toString().toUpperCase();
                const urgencyConfig: Record<string, { 
                  bg: string, 
                  text: string, 
                  border: string, 
                  icon: string,
                  pulse: boolean
                }> = {
                  'CRITICAL': { 
                    bg: 'bg-gradient-to-r from-rose-500/25 to-red-600/25', 
                    text: 'text-rose-200', 
                    border: 'border-rose-500/50',
                    icon: '🚨',
                    pulse: true
                  },
                  'HIGH': { 
                    bg: 'bg-gradient-to-r from-orange-500/25 to-red-500/25', 
                    text: 'text-orange-200', 
                    border: 'border-orange-500/50',
                    icon: '⚠️',
                    pulse: false
                  },
                  'MEDIUM': { 
                    bg: 'bg-gradient-to-r from-amber-500/25 to-yellow-500/25', 
                    text: 'text-amber-200', 
                    border: 'border-amber-500/50',
                    icon: '📊',
                    pulse: false
                  },
                  'LOW': { 
                    bg: 'bg-gradient-to-r from-emerald-500/20 to-green-500/20', 
                    text: 'text-emerald-200', 
                    border: 'border-emerald-500/40',
                    icon: '✅',
                    pulse: false
                  },
                  'NONE': { 
                    bg: 'bg-gradient-to-r from-slate-500/15 to-gray-500/15', 
                    text: 'text-slate-300', 
                    border: 'border-slate-500/30',
                    icon: '💤',
                    pulse: false
                  }
                };
                const config = urgencyConfig[u] || urgencyConfig['NONE'];
                
                return (
                  <div className={`inline-flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-1 rounded-md border backdrop-blur-sm transition-all duration-300 hover:scale-105 cursor-default ${config.bg} ${config.border} ${config.pulse ? 'animate-pulse' : ''}`}>
                    <div className="flex items-center gap-1">
                      <span className="text-xs select-none" role="img" aria-label={`${u} urgency`}>
                        {config.icon}
                      </span>
                      <div className="flex flex-col">
                        <span className={`text-xs font-bold uppercase tracking-tight ${config.text}`}>
                          {u}
                          <span className="ml-1 text-xs text-gray-400 font-normal normal-case hidden sm:inline">Attention level</span>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
        {/* <button
          onClick={() => refetch()}
          className="text-xs text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 px-2 py-1 rounded-md transition-colors flex items-center gap-1 self-start sm:self-auto flex-shrink-0"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span className="hidden sm:inline">Refresh</span>
        </button> */}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center sm:justify-start gap-2 py-4 text-slate-300">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
          <span className="text-xs sm:text-sm">Loading summary...</span>
        </div>
      )}

      {error && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <svg className="w-4 h-4 text-red-400 flex-shrink-0 self-center sm:self-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs text-red-300 text-center sm:text-left">Failed to load summary</span>
        </div>
      )}

      {!isLoading && !error && !hasAny && (
        <div className="py-6 sm:py-4">
          <p className="text-xs sm:text-sm text-slate-400 text-center">No summary available</p>
        </div>
      )}

      {!isLoading && hasAny && (
        <div className="space-y-3">
          {/* Main content area with headline, subheadline and highlights - responsive layout */}
          <div className="flex flex-col lg:flex-row lg:items-start gap-3 lg:gap-4">
            {/* Left side: Headline and subheadline */}
            <div className="flex-1 min-w-0">
              <div className="bg-white/5 rounded-lg p-2.5 sm:p-3 border border-white/10 backdrop-blur-sm hover:bg-white/10 transition-all duration-200 h-full flex flex-col">
                {headline && (
                  <div className="relative group/headline mb-2">
                    <div className="absolute -left-1 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-400 to-purple-500 rounded-full opacity-60"></div>
                    <h4 className="text-sm font-bold text-white leading-tight pl-3 group-hover/headline:text-blue-100 transition-colors duration-200">
                      {headline}
                    </h4>
                  </div>
                )}
                {subheadline && (
                  <div className="pl-3 flex-1">
                    <p className="text-xs text-slate-300 leading-relaxed font-medium opacity-90 hover:opacity-100 transition-opacity duration-200">
                      {subheadline}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Right side: Highlights */}
            {highlights && highlights.length > 0 && (
              <div className="flex-1 min-w-0">
                <div className="bg-white/5 rounded-lg p-2.5 sm:p-3 border border-white/10 backdrop-blur-sm hover:bg-white/10 transition-all duration-200 group/highlights">
                  {/* Header with title and desktop navigation */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-2 sm:gap-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="w-4 h-4 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-md flex items-center justify-center flex-shrink-0">
                        <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <span className="text-xs font-semibold text-yellow-300 group-hover/highlights:text-yellow-200 transition-colors duration-200">
                        Key Insights
                      </span>
                      {/* Alert monitor positioned with proper spacing */}
                      <AlertMonitor portfolioName={portfolioName} pollIntervalMs={60_000} />
                    </div>
                    {/* Desktop navigation - only show on sm and up */}
                    {highlights.length > 1 && (
                      <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                        <div className="flex items-center gap-1 px-1.5 py-0.5 bg-white/10 rounded-md">
                          <span className="text-xs text-slate-300 font-medium">{safeHighlightIndex + 1}</span>
                          <span className="text-xs text-slate-400">/</span>
                          <span className="text-xs text-slate-400">{highlights.length}</span>
                        </div>
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={() => setCurrentHighlightIndex((prev) => (prev > 0 ? prev - 1 : Math.max(0, highlights.length - 1)))}
                            className="p-1 rounded-md bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white transition-all duration-200 hover:scale-105 min-h-[32px] min-w-[32px] flex items-center justify-center"
                            aria-label="Previous highlight"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setCurrentHighlightIndex((prev) => (prev < Math.max(0, highlights.length - 1) ? prev + 1 : 0))}
                            className="p-1 rounded-md bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white transition-all duration-200 hover:scale-105 min-h-[32px] min-w-[32px] flex items-center justify-center"
                            aria-label="Next highlight"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Mobile: Horizontal scroll, Desktop: Single highlight with navigation */}
                  <div className="relative">
                    {/* Mobile scrollable highlights with snap scrolling */}
                    <div className="sm:hidden overflow-x-auto pb-2 -mx-2.5 px-2.5 snap-x snap-mandatory">
                      <div className="flex gap-3 min-w-max">
                        {highlights.map((highlight, index) => (
                          <div key={index} className="flex items-start gap-2.5 flex-shrink-0 w-[calc(100vw-3rem)] max-w-[320px] snap-start">
                            <div className="w-1.5 h-1.5 bg-gradient-to-r from-blue-400 to-cyan-400 rounded-full mt-1.5 flex-shrink-0 animate-pulse"></div>
                            <span className="text-xs text-slate-200 leading-relaxed font-medium group-hover/highlights:text-slate-100 transition-colors duration-200">
                              {highlight}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* Desktop single highlight with navigation */}
                    <div className="hidden sm:block">
                      <div className="flex items-start gap-2.5">
                        <div className="w-1.5 h-1.5 bg-gradient-to-r from-blue-400 to-cyan-400 rounded-full mt-1.5 flex-shrink-0 animate-pulse"></div>
                        <span className="text-xs text-slate-200 leading-relaxed font-medium group-hover/highlights:text-slate-100 transition-colors duration-200">
                          {highlights[safeHighlightIndex]}
                        </span>
                      </div>
                      {highlights.length > 1 && (
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover/highlights:opacity-100 transition-opacity duration-300 pointer-events-none rounded"></div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom row: Next Action */}
          {nextAction && (
            <div className="pt-3 border-t border-white/10">
              <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-400/20 rounded-xl p-3 sm:p-4 backdrop-blur-sm hover:from-green-500/15 hover:to-emerald-500/15 transition-all duration-200 group/action">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-4 h-4 sm:w-5 sm:h-5 bg-gradient-to-br from-green-400 to-emerald-500 rounded-lg flex items-center justify-center group-hover/action:scale-110 transition-transform duration-200 flex-shrink-0">
                    <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <span className="text-sm font-bold text-green-300 group-hover/action:text-green-200 transition-colors duration-200">Recommended Action</span>
                  <div className="flex-1"></div>
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse flex-shrink-0"></div>
                </div>
                <div className="relative">
                  <div className="absolute -left-1 top-0 bottom-0 w-0.5 bg-gradient-to-b from-green-400 to-emerald-500 rounded-full opacity-60"></div>
                  <p className="text-sm text-white leading-relaxed font-medium pl-3 group-hover/action:text-green-50 transition-colors duration-200">
                    {nextAction}
                  </p>
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-green-400/5 to-transparent opacity-0 group-hover/action:opacity-100 transition-opacity duration-300 pointer-events-none rounded-xl"></div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MiniSummary;
