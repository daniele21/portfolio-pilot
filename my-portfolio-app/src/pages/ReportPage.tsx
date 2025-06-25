import React, { useEffect, useState, Fragment } from 'react';
import { fetchPortfolioStatus, fetchTickerReport, fetchAllPortfolioNames, fetchPortfolioReport, fetchMultiTickerReport } from '../services/portfolioService';
import { useAuth } from '../AuthContext';
import { Listbox, Transition } from '@headlessui/react';
import { CheckIcon, ChevronUpDownIcon, XMarkIcon } from '@heroicons/react/20/solid';
import ReactMarkdown from 'react-markdown';
import { TrafficLight } from '../components/TrafficLight';
import FinalEvaluationCard from '../components/FinalEvaluationCard';

// --- Ticker Overview Table (modern style, no external Card or lucide-react) ---
function ExpandableCell({ text = "", isExpanded, onToggle }: { text: string; isExpanded: boolean; onToggle: () => void }) {
  const clampClass = isExpanded ? "" : "line-clamp-3";
  return (
    <div className="relative">
      <p className={`${clampClass} transition-all duration-300 text-gray-500 whitespace-pre-line`}>{text}</p>
      {!isExpanded && text.length > 140 && (
        <button
          onClick={onToggle}
          className="absolute bottom-0 right-0 flex items-center gap-1 bg-gradient-to-r from-transparent via-gray-50/60 dark:via-gray-900/60 to-gray-50/90 dark:to-gray-900/90 px-1 text-xs text-indigo-700 font-medium"
        >
          more
          <svg className="w-3 h-3 ml-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" /></svg>
        </button>
      )}
    </div>
  );
}

function TickerOverviewTable({ rows = [] }: { rows: any[] }) {
  const [tickerExpanded, setTickerExpanded] = React.useState<string | null>(null);
  const toggleRow = (id: string) => setTickerExpanded(tickerExpanded === id ? null : id);

  // Helper for row background color based on sentiment
  function getRowBg(sentiment: string | undefined) {
    if (!sentiment) return '';
    const s = sentiment.toLowerCase();
    if (s === 'positive' || s === 'low') return 'bg-green-50';
    if (s === 'neutral' || s === 'medium') return 'bg-yellow-50';
    if (s === 'negative' || s === 'high') return 'bg-red-50';
    return '';
  }

  return (
    <div className="w-full mx-auto dark:bg-gray-900 bg-white rounded-2xl shadow-sm border dark:border-gray-700 mb-6">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800">
              <th className="px-4 py-3 text-left font-medium">Ticker</th>
              <th className="px-4 py-3 text-left font-medium w-1/2">Momentum / News</th>
              <th className="px-4 py-3 text-left font-medium w-1/2">What to Evaluate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ ticker, momentum_news, what_to_evaluate, momentum_sentiment }: any, idx: number) => (
              <tr
                key={ticker}
                className={getRowBg(momentum_sentiment)}
              >
                {/* Ticker */}
                <td className="px-4 py-3 whitespace-nowrap font-semibold text-indigo-700 dark:text-indigo-300">
                  {ticker}
                </td>

                {/* Momentum / News */}
                <td className="px-4 py-3 align-top">
                  <ExpandableCell
                    text={momentum_news}
                    isExpanded={tickerExpanded === ticker + "-news"}
                    onToggle={() => toggleRow(ticker + "-news")}
                  />
                </td>

                {/* What to Evaluate */}
                <td className="px-4 py-3 align-top">
                  <ExpandableCell
                    text={what_to_evaluate}
                    isExpanded={tickerExpanded === ticker + "-eval"}
                    onToggle={() => toggleRow(ticker + "-eval")}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const ReportPage: React.FC = () => {
  const { isLoggedIn } = useAuth();
  const [portfolioNames, setPortfolioNames] = useState<string[]>([]);
  const [portfolioName, setPortfolioName] = useState<string>('main');
  const [tickers, setTickers] = useState<string[]>([]);
  const [reports, setReports] = useState<Record<string, any>>({});
  const [portfolioReport, setPortfolioReport] = useState<any | null>(null);
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [force, setForce] = useState(false);

  useEffect(() => {
    // Fetch all portfolio names on mount
    const fetchPortfolios = async () => {
      const names = await fetchAllPortfolioNames();
      setPortfolioNames(names);
      if (names.length > 0 && !names.includes(portfolioName)) {
        setPortfolioName(names[0]);
      }
    };
    if (isLoggedIn) fetchPortfolios();
  }, [isLoggedIn]);

  // Fetch tickers when portfolioName changes
  useEffect(() => {
    const fetchTickers = async () => {
      if (!portfolioName) return;
      const status = await fetchPortfolioStatus(portfolioName);
      const tickersList = (status?.holdings || []).map((h: any) => h.ticker);
      setTickers(tickersList);
      setSelectedTickers([]); // No ticker selected by default
    };
    if (isLoggedIn && portfolioName) fetchTickers();
  }, [isLoggedIn, portfolioName]);

  const handleTickerSelection = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const options = Array.from(e.target.selectedOptions).map(opt => opt.value);
    setSelectedTickers(options);
  };

  const handleGenerateReports = async (tickersToGenerate?: string[], onlyPortfolio = false, forceParam = false) => {
    setLoading(true);
    setError(null);
    try {
      if (onlyPortfolio) {
        // Call the real API for the portfolio report
        const portReport = await fetchPortfolioReport(portfolioName, forceParam);
        // Support both array and object backend responses
        let reportObj = null;
        let reportCost = null;
        if (Array.isArray(portReport?.report)) {
          reportObj = portReport.report[0];
          reportCost = portReport.report[1];
        } else if (portReport?.report) {
          reportObj = portReport.report;
          reportCost = portReport.cost ?? null;
        }
        setPortfolioReport(reportObj || null);
        setCost(typeof reportCost === 'number' ? reportCost : null);
        setLoading(false);
        return;
      }
      const status = await fetchPortfolioStatus(portfolioName);
      const tickersList = (status?.holdings || []).map((h: any) => h.ticker);
      setTickers(tickersList);
      // Fetch ticker reports (only for selected tickers)
      const reportResults: Record<string, any> = {};
      const tickersForReport = tickersToGenerate || selectedTickers;
      for (const ticker of tickersForReport) {
        const res = await fetchTickerReport(portfolioName, ticker);
        if (res && res.report) {
          reportResults[ticker] = res.report;
        } else {
          reportResults[ticker] = { error: 'No report available' };
        }
      }
      setReports(prev => ({ ...prev, ...reportResults }));
    } catch (e) {
      setError('Failed to fetch reports.');
    } finally {
      setLoading(false);
    }
  };

  // --- Helper for traffic light in tables ---
  const renderTrafficLight = (sentiment: string | undefined | null) => <TrafficLight sentiment={sentiment} className="inline-block mr-1 align-middle" />;

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Portfolio & Ticker Report</h1>
      <div className="mb-6 flex flex-col md:flex-row md:items-end md:gap-6 gap-2">
        <div>
          <label htmlFor="portfolio-select" className="block text-sm font-medium text-gray-700 mb-1">Select Portfolio:</label>
          <select
            id="portfolio-select"
            className="bg-gray-100 border border-gray-300 rounded px-3 py-2"
            value={portfolioName}
            onChange={e => setPortfolioName(e.target.value)}
          >
            {portfolioNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 mt-2 md:mt-0">
          <button
            className="px-4 py-2 rounded bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:opacity-50"
            onClick={() => handleGenerateReports(undefined, true, force)}
            disabled={loading || !portfolioName}
          >
            {loading ? 'Generating Reports...' : 'Generate Portfolio Report'}
          </button>
          <label className="flex items-center text-xs text-gray-600 ml-1">
            <input
              type="checkbox"
              checked={force}
              onChange={e => setForce(e.target.checked)}
              className="form-checkbox h-4 w-4 text-indigo-600 mr-1"
            />
            Force
          </label>
          {cost !== null && (
            <span className="text-xs text-gray-500 bg-gray-100 rounded px-2 py-1 border border-gray-200 ml-1">Cost: ${cost.toFixed(4)}</span>
          )}
        </div>
      </div>
      <p className="mb-4">This page generates a report for your portfolio and for each ticker, helping you understand performance and key factors.</p>
      {loading && <div className="text-gray-400">Loading reports...</div>}
      {error && <div className="text-red-500">{error}</div>}
      {/* Portfolio Report Section (now collapsible) */}
      <div className="bg-white rounded-xl shadow-md p-6 mb-10">
        <CollapsibleSection section="Portfolio Report" text="" defaultOpen={true}>
          {/* Portfolio Overview as prominent introduction (no card UI) */}
          {portfolioReport && portfolioReport.portfolio_report ? (
            <div className="space-y-6">
              {portfolioReport.portfolio_report.portfolio_overview && (
                <div className="mb-6">
                  <h3 className="text-lg font-bold mb-2 text-indigo-700">Portfolio Overview</h3>
                  <div className="prose prose-sm dark:prose-invert leading-relaxed max-w-prose mx-auto text-muted-foreground">
                    <ReactMarkdown components={{ strong: ({node, ...props}) => <strong className="font-bold text-indigo-800 dark:text-indigo-300" {...props} /> }}>
                      {portfolioReport.portfolio_report.portfolio_overview}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
              {/* Final Evaluation Card */}
              {portfolioReport.portfolio_report.final_evaluation && (
                <FinalEvaluationCard data={portfolioReport.portfolio_report.final_evaluation} />
              )}
              {/* Overview Table */}
              {Array.isArray(portfolioReport.overview) && portfolioReport.overview.length > 0 && (
                <CollapsibleSectionTable title="Ticker Overview">
                  <TickerOverviewTable rows={portfolioReport.overview} />
                </CollapsibleSectionTable>
              )}
              {/* Weight Check Table */}
              {Array.isArray(portfolioReport.weight_check) && portfolioReport.weight_check.length > 0 && (
                <CollapsibleSectionTable title="Weight Check">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800">
                        <th className="px-4 py-3 text-left font-medium">Macro-class</th>
                        <th className="px-4 py-3 text-left font-medium">Value</th>
                        <th className="px-4 py-3 text-left font-medium">% on Portfolio</th>
                        <th className="px-4 py-3 text-left font-medium">Suggestions</th>
                        <th className="px-4 py-3 text-left font-medium">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portfolioReport.weight_check
                        .slice()
                        .sort((a: any, b: any) => {
                          const aKey = typeof a.sentiment === 'string' ? a.sentiment.toLowerCase() : '';
                          const bKey = typeof b.sentiment === 'string' ? b.sentiment.toLowerCase() : '';
                          const aVal = aKey in sentimentOrder ? sentimentOrder[aKey] : 1;
                          const bVal = bKey in sentimentOrder ? sentimentOrder[bKey] : 1;
                          return aVal - bVal;
                        })
                        .map((row: any, idx: number) => {
                          let bg = '';
                          if (row.sentiment) {
                            const s = row.sentiment.toLowerCase();
                            if (s === 'positive' || s === 'low') bg = 'bg-green-50';
                            else if (s === 'neutral' || s === 'medium') bg = 'bg-yellow-50';
                            else if (s === 'negative' || s === 'high') bg = 'bg-red-50';
                          }
                          return (
                            <tr key={idx} className={bg}>
                              <td className="px-4 py-3 whitespace-nowrap">{row.macro_class}</td>
                                <td className="px-4 py-3">{parseInt(row.value, 10)} €</td>
                              <td className="px-4 py-3">{row.percent_on_portfolio} %</td>
                              <td className="px-4 py-3">{row.suggestions || row.suggested_actions}</td>
                              <td className="px-4 py-3">{row.reason || row.rationale}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </CollapsibleSectionTable>
              )}
              {/* Diversification Analysis Table */}
              {Array.isArray(portfolioReport.portfolio_report.diversification_analysis) && portfolioReport.portfolio_report.diversification_analysis.length > 0 && (
                <CollapsibleSectionTable title="Diversification Analysis">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800">
                        {/* Ensure 'Diversification' is always the first column if present */}
                        {(() => {
                          const keys = Object.keys(portfolioReport.portfolio_report.diversification_analysis[0] || {}).filter(col => col.toLowerCase() !== 'attention');
                          const divIdx = keys.findIndex(k => k.toLowerCase() === 'diversification');
                          if (divIdx > 0) {
                            const [div] = keys.splice(divIdx, 1);
                            keys.unshift(div);
                          }
                          return keys.map((col) => (
                            <th key={col} className="px-4 py-3 text-left font-medium">{col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</th>
                          ));
                        })()}
                      </tr>
                    </thead>
                    <tbody>
                      {/* Sort rows by attention level: high/negative first, then medium/neutral, then low/positive */}
                      {portfolioReport.portfolio_report.diversification_analysis.slice().sort((a: any, b: any) => {
                        const aKey = typeof a.attention === 'string' ? a.attention.toLowerCase() : '';
                        const bKey = typeof b.attention === 'string' ? b.attention.toLowerCase() : '';
                        const aVal = aKey in attentionOrder ? attentionOrder[aKey] : 1;
                        const bVal = bKey in attentionOrder ? attentionOrder[bKey] : 1;
                        return aVal - bVal;
                      }).map((row: any, idx: number) => {
                        let bg = '';
                        if (row.attention) {
                          const s = row.attention.toLowerCase();
                          if (s === 'low' || s === 'positive') bg = 'bg-green-50';
                          else if (s === 'medium' || s === 'neutral') bg = 'bg-yellow-50';
                          else if (s === 'high' || s === 'negative') bg = 'bg-red-50';
                        }
                        // Ensure 'Diversification' is always the first cell if present
                        const entries = Object.entries(row).filter(([key]) => key.toLowerCase() !== 'attention');
                        const divIdx = entries.findIndex(([key]) => key.toLowerCase() === 'diversification');
                        if (divIdx > 0) {
                          const [div] = entries.splice(divIdx, 1);
                          entries.unshift(div);
                        }
                        return (
                          <tr key={idx} className={bg}>
                            {entries.map(([key, val], i) => (
                              <td key={i} className="px-4 py-3">{val}</td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CollapsibleSectionTable>
              )}
              {/* Portfolio Report Bullets */}
              <div className="space-y-4 mt-6">
                <CollapsibleSection section="Portfolio Insights" text="" defaultOpen={true}>
                  <InsightsAccordion data={{
                    main_risks: portfolioReport.portfolio_report.main_risks,
                    key_strengths: portfolioReport.portfolio_report.key_strengths,
                    notable_events: portfolioReport.portfolio_report.notable_events
                  }} />
                </CollapsibleSection>
                {Object.entries(portfolioReport.portfolio_report).map(([section, text]) => {
                  if ([
                    'diversification_analysis',
                    'main_risks',
                    'events',
                    'final_evaluation',
                    'key_strengths',
                    'notable_events',
                    'portfolio_overview',
                  ].includes(section)) return null;
                  return <CollapsibleSection key={section} section={section} text={typeof text === 'string' ? text : ''} />;
                })}
              </div>
            </div>
          ) : (
            <p className="text-gray-400">No portfolio report available.</p>
          )}
        </CollapsibleSection>
      </div>
      {/* Ticker Report Selector and Section */}
      <div className="mb-4 flex items-end gap-2">
        <div className="max-w-xs flex-1">
          <label htmlFor="ticker-select" className="block text-sm font-medium text-gray-700 mb-1">Select Ticker(s):</label>
          <Listbox value={selectedTickers} onChange={setSelectedTickers} multiple>
            <div className="relative mt-1 w-full">
              <Listbox.Button className="relative w-full cursor-default rounded-lg bg-gray-100 py-2 pl-3 pr-10 text-left border border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm min-h-[44px] max-w-xs">
                {selectedTickers.length > 1 ? (
                  <span className="text-indigo-700 font-semibold">{selectedTickers.length} tickers selected</span>
                ) : (
                  <span className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                    {selectedTickers.length === 0 && <span className="text-gray-400">Choose tickers...</span>}
                    {selectedTickers.map((symbol) => (
                      <span key={symbol} className="flex items-center bg-indigo-600 text-white rounded px-2 py-0.5 text-xs font-semibold mr-1 mb-1">
                        {symbol}
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label={`Remove ${symbol}`}
                          className="ml-1 text-indigo-200 hover:text-white focus:outline-none cursor-pointer"
                          onClick={e => {
                            e.stopPropagation();
                            setSelectedTickers(selectedTickers.filter(t => t !== symbol));
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedTickers(selectedTickers.filter(t => t !== symbol));
                            }
                          }}
                        >
                          <XMarkIcon className="h-3 w-3" />
                        </span>
                      </span>
                    ))}
                  </span>
                )}
                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                  <ChevronUpDownIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                </span>
              </Listbox.Button>
              <Transition as={Fragment} leave="transition ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0">
                <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm border border-gray-300">
                  {tickers.map((ticker) => (
                    <Listbox.Option
                      key={ticker}
                      className={({ active }) =>
                        `relative cursor-pointer select-none py-2 pl-10 pr-4 ${active ? 'bg-indigo-100 text-indigo-900' : 'text-gray-900'}`
                      }
                      value={ticker}
                    >
                      {({ selected }) => (
                        <>
                          <span className={`block truncate ${selected ? 'font-semibold' : 'font-normal'}`}>{ticker}</span>
                          {selected ? (
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-indigo-600">
                              <CheckIcon className="h-5 w-5" aria-hidden="true" />
                            </span>
                          ) : null}
                        </>
                      )}
                    </Listbox.Option>
                  ))}
                </Listbox.Options>
              </Transition>
            </div>
          </Listbox>
        </div>
        <button
          className="px-3 py-2 rounded bg-indigo-500 text-white font-semibold hover:bg-indigo-400 disabled:opacity-50"
          onClick={() => handleGenerateReports(selectedTickers, false)}
          disabled={loading || selectedTickers.length === 0}
        >
          {loading ? 'Generating...' : 'Generate Ticker Report'}
        </button>
        <button
          className="px-3 py-2 rounded bg-green-600 text-white font-semibold hover:bg-green-500 disabled:opacity-50"
          onClick={async () => {
            if (selectedTickers.length < 2) {
              setError('Select at least two tickers for a multi-ticker report.');
              return;
            }
            setLoading(true);
            setError(null);
            try {
              // Call the multi-ticker report API (assume fetchMultiTickerReport exists)
              // You may need to implement fetchMultiTickerReport in your service
              const res = await fetchMultiTickerReport(portfolioName, selectedTickers);
              if (res && res.report) {
                setReports(prev => ({ ...prev, multi: res.report }));
              } else {
                setError('No multi-ticker report available.');
              }
            } catch (e) {
              setError('Failed to fetch multi-ticker report.');
            } finally {
              setLoading(false);
            }
          }}
          disabled={loading || selectedTickers.length < 2}
        >
          {loading ? 'Generating...' : 'Generate Multi Ticker Report'}
        </button>
      </div>
      {/* Show multi-ticker report if present */}
      {reports.multi && (
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <h3 className="text-lg font-bold mb-2">Multi Ticker Report</h3>
          <div className="space-y-2">
            {Object.entries(reports.multi).map(([section, text]) => (
              <div key={section}>
                <div className="font-semibold text-green-700 mb-1">{section.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</div>
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown>{typeof text === 'string' ? text.replace(/^\*\s{2,}/gm, '* ') : ''}</ReactMarkdown>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {selectedTickers.map(ticker => (
        <div key={ticker} className="bg-white rounded-xl shadow-md p-6 mb-6">
          <h3 className="text-lg font-bold mb-2">{ticker}</h3>
          {reports[ticker]?.error ? (
            <p className="text-red-400">{reports[ticker].error}</p>
          ) : reports[ticker] ? (
            <TickerReportCard report={reports[ticker]} ticker={ticker} />
          ) : (
            <p className="text-gray-400">Report unavailable</p>
          )}
        </div>
      ))}
    </div>
  );
};

// CollapsibleSection component (move outside ReportPage)
function CollapsibleSection({ section, text, children, defaultOpen = false }: { section: string; text: string; children?: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        className="flex items-center w-full font-semibold text-indigo-700 mb-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls={`section-${section}`}
      >
        <span className="flex-1 text-left">{section.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
        <svg
          className={`w-4 h-4 ml-2 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {open && (
        <div id={`section-${section}`} className="prose prose-sm max-w-none border-l-2 border-indigo-200 pl-3 mb-2">
          {children ? children : <ReactMarkdown>{typeof text === 'string' ? text.replace(/^\*\s{2,}/gm, '* ') : ''}</ReactMarkdown>}
        </div>
      )}
    </div>
  );
}

// CollapsibleSectionTable component for collapsible tables
function CollapsibleSectionTable({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="w-full mx-auto dark:bg-gray-900 bg-white rounded-2xl shadow-sm border dark:border-gray-700 mb-6">
      <button
        type="button"
        className="flex items-center w-full p-4 pb-0 font-semibold text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls={`section-table-${title}`}
      >
        <span className="flex-1 text-left text-lg tracking-tight">{title}</span>
        <svg
          className={`w-4 h-4 ml-2 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {open && (
        <div id={`section-table-${title}`} className="overflow-x-auto pt-2">
          {children}
        </div>
      )}
    </div>
  );
}

// --- Fix: Define sentimentOrder and attentionOrder at top-level if not already defined ---
const sentimentOrder: Record<string, number> = { negative: 0, high: 0, neutral: 1, medium: 1, positive: 2, low: 2 };
const attentionOrder: Record<string, number> = { high: 0, negative: 0, medium: 1, neutral: 1, low: 2, positive: 2 };

// --- Minimal placeholder components for ticker report sections ---
function StockOverviewCard({ data, ticker }: { data: any, ticker: string }) {
  if (!data) return null;
  const { valuation_summary = {}, analysts_opinion = {}, sentiment_analysis = {} } = data;
  return (
    <div className="border rounded-xl p-4 mb-4 bg-gray-50">
      <div className="font-bold text-lg mb-1">{ticker} Overview</div>
      <div className="text-sm mb-1">Trend: {valuation_summary.trend || '-'}</div>
      <div className="text-sm mb-1">Consensus: {analysts_opinion.consensus_rating || '-'}</div>
      <div className="text-sm mb-1">Sentiment: {sentiment_analysis.overall_sentiment || '-'}</div>
      <div className="text-sm mb-1">Target Price: {analysts_opinion.target_price || '-'}</div>
      <div className="text-sm mb-1">Score: {valuation_summary.score || '-'}</div>
    </div>
  );
}
function FundamentalMetricsGrid({ ratios = {}, keyMetrics = {} }: { ratios?: any, keyMetrics?: any }) {
  return (
    <div className="border rounded-xl p-4 mb-4 bg-gray-50">
      <div className="font-semibold mb-2">Key Fundamentals</div>
      <table className="min-w-full text-xs">
        <tbody>
          {Object.entries(keyMetrics).map(([k, v]) => (
            <tr key={k}><td className="pr-2 font-medium">{k}</td><td>{String(v)}</td></tr>
          ))}
          {Object.entries(ratios).map(([k, v]) => (
            <tr key={k}><td className="pr-2 font-medium">{k}</td><td>{String(v)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function EventsTimeline({ events = [] }: { events?: any[] }) {
  if (!Array.isArray(events) || events.length === 0) return null;
  return (
    <div className="border rounded-xl p-4 mb-4 bg-gray-50">
      <div className="font-semibold mb-2">Key Events</div>
      <ul className="list-disc pl-5">
        {events.map((ev, idx) => (
          <li key={idx}><span className="font-medium">{ev.event}</span> ({ev.date}): <ReactMarkdown>{ev.description}</ReactMarkdown></li>
        ))}
      </ul>
    </div>
  );
}
function RiskBenefitAccordion({ risks = [], benefits = [] }: { risks?: any[], benefits?: any[] }) {
  return (
    <div className="border rounded-xl p-4 mb-4 bg-gray-50">
      <div className="font-semibold mb-2">Potential Benefits</div>
      <ul className="list-disc pl-5 mb-2">
        {benefits.map((b, idx) => (
          <li key={idx}><span className="font-medium">{b.benefit}</span>: <ReactMarkdown>{b.description}</ReactMarkdown></li>
        ))}
      </ul>
      <div className="font-semibold mb-2">Potential Risks</div>
      <ul className="list-disc pl-5">
        {risks.map((r, idx) => (
          <li key={idx}><span className="font-medium">{r.risk}</span>: <ReactMarkdown>{r.description}</ReactMarkdown> {r.attention && <span>({r.attention})</span>}</li>
        ))}
      </ul>
    </div>
  );
}
function RecommendationCard({ rec = {} }: { rec?: any }) {
  if (!rec.action) return null;
  return (
    <div className="border rounded-xl p-4 mb-4 bg-gray-50">
      <div className="font-semibold mb-1 capitalize">{rec.action} (Priority: {rec.priority})</div>
      <div className="text-sm mb-1">Trade Size: {rec.trade_size}</div>
      <div className="text-sm mb-1">Timing: {rec.timing}</div>
      <div className="text-sm mb-1">Rationale: {rec.rationale}</div>
    </div>
  );
}

// --- Modern Ticker Report Card (portfolio-style, unified design) ---
function TickerReportCard({ report, ticker }: { report: any, ticker: string }) {
  if (!report) return <p className="text-gray-400">No report available.</p>;
  const { valuation_summary = {}, analysts_opinion = {}, sentiment_analysis = {}, fundamental_analysis = {}, key_events = [], potential_benefits = [], potential_risks = [], recommendations = [] } = report;
  const keyMetrics = fundamental_analysis.key_metrics || {};
  const ratios = fundamental_analysis.financial_ratios || {};
  // Compose a description for the card
  const description = valuation_summary.explanation || '';
  // Compose actionable recommendations for the card
  const actionable = recommendations.map((rec: any) => ({
    recommendation: rec.action,
    rationale: rec.rationale,
    recommendation_key: rec.recommendation_key,
    priority: rec.priority,
    timing: rec.timing,
    trade_size: rec.trade_size,
    trading_strategy: rec.trading_strategy
  }));
  // Compose alert if any (e.g. high risk)
  const alert = potential_risks.find((r: any) => r.attention === 'high' || r.attention === 'negative')?.description || '';
  // Card label/score
  const label = valuation_summary.trend === 'Bullish' ? 'Excellent' : valuation_summary.trend === 'Bearish' ? 'Critical' : 'Caution';
  const score = valuation_summary.score || 0;

  // --- Section components (as before) ---
  function TickerFinalEvaluationCard() {
    return (
      <FinalEvaluationCard
        data={{
          evaluation_label: label,
          score,
          evaluation_description: description,
          recommendations: actionable,
          alert,
          analysts_opinion: report.analysts_opinion,
          valuation_summary: report.valuation_summary,
          top_pros: report.top_pros,
          top_cons: report.top_cons,
          analyst_opinion: report.analyst_opinion
        }}
      />
    );
  }
  function KeyFundamentalsTable() {
    // Merge keyMetrics and ratios, and show value + analysis
    const rows: Array<{ label: string, value: any, analysis?: string }> = [];
    for (const [k, v] of Object.entries(keyMetrics)) {
      if (!k.endsWith('_analysis')) rows.push({ label: k, value: v, analysis: keyMetrics[k + '_analysis'] });
    }
    for (const [k, v] of Object.entries(ratios)) {
      if (!k.endsWith('_analysis')) rows.push({ label: k, value: v, analysis: ratios[k + '_analysis'] });
    }
    return (
      <div className="w-full mx-auto dark:bg-gray-900 bg-white rounded-2xl shadow-sm border dark:border-gray-700 mb-6">
        <div className="p-4 pb-0 font-semibold text-indigo-700 text-lg">Key Fundamentals</div>
        <div className="overflow-x-auto p-4 pt-2">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800">
                <th className="px-4 py-3 text-left font-medium">Metric</th>
                <th className="px-4 py-3 text-left font-medium">Value</th>
                <th className="px-4 py-3 text-left font-medium">Analysis</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx}>
                  <td className="px-4 py-3 whitespace-nowrap font-medium">{row.label.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</td>
                  <td className="px-4 py-3">{typeof row.value === 'number' ? row.value : String(row.value)}</td>
                  <td className="px-4 py-3 text-gray-500">{row.analysis ? <ReactMarkdown>{row.analysis}</ReactMarkdown> : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  // --- Benefits & Risks (portfolio style) ---
  function BenefitsRisksAccordion() {
    return (
      <div className="w-full mx-auto dark:bg-gray-900 bg-white rounded-2xl shadow-sm border dark:border-gray-700 mb-6">
        <div className="flex flex-col md:flex-row gap-6 p-4">
          {/* Benefits */}
          <div className="flex-1">
            <div className="font-semibold mb-2 text-green-700">Potential Benefits</div>
            <ul className="list-disc pl-5 space-y-2 text-sm leading-snug">
              {potential_benefits.map((b: any, idx: number) => (
                <li key={idx}><span className="font-medium">{b.benefit}</span>: <ReactMarkdown>{b.description}</ReactMarkdown></li>
              ))}
            </ul>
          </div>
          {/* Risks */}
          <div className="flex-1">
            <div className="font-semibold mb-2 text-red-700">Potential Risks</div>
            <ul className="list-disc pl-5 space-y-2 text-sm leading-snug">
              {potential_risks.map((r: any, idx: number) => (
                <li key={idx}>
                  <span className="font-medium">{r.risk}</span>
                  {r.attention && (
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-semibold text-white ${r.attention.toLowerCase() === 'high' || r.attention.toLowerCase() === 'negative' ? 'bg-red-600' : r.attention.toLowerCase() === 'medium' || r.attention.toLowerCase() === 'neutral' ? 'bg-yellow-500' : 'bg-green-600'}`}>{r.attention}</span>
                  )}
                  : <ReactMarkdown>{r.description}</ReactMarkdown>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }
  // --- Key Events Timeline (simple) ---
  function KeyEventsTimeline() {
    if (!Array.isArray(key_events) || key_events.length === 0) return null;
    return (
      <div className="w-full mx-auto dark:bg-gray-900 bg-white rounded-2xl shadow-sm border dark:border-gray-700 mb-6">
        <div className="p-4 pb-0 font-semibold text-indigo-700 text-lg">Key Events</div>
        <div className="p-4 pt-2">
          <ul className="space-y-2">
            {key_events.map((ev: any, idx: number) => (
              <li key={idx} className="text-sm"><span className="font-medium text-foreground dark:text-white">{ev.event}</span> <span className="text-xs text-gray-400">({ev.date})</span>: {ev.description}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }
  // --- Ticker Overview Card (top) ---
  function TickerOverviewCard() {
    return (
      <div className="w-full mx-auto dark:bg-gray-900 bg-white rounded-2xl shadow-sm border dark:border-gray-700 mb-6">
        <div className="p-4 pb-0 font-bold text-lg text-indigo-700">{ticker} Overview</div>
        <div className="p-4 pt-2 text-sm">
          <div><strong>Sentiment:</strong> <span className="capitalize">{sentiment_analysis.overall_sentiment}</span></div>
          {sentiment_analysis.recent_news && (
            <div className="mt-1">
              <strong>Recent News:</strong> <ReactMarkdown>{sentiment_analysis.recent_news}</ReactMarkdown>
            </div>
          )}

        </div>
      </div>
    );
  }
  // --- Fundamental Analysis Table Section ---
  function FundamentalNarrativeTable() {
    const fa = report.fundamental_analysis || {};
    const narrativeSections = [
      { key: 'revenue_and_ebitda', label: 'Revenue and EBITDA' },
      { key: 'profitability_and_margins', label: 'Profitability and Margins' },
      { key: 'balance_sheet_strength', label: 'Balance Sheet Strength' },
      { key: 'cash_flow_analysis', label: 'Cash Flow Analysis' },
      { key: 'valuation_metrics', label: 'Valuation Metrics' },
      { key: 'growth_drivers', label: 'Growth Drivers' },
      { key: 'capital_allocation', label: 'Capital Allocation' },
      { key: 'risk_profile', label: 'Risk Profile' },
    ];
    return (
      <div className="w-full mx-auto dark:bg-gray-900 bg-white rounded-2xl shadow-sm border dark:border-gray-700 mb-6">
        <div className="p-4 pb-0 font-semibold text-indigo-700 text-lg">Fundamental Analysis</div>
        <div className="overflow-x-auto p-4 pt-2">
          <table className="min-w-full text-sm">
            <tbody>
              {narrativeSections.map(({ key, label }) =>
                fa[key] ? (
                  <tr key={key}>
                    <td className="px-4 py-3 whitespace-nowrap align-top w-1/3 font-bold">{label}</td>
                    <td className="px-4 py-3 text-gray-800 dark:text-gray-200 whitespace-pre-line">
                      <ReactMarkdown>{fa[key]}</ReactMarkdown>
                    </td>
                  </tr>
                ) : null
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  // --- Entire Ticker Report Collapsible ---
  const [open, setOpen] = React.useState(true);
  return (
    <div className="mb-2">
      <button
        type="button"
        className="flex items-center w-full font-bold text-indigo-700 text-lg mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls={`ticker-report-${ticker}`}
      >
        <span className="flex-1 text-left">{ticker} Report</span>
        <svg
          className={`w-5 h-5 ml-2 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {open && (
        <div id={`ticker-report-${ticker}`} className="space-y-6">
          <TickerOverviewCard />
          <TickerFinalEvaluationCard />
          <FundamentalNarrativeTable />
          <KeyFundamentalsTable />
          <BenefitsRisksAccordion />
          <KeyEventsTimeline />
        </div>
      )}
    </div>
  );
};

// --- Minimal InsightsAccordion for portfolio report bullets ---
function InsightsAccordion({ data }: { data: any }) {
  if (!data) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
      {/* Key Strengths */}
      {data.key_strengths && Array.isArray(data.key_strengths) && data.key_strengths.length > 0 && (
        <div className="border-l-4 border-green-500 bg-green-50 rounded-xl p-4 shadow-sm flex flex-col">
          <div className="flex items-center mb-2">
            <svg className="w-5 h-5 text-green-600 mr-2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            <span className="font-semibold text-green-700 text-lg">Key Strengths</span>
          </div>
          <ul className="space-y-2">
            {data.key_strengths.map((s: any, idx: number) => (
              <li key={idx} className="text-sm">
                <span className="font-medium text-green-800">{s.strength}</span>{s.strength && s.description ? ': ' : ''}
                <span className="text-gray-700"><ReactMarkdown>{s.description}</ReactMarkdown></span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* Main Risks */}
      {data.main_risks && Array.isArray(data.main_risks) && data.main_risks.length > 0 && (
        <div className="border-l-4 border-red-500 bg-red-50 rounded-xl p-4 shadow-sm flex flex-col">
          <div className="flex items-center mb-2">
            <svg className="w-5 h-5 text-red-600 mr-2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" /></svg>
            <span className="font-semibold text-red-700 text-lg">Main Risks</span>
          </div>
          <ul className="space-y-2">
            {data.main_risks.map((r: any, idx: number) => (
              <li key={idx} className="text-sm">
                <span className="font-medium text-red-800">{r.risk}</span>{r.risk && r.description ? ': ' : ''}
                <span className="text-gray-700"><ReactMarkdown>{r.description}</ReactMarkdown></span>
                {r.attention && (
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-semibold text-white ${r.attention.toLowerCase() === 'high' || r.attention.toLowerCase() === 'negative' ? 'bg-red-600' : r.attention.toLowerCase() === 'medium' || r.attention.toLowerCase() === 'neutral' ? 'bg-yellow-500' : 'bg-green-600'}`}>{r.attention}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* Notable Events */}
      {data.notable_events && Array.isArray(data.notable_events) && data.notable_events.length > 0 && (
        <div className="border-l-4 border-indigo-500 bg-indigo-50 rounded-xl p-4 shadow-sm flex flex-col">
          <div className="flex items-center mb-2">
            <svg className="w-5 h-5 text-indigo-600 mr-2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3" /></svg>
            <span className="font-semibold text-indigo-700 text-lg">Notable Events</span>
          </div>
          <ul className="space-y-2">
            {data.notable_events.map((e: any, idx: number) => (
              <li key={idx} className="text-sm">
                <span className="font-medium text-indigo-800">{e.event}</span>
                {e.date && <span className="ml-1 text-xs text-indigo-500">({e.date})</span>}
                {e.event && e.description ? ': ' : ''}
                <span className="text-gray-700"><ReactMarkdown>{e.description}</ReactMarkdown></span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// --- Fix: Export all used components from this file ---
export {
  ReportPage,
  CollapsibleSection,
  CollapsibleSectionTable,
  TickerOverviewTable,
  TrafficLight,
  FinalEvaluationCard,
  StockOverviewCard,
  FundamentalMetricsGrid,
  EventsTimeline,
  RiskBenefitAccordion,
  RecommendationCard,
};

// --- Main export (for older imports) ---
export default ReportPage;
