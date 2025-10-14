import * as React from 'react';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchPortfolioKpis } from '../services/portfolioService';
import { useAuth } from '../AuthContext';
import { useSelectedPortfolio } from '../SelectedPortfolioContext';
import TickerPerformanceSection from './home/components/TickerPerformanceSection';
import TickerReturnsTable from '../components/TickerReturnsTable';
import PageShell from '../components/PageShell';
// no direct fetches from this page; services are used inside child components

// --- Types ---
// no historical types needed in this page

import { API_BASE_URL, cleanApiBaseUrl } from '../apiBase';
import { apiFetch } from '../utils/apiFetch';

// -----------------------------------------------------
// Page: Asset Analysis
// -----------------------------------------------------
const AssetAnalysisPage: React.FC = () => {
  const { isLoggedIn, idToken } = useAuth();
  const { selectedPortfolio } = useSelectedPortfolio();
  const [tickersList, setTickersList] = useState<string[]>([]);
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);

  // (Portfolio list fetching is handled globally in PageShell/Home; not needed here)

  // Fetch tickers for selected portfolio
  useEffect(() => {
    const fetchTickers = async () => {
      if (!selectedPortfolio || selectedPortfolio === '--select portfolio--' || !idToken) {
        setTickersList([]);
        return;
      }
      try {
        const base = cleanApiBaseUrl(API_BASE_URL);
        const { data: json } = await apiFetch<any>(`${base}/api/portfolio/${selectedPortfolio}/tickers`, { idToken });
        let tickersList: string[] = [];
        if (Array.isArray(json)) tickersList = json;
        else if (json && Array.isArray(json.tickers)) tickersList = json.tickers;
        else if (json && Array.isArray(json.names)) tickersList = json.names;
        setTickersList(tickersList);
      } catch (e) {
        setTickersList([]);
      }
    };
    if (isLoggedIn && selectedPortfolio && selectedPortfolio !== '--select portfolio--') fetchTickers();
  }, [isLoggedIn, selectedPortfolio, idToken]);

  // Set default selector value
  // No sentinel; rely on null and optional auto-select in PageShell

  // availableTickers for TickerPerformanceSection
  const availableTickers = tickersList.map((symbol: string) => ({ id: symbol, name: symbol }));

  // Fetch portfolio KPIs so we can replicate SimpleHome's default selected ticker behavior
  const { data: kpis } = useQuery({
    queryKey: ['portfolioKpis', selectedPortfolio, isLoggedIn, idToken],
    queryFn: () => selectedPortfolio ? fetchPortfolioKpis(selectedPortfolio) : null,
    enabled: !!selectedPortfolio && !!isLoggedIn && !!idToken
  });

  // Auto-select best performing ticker (same logic used in SimpleHome)
  useEffect(() => {
    if (kpis?.net_performance_tickers?.length > 0 && selectedTickers.length === 0 && availableTickers.length > 0) {
      const bestPerformer = kpis.net_performance_tickers[0];
      if (bestPerformer && availableTickers.some((t: { id: string; name: string }) => t.id === bestPerformer.ticker)) {
        setSelectedTickers([bestPerformer.ticker]);
      }
    }
  }, [kpis, selectedTickers.length, availableTickers]);

  // Fix GenericPerformanceSection usage: pass a default valueType and onValueTypeChange
  return (
    <PageShell
      title="Asset Analysis"
    >
      {/* Early prompt when not signed in or portfolio not selected */}
      {(!isLoggedIn || !selectedPortfolio) && (
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 sm:p-6 text-center">
          <p className="text-gray-300">{isLoggedIn ? 'Please select a portfolio to view analysis.' : 'Please sign in to access portfolio analysis.'}</p>
        </div>
      )}

      {/* Content when a portfolio is selected */}
      {isLoggedIn && selectedPortfolio && (
        <div className="grid grid-cols-1 gap-6 px-4 sm:px-6 lg:px-8">
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-3 sm:p-4 shadow-lg">
            {/* <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-white">Asset Returns</h2>
            </div> */}

            {/* Fixed-height scrollable area for many assets; allow horizontal scroll for wide tables */}
            <div className="max-h-72 sm:max-h-96 overflow-y-auto overflow-x-auto">
              <TickerReturnsTable
                portfolio={selectedPortfolio}
                idToken={idToken}
                selectedTickers={selectedTickers}
                onSelectedTickersChange={setSelectedTickers}
              />
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-3 sm:p-4 shadow-lg">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-5 bg-gradient-to-b from-purple-400 to-purple-600 rounded-full"></div>
              <h2 className="text-lg font-bold text-white">Holdings Analysis</h2>
            </div>

            <div className="bg-gradient-to-br from-slate-800/30 to-slate-700/20 rounded-xl p-3 sm:p-4 border border-white/10 overflow-x-auto">
              <TickerPerformanceSection
                selectedPortfolio={selectedPortfolio}
                availableTickers={availableTickers}
                selectedTickers={selectedTickers}
                onSelectedTickersChange={setSelectedTickers}
              />
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
};

export default AssetAnalysisPage;
