import React, { useState } from 'react';
import ActionButton from './ActionButton';

interface TickerSuggestion {
  symbol: string;
  name: string;
  source?: string; // 'yahoo' or other sources; do not display 'original' in the UI
  exchange?: string;
  quoteType?: string;
  confidence?: number;
}

interface PendingResolution {
  original_ticker: string;
  suggestions: TickerSuggestion[];
  sample_transaction: {
    name: string;
    description: string;
    date: string;
    quantity: number;
    price: number;
    operation: string;
    isin?: string;
  };
  affected_transaction_count: number;
}

interface Props {
  open: boolean;
  pendingResolutions: PendingResolution[];
  onResolve: (resolutions: Array<{original_ticker: string, chosen_symbol: string}>) => void;
  onCancel: () => void;
  loading?: boolean;
}

const TickerResolutionModal: React.FC<Props> = ({
  open,
  pendingResolutions,
  onResolve,
  onCancel,
  loading = false
}) => {
  const [selectedChoices, setSelectedChoices] = useState<{[key: string]: string}>({});
  const [expandedDetails, setExpandedDetails] = useState<{[key: string]: string}>({});
  const [showCustomInput, setShowCustomInput] = useState<{[key: string]: boolean}>({});
  const [customInputs, setCustomInputs] = useState<{[key: string]: string}>({});

  if (!open) return null;

  const handleTickerSelect = (originalTicker: string, chosenSymbol: string) => {
    setSelectedChoices(prev => ({
      ...prev,
      [originalTicker]: chosenSymbol
    }));
  };

  const handleResolve = () => {
    const resolutions = pendingResolutions.map(pending => ({
      original_ticker: pending.original_ticker,
      chosen_symbol: selectedChoices[pending.original_ticker] || ''
    })).filter(r => r.chosen_symbol); // Only include resolutions where user made a choice

    if (resolutions.length === 0) {
      alert('Please select at least one ticker option to proceed.');
      return;
    }

    onResolve(resolutions);
  };



  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black bg-opacity-70 p-4 pt-20 sm:pt-0 overflow-y-auto">
      <div className="bg-gray-900 p-6 rounded-xl shadow-2xl w-full max-w-4xl mt-6 sm:my-auto mx-auto max-h-screen overflow-y-auto">
        <h2 className="text-2xl font-bold text-white mb-4">Resolve Ticker Symbols</h2>
        <p className="text-gray-300 mb-6">
          Some ticker symbols could not be found. Please select the correct symbol for each:
        </p>

        <div className="space-y-6">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                // Apply imported/original identifier for every pending resolution
                const newMap: {[key: string]: string} = { ...selectedChoices };
                pendingResolutions.forEach(p => {
                  if (p.original_ticker) newMap[p.original_ticker] = p.original_ticker;
                });
                setSelectedChoices(newMap);
              }}
              className="text-xs text-indigo-300 hover:underline mr-2"
            >
              Use imported for all
            </button>
          </div>
          {pendingResolutions.map((pending, index) => (
            <div key={pending.original_ticker} className="border border-gray-700 rounded-lg p-4 bg-gray-800">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-white mb-2">Unresolved symbol</h3>
                <div className="text-sm text-gray-400 mb-2 space-y-1">
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-gray-400">Identifier:</div>
                    <div className="text-white font-semibold">{pending.original_ticker}</div>
                    {pending.sample_transaction.isin && (
                      <div className="text-xs text-gray-400">ISIN: <span className="text-gray-300 ml-1">{pending.sample_transaction.isin}</span></div>
                    )}
                  </div>
                  {pending.sample_transaction.name && (
                    <div>Company: <span className="text-gray-300">{pending.sample_transaction.name}</span></div>
                  )}
                  {pending.sample_transaction.description && (
                    <div>Description: <span className="text-gray-300">{pending.sample_transaction.description}</span></div>
                  )}
                  <div>
                    Sample transaction: {pending.sample_transaction.operation} {pending.sample_transaction.quantity} shares
                    {pending.sample_transaction.price > 0 && ` at $${pending.sample_transaction.price}`}
                    {pending.sample_transaction.date && ` on ${pending.sample_transaction.date}`}
                  </div>
                  <div className="text-indigo-400">
                    This will affect {pending.affected_transaction_count} transaction{pending.affected_transaction_count !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-300 mb-2">Select the correct ticker:</h4>
                <div className="text-xs text-gray-400 mb-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleTickerSelect(pending.original_ticker, pending.original_ticker)}
                    className="text-xs text-indigo-300 hover:underline"
                  >
                    Use imported
                  </button>
                  <span className="text-gray-500">(will accept the originally imported value)</span>
                </div>
                <div className="space-y-2">
                  {/* Do not display suggestions that were inserted as the original input fallback. */}
                  {(() => null)()}
                  {(() => {
                    const visible = (pending.suggestions || []).filter(s => s.source !== 'original');
                    if (visible.length === 0) {
                      const current = selectedChoices[pending.original_ticker] || '';
                      return (
                        <div className="ml-0">
                          <label className="block text-xs text-gray-400 mb-2">No suggestions available — enter a ticker symbol to use:</label>
                          <input
                            type="text"
                            value={current}
                            onChange={(e) => handleTickerSelect(pending.original_ticker, e.target.value.toUpperCase())}
                            placeholder="Enter ticker (e.g., AAPL or ENEL.MI)"
                            className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-gray-100"
                          />
                        </div>
                      );
                    }

                    return visible.map((suggestion, suggestionIndex) => (
                      <div key={suggestionIndex}>
                        <label
                          className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${
                            selectedChoices[pending.original_ticker] === suggestion.symbol
                              ? 'border-indigo-500 bg-indigo-900/30'
                              : 'border-gray-600 bg-gray-700/50 hover:bg-gray-700'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`ticker-${index}`}
                            value={suggestion.symbol}
                            checked={selectedChoices[pending.original_ticker] === suggestion.symbol}
                            onChange={(e) => handleTickerSelect(pending.original_ticker, e.target.value)}
                            className="mr-3 text-indigo-600"
                          />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="font-semibold text-white">{suggestion.symbol}</span>
                                {suggestion.name && (
                                  <span className="ml-2 text-gray-300">{suggestion.name}</span>
                                )}
                              </div>
                              <div className="text-sm text-gray-400">
                                {suggestion.exchange && <span>{suggestion.exchange}</span>}
                                {suggestion.quoteType && <span className="ml-2">({suggestion.quoteType})</span>}
                                {suggestion.source && (
                                  <span className="ml-2 px-2 py-1 bg-gray-600 rounded text-xs">
                                    {suggestion.source}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </label>
                        <div className="ml-12 mt-2 mb-4 text-sm text-gray-300">
                          <button
                            type="button"
                            onClick={() => setExpandedDetails(prev => ({ ...prev, [pending.original_ticker]: prev[pending.original_ticker] === suggestion.symbol ? '' : suggestion.symbol }))}
                            className="text-xs text-indigo-300 hover:underline mr-3"
                          >
                            {expandedDetails[pending.original_ticker] === suggestion.symbol ? 'Hide details' : 'View details'}
                          </button>
                          <a href={`https://finance.yahoo.com/quote/${encodeURIComponent(suggestion.symbol)}`} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-400 hover:underline">Open on Yahoo</a>
                          {expandedDetails[pending.original_ticker] === suggestion.symbol && (
                            <div className="mt-2 p-3 bg-gray-800 border border-gray-700 rounded text-xs text-gray-300">
                              <div><strong>Symbol:</strong> {suggestion.symbol}</div>
                              {suggestion.name && <div><strong>Name:</strong> {suggestion.name}</div>}
                              {suggestion.exchange && <div><strong>Exchange:</strong> {suggestion.exchange}</div>}
                              {suggestion.quoteType && <div><strong>Type:</strong> {suggestion.quoteType}</div>}
                              {suggestion.confidence !== undefined && <div><strong>Score:</strong> {String(suggestion.confidence)}</div>}
                            </div>
                          )}
                        </div>
                      </div>
                    ));
                  })()}
                  {(pending.suggestions || []).filter(s => s.source !== 'original').length > 0 && (
                    <div className="mt-2">
                      {!showCustomInput[pending.original_ticker] ? (
                        <button
                          type="button"
                          onClick={() => setShowCustomInput(prev => ({ ...prev, [pending.original_ticker]: true }))}
                          className="text-xs text-indigo-300 hover:underline"
                        >
                          Enter a custom ticker instead
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 mt-2">
                          <input
                            type="text"
                            value={customInputs[pending.original_ticker] || ''}
                            onChange={(e) => setCustomInputs(prev => ({ ...prev, [pending.original_ticker]: e.target.value.toUpperCase() }))}
                            placeholder="Custom ticker (e.g., AAPL)"
                            className="p-2 bg-gray-700 border border-gray-600 rounded-md text-gray-100 flex-1"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const val = (customInputs[pending.original_ticker] || '').trim().toUpperCase();
                              if (val) {
                                handleTickerSelect(pending.original_ticker, val);
                                setShowCustomInput(prev => ({ ...prev, [pending.original_ticker]: false }));
                              }
                            }}
                            className="px-3 py-2 bg-indigo-600 text-white rounded-md text-xs"
                          >
                            Use this
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowCustomInput(prev => ({ ...prev, [pending.original_ticker]: false }))}
                            className="text-xs text-gray-400 hover:underline"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="text-xs text-gray-500">
                Can't find the right ticker? You can cancel and try entering a different symbol in your transaction data.
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-700">
          <div className="text-sm text-gray-400">
            {Object.keys(selectedChoices).length} of {pendingResolutions.length} resolved
          </div>
          <div className="flex gap-3">
            <ActionButton 
              variant="ghost" 
              size="md" 
              onClick={onCancel} 
              disabled={loading}
            >
              Cancel
            </ActionButton>
            <ActionButton 
              variant="primary" 
              size="md" 
              onClick={handleResolve} 
              disabled={loading || Object.keys(selectedChoices).length === 0}
            >
              {loading ? 'Saving...' : `Save ${Object.keys(selectedChoices).length} Transaction${Object.keys(selectedChoices).length !== 1 ? 's' : ''}`}
            </ActionButton>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TickerResolutionModal;