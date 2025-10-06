import React from 'react';

interface RiskAnalysisProps {
  volatilityWindow: string;
  volatilityValue?: number | null;
  setVolatilityWindow: (v: string) => void;
  presets: Array<{ label: string; value: string }>;
}

const RiskAnalysis: React.FC<RiskAnalysisProps> = ({ volatilityWindow, volatilityValue, setVolatilityWindow, presets }) => {
  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
      <h2 className="text-lg font-semibold text-white mb-6">Risk Analysis</h2>
      <div className="space-y-4">
        <div className="bg-white/5 rounded-lg p-4">
          <div className="text-xs text-slate-400 uppercase tracking-wide mb-2">
            Volatility ({presets.find(opt => opt.value === volatilityWindow)?.label})
          </div>
          <div className="text-xl font-bold text-white">
            {typeof volatilityValue === 'number' ? volatilityValue.toFixed(2) : 'N/A'}%
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs text-slate-400 uppercase tracking-wide">Period</div>
          <div className="grid grid-cols-2 gap-2">
            {presets.map(preset => (
              <button
                key={preset.value}
                onClick={() => setVolatilityWindow(preset.value)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  volatilityWindow === preset.value
                    ? 'bg-blue-500 text-white'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RiskAnalysis;
