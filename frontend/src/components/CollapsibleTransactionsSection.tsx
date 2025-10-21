import React from 'react';
import ActionButton from './ActionButton';
import { PlusIcon, TrashIcon, PencilSquareIcon } from '@heroicons/react/24/outline';

type SortableKeys = 'date' | 'type' | 'assetName' | 'quantity' | 'price' | 'amount' | 'currency';

const CollapsibleTransactionsSection: React.FC<{
  portfolioName: string;
  filteredMovements: any[];
  pendingDeletes: any[];
  getTransactionIdAndPortfolio: (mov: any) => { id: any, portfolio: any };
  handleUnmarkDelete: (mov: any) => void;
  requestSort: (key: SortableKeys) => void;
  getSortIcon: (key: SortableKeys) => React.ReactNode;
  onEditTransaction?: (mov: any) => void;
  onAddTransaction?: () => void;
  onRequestDelete?: (mov: any) => void;
  availablePortfolioNames?: string[];
}> = ({ portfolioName, filteredMovements, pendingDeletes, getTransactionIdAndPortfolio, handleUnmarkDelete, requestSort, getSortIcon, onEditTransaction, onAddTransaction, onRequestDelete, availablePortfolioNames }) => {
  const [collapsed, setCollapsed] = React.useState(false);
  // Grouping state: collapsedGroups stores whether a given group key is collapsed
  const [collapsedGroups, setCollapsedGroups] = React.useState<Record<string, boolean>>({});
  // Allow grouping by asset name (with ticker shown) or no grouping
  const [groupBy, setGroupBy] = React.useState<'asset' | 'none'>('asset');

  // Initialize grouping preference from localStorage when possible
  React.useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
  const saved = window.localStorage.getItem('transactionsGroupBy');
  if (saved === 'none' || saved === 'asset') setGroupBy(saved as 'asset' | 'none');
      }
    } catch (e) {
      // ignore storage errors
    }
  }, []);

  const handleToggleGroup = () => {
    setGroupBy(prev => {
      const next: 'asset' | 'none' = prev === 'asset' ? 'none' : 'asset';
      // If turning grouping off, clear collapsed group state to avoid stale keys
      if (next === 'none') setCollapsedGroups({});
      try {
        if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem('transactionsGroupBy', next);
      } catch (e) {
        // ignore
      }
      return next;
    });
  };

  // Compute groups by asset name (fallback to ticker if name missing). Label shows name and ticker when available.
  const groups = React.useMemo(() => {
    const map = new Map<string, { key: string; label: string; items: any[]; aggregates: { count: number; totalQuantity: number; totalAmount: number } }>();
    for (const mov of filteredMovements) {
      const symbol = (mov && (mov.assetSymbol || mov.ticker)) || null;
      // Prefer human-readable asset name, fall back to ticker/symbol when necessary
      const name = (mov && (mov.name || mov.assetName || mov.asset)) || (symbol ? String(symbol) : null);
      const key = name ? String(name).trim() : 'UNKNOWN';
      const baseLabel = name ? String(name).trim() : 'Unknown';
      const label = symbol ? `${baseLabel} • ${String(symbol).trim().toUpperCase()}` : baseLabel;
      const entry = map.get(key) ?? { key, label, items: [], aggregates: { count: 0, totalQuantity: 0, totalAmount: 0 } };
      entry.items.push(mov);
      entry.aggregates.count += 1;
      const qty = typeof mov.quantity === 'number' ? mov.quantity : Number(mov.quantity) || 0;
      const price = typeof mov.price === 'number' ? mov.price : Number(mov.price) || 0;
      entry.aggregates.totalQuantity += qty;
      entry.aggregates.totalAmount += qty && price ? qty * price : 0;
      map.set(key, entry);
    }
    // Convert to array and sort by label (symbols first alphabetically)
    const arr = Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
    return arr;
  }, [filteredMovements]);

  // When grouping is enabled, default all groups to collapsed to hide details by default
  React.useEffect(() => {
    try {
      if (groupBy === 'asset') {
        const keys = groups.map(g => g.key);
        // Only set if collapsedGroups doesn't already match
        const needsInit = keys.length > 0 && (Object.keys(collapsedGroups).length !== keys.length || keys.some(k => !(k in collapsedGroups)));
        if (needsInit) {
          const init: Record<string, boolean> = {};
          keys.forEach(k => { init[k] = true; });
          setCollapsedGroups(init);
        }
      } else {
        // Clear when grouping disabled
        if (Object.keys(collapsedGroups).length > 0) setCollapsedGroups({});
      }
    } catch (e) {
      // ignore
    }
  }, [groupBy, groups, collapsedGroups]);

  // Build table rows (grouped or flat) as a memoized array to avoid complex nested JSX in the return
  const renderTableRows = React.useMemo(() => {
    const rows: React.ReactNode[] = [];
  if (groupBy === 'asset') {
      for (const group of groups) {
          rows.push(
            <React.Fragment key={`group-${group.key}`}>
              <tr className="bg-gray-850">
                <td colSpan={10} className="px-4 py-2 text-sm text-gray-200 font-medium">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setCollapsedGroups(prev => ({ ...prev, [group.key]: !prev[group.key] }))}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCollapsedGroups(prev => ({ ...prev, [group.key]: !prev[group.key] })); } }}
                  className="flex items-center justify-between cursor-pointer"
                  aria-expanded={!collapsedGroups[group.key]}
                  aria-controls={`group-${group.key}-rows`}
                >
                  <div>
                    <span className="text-sm font-semibold text-white mr-3">{group.label}</span>
                    <span className="text-xs text-gray-400">{group.aggregates.count} tx • Qty: {group.aggregates.totalQuantity.toLocaleString()} • Amount: {group.aggregates.totalAmount.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                  </div>
                  <div className="text-xs text-gray-400">{collapsedGroups[group.key] ? '(Show)' : '(Hide)'}</div>
                </div>
              </td>
            </tr>
        </React.Fragment>
        );
        if (!collapsedGroups[group.key]) {
            group.items.forEach((mov: any, index: number) => {
            // Prefer normalized `operation` (Buy/Sell/etc), then legacy `type`, then `label`.
            const rawType = typeof mov.operation === 'string' ? mov.operation : (typeof mov.type === 'string' ? mov.type : (typeof (mov as any).label === 'string' ? (mov as any).label : null));
            const isSell = rawType && rawType.toLowerCase() === 'sell';
            const { id, portfolio } = getTransactionIdAndPortfolio(mov);
            const isPendingDelete = pendingDeletes.some(d => d.id === (id || `row-${index}`) && d.portfolio === (portfolio || 'Imported'));
            rows.push(
              <tr
                key={id || `group-${group.key}-row-${index}`}
                className={`hover:bg-gray-750 transition-colors${isSell ? ' bg-red-900/60' : ''}${isPendingDelete ? ' bg-yellow-900/40' : ''}`}
              >
                <td className={`px-4 py-3 whitespace-nowrap text-sm text-gray-300 font-medium tracking-wide${isPendingDelete ? ' line-through opacity-50' : ''}`}>{new Date(mov.date).toLocaleDateString()}</td>
                <td className={`px-4 py-3 whitespace-nowrap text-sm text-gray-300 capitalize${isPendingDelete ? ' line-through opacity-50' : ''}`}>{(() => {
                  if (!rawType) return '-';
                  const formatted = rawType.replace(/_/g, ' ').toLowerCase();
                  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
                })()}</td>
                <td className={`px-4 py-3 whitespace-nowrap text-sm font-medium text-white max-w-[160px] truncate${isPendingDelete ? ' line-through opacity-50' : ''}`} title={mov.name}>{mov.name || 'N/A'}</td>
                <td className={`px-4 py-3 whitespace-nowrap text-sm text-gray-300${isPendingDelete ? ' line-through opacity-50' : ''}`}>{mov.description || '-'}</td>
                <td className={`px-4 py-3 whitespace-nowrap text-sm font-semibold text-indigo-200 tracking-wide${isPendingDelete ? ' line-through opacity-50' : ''}`}>{mov.yahoo_ticker || 'N/A'}</td>
                {/* <td className={`px-4 py-3 whitespace-nowrap text-sm text-gray-300${isPendingDelete ? ' line-through opacity-50' : ''}`}>{mov.isin || '-'}</td> */}
                <td className={`px-4 py-3 whitespace-nowrap text-sm text-gray-300 text-right${isPendingDelete ? ' line-through opacity-50' : ''}`}>{mov.quantity != null ? mov.quantity.toLocaleString() : '-'}</td>
                <td className={`px-4 py-3 whitespace-nowrap text-sm text-gray-300 text-right${isPendingDelete ? ' line-through opacity-50' : ''}`}>{mov.price != null ? mov.price.toLocaleString(undefined,{ minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '-'}</td>
                <td className={`px-4 py-3 whitespace-nowrap text-sm text-gray-300 text-right${isPendingDelete ? ' line-through opacity-50' : ''}`}>{(typeof mov.quantity === 'number' && typeof mov.price === 'number') ? (mov.quantity * mov.price).toLocaleString(undefined,{ minimumFractionDigits:2, maximumFractionDigits:2 }) : '-'}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300 text-center">
                  {isPendingDelete ? (
                    <button
                      type="button"
                      className="px-2 py-1 rounded bg-gray-600/80 text-white font-semibold hover:bg-gray-500 text-xs focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 animate-pulse relative z-10"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleUnmarkDelete(mov); }}
                      aria-label="Undo delete for this transaction"
                      title="Undo delete for this transaction"
                    >
                      <span role="img" aria-label="Undo">↩️</span> Undo
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="px-2 py-1 rounded bg-red-600/80 text-white font-semibold hover:bg-red-500 text-xs focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-400 relative z-10 flex items-center gap-1"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (onRequestDelete) onRequestDelete(mov); }}
                      aria-label="Delete this transaction"
                      title="Delete this transaction"
                    >
                      <TrashIcon className="h-4 w-4"/> Delete
                    </button>
                  )}
                  <button
                    type="button"
                    className="ml-2 px-2 py-1 rounded bg-indigo-600/80 text-white font-semibold hover:bg-indigo-500 text-xs focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-400 flex items-center gap-1"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (onEditTransaction) onEditTransaction(mov); }}
                    aria-label="Edit this transaction"
                    title="Edit this transaction"
                  >
                    <PencilSquareIcon className="h-4 w-4"/> Edit
                  </button>
                </td>
              </tr>
            );
          });
        }
      }
    } else {
      // flat rows
      filteredMovements.forEach((mov: any, index: number) => {
        const rawType = typeof mov.operation === 'string' ? mov.operation : (typeof mov.type === 'string' ? mov.type : (typeof (mov as any).label === 'string' ? (mov as any).label : null));
        const isSell = rawType && rawType.toLowerCase() === 'sell';
        const { id, portfolio } = getTransactionIdAndPortfolio(mov);
        const isPendingDelete = pendingDeletes.some(d => d.id === (id || `row-${index}`) && d.portfolio === (portfolio || 'Imported'));
        rows.push(
            <tr
            key={id || `row-${index}`}
            className={`hover:bg-gray-750 transition-colors${isSell ? ' bg-red-900/60' : ''}${isPendingDelete ? ' bg-yellow-900/40' : ''}`}
          >
            <td className={`px-4 py-3 whitespace-nowrap text-sm text-gray-300 font-medium tracking-wide${isPendingDelete ? ' line-through opacity-50' : ''}`}>{new Date(mov.date).toLocaleDateString()}</td>
            <td className={`px-4 py-3 whitespace-nowrap text-sm text-gray-300 capitalize${isPendingDelete ? ' line-through opacity-50' : ''}`}>{(() => {
              if (!rawType) return '-';
              const formatted = rawType.replace(/_/g, ' ').toLowerCase();
              return formatted.charAt(0).toUpperCase() + formatted.slice(1);
            })()}</td>
            <td className={`px-4 py-3 whitespace-nowrap text-sm font-medium text-white max-w-[160px] truncate${isPendingDelete ? ' line-through opacity-50' : ''}`} title={mov.name}>{mov.name || 'N/A'}</td>
            <td className={`px-4 py-3 whitespace-nowrap text-sm text-gray-300${isPendingDelete ? ' line-through opacity-50' : ''}`}>{mov.description || '-'}</td>
            <td className={`px-4 py-3 whitespace-nowrap text-sm font-semibold text-indigo-200 tracking-wide${isPendingDelete ? ' line-through opacity-50' : ''}`}>{mov.assetSymbol || mov.ticker || 'N/A'}</td>
            {/* <td className={`px-4 py-3 whitespace-nowrap text-sm text-gray-300${isPendingDelete ? ' line-through opacity-50' : ''}`}>{mov.isin || '-'}</td> */}
            <td className={`px-4 py-3 whitespace-nowrap text-sm text-gray-300 text-right${isPendingDelete ? ' line-through opacity-50' : ''}`}>{mov.quantity != null ? mov.quantity.toLocaleString() : '-'}</td>
            <td className={`px-4 py-3 whitespace-nowrap text-sm text-gray-300 text-right${isPendingDelete ? ' line-through opacity-50' : ''}`}>{mov.price != null ? mov.price.toLocaleString(undefined,{ minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '-'}</td>
            <td className={`px-4 py-3 whitespace-nowrap text-sm text-gray-300 text-right${isPendingDelete ? ' line-through opacity-50' : ''}`}>{(typeof mov.quantity === 'number' && typeof mov.price === 'number') ? (mov.quantity * mov.price).toLocaleString(undefined,{ minimumFractionDigits:2, maximumFractionDigits:2 }) : '-'}</td>
            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300 text-center">
              {isPendingDelete ? (
                <button
                  type="button"
                  className="px-2 py-1 rounded bg-gray-600/80 text-white font-semibold hover:bg-gray-500 text-xs focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 animate-pulse relative z-10"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleUnmarkDelete(mov); }}
                  aria-label="Undo delete for this transaction"
                  title="Undo delete for this transaction"
                >
                  <span role="img" aria-label="Undo">↩️</span> Undo
                </button>
              ) : (
                <button
                  type="button"
                  className="px-2 py-1 rounded bg-red-600/80 text-white font-semibold hover:bg-red-500 text-xs focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-400 relative z-10 flex items-center gap-1"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (onRequestDelete) onRequestDelete(mov); }}
                  aria-label="Delete this transaction"
                  title="Delete this transaction"
                >
                  <TrashIcon className="h-4 w-4"/> Delete
                </button>
              )}
              <button
                type="button"
                className="ml-2 px-2 py-1 rounded bg-indigo-600/80 text-white font-semibold hover:bg-indigo-500 text-xs focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-400 flex items-center gap-1"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (onEditTransaction) onEditTransaction(mov); }}
                aria-label="Edit this transaction"
                title="Edit this transaction"
              >
                <PencilSquareIcon className="h-4 w-4"/> Edit
              </button>
            </td>
          </tr>
        );
      });
    }
    return rows;
  }, [groupBy, groups, filteredMovements, collapsedGroups, pendingDeletes, getTransactionIdAndPortfolio, onRequestDelete, onEditTransaction, handleUnmarkDelete]);
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2">
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => setCollapsed(c => !c)}
          role="button"
          aria-expanded={!collapsed}
          aria-controls={`transactions-table-${portfolioName}`}
        >
          <div className="w-1 h-5 bg-gradient-to-b from-purple-400 to-purple-600 rounded-full"></div>
          <h2 className="text-lg font-bold text-white">Transactions</h2>
          <span className="ml-3 text-sm text-gray-400">{collapsed ? '(Show)' : '(Hide)'}</span>
        </div>
        <div className="flex items-center gap-2">
          <ActionButton variant="primary" size="sm" className="p-2 rounded-full" onClick={() => { if (onAddTransaction) onAddTransaction(); }} title="Add transaction" aria-label="Add transaction">
            <PlusIcon className="h-4 w-4" />
          </ActionButton>
          
          {/* Group-by control: asset (name) or none */}
          <div className="flex items-center">
            <label className="sr-only">Toggle group by asset</label>
            <button
              type="button"
              onClick={handleToggleGroup}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${groupBy === 'asset' ? 'bg-indigo-500 text-white' : 'bg-gray-900/30 text-gray-300 hover:bg-gray-800'}`}
              aria-pressed={groupBy === 'asset'}
              title={groupBy === 'asset' ? 'Ungroup transactions' : 'Group transactions by asset name'}
            >
                {groupBy === 'asset' ? 'Grouped by asset' : 'No group'}
            </button>
          </div>
        </div>
      </div>
      <div className="bg-gray-800 rounded-xl shadow-2xl overflow-hidden">
        {!collapsed && (
          filteredMovements.length > 0 ? (
            <>
              <div className="sm:hidden divide-y divide-gray-800">
                {groupBy === 'asset' ? (
                  groups.map(group => {
                    const isGrpCollapsed = !!collapsedGroups[group.key];
                    return (
                      <div key={group.key} className="p-3">
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setCollapsedGroups(prev => ({ ...prev, [group.key]: !prev[group.key] }))}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCollapsedGroups(prev => ({ ...prev, [group.key]: !prev[group.key] })); } }}
                          className="flex items-center justify-between mb-2 cursor-pointer"
                          aria-expanded={!isGrpCollapsed}
                          aria-controls={`group-${group.key}-items`}
                        >
                          <div>
                            <div className="text-sm font-semibold text-white tracking-wide">{group.label}</div>
                            <div className="text-xs text-gray-400">{group.aggregates.count} tx • Qty: {group.aggregates.totalQuantity.toLocaleString()} • Amount: {group.aggregates.totalAmount.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2})}</div>
                          </div>
                          <div className="text-xs text-gray-400">{isGrpCollapsed ? '(Show)' : '(Hide)'}</div>
                        </div>
                        {!isGrpCollapsed && (
                          <div className="divide-y divide-gray-800 rounded-lg">
                            {group.items.map((mov: any, idx: number) => {
                              const rawType = typeof mov.operation === 'string' ? mov.operation : (typeof mov.type === 'string' ? mov.type : (typeof (mov as any).label === 'string' ? (mov as any).label : null));
                              const isSell = rawType && rawType.toLowerCase() === 'sell';
                              const { id, portfolio } = getTransactionIdAndPortfolio(mov);
                              const isPendingDelete = pendingDeletes.some(d => d.id === (id || `row-${idx}`) && d.portfolio === (portfolio || 'Imported'));
                              const amount = (typeof mov.quantity === 'number' && typeof mov.price === 'number') ? mov.quantity * mov.price : null;
                              return (
                                <div key={id || idx} className={`p-3 flex flex-col gap-2 border-l-4 ${isSell ? 'border-red-500/70' : 'border-indigo-500/70'} bg-gray-900/60 backdrop-blur rounded-xl shadow-sm ring-1 ring-gray-700/50 ${isPendingDelete ? 'opacity-60' : ''}`}>
                                  <div className="flex justify-between items-center gap-3">
                                    <span className="text-[11px] tracking-wide font-medium text-gray-400">{new Date(mov.date).toLocaleDateString()}</span>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize tracking-wide ${isSell ? 'bg-red-600/80 text-white' : 'bg-indigo-600/80 text-white'}`}>{rawType ? rawType.replace(/_/g,' ').toLowerCase() : '-'}</span>
                                  </div>
                                  <div className="flex justify-between items-end">
                                    <div className="flex flex-col">
                                      <span className="text-sm font-semibold text-white tracking-wide">{mov.assetSymbol || mov.ticker}</span>
                                      <span className="text-[11px] text-gray-400 truncate max-w-[160px]" title={mov.name}>{mov.name || '—'}</span>
                                      {mov.description ? (
                                        <span className="text-[11px] text-gray-400 truncate max-w-[160px] mt-1" title={mov.description}>{mov.description}</span>
                                      ) : null}
                                    </div>
                                    <div className="text-right">
                                      <span className="block text-sm text-gray-200">Qty: {mov.quantity ?? '-'}</span>
                                      <span className="block text-sm text-gray-300">@ {mov.price != null ? mov.price.toLocaleString() : '-'}</span>
                                      <span className="block text-xs text-indigo-300 font-medium">{amount != null ? amount.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2}) : '-'}</span>
                                    </div>
                                  </div>
                                  <div className="mt-2 flex justify-end gap-2">
                                    {isPendingDelete ? (
                                      <ActionButton variant="ghost" size="sm" className="p-2 rounded-full" onClick={() => handleUnmarkDelete(mov)} title="Undo delete">
                                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 10v6a2 2 0 0 1-2 2H7"/><path d="M3 7v2a2 2 0 0 0 2 2h10"/></svg>
                                      </ActionButton>
                                    ) : (
                                      <ActionButton variant="danger" size="sm" className="p-2 rounded-full" onClick={() => { if (onRequestDelete) onRequestDelete(mov); }} title="Delete transaction">
                                        <TrashIcon className="h-4 w-4" />
                                      </ActionButton>
                                    )}
                                    <ActionButton variant="primary" size="sm" className="p-2 rounded-full" onClick={() => { if (onEditTransaction) onEditTransaction(mov); }} title="Edit transaction">
                                      <PencilSquareIcon className="h-4 w-4"/>
                                    </ActionButton>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  // No grouping: render flat list
                  filteredMovements.map((mov: any, idx: number) => {
                    const rawType = typeof mov.operation === 'string' ? mov.operation : (typeof mov.type === 'string' ? mov.type : (typeof (mov as any).label === 'string' ? (mov as any).label : null));
                    const isSell = rawType && rawType.toLowerCase() === 'sell';
                    const { id, portfolio } = getTransactionIdAndPortfolio(mov);
                    const isPendingDelete = pendingDeletes.some(d => d.id === (id || `row-${idx}`) && d.portfolio === (portfolio || 'Imported'));
                    const amount = (typeof mov.quantity === 'number' && typeof mov.price === 'number') ? mov.quantity * mov.price : null;
                    return (
                      <div key={id || idx} className={`p-3 flex flex-col gap-2 border-l-4 ${isSell ? 'border-red-500/70' : 'border-indigo-500/70'} bg-gray-900/60 backdrop-blur rounded-xl shadow-sm ring-1 ring-gray-700/50 ${isPendingDelete ? 'opacity-60' : ''}`}>
                        <div className="flex justify-between items-center gap-3">
                          <span className="text-[11px] tracking-wide font-medium text-gray-400">{new Date(mov.date).toLocaleDateString()}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize tracking-wide ${isSell ? 'bg-red-600/80 text-white' : 'bg-indigo-600/80 text-white'}`}>{rawType ? rawType.replace(/_/g,' ').toLowerCase() : '-'}</span>
                        </div>
                        <div className="flex justify-between items-end">
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold text-white tracking-wide">{mov.assetSymbol || mov.ticker}</span>
                            <span className="text-[11px] text-gray-400 truncate max-w-[160px]" title={mov.name}>{mov.name || '—'}</span>
                          </div>
                          <div className="text-right">
                            <span className="block text-sm text-gray-200">Qty: {mov.quantity ?? '-'}</span>
                            <span className="block text-sm text-gray-300">@ {mov.price != null ? mov.price.toLocaleString() : '-'}</span>
                            <span className="block text-xs text-indigo-300 font-medium">{amount != null ? amount.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2}) : '-'}</span>
                          </div>
                        </div>
                        <div className="mt-2 flex justify-end gap-2">
                          {isPendingDelete ? (
                            <ActionButton variant="ghost" size="sm" className="p-2 rounded-full" onClick={() => handleUnmarkDelete(mov)} title="Undo delete">
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 10v6a2 2 0 0 1-2 2H7"/><path d="M3 7v2a2 2 0 0 0 2 2h10"/></svg>
                            </ActionButton>
                          ) : (
                            <ActionButton variant="danger" size="sm" className="p-2 rounded-full" onClick={() => { if (onRequestDelete) onRequestDelete(mov); }} title="Delete transaction">
                              <TrashIcon className="h-4 w-4" />
                            </ActionButton>
                          )}
                          <ActionButton variant="primary" size="sm" className="p-2 rounded-full" onClick={() => { if (onEditTransaction) onEditTransaction(mov); }} title="Edit transaction">
                            <PencilSquareIcon className="h-4 w-4"/>
                          </ActionButton>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="hidden sm:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700 relative" id={`transactions-table-${portfolioName}`}>
                  <thead className="bg-gray-900/85 backdrop-blur sticky top-0 z-20 shadow-sm">
                    <tr>
                      {[
                        { label: 'Date', key: 'date' },
                        { label: 'Operation', key: 'type' },
                        { label: 'Asset Name', key: 'assetName' },
                        { label: 'Description', key: 'description' },
                        { label: 'Ticker', key: 'ticker' },
                        // { label: 'ISIN', key: 'isin' },
                        { label: 'Qty', key: 'quantity' },
                        { label: 'Price', key: 'price' },
                        { label: 'Amount', key: 'amount' },
                      ].map(col => (
                        <th
                          key={col.key}
                          scope="col"
                          className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-700"
                          onClick={() => requestSort(col.key as SortableKeys)}
                        >
                          {col.label} {getSortIcon(col.key as SortableKeys)}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-xs font-medium text-gray-300 uppercase text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-gray-800 divide-y divide-gray-700">
                    {renderTableRows}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="p-6 sm:p-8 text-center text-gray-400">
              <p className="text-sm sm:text-base">No transactions found for <span className="font-bold text-indigo-300">{portfolioName}</span>.</p>
              <p className="mt-2 text-xs sm:text-sm">Available portfolio names: <span className="text-yellow-300">{(availablePortfolioNames && availablePortfolioNames.length > 0) ? availablePortfolioNames.join(', ') : (Array.from(new Set(filteredMovements.map(mov => (mov as any).portfolio)).values()).join(', ') || 'None')}</span></p>
              <p className="mt-2 text-[10px] sm:text-xs text-gray-500">Check console for detailed debug info.</p>
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default CollapsibleTransactionsSection;
