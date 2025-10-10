import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { useQuery } from '@tanstack/react-query';
import { 
  fetchAllPortfolioNames, 
  fetchPortfolioStatus,
  fetchPortfolioStatusLive,
  fetchPortfolioReturnsKpis,
  fetchPortfolioPerformance,
  fetchPortfolioRisk,
  fetchPortfolioSummary
} from '../services/portfolioService';
import { 
  CurrencyDollarIcon, 
  ChartBarIcon, 
  ShieldCheckIcon,
  EyeIcon,
  EyeSlashIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline';
import { InformationCircleIcon } from '@heroicons/react/24/outline';
import { ArrowUpIcon, ArrowDownIcon } from '@heroicons/react/20/solid';
import LoadingCard from '../components/LoadingCard';

interface PortfolioCardData {
  name: string;
  totalValue: number;
  weeklyReturn: number;
  weeklyReturnPct: number;
  monthlyReturn: number;
  monthlyReturnPct: number;
  threeMonthReturn: number;
  threeMonthReturnPct: number;
  totalPnL: number;
  totalPnLPct: number;
  riskLevel: string;
  riskScore?: number;
  headline?: string;
  urgency?: string;
}

interface PortfolioSelectorPageProps {
  onPortfolioSelect: (portfolioName: string) => void;
  selectedPortfolio?: string | null;
}

const PortfolioSelectorPage: React.FC<PortfolioSelectorPageProps> = ({ onPortfolioSelect, selectedPortfolio = null }) => {
  const { isLoggedIn, idToken } = useAuth();
  const [maskValues, setMaskValues] = useState(false);
  const navigate = useNavigate();

  const handleSelectAndNavigate = (name: string) => {
    onPortfolioSelect(name);
    // navigate to dashboard which will render SimpleHome when selectedPortfolio is set
    navigate('/');
  };

  // Fetch all portfolio names
  const { data: portfolioNames = [], isLoading: isLoadingNames } = useQuery({
    queryKey: ['portfolioNames', isLoggedIn, idToken],
    queryFn: fetchAllPortfolioNames,
    enabled: isLoggedIn && !!idToken,
    staleTime: 15 * 60 * 1000,
  });

  

  // Fetch detailed data for all portfolios using separate queries
  const statusQueries = useQuery({
    queryKey: ['portfolioStatuses', portfolioNames, isLoggedIn, idToken],
    queryFn: async () => {
      const results = await Promise.allSettled(
        portfolioNames.map(async (name) => {
          // Try saved status first
          let status = await fetchPortfolioStatus(name);
          // If no saved status or zero total_value, fall back to live status
          if (!status || !status.total_value) {
            console.log(`[PortfolioSelector] Falling back to live status for ${name}`);
            status = await fetchPortfolioStatusLive(name);
          }
          return status;
        })
      );
      return portfolioNames.reduce((acc, name, index) => {
        const result = results[index];
        acc[name] = result.status === 'fulfilled' ? result.value : null;
        return acc;
      }, {} as Record<string, any>);
    },
    enabled: isLoggedIn && !!idToken && portfolioNames.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  const returnsQueries = useQuery({
    queryKey: ['portfolioReturns', portfolioNames, isLoggedIn, idToken],
    queryFn: async () => {
      const results = await Promise.allSettled(
        portfolioNames.map(name => fetchPortfolioReturnsKpis(name))
      );
      return portfolioNames.reduce((acc, name, index) => {
        const result = results[index];
        acc[name] = result.status === 'fulfilled' ? result.value : null;
        return acc;
      }, {} as Record<string, any>);
    },
    enabled: isLoggedIn && !!idToken && portfolioNames.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  // Fetch historical performance series for each portfolio (used to compute overall total performance)
  const performanceQueries = useQuery({
    queryKey: ['portfolioPerformanceSeries', portfolioNames, isLoggedIn, idToken],
    queryFn: async () => {
      const results = await Promise.allSettled(
        portfolioNames.map(name => fetchPortfolioPerformance(name))
      );
      return portfolioNames.reduce((acc, name, index) => {
        const result = results[index];
        acc[name] = result.status === 'fulfilled' ? result.value : [];
        return acc;
      }, {} as Record<string, any[]>);
    },
    enabled: isLoggedIn && !!idToken && portfolioNames.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const riskQueries = useQuery({
    queryKey: ['portfolioRisks', portfolioNames, isLoggedIn, idToken],
    queryFn: async () => {
      const results = await Promise.allSettled(
        portfolioNames.map(name => fetchPortfolioRisk(name))
      );
      return portfolioNames.reduce((acc, name, index) => {
        const result = results[index];
        acc[name] = result.status === 'fulfilled' ? result.value : null;
        return acc;
      }, {} as Record<string, any>);
    },
    enabled: isLoggedIn && !!idToken && portfolioNames.length > 0,
    staleTime: 15 * 60 * 1000,
  });

  // Fetch daily Gemini summary (sumup) for each portfolio
  const summaryQueries = useQuery({
    queryKey: ['portfolioSummaries', portfolioNames, isLoggedIn, idToken],
    queryFn: async () => {
      const results = await Promise.allSettled(
        portfolioNames.map(name => fetchPortfolioSummary(name))
      );
      return portfolioNames.reduce((acc, name, index) => {
        const result = results[index];
        acc[name] = result.status === 'fulfilled' ? result.value : null;
        return acc;
      }, {} as Record<string, any>);
    },
    enabled: isLoggedIn && !!idToken && portfolioNames.length > 0,
    staleTime: 30 * 60 * 1000, // summaries can be considered valid for longer (daily)
  });

  const formatCurrency = (value: number): string => {
    if (maskValues) return '•••••';
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatPercentage = (value: number): string => {
    if (maskValues) return '•••%';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  const getRiskDisplayInfo = (riskData: any) => {
    if (!riskData) return { level: 'Unknown', textColor: 'text-slate-400', pillBg: 'bg-slate-700/10', pillBorder: 'border-slate-600/20', dotColor: 'bg-slate-400' };
    // Accept both old flat shape and new nested { report: { overall_risk, risk_score } }
    const report = riskData.report || riskData;
    let rawLevel: string | undefined = report.overall_risk || report.risk_level;
    const scoreRaw = report.risk_score;
    let riskLevel = 'Unknown';
    if (rawLevel && typeof rawLevel === 'string') {
      const normalized = rawLevel.toLowerCase();
      if (['low','medium','high'].includes(normalized)) {
        riskLevel = normalized.charAt(0).toUpperCase() + normalized.slice(1);
      }
    } else if (typeof scoreRaw === 'number') {
      // If score present but no textual level, bucket it (assuming 0-100 scale from Gemini)
      if (scoreRaw <= 33) riskLevel = 'Low';
      else if (scoreRaw <= 66) riskLevel = 'Medium';
      else riskLevel = 'High';
    }
    // Stronger, consistent Tailwind tokens for pill background, border, text and dot
    const riskColors = {
      'Low': { textColor: 'text-emerald-600', pillBg: 'bg-emerald-700/10', pillBorder: 'border-emerald-600/20', dotColor: 'bg-emerald-400' },
      'Medium': { textColor: 'text-amber-600', pillBg: 'bg-amber-700/10', pillBorder: 'border-amber-600/20', dotColor: 'bg-amber-400' },
      'High': { textColor: 'text-rose-600', pillBg: 'bg-rose-700/10', pillBorder: 'border-rose-600/20', dotColor: 'bg-rose-400' },
      'Unknown': { textColor: 'text-slate-400', pillBg: 'bg-slate-700/10', pillBorder: 'border-slate-600/20', dotColor: 'bg-slate-400' }
    } as const;
    return { level: riskLevel, ...riskColors[riskLevel as keyof typeof riskColors] };
  };

  const portfolioData: PortfolioCardData[] = portfolioNames.map((name) => {
    const statusData = statusQueries.data?.[name];
    const returnsData = returnsQueries.data?.[name];
  const riskData = riskQueries.data?.[name];
  const summaryData = summaryQueries.data?.[name];

    // Extract weekly returns using backend structure weekly.portfolio.{start_value,end_value,return_pct}
    let weeklyReturn = 0; // absolute gain/loss (end - start)
    let weeklyReturnPct = 0; // already percent from backend
    const weeklyPortfolio = returnsData?.weekly?.portfolio;
    if (weeklyPortfolio) {
      const startVal = typeof weeklyPortfolio.start_value === 'number' ? weeklyPortfolio.start_value : null;
      const endVal = typeof weeklyPortfolio.end_value === 'number' ? weeklyPortfolio.end_value : null;
      if (startVal !== null && endVal !== null) {
        weeklyReturn = endVal - startVal;
      }
      if (typeof weeklyPortfolio.return_pct === 'number') {
        weeklyReturnPct = weeklyPortfolio.return_pct; // already %
      }
    }

    // Extract monthly and 3-month returns (backend keys: monthly, three_month)
    let monthlyReturn = 0;
    let monthlyReturnPct = 0;
    const monthlyPortfolio = returnsData?.monthly?.portfolio;
    if (monthlyPortfolio) {
      const s = typeof monthlyPortfolio.start_value === 'number' ? monthlyPortfolio.start_value : null;
      const e = typeof monthlyPortfolio.end_value === 'number' ? monthlyPortfolio.end_value : null;
      if (s !== null && e !== null) monthlyReturn = e - s;
      if (typeof monthlyPortfolio.return_pct === 'number') monthlyReturnPct = monthlyPortfolio.return_pct;
    }

    let threeMonthReturn = 0;
    let threeMonthReturnPct = 0;
    const threeMonthPortfolio = returnsData?.three_month?.portfolio;
    if (threeMonthPortfolio) {
      const s3 = typeof threeMonthPortfolio.start_value === 'number' ? threeMonthPortfolio.start_value : null;
      const e3 = typeof threeMonthPortfolio.end_value === 'number' ? threeMonthPortfolio.end_value : null;
      if (s3 !== null && e3 !== null) threeMonthReturn = e3 - s3;
      if (typeof threeMonthPortfolio.return_pct === 'number') threeMonthReturnPct = threeMonthPortfolio.return_pct;
    }

    // Extract overall/total P&L and percent from historical performance series.
    // Per requirement: take the last item from /performance API and use its `pct` field as the total performance percent.
    // Keep absolute P&L as last - first when available.
    let totalPnL = 0;
    let totalPnLPct = 0;
    const perfSeries = performanceQueries.data?.[name] as any[] | undefined;
    if (Array.isArray(perfSeries) && perfSeries.length > 0) {
      const sorted = [...perfSeries].sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const firstVal = first?.abs_value ?? first?.value ?? null;
      const lastVal = last?.abs_value ?? last?.value ?? null;

      // Absolute P&L: prefer last - first when both available
      if (typeof firstVal === 'number' && typeof lastVal === 'number') {
        totalPnL = lastVal - firstVal;
      }

      // Total percent: prefer the last item's `pct` field (assumed to be percent already).
      if (last && typeof last.pct === 'number') {
        totalPnLPct = last.pct;
      } else if (typeof firstVal === 'number' && typeof lastVal === 'number' && firstVal !== 0) {
        // Fallback to computed percent if `pct` not present on the last point
        totalPnLPct = ((lastVal - firstVal) / firstVal) * 100;
      }
    }

    const riskInfo = getRiskDisplayInfo(riskData);
    const riskScore = (riskData?.report?.risk_score ?? riskData?.risk_score);

  const summary = summaryData?.sumup || summaryData?.summary || null;
  const headline: string | undefined = summary?.headline;
  const urgency: string | undefined = summary?.urgency;
  const firstHighlight: string | undefined = Array.isArray(summary?.highlights) ? summary.highlights[0] : undefined;

    return {
      name,
      totalValue: statusData?.total_value || 0,
      weeklyReturn,
      weeklyReturnPct,
      monthlyReturn,
      monthlyReturnPct,
      threeMonthReturn,
      threeMonthReturnPct,
      totalPnL,
      totalPnLPct,
      riskLevel: riskInfo.level,
      riskScore: typeof riskScore === 'number' ? riskScore : undefined,
      headline,
      urgency,
      // extra UI summary field (used inline)
      // @ts-ignore - keeps existing highlight usage
      _highlight: firstHighlight,
    };
  });

  const isLoading = isLoadingNames || statusQueries.isLoading || returnsQueries.isLoading || riskQueries.isLoading;

  // Order portfolios by urgency/attention level (highest first)
  const urgencyPriority: Record<string, number> = {
    'CRITICAL': 5,
    'HIGH': 4,
    'MEDIUM': 3,
    'LOW': 2,
    'NONE': 1,
  };

  portfolioData.sort((a, b) => {
    const au = (a.urgency || 'NONE').toString().toUpperCase();
    const bu = (b.urgency || 'NONE').toString().toUpperCase();
    const pa = urgencyPriority[au] ?? 0;
    const pb = urgencyPriority[bu] ?? 0;
    // higher priority first
    return pb - pa;
  });

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Please sign in to view your portfolios</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Select Portfolio</h1>
              <p className="text-gray-400">Choose a portfolio to view detailed analysis and performance</p>
            </div>
            <button
              onClick={() => setMaskValues(!maskValues)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
            >
              {maskValues ? <EyeIcon className="w-5 h-5" /> : <EyeSlashIcon className="w-5 h-5" />}
              {maskValues ? 'Show Values' : 'Hide Values'}
            </button>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="grid gap-8 sm:grid-cols-1 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
            {[...Array(portfolioNames.length || 4)].map((_, i) => (
              <div key={i} className="bg-gradient-to-br from-gray-800 to-gray-850 rounded-2xl p-8 animate-pulse border border-gray-700/50 shadow-lg">
                <div className="h-6 bg-gray-700 rounded-lg mb-6"></div>
                <div className="space-y-4">
                  <div className="h-8 bg-gray-700 rounded-lg w-3/4"></div>
                  <div className="h-6 bg-gray-700 rounded-lg w-1/2"></div>
                  <div className="h-6 bg-gray-700 rounded-lg w-2/3"></div>
                  <div className="flex gap-2">
                    <div className="h-6 bg-gray-700 rounded-md w-12"></div>
                    <div className="h-6 bg-gray-700 rounded-md w-12"></div>
                    <div className="h-6 bg-gray-700 rounded-md w-12"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Portfolio Grid */}
        {!isLoading && portfolioData.length > 0 && (
          <div className="grid gap-8 sm:grid-cols-1 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
            {portfolioData.map((portfolio) => {
              const riskInfo = getRiskDisplayInfo({ risk_level: portfolio.riskLevel });
              const isSelected = selectedPortfolio && selectedPortfolio === portfolio.name;
              // Determine whether this particular portfolio's data is still being fetched
              const name = portfolio.name;
              const cardLoading = (
                (statusQueries.isFetching && (statusQueries.data == null || !(name in statusQueries.data))) ||
                (returnsQueries.isFetching && (returnsQueries.data == null || !(name in returnsQueries.data))) ||
                (performanceQueries.isFetching && (performanceQueries.data == null || !(name in performanceQueries.data))) ||
                (riskQueries.isFetching && (riskQueries.data == null || !(name in riskQueries.data))) ||
                (summaryQueries.isFetching && (summaryQueries.data == null || !(name in summaryQueries.data)))
              );
              
              return (
                <LoadingCard
                  key={portfolio.name}
                  loading={!!cardLoading}
                  className={`bg-gradient-to-br from-gray-800 to-gray-850 rounded-2xl p-8 border backdrop-blur-sm transition-all duration-400 ease-out cursor-pointer group relative overflow-hidden focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-lg hover:shadow-xl hover:-translate-y-1 hover:scale-[1.01] ${isSelected ? 'border-indigo-500 ring-2 ring-indigo-500/30 ' : 'border-gray-700/40 '}`}
                >
                  <div
                    onClick={() => handleSelectAndNavigate(portfolio.name)}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelectAndNavigate(portfolio.name); }}
                    role="button"
                    aria-pressed={!!isSelected}
                    className="h-full"
                  >
                  {/* Portfolio Header */}
                    <div className="mb-4">
                      {/* Portfolio Name and Navigation Arrow */}
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-semibold text-white truncate group-hover:text-indigo-100 transition-colors duration-300">
                          {portfolio.name}
                        </h3>
                        <div className="relative">
                          <ArrowRightIcon className="w-5 h-5 text-gray-400 group-hover:text-indigo-400 transition-all duration-300 opacity-0 group-hover:opacity-100 group-hover:translate-x-1" />
                          <div className="absolute inset-0 bg-indigo-400/20 rounded-full scale-0 group-hover:scale-150 transition-transform duration-300 -z-10"></div>
                        </div>
                      </div>
                      
                      {/* Urgency Badge */}
                      {portfolio.urgency && (
                        <div className="mb-4 group/urgency-badge">
                          {(() => {
                            const u = (portfolio.urgency || '').toString().toUpperCase();
                            const urgencyConfig: Record<string, { 
                              bg: string, 
                              text: string, 
                              border: string, 
                              icon: string,
                              pulse: boolean,
                              priority: number 
                            }> = {
                              'CRITICAL': { 
                                bg: 'bg-gradient-to-r from-rose-500/25 to-red-600/25', 
                                text: 'text-rose-200', 
                                border: 'border-rose-500/50',
                                icon: '🚨',
                                pulse: true,
                                priority: 5
                              },
                              'HIGH': { 
                                bg: 'bg-gradient-to-r from-orange-500/25 to-red-500/25', 
                                text: 'text-orange-200', 
                                border: 'border-orange-500/50',
                                icon: '⚠️',
                                pulse: false,
                                priority: 4
                              },
                              'MEDIUM': { 
                                bg: 'bg-gradient-to-r from-amber-500/25 to-yellow-500/25', 
                                text: 'text-amber-200', 
                                border: 'border-amber-500/50',
                                icon: '📊',
                                pulse: false,
                                priority: 3
                              },
                              'LOW': { 
                                bg: 'bg-gradient-to-r from-emerald-500/20 to-green-500/20', 
                                text: 'text-emerald-200', 
                                border: 'border-emerald-500/40',
                                icon: '✅',
                                pulse: false,
                                priority: 2
                              },
                              'NONE': { 
                                bg: 'bg-gradient-to-r from-slate-500/15 to-gray-500/15', 
                                text: 'text-slate-300', 
                                border: 'border-slate-500/30',
                                icon: '💤',
                                pulse: false,
                                priority: 1
                              }
                            };
                            const config = urgencyConfig[u] || urgencyConfig['NONE'];
                            
                            return (
                              <div className={`relative inline-flex items-center gap-3 px-4 py-2.5 rounded-xl border backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:shadow-lg cursor-default group-hover:brightness-110 ${config.bg} ${config.border} ${config.pulse ? 'animate-pulse' : ''} group/urgency`}>
                                <div className="flex items-center gap-2">
                                  <span className="text-base select-none transition-transform duration-300 hover:scale-125 hover:rotate-12" role="img" aria-label={`${u} urgency`}>
                                    {config.icon}
                                  </span>
                                  <div className="flex flex-col">
                                    <span className={`text-xs font-bold uppercase tracking-wider transition-all duration-300 group-hover:scale-105 ${config.text}`}>
                                      {u}
                                    </span>
                                    <span className="text-xs text-gray-400 font-medium transition-colors duration-300 group-hover:text-gray-300">
                                      Attention Level
                                    </span>
                                  </div>
                                </div>
                                
                                {/* Info tooltip */}
                                <div className="relative">
                                  <InformationCircleIcon 
                                    className="w-4 h-4 text-gray-500 hover:text-gray-300 transition-colors cursor-help opacity-60 group-hover/urgency:opacity-100" 
                                  />
                                  <div className="absolute -top-16 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 opacity-0 group-hover/urgency:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10 border border-gray-700 shadow-xl">
                                    AI-analyzed attention priority
                                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-900"></div>
                                  </div>
                                </div>
                                
                                {/* Priority indicator */}
                                {config.priority >= 4 && (
                                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full border-2 border-gray-800 animate-pulse hover:scale-125 transition-transform duration-300"></div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                      
                      {/* Headline */}
                      {portfolio.headline && (
                        <div className="mb-6">
                          <div className="relative bg-gradient-to-r from-indigo-500/15 to-purple-500/10 border border-indigo-500/30 rounded-xl p-4 backdrop-blur-sm group/headline">
                            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-purple-500/5 rounded-xl opacity-0 group-hover/headline:opacity-100 transition-opacity duration-300"></div>
                            <div className="relative">
                              <div className="flex items-start gap-3">
                                <div className="flex-shrink-0 w-2 h-2 bg-indigo-400 rounded-full mt-2 animate-pulse"></div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-indigo-100 leading-relaxed mb-1" title={portfolio.headline}>
                                    {portfolio.headline}
                                  </p>
                                  {(portfolio as any)._highlight && (
                                    <p className="text-xs text-gray-300 leading-relaxed opacity-80" title={(portfolio as any)._highlight}>
                                      {(portfolio as any)._highlight}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <div className="absolute top-4 right-4">
                        <div className="relative">
                          <span className="inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg">
                            <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                            SELECTED
                          </span>
                          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 opacity-30 animate-ping"></div>
                        </div>
                      </div>
                    )}

                  {/* Total Value */}
                  <div className="mb-4 group/value">
                    <div className="flex items-center gap-2 mb-1">
                      <CurrencyDollarIcon className="w-5 h-5 text-green-400 group-hover:text-green-300 group-hover:scale-110 transition-all duration-300" />
                      <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors duration-300">Total Value</span>
                    </div>
                    <div className="text-2xl font-bold text-white group-hover:text-green-100 transition-all duration-300 group-hover:scale-105 transform-gpu">
                      {formatCurrency(portfolio.totalValue)}
                    </div>
                  </div>

                  {/* Total Performance */}
                  <div className="mb-4 group/performance">
                    <div className="flex items-center gap-2 mb-1">
                      <ChartBarIcon className="w-5 h-5 text-blue-400 group-hover:text-blue-300 group-hover:scale-110 transition-all duration-300" />
                      <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors duration-300">Total Performance</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`flex items-center gap-1 transition-all duration-300 group-hover:scale-105 ${portfolio.totalPnLPct >= 0 ? 'text-green-400 group-hover:text-green-300' : 'text-red-400 group-hover:text-red-300'}`}>
                        {portfolio.totalPnLPct >= 0 ? (
                          <ArrowUpIcon className="w-4 h-4 group-hover:animate-bounce" />
                        ) : (
                          <ArrowDownIcon className="w-4 h-4 group-hover:animate-bounce" />
                        )}
                        <span className="font-semibold">
                          {formatPercentage(portfolio.totalPnLPct)}
                        </span>
                      </div>
                      {!maskValues && (
                        <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors duration-300">
                          ({formatCurrency(portfolio.totalPnL)})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Short-term Returns: 1W / 1M / 3M */}
                  <div className="mb-4">
                    <div className="flex items-center gap-3">
                      {[{
                        label: '1W',
                        pct: portfolio.weeklyReturnPct
                      }, {
                        label: '1M',
                        pct: portfolio.monthlyReturnPct
                      }, {
                        label: '3M',
                        pct: portfolio.threeMonthReturnPct
                      }].map((item, index) => (
                        <div 
                          key={item.label} 
                          className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all duration-300 hover:scale-110 hover:shadow-lg cursor-default group-hover:translate-y-0 ${item.pct >= 0 ? 'text-green-400 bg-green-900/10 hover:bg-green-900/20 hover:text-green-300' : 'text-red-400 bg-red-900/10 hover:bg-red-900/20 hover:text-red-300'}`}
                          style={{ transitionDelay: `${index * 50}ms` }}
                        >
                          {item.pct >= 0 ? <ArrowUpIcon className="w-3 h-3 transition-transform duration-300 hover:scale-125" /> : <ArrowDownIcon className="w-3 h-3 transition-transform duration-300 hover:scale-125" />}
                          <span>{item.label} {formatPercentage(item.pct)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Risk Level */}
                  <div className="group/risk">
                    <div className="flex items-center gap-2 mb-2">
                      <ShieldCheckIcon className="w-5 h-5 text-purple-400 group-hover:text-purple-300 group-hover:scale-110 transition-all duration-300" />
                      <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors duration-300">Risk Level</span>
                    </div>
                    <div className="inline-flex items-center gap-3">
                      <div
                        className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold border transition-all duration-300 hover:scale-105 hover:shadow-lg cursor-default ${riskInfo.pillBg} ${riskInfo.pillBorder} ${riskInfo.textColor} shadow-sm`}
                        aria-label={`Risk level ${portfolio.riskLevel}`}
                      >
                        {/* colored dot */}
                        <span className={`w-2 h-2 rounded-full transition-all duration-300 hover:scale-150 hover:animate-pulse ${riskInfo.dotColor} ring-1 ring-white/10`} />
                        <span className="uppercase tracking-wider text-xs">{portfolio.riskLevel}</span>
                      </div>
                      {/* {portfolio.riskScore !== undefined && (
                        <div className="ml-1 px-2 py-0.5 rounded-full bg-white/5 text-xs font-medium text-white/90 border border-white/6">
                          {Number(portfolio.riskScore).toFixed(1)}/10
                        </div>
                      )} */}
                    </div>
                  </div>

                    {/* Advanced Hover Effects (lighten on hover) */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/6 to-white/4 opacity-0 group-hover:opacity-60 transition-all duration-400 rounded-2xl pointer-events-none"></div>
                    <div className="absolute inset-0 border border-white/6 opacity-0 group-hover:opacity-40 transition-opacity duration-400 rounded-2xl pointer-events-none"></div>
                    
                    {/* Animated corner accents (subtle, lighter) */}
                    <div className="absolute top-2 left-2 w-4 h-4 border-l-2 border-t-2 border-white/0 group-hover:border-white/20 transition-all duration-400 rounded-tl-lg"></div>
                    <div className="absolute top-2 right-2 w-4 h-4 border-r-2 border-t-2 border-white/0 group-hover:border-white/20 transition-all duration-400 delay-100 rounded-tr-lg"></div>
                    <div className="absolute bottom-2 left-2 w-4 h-4 border-l-2 border-b-2 border-white/0 group-hover:border-white/20 transition-all duration-400 delay-200 rounded-bl-lg"></div>
                    <div className="absolute bottom-2 right-2 w-4 h-4 border-r-2 border-b-2 border-white/0 group-hover:border-white/20 transition-all duration-400 delay-300 rounded-br-lg"></div>
                    
                    {/* Subtle light sweep effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/8 to-transparent opacity-0 group-hover:opacity-60 transition-opacity duration-600"></div>
                  </div>
                </LoadingCard>
              );
            })}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && portfolioData.length === 0 && (
          <div className="text-center py-12">
            <CurrencyDollarIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No Portfolios Found</h3>
            <p className="text-gray-400">
              No portfolios are available for your account. Please check your access or contact support.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PortfolioSelectorPage;