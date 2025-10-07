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
}> = ({ portfolioName, filteredMovements, pendingDeletes, getTransactionIdAndPortfolio, handleUnmarkDelete, requestSort, getSortIcon, onEditTransaction, onAddTransaction, onRequestDelete }) => {
  const [collapsed, setCollapsed] = React.useState(false);
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2">
        <h2
          className="text-2xl font-bold text-indigo-300 flex items-center mb-0 cursor-pointer"
          onClick={() => setCollapsed(c => !c)}
          role="button"
          aria-expanded={!collapsed}
          aria-controls={`transactions-table-${portfolioName}`}
        >
          Transactions
          <span className="ml-3 text-sm text-gray-400">{collapsed ? '(Show)' : '(Hide)'}</span>
        </h2>
        <div className="flex items-center gap-2">
          <ActionButton variant="primary" size="sm" className="p-2 rounded-full" onClick={() => { if (onAddTransaction) onAddTransaction(); }} title="Add transaction" aria-label="Add transaction">
            <PlusIcon className="h-4 w-4" />
          </ActionButton>
        </div>
      </div>
      <div className="bg-gray-800 rounded-xl shadow-2xl overflow-hidden">
        {!collapsed && (
          filteredMovements.length > 0 ? (
            <>
              <div className="sm:hidden divide-y divide-gray-800">
                {filteredMovements.map((mov, index) => {
                  const rawType = typeof mov.type === 'string' ? mov.type : (typeof (mov as any).label === 'string' ? (mov as any).label : null);
                  const isSell = rawType && rawType.toLowerCase() === 'sell';
                  const { id, portfolio } = getTransactionIdAndPortfolio(mov);
                  const isPendingDelete = pendingDeletes.some(d => d.id === (id || `row-${index}`) && d.portfolio === (portfolio || 'Imported'));
                  const amount = (typeof mov.quantity === 'number' && typeof mov.price === 'number') ? mov.quantity * mov.price : null;
                  return (
                    <div key={id || index} className={`p-4 flex flex-col gap-2 border-l-4 ${isSell ? 'border-red-500/70' : 'border-indigo-500/70'} bg-gray-900/60 backdrop-blur rounded-xl m-2 shadow-sm ring-1 ring-gray-700/50 ${isPendingDelete ? 'opacity-60' : ''}`}>
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
                })}
              </div>
              <div className="hidden sm:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700 relative" id={`transactions-table-${portfolioName}`}>
                  <thead className="bg-gray-900/85 backdrop-blur sticky top-0 z-20 shadow-sm">
                    <tr>
                      {[
                        { label: 'Date', key: 'date' },
                        { label: 'Type', key: 'type' },
                        { label: 'Asset Name', key: 'assetName' },
                        { label: 'Ticker', key: 'ticker' },
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
                    {filteredMovements.map((mov, index) => {
                      const rawType = typeof mov.type === 'string' ? mov.type : (typeof (mov as any).label === 'string' ? (mov as any).label : null);
                      const isSell = rawType && rawType.toLowerCase() === 'sell';
                      const { id, portfolio } = getTransactionIdAndPortfolio(mov);
                      const isPendingDelete = pendingDeletes.some(d => d.id === (id || `row-${index}`) && d.portfolio === (portfolio || 'Imported'));
                      return (
                        <tr
                          key={id || index}
                          className={`hover:bg-gray-750 transition-colors${isSell ? ' bg-red-900/60' : ''}${isPendingDelete ? ' bg-yellow-900/40' : ''}`}
                        >
                              <td className={`px-4 py-3 whitespace-nowrap text-sm text-gray-300 font-medium tracking-wide${isPendingDelete ? ' line-through opacity-50' : ''}`}>{new Date(mov.date).toLocaleDateString()}</td>
                              <td className={`px-4 py-3 whitespace-nowrap text-sm text-gray-300 capitalize${isPendingDelete ? ' line-through opacity-50' : ''}`}>{(() => {
                            if (!rawType) return '-';
                            const formatted = rawType.replace(/_/g, ' ').toLowerCase();
                            return formatted.charAt(0).toUpperCase() + formatted.slice(1);
                          })()}</td>
                              <td className={`px-4 py-3 whitespace-nowrap text-sm font-medium text-white max-w-[160px] truncate${isPendingDelete ? ' line-through opacity-50' : ''}`} title={mov.name}>{mov.name || 'N/A'}</td>
                              <td className={`px-4 py-3 whitespace-nowrap text-sm font-semibold text-indigo-200 tracking-wide${isPendingDelete ? ' line-through opacity-50' : ''}`}>{mov.assetSymbol || mov.ticker || 'N/A'}</td>
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
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="p-6 sm:p-8 text-center text-gray-400">
              <p className="text-sm sm:text-base">No transactions found for <span className="font-bold text-indigo-300">{portfolioName}</span>.</p>
              <p className="mt-2 text-xs sm:text-sm">Available portfolio names: <span className="text-yellow-300">{Array.from(new Set(filteredMovements.map(mov => (mov as any).portfolio)).values()).join(', ') || 'None'}</span></p>
              <p className="mt-2 text-[10px] sm:text-xs text-gray-500">Check console for detailed debug info.</p>
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default CollapsibleTransactionsSection;
