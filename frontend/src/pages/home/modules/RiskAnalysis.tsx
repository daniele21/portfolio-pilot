import React, { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import LoadingCard from '../../../components/LoadingCard';

interface LLMRiskSummaryProps {
  llmRisk: any;
}

const LLMRiskSummary: React.FC<LLMRiskSummaryProps> = ({ llmRisk }) => {
  const [showFullDialog, setShowFullDialog] = useState(false);
  const [focusSection, setFocusSection] = useState<string | null>(null);
  const recCount = Array.isArray(llmRisk.recommended_actions) ? llmRisk.recommended_actions.length : 0;

  const overallRisk = llmRisk.overall_risk ?? llmRisk.overall ?? 'N/A';
  const riskScore = typeof llmRisk.risk_score === 'number' ? llmRisk.risk_score.toFixed(1) : (llmRisk.risk_score ?? 'N/A');
  const drivers = Array.isArray(llmRisk.drivers) ? llmRisk.drivers : [];
  const topDrivers = drivers.slice(0, 3);

  const getRiskColor = (risk: string) => {
    const lower = risk.toLowerCase();
    if (lower.includes('low')) return 'text-emerald-400';
    if (lower.includes('medium') || lower.includes('moderate')) return 'text-amber-400';
    if (lower.includes('high')) return 'text-rose-400';
    return 'text-slate-400';
  };

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-purple-400 rounded-full"></div>
          <div className="text-sm font-semibold text-white">AI Assessment</div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="bg-slate-800/30 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Risk Level:</span>
            <span className={`text-sm font-bold px-2 py-1 rounded ${
              overallRisk.toLowerCase().includes('low') ? 'bg-emerald-500/20 text-emerald-400' :
              overallRisk.toLowerCase().includes('medium') || overallRisk.toLowerCase().includes('moderate') ? 'bg-amber-500/20 text-amber-400' :
              overallRisk.toLowerCase().includes('high') ? 'bg-rose-500/20 text-rose-400' :
              'bg-slate-500/20 text-slate-400'
            }`}>{overallRisk}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowFullDialog(true); setFocusSection('drivers'); }}
            className="text-xs px-2 py-1 rounded hover:bg-white/10 transition-colors text-slate-300"
          >
            Drivers {topDrivers.length > 0 ? `(${topDrivers.length})` : ''}
          </button>

          <button
            onClick={() => { setShowFullDialog(true); setFocusSection('recommendations'); }}
            className="text-xs px-2 py-1 rounded hover:bg-white/10 transition-colors text-slate-300"
          >
            Recommendations {recCount > 0 ? `(${recCount})` : ''}
          </button>
        </div>
      </div>

      {/* Full Details Dialog */}
      {showFullDialog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-white/20 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <h3 className="text-lg font-semibold text-white">Detailed Risk Analysis</h3>
                <button
                  onClick={() => { setShowFullDialog(false); setFocusSection(null); }}
                  className="p-1 hover:bg-white/10 rounded-full transition-colors"
                >
                  <XMarkIcon className="h-5 w-5 text-slate-400" />
                </button>
              </div>
            
            <div className="p-4 overflow-y-auto max-h-[60vh] space-y-4">
              {/* If a focusSection is set, render only that section to avoid scrolling */}
              {focusSection === 'drivers' ? (
                drivers.length > 0 ? (
                  <div className="bg-white/5 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-white mb-3">Risk Drivers</h4>
                    <div className="space-y-3">
                      {drivers.map((driver: any, i: number) => (
                        <div key={i} className="border-l-2 border-blue-500/50 pl-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="text-sm font-medium text-white">{driver.name}</div>
                              <div className="text-xs text-slate-400 mt-1">{driver.type}</div>
                            </div>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              driver.impact === 'high' ? 'bg-rose-500/20 text-rose-400' :
                              driver.impact === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                              'bg-emerald-500/20 text-emerald-400'
                            }`}>
                              {driver.impact}
                            </span>
                          </div>
                          <p className="text-sm text-slate-300 mt-2">{driver.explanation}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-400">No drivers available</div>
                )
              ) : focusSection === 'recommendations' ? (
                Array.isArray(llmRisk.recommended_actions) && llmRisk.recommended_actions.length > 0 ? (
                  <div className="bg-white/5 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-white mb-3">Recommended Actions</h4>
                    <div className="space-y-2">
                      {llmRisk.recommended_actions.map((action: any, i: number) => (
                        <div key={i} className="flex items-start gap-3 p-3 bg-white/5 rounded">
                          <div className={`px-2 py-1 rounded text-xs font-medium ${
                            action.action === 'reduce' ? 'bg-rose-500/20 text-rose-400' :
                            action.action === 'increase' ? 'bg-emerald-500/20 text-emerald-400' :
                            action.action === 'hedge' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-blue-500/20 text-blue-400'
                          }`}>
                            {action.action}
                          </div>
                          <div className="flex-1">
                            <div className="text-sm text-white">{action.instrument}</div>
                            <div className="text-xs text-slate-400 mt-1">{action.rationale}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-400">No recommendations available</div>
                )
              ) : (
                // Full content when no specific focus requested
                <>
                  {/* Overall Assessment */}
                  <div className="bg-white/5 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-white mb-2">Overall Assessment</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-slate-400">Risk Level:</span>
                        <span className={`ml-2 font-medium ${getRiskColor(overallRisk)}`}>{overallRisk}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Score:</span>
                        <span className="ml-2 font-medium text-white">{riskScore}/100</span>
                      </div>
                    </div>
                  </div>

                  {/* Risk Drivers */}
                  {drivers.length > 0 && (
                    <div id="risk-drivers" className="bg-white/5 rounded-lg p-4">
                      <h4 className="text-sm font-medium text-white mb-3">Risk Drivers</h4>
                      <div className="space-y-3">
                        {drivers.map((driver: any, i: number) => (
                          <div key={i} className="border-l-2 border-blue-500/50 pl-3">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="text-sm font-medium text-white">{driver.name}</div>
                                <div className="text-xs text-slate-400 mt-1">{driver.type}</div>
                              </div>
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                driver.impact === 'high' ? 'bg-rose-500/20 text-rose-400' :
                                driver.impact === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                                'bg-emerald-500/20 text-emerald-400'
                              }`}>
                                {driver.impact}
                              </span>
                            </div>
                            <p className="text-sm text-slate-300 mt-2">{driver.explanation}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recommended Actions */}
                  {Array.isArray(llmRisk.recommended_actions) && llmRisk.recommended_actions.length > 0 && (
                    <div id="risk-recommendations" className="bg-white/5 rounded-lg p-4">
                      <h4 className="text-sm font-medium text-white mb-3">Recommended Actions</h4>
                      <div className="space-y-2">
                        {llmRisk.recommended_actions.map((action: any, i: number) => (
                          <div key={i} className="flex items-start gap-3 p-3 bg-white/5 rounded">
                            <div className={`px-2 py-1 rounded text-xs font-medium ${
                              action.action === 'reduce' ? 'bg-rose-500/20 text-rose-400' :
                              action.action === 'increase' ? 'bg-emerald-500/20 text-emerald-400' :
                              action.action === 'hedge' ? 'bg-amber-500/20 text-amber-400' :
                              'bg-blue-500/20 text-blue-400'
                            }`}>
                              {action.action}
                            </div>
                            <div className="flex-1">
                              <div className="text-sm text-white">{action.instrument}</div>
                              <div className="text-xs text-slate-400 mt-1">{action.rationale}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

interface RiskAnalysisProps {
  volatilityWindow: string;
  volatilityValue?: number | null;
  setVolatilityWindow: (v: string) => void;
  presets: Array<{ label: string; value: string }>;
  llmRisk?: any;
  llmRiskLoading?: boolean;
}

const RiskAnalysis: React.FC<RiskAnalysisProps> = ({ volatilityWindow, volatilityValue, setVolatilityWindow, presets, llmRisk, llmRiskLoading }) => {
  // Determine risk level and color based on volatility
  const getRiskLevel = (vol: number | null | undefined): { level: string; color: string; bgColor: string; description: string } => {
    if (typeof vol !== 'number') return { level: 'N/A', color: 'text-slate-400', bgColor: 'bg-slate-500/20', description: 'No data available' };
    
    // Convert to percentage and classify
    const volPercent = vol * 100;
    if (volPercent < 10) return { level: 'Low', color: 'text-emerald-400', bgColor: 'bg-emerald-500/20', description: 'Conservative risk profile' };
    if (volPercent < 20) return { level: 'Moderate', color: 'text-blue-400', bgColor: 'bg-blue-500/20', description: 'Balanced risk profile' };
    if (volPercent < 30) return { level: 'High', color: 'text-amber-400', bgColor: 'bg-amber-500/20', description: 'Aggressive risk profile' };
    return { level: 'Very High', color: 'text-rose-400', bgColor: 'bg-rose-500/20', description: 'Highly volatile assets' };
  };

  const riskInfo = getRiskLevel(volatilityValue);
  const volatilityPercent = typeof volatilityValue === 'number' ? volatilityValue * 100 : null;
  const normalizedValue = typeof volatilityPercent === 'number' ? Math.min(volatilityPercent / 50 * 100, 100) : 0;

  return (
  <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-4 sm:p-6 shadow-lg hover:shadow-xl transition-all duration-300 h-full max-h-[547px]">
      {/* Compact Header Section */}
      <div className="flex items-center gap-2 mb-4 sm:mb-6">
        <div className="w-1 h-5 bg-gradient-to-b from-orange-400 to-orange-600 rounded-full"></div>
        <h2 className="text-lg sm:text-xl font-bold text-white">Risk Analysis</h2>
      </div>
      
        <div className="space-y-4 sm:space-y-6">
        {/* Compact LLM risk analysis card: always render the card so the UI is stable while the LLM runs */}
        <LoadingCard
          loading={!!llmRiskLoading}
          className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 rounded-lg p-3 sm:p-4 border border-purple-400/20"
        >
          {llmRisk && typeof llmRisk === 'object' ? (
            <LLMRiskSummary llmRisk={llmRisk} />
          ) : (
            <div className="p-2 text-sm text-slate-400">AI assessment will appear here when ready.</div>
          )}
        </LoadingCard>

        {/* Compact Volatility Card */}
        <div className={`${riskInfo.bgColor} rounded-xl p-3 sm:p-4 border border-white/10`}>
          {/* Mobile: Single row with selector, value, and label */}
          <div className="flex items-center justify-between mb-3 sm:hidden">
            <div className="text-xs text-slate-400">Volatility</div>
            <div className="flex items-center gap-1.5">
              <select
                value={volatilityWindow}
                onChange={(e) => setVolatilityWindow(e.target.value)}
                className="bg-white/10 border border-white/20 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50 hover:bg-white/15 transition-colors min-w-0 w-16"
              >
                {presets.map(preset => (
                  <option key={preset.value} value={preset.value} className="bg-slate-800 text-white">
                    {preset.value === '30' ? '30d' : preset.value === '90' ? '90d' : preset.value === '252' ? '1y' : preset.label}
                  </option>
                ))}
              </select>
              <div className="text-base font-bold text-white whitespace-nowrap">
                {typeof volatilityPercent === 'number' ? volatilityPercent.toFixed(1) : 'N/A'}%
              </div>
              <div className={`px-1.5 py-0.5 rounded text-xs font-bold whitespace-nowrap ${
                riskInfo.level === 'Low' ? 'bg-emerald-500/20 text-emerald-400' :
                riskInfo.level === 'Moderate' ? 'bg-blue-500/20 text-blue-400' :
                riskInfo.level === 'High' ? 'bg-amber-500/20 text-amber-400' :
                'bg-rose-500/20 text-rose-400'
              }`}>
                {riskInfo.level}
              </div>
            </div>
          </div>

          {/* Desktop: Original two-row layout */}
          <div className="hidden sm:flex sm:flex-row sm:items-center justify-between mb-4 gap-3">
            <div className="flex-1">
              <div className="flex flex-row items-center gap-2 mb-1">
                <div className="text-xs text-slate-400">Volatility</div>
                {/* Period Selector Menu */}
                <select
                  value={volatilityWindow}
                  onChange={(e) => setVolatilityWindow(e.target.value)}
                  className="bg-white/10 border border-white/20 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 hover:bg-white/15 transition-colors w-fit"
                >
                  {presets.map(preset => (
                    <option key={preset.value} value={preset.value} className="bg-slate-800 text-white">
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-white">
                {typeof volatilityPercent === 'number' ? volatilityPercent.toFixed(1) : 'N/A'}%
              </div>
            </div>
            
            {/* Compact Risk Level Badge */}
            <div className={`px-3 py-1 rounded-lg text-xs font-bold ${
              riskInfo.level === 'Low' ? 'bg-emerald-500/20 text-emerald-400' :
              riskInfo.level === 'Moderate' ? 'bg-blue-500/20 text-blue-400' :
              riskInfo.level === 'High' ? 'bg-amber-500/20 text-amber-400' :
              'bg-rose-500/20 text-rose-400'
            }`}>
              {riskInfo.level}
            </div>
          </div>
          
          {/* Compact Visual volatility bar */}
          <div className="relative">
            <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full transition-all duration-700 ease-out ${
                  typeof volatilityValue === 'number' 
                    ? riskInfo.level === 'Low' ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                      : riskInfo.level === 'Moderate' ? 'bg-gradient-to-r from-blue-400 to-blue-500'
                      : riskInfo.level === 'High' ? 'bg-gradient-to-r from-amber-400 to-amber-500'
                      : 'bg-gradient-to-r from-rose-400 to-rose-500'
                    : 'bg-slate-500'
                }`}
                style={{ width: `${normalizedValue}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-400 mt-1">
              <span>Low</span>
              <span>High</span>
            </div>
          </div>
        </div>


      </div>
    </div>
  );
};

export default RiskAnalysis;
