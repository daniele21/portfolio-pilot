import React, { useEffect, useState, useRef } from 'react';
// Use react-query hook to avoid repeated manual fetch loops
import { usePortfolioStatusLive } from '../services/transactionsApi';
import { PortfolioStatusResponse } from '../types';
import { idbGet, idbSet } from '../utils/idbCache';
import { API_BASE_URL, cleanApiBaseUrl } from '../apiBase';
import { apiFetch } from '../utils/apiFetch';
import { useCallback } from 'react';
import { ArrowUpIcon, ArrowDownIcon, CheckIcon, InformationCircleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

interface PortfolioStatusCardProps {
  portfolioName: string;
  onConfigureTargets?: (assetTypes: string[], riskOptions: string[]) => void;
  onHoldingsLoaded?: (holdings: { ticker: string; name?: string }[]) => void;
}

const PortfolioStatusCard: React.FC<PortfolioStatusCardProps> = ({ portfolioName, onConfigureTargets, onHoldingsLoaded }) => {
  const [status, setStatus] = useState<PortfolioStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  // Local metadata state for holdings (persisted in IndexedDB)
  const [meta, setMeta] = useState<Record<string, { risk?: string; category?: string; assetType?: string }>>({});
  const originalMetaRef = useRef<Record<string, { risk?: string; category?: string; assetType?: string }>>({});
  const [dirty, setDirty] = useState(false);
  const CACHE_META_KEY = `status_meta:${portfolioName}`;

  // Lightweight helper to read stored ID token (avoid import resolution issues)
  const getAuthIdToken = (): string | null => {
    try { return localStorage.getItem('idToken'); } catch { return null; }
  };
  // Column resizing
  const DEFAULT_COL_WIDTHS: Record<string, number> = {
    ticker: 110,
    name: 220,
    risk: 90,
    category: 170,
    assetType: 110,
    quantity: 90,
    price: 90,
    value: 110,
  };
  const COL_WIDTHS_STORAGE_KEY = `ps_col_widths_v1`;
  const [colWidths, setColWidths] = useState<Record<string, number>>(()=>{
    try {
      const stored = localStorage.getItem(COL_WIDTHS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...DEFAULT_COL_WIDTHS, ...parsed };
      }
    } catch {/* ignore */}
    return DEFAULT_COL_WIDTHS;
  });
  const resizingRef = useRef<{ colKey: string; startX: number; startWidth: number } | null>(null);
  const tableWrapperRef = useRef<HTMLDivElement | null>(null);

  // Static options
  const RISK_OPTIONS = ['Low', 'Medium', 'High'];
  const ASSET_TYPES = ['Equity', 'Bond', 'Crypto', 'Forex', 'ETF'];

  // Load metadata when portfolioName changes
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!portfolioName) return;
      try {
        const stored = await idbGet(CACHE_META_KEY);
        if (mounted && stored && typeof stored === 'object') {
          const casted = stored as Record<string, { risk?: string; category?: string; assetType?: string }>;
          setMeta(casted);
          originalMetaRef.current = JSON.parse(JSON.stringify(casted));
          setDirty(false);
        } else {
          setMeta({});
          originalMetaRef.current = {};
          setDirty(false);
        }
      } catch (e) {
        setMeta({});
        originalMetaRef.current = {};
        setDirty(false);
      }
    })();
    return () => { mounted = false; };
  }, [portfolioName]);

  const handleMetaChange = useCallback((ticker: string, patch: Partial<{ risk?: string; category?: string; assetType?: string }>) => {
    setMeta(prev => {
      const next = { ...prev, [ticker]: { ...(prev[ticker] || {}), ...patch } };
      // detect dirty: shallow compare JSON strings (small map)
      const orig = originalMetaRef.current;
      const isDirty = JSON.stringify(next) !== JSON.stringify(orig);
      setDirty(isDirty);
      return next;
    });
  }, []);

  const handleSaveMeta = useCallback(async () => {
    try {
      // First, attempt to POST metadata to backend
      const idToken = getAuthIdToken();
      if (idToken) {
        try {
          const base = cleanApiBaseUrl(API_BASE_URL);
          const { ok } = await apiFetch(`${base}/api/portfolio/${portfolioName}/status/metadata`, { method: 'POST', idToken, body: JSON.stringify({ metadata: meta }) });
          if (!ok) console.warn('Server rejected metadata save, falling back to local cache');
        } catch (e) {
          console.warn('Failed to POST metadata to server, saving locally instead');
        }
      }
      await idbSet(CACHE_META_KEY, meta);
      originalMetaRef.current = JSON.parse(JSON.stringify(meta));
      setDirty(false);
    } catch (e) {
      console.error('Failed to save portfolio metadata', e);
    }
  }, [meta, CACHE_META_KEY]);

  // handleResetMeta intentionally removed; Reset button is commented out

  // React Query live status
  const { data: liveStatus, isFetching: statusFetching, error: statusError } = usePortfolioStatusLive(portfolioName, getAuthIdToken(), { enabled: !!portfolioName });

  // Sync into local state without changing rest of component logic
  useEffect(() => {
    if (statusFetching) setLoading(true);
    if (!statusFetching) setLoading(false);
  }, [statusFetching]);

  useEffect(() => {
    if (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Failed to fetch portfolio status.');
      setStatus(null);
    } else if (liveStatus) {
      // Some API variants return { status: { holdings: [...] } }
      const resolved = (liveStatus as any) && (liveStatus as any).status ? (liveStatus as any).status : liveStatus;
      setStatus(resolved as any);
      setError(null);
      if (onHoldingsLoaded && resolved?.holdings) {
        const holdingsForTickers = resolved.holdings.map((h: any) => ({ ticker: h.ticker, name: h.name || h.ticker }));
        onHoldingsLoaded(holdingsForTickers);
      }
    }
  }, [liveStatus, statusError, onHoldingsLoaded]);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <span className="opacity-50"><ArrowUpIcon className="h-3 w-3 inline-block" /><ArrowDownIcon className="h-3 w-3 inline-block -ml-1" /></span>;
    }
    return sortConfig.direction === 'asc' ? <ArrowUpIcon className="h-4 w-4 inline-block" /> : <ArrowDownIcon className="h-4 w-4 inline-block" />;
  };

  // Sort holdings
  const sortedHoldings = React.useMemo(() => {
    if (!status?.holdings) return [];
    if (!sortConfig) return status.holdings;
    const sorted = [...status.holdings];
    sorted.sort((a, b) => {
      let valA: any, valB: any;
      switch (sortConfig.key) {
        case 'ticker':
          valA = a.ticker;
          valB = b.ticker;
          break;
        case 'name':
          valA = 'name' in a ? (a as any).name : a.ticker;
          valB = 'name' in b ? (b as any).name : b.ticker;
          break;
        case 'quantity':
          valA = a.quantity;
          valB = b.quantity;
          break;
        case 'price':
          valA = a.price;
          valB = b.price;
          break;
        case 'value':
          valA = a.value;
          valB = b.value;
          break;
        default:
          valA = '';
          valB = '';
      }
      if (['quantity', 'price', 'value'].includes(sortConfig.key)) {
        return sortConfig.direction === 'asc'
          ? (Number(valA) - Number(valB))
          : (Number(valB) - Number(valA));
      }
      return sortConfig.direction === 'asc'
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });
    return sorted;
  }, [status, sortConfig]);

  // Use Pointer Events for consistent mouse/touch/pen handling
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!resizingRef.current) return;
      const { colKey, startX, startWidth } = resizingRef.current;
      const delta = e.clientX - startX;
      const nextWidth = Math.max(60, Math.min(1200, startWidth + delta));
      setColWidths(prev => ({ ...prev, [colKey]: nextWidth }));
    };
    const handlePointerUp = () => {
      if (resizingRef.current) {
        try { localStorage.setItem(COL_WIDTHS_STORAGE_KEY, JSON.stringify(colWidths)); } catch { /* ignore */ }
      }
      resizingRef.current = null;
      document.body.classList.remove('select-none', 'cursor-col-resize');
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  // Persist column widths whenever they change
  useEffect(() => {
    try { localStorage.setItem(COL_WIDTHS_STORAGE_KEY, JSON.stringify(colWidths)); } catch { /* ignore */ }
  }, [colWidths]);

  // Early state-based UI fragments (no hook calls after this point)
  if (!portfolioName) return <div className="text-red-400 text-sm">No portfolio selected.</div>;
  if (loading) return (
    <div className="bg-gradient-to-br from-gray-800 to-gray-850 rounded-2xl border border-gray-700/70 p-6 animate-pulse space-y-4">
      <div className="h-5 w-40 bg-gray-700/50 rounded" />
      <div className="h-4 w-24 bg-gray-700/40 rounded" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 w-full bg-gray-700/30 rounded" />
        ))}
      </div>
    </div>
  );
  if (error) return <div className="text-red-400 text-sm">{error}</div>;
  if (!status) return <div className="text-red-400 text-sm">No portfolio status data available (empty response).</div>;
  if (!status.holdings || status.holdings.length === 0) return <div className="text-yellow-400 text-sm">No holdings found for this portfolio. Try importing transactions or check your data.</div>;

  const riskChipClass = (risk?: string) => {
    if (!risk) return 'bg-gray-700/70 text-gray-300';
    switch (risk) {
      case 'Low': return 'bg-green-600/80 text-white';
      case 'Medium': return 'bg-amber-500/80 text-white';
      case 'High': return 'bg-red-600/80 text-white';
      default: return 'bg-gray-700/70 text-gray-300';
    }
  };


  // Column resize handlers (use pointer down for broad device support)
  const handleResizePointerDown = (e: React.PointerEvent, colKey: string) => {
    // Only respond to primary button / primary touch
    if ((e as any).button && (e as any).button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const th = (e.target as HTMLElement).closest('th');
    if (!th) return;
    const clientX = (e.nativeEvent as PointerEvent).clientX;
    const startWidth = th.getBoundingClientRect().width;
    resizingRef.current = { colKey, startX: clientX, startWidth };
    document.body.classList.add('select-none', 'cursor-col-resize');
  };


  const resetColumnWidth = (colKey: string) => {
    setColWidths(prev => {
      const updated = { ...prev, [colKey]: DEFAULT_COL_WIDTHS[colKey] };
      try { localStorage.setItem(COL_WIDTHS_STORAGE_KEY, JSON.stringify(updated)); } catch {/* ignore */}
      return updated;
    });
  };

  const headerClassBase = "px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider group relative select-none";
  const resizerHandle = (colKey: string) => (
    <span
      onPointerDown={(e) => handleResizePointerDown(e, colKey)}
      className="absolute top-0 right-0 h-full w-6 md:w-1.5 -mr-2 md:mr-0 cursor-col-resize bg-transparent group-hover:bg-indigo-500/50 transition-colors touch-action-none"
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${colKey} column`}
    />
  );

  const sortableHeader = (label: string, key: string) => (
    <th
      style={{ width: colWidths[key] }}
      className={`${headerClassBase} cursor-pointer hover:bg-gray-800/70`}
      onClick={(e) => { if ((e.target as HTMLElement).closest('span[role="separator"]')) return; requestSort(key); }}
      onDoubleClick={() => resetColumnWidth(key)}
    >
      <div className="flex items-center gap-1">
        <span>{label}</span>
        {getSortIcon(key)}
      </div>
      {resizerHandle(key)}
    </th>
  );

  const staticHeader = (label: string, key: string) => (
    <th
      style={{ width: colWidths[key] }}
      className={`${headerClassBase}`}
      onDoubleClick={() => resetColumnWidth(key)}
    >
      <div className="flex items-center gap-1">
        <span>{label}</span>
      </div>
      {resizerHandle(key)}
    </th>
  );

  return (
    <div className="bg-gradient-to-br from-gray-800 to-gray-850 rounded-2xl shadow-xl border border-gray-700/70 overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-5 border-b border-gray-700/70 bg-gray-900/40 backdrop-blur">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold tracking-wide text-gray-300 flex items-center gap-2">
            Holdings Overview
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-600/30 text-indigo-200">
              {sortedHoldings.length} assets
            </span>
            {status.last_updated && (
              <span className="text-[10px] text-gray-500 font-normal">Updated {new Date(status.last_updated).toLocaleTimeString()}</span>
            )}
          </h3>
          <div className="text-xs text-gray-400 flex items-center gap-1">
            <InformationCircleIcon className="h-3.5 w-3.5 text-gray-500" />
            Edit metadata then save; it syncs with backend and persists locally.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-2 py-1 rounded-md text-xs bg-gray-700/80 hover:bg-gray-600 text-gray-100"
            onClick={() => onConfigureTargets && onConfigureTargets(ASSET_TYPES, RISK_OPTIONS)}
            title="Configure target allocations"
          >
            Configure Targets
          </button>
          <button
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors shadow ${dirty ? 'bg-indigo-600/90 hover:bg-indigo-500 text-white ring-2 ring-indigo-400/40' : 'bg-gray-700/80 hover:bg-gray-600 text-gray-100'}`}
            disabled={!dirty}
            onClick={handleSaveMeta}
            title={dirty ? 'Save metadata changes' : 'No changes to save'}
          >
            {dirty ? <ArrowPathIcon className="h-4 w-4 animate-spin-slow" /> : <CheckIcon className="h-4 w-4" />} {dirty ? 'Save Changes' : 'Saved'}
          </button>
          {/* <button
            className="px-3 py-1.5 rounded-lg bg-red-700/80 hover:bg-red-600 text-white text-xs font-semibold transition-colors shadow"
            onClick={handleResetMeta}
            title="Reset all metadata fields"
          >Reset</button> */}
        </div>
      </div>

      {/* Desktop / Tablet Table */}
      <div ref={tableWrapperRef} className="hidden sm:block overflow-x-auto max-h-[480px] scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
        <table className="min-w-full divide-y divide-gray-700 relative table-fixed" id="portfolio-status-table">
          <thead className="bg-gray-900/75 backdrop-blur sticky top-0 z-20">
            <tr>
              {sortableHeader('Ticker', 'ticker')}
              {sortableHeader('Name', 'name')}
              {staticHeader('Risk', 'risk')}
              {staticHeader('Category', 'category')}
              {staticHeader('Asset Type', 'assetType')}
              {sortableHeader('Qty', 'quantity')}
              {sortableHeader('Price', 'price')}
              {sortableHeader('Value', 'value')}
            </tr>
          </thead>
          <tbody className="bg-gray-800/40 divide-y divide-gray-700/60">
            {sortedHoldings.map((h) => {
              const ticker = h.ticker;
              const m = meta[ticker] || {};
              return (
                <tr key={ticker} className="hover:bg-gray-800/70 transition-colors">
                  <td style={{ width: colWidths.ticker }} className="px-4 py-3 text-white whitespace-nowrap font-medium tracking-wide">{h.ticker}</td>
                  <td style={{ width: colWidths.name }} className="px-4 py-3 text-gray-200 whitespace-nowrap max-w-full truncate relative group">
                    <div className="truncate" >{'name' in h ? (h as any).name : h.ticker}</div>
                    {/* Tooltip */}
                    <div className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute left-0 top-full mt-1 z-50 bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-xl whitespace-normal max-w-xs w-max min-w-[140px] border border-gray-700">
                      {'name' in h ? (h as any).name : h.ticker}
                    </div>
                  </td>
                  <td style={{ width: colWidths.risk }} className="px-4 py-3 whitespace-nowrap">
                    <select
                      className="bg-gray-900/80 text-white px-2 py-1 rounded-md text-xs focus:ring-2 focus:ring-indigo-500 border border-gray-700"
                      value={m.risk || ''}
                      onChange={(e) => handleMetaChange(ticker, { risk: e.target.value })}
                    >
                      <option value="">-</option>
                      {RISK_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td style={{ width: colWidths.category }} className="px-4 py-3 whitespace-nowrap">
                    <input
                      className="bg-gray-900/80 text-white px-2 py-1 rounded-md text-xs w-40 focus:ring-2 focus:ring-indigo-500 border border-gray-700"
                      value={m.category || ''}
                      placeholder="Category"
                      onChange={(e) => handleMetaChange(ticker, { category: e.target.value })}
                    />
                  </td>
                  <td style={{ width: colWidths.assetType }} className="px-4 py-3 whitespace-nowrap">
                    <select
                      className="bg-gray-900/80 text-white px-2 py-1 rounded-md text-xs focus:ring-2 focus:ring-indigo-500 border border-gray-700"
                      value={m.assetType || ''}
                      onChange={(e) => handleMetaChange(ticker, { assetType: e.target.value })}
                    >
                      <option value="">-</option>
                      {ASSET_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </td>
                  <td style={{ width: colWidths.quantity }} className="px-4 py-3 text-right text-gray-300 whitespace-nowrap text-sm">{h.quantity}</td>
                  <td style={{ width: colWidths.price }} className="px-4 py-3 text-right text-gray-300 whitespace-nowrap text-sm">{h.price}</td>
                  <td style={{ width: colWidths.value }} className="px-4 py-3 text-right text-indigo-200 font-semibold whitespace-nowrap text-sm">{h.value?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              );
            })}
            <tr className="bg-gray-900/60 font-semibold">
              <td colSpan={7} className="px-4 py-3 text-right text-gray-300 uppercase tracking-wide">Total Value</td>
              <td style={{ width: colWidths.value }} className="px-4 py-3 text-right text-indigo-200 font-bold">{status.total_value?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="sm:hidden divide-y divide-gray-800">
        {sortedHoldings.map((h) => {
          const ticker = h.ticker;
          const m = meta[ticker] || {};
          return (
            <div key={ticker} className="p-4 flex flex-col gap-3 bg-gray-900/50 backdrop-blur border-l-4 border-indigo-600/70 m-2 rounded-xl shadow-sm ring-1 ring-gray-700/40">
              <div className="flex justify-between items-start gap-2">
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-white tracking-wide">{ticker}</span>
                  <span className="text-[11px] text-gray-400 truncate max-w-[160px]" title={'name' in h ? (h as any).name : h.ticker}>{'name' in h ? (h as any).name : h.ticker}</span>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${riskChipClass(m.risk)} tracking-wide`}>{m.risk || '—'}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div className="flex flex-col gap-1">
                  <label className="uppercase tracking-wider text-gray-500 text-[9px] font-semibold">Risk</label>
                  <select className="bg-gray-900/80 text-white px-2 py-1 rounded-md text-[11px]" value={m.risk || ''} onChange={(e) => handleMetaChange(ticker, { risk: e.target.value })}>
                    <option value="">-</option>
                    {RISK_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="uppercase tracking-wider text-gray-500 text-[9px] font-semibold">Asset Type</label>
                  <select className="bg-gray-900/80 text-white px-2 py-1 rounded-md text-[11px]" value={m.assetType || ''} onChange={(e) => handleMetaChange(ticker, { assetType: e.target.value })}>
                    <option value="">-</option>
                    {ASSET_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1 col-span-2">
                  <label className="uppercase tracking-wider text-gray-500 text-[9px] font-semibold">Category</label>
                  <input className="bg-gray-900/80 text-white px-2 py-1 rounded-md text-[11px]" value={m.category || ''} placeholder="Category" onChange={(e) => handleMetaChange(ticker, { category: e.target.value })} />
                </div>
              </div>
              <div className="flex items-center justify-between pt-1">
                <div className="flex flex-col text-[11px] text-gray-400">
                  <span>Qty: <span className="text-gray-200 font-medium">{h.quantity}</span></span>
                  <span>Price: <span className="text-gray-200 font-medium">{h.price}</span></span>
                </div>
                <div className="text-right text-indigo-300 font-semibold text-sm">{h.value?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>
            </div>
          );
        })}
        <div className="m-2 mt-4 p-4 rounded-xl bg-gray-900/60 border border-gray-700/60 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Total Value</span>
          <span className="text-indigo-300 font-bold text-sm">{status.total_value?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      </div>
    </div>
  );
};

export default PortfolioStatusCard;
