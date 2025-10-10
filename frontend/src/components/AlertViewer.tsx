import React from 'react';
import type { AlertCondition } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  triggered: AlertCondition[];
  portfolioName: string;
  onOpenSetup: () => void;
}

const AlertViewer: React.FC<Props> = ({ open, onClose, triggered, portfolioName, onOpenSetup }) => {
  if (!open) return null;

  const formatValue = (value: number | null | undefined, type: string) => {
    if (value === null || value === undefined) return 'N/A';
    if (type === 'volatility' || type === 'portfolio_return' || type === 'ticker_return') {
      return `${value.toFixed(2)}%`;
    }
    return value.toString();
  };

  const getAlertIcon = (comparison: string) => {
    return comparison === 'above' ? '📈' : '📉';
  };

  const getAlertSeverity = (condition: AlertCondition) => {
    const measured = (condition as any).measured_value;
    const threshold = condition.threshold;
    if (measured === null || measured === undefined) return 'unknown';
    
    const diff = Math.abs(measured - threshold);
    const pct = (diff / Math.abs(threshold)) * 100;
    
    if (pct > 50) return 'high';
    if (pct > 20) return 'medium';
    return 'low';
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
        <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose}></div>
        
        <div className="relative transform overflow-hidden rounded-lg bg-slate-800 border border-slate-700 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg">
          {/* Header */}
          <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-4 py-3 border-b border-slate-600">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-rose-500 to-red-600 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h11z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Portfolio Alerts</h3>
                  <p className="text-sm text-slate-400">{portfolioName}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="px-4 py-4">
            {triggered.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h4 className="text-lg font-medium text-white mb-2">All Clear</h4>
                <p className="text-slate-400">No alerts are currently triggered for this portfolio.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-semibold text-white">
                    {triggered.length} Alert{triggered.length === 1 ? '' : 's'} Triggered
                  </h4>
                  <span className="text-xs text-slate-400">
                    {new Date().toLocaleTimeString()}
                  </span>
                </div>

                {triggered.map((alert, index) => {
                  const severity = getAlertSeverity(alert);
                  const measuredValue = (alert as any).measured_value;
                  
                  return (
                    <div
                      key={alert.id || index}
                      className={`
                        p-4 rounded-lg border-l-4 
                        ${severity === 'high' 
                          ? 'bg-red-500/10 border-red-500 border-l-red-500' 
                          : severity === 'medium'
                          ? 'bg-orange-500/10 border-orange-500 border-l-orange-500'
                          : 'bg-yellow-500/10 border-yellow-500 border-l-yellow-500'
                        }
                      `}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">{getAlertIcon(alert.comparison)}</span>
                            <h5 className="font-semibold text-white text-sm">
                              {alert.name || `${alert.type} Alert`}
                            </h5>
                            <span className={`
                              px-2 py-1 rounded-full text-xs font-medium
                              ${severity === 'high' 
                                ? 'bg-red-500/20 text-red-300' 
                                : severity === 'medium'
                                ? 'bg-orange-500/20 text-orange-300'
                                : 'bg-yellow-500/20 text-yellow-300'
                              }
                            `}>
                              {severity.toUpperCase()}
                            </span>
                          </div>
                          
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between text-slate-300">
                              <span>Current Value:</span>
                              <span className="font-medium text-white">
                                {formatValue(measuredValue, alert.type)}
                              </span>
                            </div>
                            <div className="flex justify-between text-slate-300">
                              <span>Threshold:</span>
                              <span className="font-medium">
                                {alert.comparison === 'above' ? '>' : '<'} {formatValue(alert.threshold, alert.type)}
                              </span>
                            </div>
                            {alert.type === 'volatility' && alert.period && (
                              <div className="flex justify-between text-slate-300">
                                <span>Period:</span>
                                <span>{alert.period}</span>
                              </div>
                            )}
                            {(alert.type === 'portfolio_return' || alert.type === 'ticker_return') && alert.timeframe && (
                              <div className="flex justify-between text-slate-300">
                                <span>Timeframe:</span>
                                <span>{alert.timeframe}</span>
                              </div>
                            )}
                            {alert.type === 'ticker_return' && alert.ticker && (
                              <div className="flex justify-between text-slate-300">
                                <span>Ticker:</span>
                                <span className="font-mono">{alert.ticker}</span>
                              </div>
                            )}
                          </div>
                          
                          {alert.description && (
                            <p className="text-xs text-slate-400 mt-2 italic">
                              {alert.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-slate-700/50 px-4 py-3 flex justify-between items-center">
            <button
              onClick={onOpenSetup}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Manage Alerts
            </button>
            <button
              onClick={onClose}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-slate-600 hover:bg-slate-500 rounded-md transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AlertViewer;