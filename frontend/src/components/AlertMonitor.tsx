import React from 'react';
import ReactDOM from 'react-dom';
import type { AlertCondition } from '../types';
import { checkAlerts } from '../services/alertService';
import AlertViewer from './AlertViewer';
import AlertSetupModal from './AlertSetupModal';

interface Props {
  portfolioName?: string | null;
  pollIntervalMs?: number;
}

const AlertMonitor: React.FC<Props> = ({ portfolioName, pollIntervalMs = 60_000 }) => {
  const [triggered, setTriggered] = React.useState<AlertCondition[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [showViewer, setShowViewer] = React.useState(false);
  const [showSetupModal, setShowSetupModal] = React.useState(false);
  const [lastChecked, setLastChecked] = React.useState<Date | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    let timer: number | undefined;

    const load = async () => {
      if (!portfolioName) {
        setTriggered([]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await checkAlerts(portfolioName);
        if (!mounted) return;
        setTriggered(Array.isArray(res) ? res : []);
        setLastChecked(new Date());
      } catch (e) {
        if (mounted) {
          setError(e instanceof Error ? e.message : 'Failed to check alerts');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    timer = window.setInterval(load, pollIntervalMs);
    return () => {
      mounted = false;
      if (timer) window.clearInterval(timer);
    };
  }, [portfolioName, pollIntervalMs]);

  if (!portfolioName) return null;

  const hasTriggered = triggered.length > 0;
  const formatLastChecked = () => {
    if (!lastChecked) return '';
    const now = new Date();
    const diffMs = now.getTime() - lastChecked.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins === 1) return '1 min ago';
    if (diffMins < 60) return `${diffMins} mins ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours === 1) return '1 hour ago';
    return `${diffHours} hours ago`;
  };

  const tooltipContent = error 
    ? `Error: ${error}`
    : hasTriggered 
    ? `${triggered.length} alert${triggered.length === 1 ? '' : 's'} triggered\nLast checked: ${formatLastChecked()}`
    : `No alerts triggered\nLast checked: ${formatLastChecked()}`;

  return (
    <>
      <div className="relative group">
        <button
          onClick={() => setShowViewer(true)}
          className={`
            ml-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200
            ${hasTriggered 
              ? 'bg-gradient-to-r from-rose-500/20 to-red-500/20 border border-rose-500/30 text-rose-200 hover:from-rose-500/30 hover:to-red-500/30 hover:border-rose-500/40' 
              : error
              ? 'bg-gradient-to-r from-orange-500/20 to-amber-500/20 border border-orange-500/30 text-orange-200 hover:from-orange-500/30 hover:to-amber-500/30 hover:border-orange-500/40'
              : 'bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 hover:border-white/20'
            }
            hover:scale-105 active:scale-95 shadow-sm hover:shadow-md
          `}
          title={tooltipContent}
          aria-label="Portfolio Alerts"
        >
          {/* Bell Icon with animation */}
          <div className="relative">
            <svg 
              className={`w-4 h-4 transition-all duration-200 ${hasTriggered ? 'animate-pulse text-rose-300' : error ? 'text-orange-300' : 'text-slate-300'}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h11z" />
            </svg>
            {hasTriggered && (
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full animate-ping"></div>
            )}
          </div>

          {/* Status Display */}
          {loading ? (
            <div className="flex items-center gap-1">
              <div className="w-1 h-1 bg-current rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              <div className="w-1 h-1 bg-current rounded-full animate-bounce [animation-delay:-0.15s]"></div>
              <div className="w-1 h-1 bg-current rounded-full animate-bounce"></div>
            </div>
          ) : error ? (
            <div className="flex items-center gap-1">
              <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="text-xs">Error</span>
            </div>
          ) : hasTriggered ? (
            <div className="flex items-center gap-1">
              <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-gradient-to-r from-rose-500 to-red-600 rounded-full shadow-sm">
                {triggered.length}
              </span>
              <span className="hidden sm:inline text-xs font-semibold">Alert{triggered.length === 1 ? '' : 's'}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
              <span className="hidden sm:inline text-xs">All Clear</span>
            </div>
          )}
        </button>

        {/* Enhanced Tooltip */}
        <div className="invisible group-hover:visible absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 z-50">
          <div className="bg-slate-800 text-white text-xs rounded-lg py-2 px-3 shadow-lg border border-slate-600 whitespace-pre-line">
            {tooltipContent}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2">
              <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-800"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Alert Viewer */}
      {/* Portal for AlertViewer to render outside component hierarchy */}
      {showViewer && ReactDOM.createPortal(
        <AlertViewer
          open={showViewer}
          onClose={() => setShowViewer(false)}
          triggered={triggered}
          portfolioName={portfolioName}
          onOpenSetup={() => {
            setShowViewer(false);
            setShowSetupModal(true);
          }}
        />,
        document.body
      )}

      {/* Portal for Alert Setup Modal to render outside component hierarchy */}
      {showSetupModal && ReactDOM.createPortal(
        <AlertSetupModal
          open={showSetupModal}
          onClose={() => setShowSetupModal(false)}
          portfolioName={portfolioName}
        />,
        document.body
      )}
    </>
  );
};

export default AlertMonitor;
