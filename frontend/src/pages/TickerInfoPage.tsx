import React, { useState, useEffect } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { searchTickers, TickerSearchResultItem } from '../services/marketDataService';

const TickerInfoPage: React.FC = () => {
  const [symbolInput, setSymbolInput] = useState<string>('');
  const [suggestions, setSuggestions] = useState<TickerSearchResultItem[]>([]);
  const [searchLoading, setSearchLoading] = useState<boolean>(false);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [inputType, setInputType] = useState<'isin' | 'symbol' | 'name'>('symbol');
  const [error, setError] = useState<string | null>(null);

  const classifyInput = (raw: string): 'isin' | 'symbol' | 'name' => {
    const v = (raw || '').trim().toUpperCase();
    if (!v) return 'name';
    // ISIN pattern: 2 letters + 9 alnum + 1 digit (total 12 chars)
    if (/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(v)) return 'isin';
    // Symbol heuristic: only allowed chars A-Z0-9 . -, no spaces, length reasonable
    if (/^[A-Z0-9][A-Z0-9\.\-]{0,14}$/.test(v) && !v.includes(' ')) return 'symbol';
    return 'name';
  };

  // Track input type as user types
  useEffect(() => {
    setInputType(classifyInput(symbolInput));
  }, [symbolInput]);

  // Search only when suggestions panel is explicitly requested (showSuggestions === true).
  // This prevents triggering network calls on every keystroke and keeps UX deliberate.
  useEffect(() => {
    if (!showSuggestions) return;
    const val = symbolInput.trim();
    if (val.length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setSearchLoading(true);
      try {
  // Yahoo-only symbol search (Gemini intentionally excluded from this lookup phase)
        const resp = await searchTickers(val, 'yahoo');
        if (!cancelled && resp && !resp.error && resp.results.length > 0) {
          setSuggestions(resp.results.slice(0, 15));
        } else if (!cancelled) {
          // No suggestions found. Do NOT auto-trigger backend ticker fetch anymore.
          setSuggestions([]);
        }
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [showSuggestions, inputType]);

  const handleGetInfoClick = () => {
    const raw = symbolInput.trim();
    if (!raw) {
      setError('Please enter a value.');
      return;
    }
  // Open the suggestions panel first; the effect will run a Yahoo search.
  // If no suggestions are found and the input looks like a symbol/ISIN we auto-fallback to direct fetch.
    setError(null);
    setShowSuggestions(true);
    // Also perform an immediate search on explicit user action so the button is responsive
    (async () => {
      setSearchLoading(true);
      try {
        const resp = await searchTickers(raw, 'yahoo');
        if (resp && !resp.error && resp.results.length > 0) {
          setSuggestions(resp.results.slice(0, 15));
        } else {
          setSuggestions([]);
          if (resp && resp.error) setError(`Search failed: ${resp.error}`);
        }
      } catch (e) {
        console.error('[TickerInfoPage] Search error', e);
        setError('Search failed due to a network error.');
      } finally {
        setSearchLoading(false);
      }
    })();
  };

  return (
    <div className="space-y-8">
      <div className="pb-6 border-b border-gray-700">
        <h1 className="text-4xl font-bold tracking-tight text-white flex items-center">
          <MagnifyingGlassIcon className="h-10 w-10 mr-3 text-indigo-400" />
          Ticker Lookup
        </h1>
        <p className="mt-2 text-lg text-gray-400">
          Enter a stock ticker symbol to view available matching options. (No data fetch yet)
        </p>
      </div>
      <section className="p-6 bg-gray-800 rounded-xl shadow-2xl">
        <div className="flex flex-col sm:flex-row items-end gap-4 mb-6">
          <div className="flex-grow">
            <label htmlFor="tickerInput" className="block text-sm font-medium text-gray-300 mb-1">
              Ticker Symbol (e.g., AAPL, MSFT, EVISO.MI)
            </label>
            <input
              id="tickerInput"
              type="text"
              value={symbolInput}
              onChange={(e) => {
                // While user is typing, hide suggestions and do not call search.
                setShowSuggestions(false);
                setSuggestions([]);
                setSymbolInput(e.target.value.toUpperCase());
              }}
              placeholder="Enter ticker symbol"
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none placeholder-gray-400 text-gray-100"
              onKeyPress={(e) => e.key === 'Enter' && handleGetInfoClick()}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            />
            {/* Live suggestions dropdown (proactive search) */}
            {suggestions.length > 0 && (
              <div className="mt-2 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-72 overflow-y-auto divide-y divide-gray-700">
                <div className="px-3 py-2 text-sm text-gray-300 font-semibold">Suggestions</div>
                {suggestions.map(s => (
                  <button
                    key={s.symbol}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-gray-700 focus:outline-none focus:bg-gray-700"
                    onClick={() => {
                      setSymbolInput(s.symbol.toUpperCase());
                      setShowSuggestions(false);
                      setError(null);
                      // Removed direct fetch trigger; only update input.
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-100 mr-2">{s.symbol}</span>
                      {s.exchDisp && <span className="text-xs text-indigo-300">{s.exchDisp}</span>}
                    </div>
                    <div className="text-xs text-gray-300 truncate">
                      {s.shortname || s.longname || ''} {s.currency ? `• ${s.currency}` : ''} {s.quoteType ? `• ${s.quoteType}` : ''}
                    </div>
                  </button>
                ))}
                {searchLoading && (
                  <div className="px-3 py-2 text-xs text-gray-400">Searching...</div>
                )}
              </div>
            )}
            {showSuggestions && !searchLoading && suggestions.length === 0 && symbolInput.trim().length >= 2 && (
              <div className="mt-2 text-xs text-gray-400">No matches yet – refine your search.</div>
            )}
          </div>
          <button
            onClick={handleGetInfoClick}
            disabled={!symbolInput.trim()}
            className="w-full sm:w-auto flex items-center justify-center px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-800"
          >
            <MagnifyingGlassIcon className="h-5 w-5 mr-2" /> Search
          </button>
        </div>
        {error && (
          <div className="mt-4 text-sm text-red-300">{error}</div>
        )}
      </section>
    </div>
  );
};

export default TickerInfoPage;
