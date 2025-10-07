import React, { useEffect, useState, useRef } from 'react';
import type { StandardizedMovement } from '../types';
import { getAppliedMovementsLog, isUsingCustomData as checkIsCustomData, fetchTickerName, fetchAllPortfolioNames, ingestTransactions, savePortfolioStatus } from '../services/portfolioService';
import { fetchPortfolioTransactions } from '../services/transactionsApi';
import { ArrowUpIcon, ArrowDownIcon, PlusIcon, CloudArrowUpIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../AuthContext';
import { idbGet } from '../utils/idbCache';
import { ErrorBoundary } from '../components/ErrorBoundary';
import PortfolioStatusCard from '../components/PortfolioStatusCard';
import TargetAllocationPanel from '../components/TargetAllocationPanel';
import ReactDOM from 'react-dom';
import CollapsibleTransactionsSection from '../components/CollapsibleTransactionsSection';
import EditTransactionModal from '../components/EditTransactionModal';

// Ensure modal-root exists synchronously in browser (prevents portal target null errors)
if (typeof window !== 'undefined' && typeof document !== 'undefined' && !document.getElementById('modal-root')) {
  const _modalRoot = document.createElement('div');
  _modalRoot.id = 'modal-root';
  document.body.appendChild(_modalRoot);
}


type SortableKeys = 'date' | 'type' | 'assetName' | 'quantity' | 'price' | 'amount' | 'currency';

import ActionButton from '../components/ActionButton';
import TransactionImportModal from '../components/TransactionImportModal';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import PortfolioToolbar from '../components/PortfolioToolbar';


const TransactionsPage: React.FC = React.memo(() => {
  const [movements, setMovements] = useState<StandardizedMovement[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  // const [isCustomDataActive, setIsCustomDataActive] = useState<boolean>(false);
  const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' } | null>(null);
  const [tickerNames, setTickerNames] = useState<Record<string, string>>({});
  const { isLoggedIn, idToken } = useAuth();
  const [importing, setImporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [importPortfolioName, setImportPortfolioName] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingDeletes, setPendingDeletes] = useState<{ id: any, portfolio: any }[]>([]);
  const [allPortfolioNames, setAllPortfolioNames] = useState<string[]>([]);
  // Add state for selected portfolio
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>('');
  const [modalMode, setModalMode] = useState<'import' | 'add'>('import');
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  // Add a state to trigger PortfolioStatusCard refresh
  const [statusRefreshKey, setStatusRefreshKey] = useState(0);
  const [showTargetsModal, setShowTargetsModal] = useState(false);
  const [passedAssetTypes, setPassedAssetTypes] = useState<string[] | null>(null);
  const [passedRiskOptions, setPassedRiskOptions] = useState<string[] | null>(null);
  // Whether the Portfolio Status card is collapsed
  const [statusCollapsed, setStatusCollapsed] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Edit transaction modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTransaction, setEditTransaction] = useState<any | null>(null);
  // Per-transaction delete confirmation
  const [showDeleteTransactionModal, setShowDeleteTransactionModal] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState<any | null>(null);


  useEffect(() => {
    const fetchData = async () => {
      if (!isLoggedIn || !idToken) {
        setLoading(false);
        setError("Please sign in to view transactions.");
        setMovements([]);
        return;
      }
      setLoading(true);
      try {
        const customDataActive = checkIsCustomData();
        // setIsCustomDataActive(customDataActive);
        if (customDataActive) {
          // Fetch all portfolio names from backend
          const names = await fetchAllPortfolioNames();
          setAllPortfolioNames(names);
          // Load transactions for the first available portfolio
          const firstPortfolio = names[0];
          if (firstPortfolio) {
            try {
              const txs = await fetchPortfolioTransactions(firstPortfolio, idToken);
              setMovements(txs);
              setSelectedPortfolio(firstPortfolio);
              setError(null);
              console.log('API loaded transactions:', txs);
              if (txs.length > 0) console.log('[DEBUG] First transaction object:', txs[0]);
            } catch (e:any) {
              setMovements([]);
              setError(e?.message || 'Failed to load transactions from backend.');
            }
          } else {
            setMovements([]);
            setSelectedPortfolio('');
          }
        } else {
          // Not using custom data, show local session log
          const movementsLog = await getAppliedMovementsLog();
          setMovements(movementsLog);
          setError(null);
        }
      } catch (err) {
        setMovements([]);
        setError("Failed to load transaction data.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [isLoggedIn, idToken]); // Only depends on auth state

  const sortedMovements = React.useMemo(() => {
    let sortableItems = [...movements];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];
        // Special handling for 'type' column: use normalized type/label string
        if (sortConfig.key === 'type') {
          const getType = (mov: any) => {
            const rawType = typeof mov.type === 'string' ? mov.type : (typeof mov.label === 'string' ? mov.label : '');
            return rawType.replace(/_/g, ' ').toLowerCase();
          };
          valA = getType(a);
          valB = getType(b);
        }
        let comparison = 0;
        if (valA === null || valA === undefined) comparison = -1;
        else if (valB === null || valB === undefined) comparison = 1;
        else if (typeof valA === 'number' && typeof valB === 'number') {
          comparison = valA - valB;
        } else {
          const strA = (typeof valA === 'string') ? valA : String(valA ?? '');
          const strB = (typeof valB === 'string') ? valB : String(valB ?? '');
          comparison = strA.localeCompare(strB);
        }
        return sortConfig.direction === 'ascending' ? comparison : comparison * -1;
      });
    }
    return sortableItems;
  }, [movements, sortConfig]);

  const requestSort = (key: SortableKeys) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: SortableKeys) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <span className="opacity-50"><ArrowUpIcon className="h-3 w-3 inline-block" /><ArrowDownIcon className="h-3 w-3 inline-block -ml-1" /></span>;
    }
    return sortConfig.direction === 'ascending' ? <ArrowUpIcon className="h-4 w-4 inline-block" /> : <ArrowDownIcon className="h-4 w-4 inline-block" />;
  };


  useEffect(() => {
    if (!isLoggedIn || !idToken) return;
    fetchAllPortfolioNames().then(setAllPortfolioNames);
  }, [isLoggedIn, idToken]);

  // Compute unique portfolio names from backend API if available, otherwise fallback
  const portfolioNames = allPortfolioNames.length > 0 ? allPortfolioNames : Array.from(new Set(movements.map(m => (m as any).portfolio).filter(Boolean)));

  // When movements or portfolioNames change, if selected portfolio is not present, reset to first available
  // Add a ref to track if we've already auto-loaded to prevent excessive calls
  const autoLoadedRef = useRef<string>('');
  const lastPortfolioNamesRef = useRef<string[]>([]);
  const portfolioEffectTimeoutRef = useRef<number | undefined>(undefined);
  
  useEffect(() => {
    // Clear any pending timeout
    if (portfolioEffectTimeoutRef.current) {
      clearTimeout(portfolioEffectTimeoutRef.current);
    }
    
    // Debounce this effect to prevent rapid-fire calls during UI changes
    portfolioEffectTimeoutRef.current = setTimeout(() => {
      // Only run this effect if portfolioNames actually changed (not just re-renders)
      const portfolioNamesChanged = JSON.stringify(portfolioNames) !== JSON.stringify(lastPortfolioNamesRef.current);
      lastPortfolioNamesRef.current = portfolioNames;
      
      if (!portfolioNamesChanged) {
        return; // Skip if portfolioNames didn't actually change
      }
      
      if (portfolioNames.length > 0 && !portfolioNames.includes(selectedPortfolio)) {
        const newPortfolio = portfolioNames[0];
        setSelectedPortfolio(newPortfolio);
        // Only auto-load if we haven't already loaded this portfolio
        if (autoLoadedRef.current !== newPortfolio) {
          autoLoadedRef.current = newPortfolio;
          handleLoadTransactions(newPortfolio);
        }
      }
      // If there are no portfolios, clear selection
      if (portfolioNames.length === 0 && selectedPortfolio !== '') {
        setSelectedPortfolio('');
        autoLoadedRef.current = '';
      }
    }, 100); // 100ms debounce
    
    return () => {
      if (portfolioEffectTimeoutRef.current) {
        clearTimeout(portfolioEffectTimeoutRef.current);
      }
    };
  }, [portfolioNames, selectedPortfolio]);

  // Update handleLoadTransactions to never fallback to 'Imported'
  const handleLoadTransactions = async (portfolioOverride?: string) => {
  // manualLoading state removed
    setError(null);
    try {
  const portfolioToLoad = portfolioOverride || selectedPortfolio || (portfolioNames.length > 0 ? portfolioNames[0] : '');
      console.log('[DEBUG] handleLoadTransactions called');
      console.log('[DEBUG] portfolioOverride:', portfolioOverride);
      console.log('[DEBUG] selectedPortfolio:', selectedPortfolio);
      console.log('[DEBUG] portfolioNames:', portfolioNames);
      if (!portfolioToLoad) {
        setMovements([]);
        setError('No portfolio selected.');
  // manualLoading state removed
        return;
      }
      console.log('[DEBUG] Fetching transactions for portfolio (via service):', portfolioToLoad);
      try {
        const txs = await fetchPortfolioTransactions(portfolioToLoad, idToken);
        setMovements(txs);
        setSelectedPortfolio(portfolioToLoad);
        setError(null);
        console.log('[DEBUG] API loaded transactions via service:', txs);
        if (txs.length > 0) console.log('[DEBUG] First transaction object:', txs[0]);
      } catch (e:any) {
        setMovements([]);
        setError(e?.message || 'Failed to load transactions from backend.');
      }
    } catch (err) {
      setMovements([]);
      setError('Failed to load transactions from backend.');
      console.error('[DEBUG] Fetch error:', err);
    } finally {
  // manualLoading state removed
    }
  };

  const handleImportClick = () => {
    setModalMode('import');
    setImportText('');
    setImportPortfolioName('');
    setImportError(null);
    setShowImportModal(true);
  };
  // handleAddTransactionClick removed; add-transaction is now intra-portfolio and provided

  const handleImportSubmit = async () => {
    if (!importPortfolioName.trim()) {
      setImportError('Portfolio name is required for import.');
      return;
    }
    if (!importText.trim() && uploadFiles.length === 0) {
      setImportError('Provide raw text or at least one file.');
      return;
    }
  setImporting(true);
  setImportError(null);
    const resp = await ingestTransactions(importPortfolioName.trim(), uploadFiles, importText.trim() ? importText : null);
    if (resp.status === 'saved') {
      setTimeout(() => {
        setShowImportModal(false);
        setImportText('');
        setUploadFiles([]);
        setImportPortfolioName('');
        handleLoadTransactions(resp.portfolio || importPortfolioName);
        fetchAllPortfolioNames().then(setAllPortfolioNames);
        // progress messages removed (no longer tracked in component state)
      }, 800);
    } else {
      setImportError(resp.message || resp.error || 'Failed to ingest transactions.');
    }
    setImporting(false);
  };

  // When importing transactions, if a new portfolio name is provided, use it instead of defaulting to 'Imported'.
  // const handleImport = async () => {
  //   setImportError(null);
  //   setImporting(true);
  //   try {
  //     // Use the importPortfolioName if provided, otherwise fallback to 'Imported'
  //     const portfolioNameToUse = importPortfolioName.trim() || 'Imported';
  //     const apiUrl = `http://localhost:5000/api/transactions/${encodeURIComponent(portfolioNameToUse)}`;
  //     const response = await fetch(apiUrl, {
  //       method: 'POST',
  //       headers: {
  //         'Content-Type': 'application/json',
  //         'Authorization': `Bearer ${idToken}`
  //       },
  //       body: JSON.stringify({ raw: importText })
  //     });
  //     const data = await response.json();
  //     if (response.ok && data.status === 'saved') {
  //       setShowImportModal(false);
  //       setImportText('');
  //       setImportPortfolioName('');
  //       setMovements(data.transactions || []);
  //       setSelectedPortfolio(data.portfolio || portfolioNameToUse);
  //       // Refresh all portfolio names after import
  //       fetchAllPortfolioNames().then(setAllPortfolioNames);
  //     } else {
  //       setImportError(data.error || 'Failed to import transactions.');
  //     }
  //   } catch (err) {
  //     setImportError('Failed to import transactions.');
  //   } finally {
  //     setImporting(false);
  //   }
  // };

  // Track which symbols we've already attempted to fetch to prevent duplicate requests
  const fetchedSymbolsRef = useRef<Set<string>>(new Set());
  const lastMovementsLengthRef = useRef<number>(0);
  
  useEffect(() => {
    // Only run if we actually have new movements (not just re-renders)
    if (sortedMovements.length === lastMovementsLengthRef.current && sortedMovements.length > 0) {
      return; // Skip if no new movements
    }
    lastMovementsLengthRef.current = sortedMovements.length;
    
    // For all movements missing assetName but with assetSymbol, fetch the name from backend
    const missingNames = sortedMovements.filter(mov => 
      mov.assetSymbol && 
      !mov.assetName && 
      !tickerNames[mov.assetSymbol] &&
      !fetchedSymbolsRef.current.has(mov.assetSymbol)
    );
    if (missingNames.length === 0) return;
    
    const fetchNames = async () => {
      const updates: Record<string, string> = {};
      const symbols = [...new Set(missingNames.map(mov => mov.assetSymbol).filter((s): s is string => !!s))];
      
      await Promise.all(symbols.map(async (symbol: string) => {
        fetchedSymbolsRef.current.add(symbol);
        try {
          const name = await fetchTickerName(symbol, idToken);
          if (name) updates[symbol] = name;
        } catch { 
          // Mark as attempted even if failed to avoid retries
        }
      }));
      if (Object.keys(updates).length > 0) setTickerNames(prev => ({ ...prev, ...updates }));
    };
    fetchNames();
  }, [sortedMovements, idToken, tickerNames]);

  // Helper to get transaction id and portfolio from a movement (for backend transactions)
  const getTransactionIdAndPortfolio = (mov: any) => {
    // Always use backend id if present
    if ('id' in mov && mov.id !== undefined && mov.id !== null) {
      return { id: mov.id, portfolio: mov.portfolio };
    }
    return { id: undefined, portfolio: mov.portfolio };
  };


  // Immediate delete: send DELETE to backend and refresh transactions + status
  const handleDeleteNow = async (transaction: any) => {
    const { id, portfolio } = getTransactionIdAndPortfolio(transaction);
    if (!id || !portfolio) return;
    setError(null);
    try {
      const response = await fetch(`http://localhost:5000/api/portfolio/${portfolio}/transaction/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      const data = await response.json();
      if (!(response.ok && data.status === 'deleted')) {
        setError(data.error || 'Failed to delete transaction.');
        return;
      }
      // Refresh transactions from backend
      await handleLoadTransactions(portfolio);

      // Post any locally cached metadata before saving status
      try {
        const metaKey = `status_meta:${portfolio}`;
        const localMeta = await idbGet(metaKey);
        if (localMeta && idToken) {
          await fetch(`http://localhost:5000/api/portfolio/${portfolio}/status/metadata`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            body: JSON.stringify({ metadata: localMeta })
          });
        }
      } catch (metaErr) {
        console.warn('Failed to POST local metadata before status save after delete:', metaErr);
      }

      // Trigger server to recompute and save status
      try {
        if (idToken) localStorage.setItem('idToken', idToken);
        const result = await savePortfolioStatus(portfolio);
        if (result && result.status !== 'error') setStatusRefreshKey(k => k + 1);
      } catch (e) {
        console.warn('Failed to request status save for portfolio', portfolio, e);
      }
    } catch (err) {
      console.error('Delete transaction failed', err);
      setError('Failed to delete transaction.');
    }
  };

  const handleUnmarkDelete = (transaction: any) => {
    let { id, portfolio } = getTransactionIdAndPortfolio(transaction);
    if (!id || !portfolio) return;
    setPendingDeletes(prev => prev.filter(d => !(d.id === id && d.portfolio === portfolio)));
  };

  // Note: pending-delete flow removed in favor of immediate delete UI. Helper functions cleared.

  // Save edited transaction to backend
  const handleEditSave = async (updated: any): Promise<boolean> => {
    if (!updated) return false;
    // Determine id and portfolio for endpoint
    const { id, portfolio } = getTransactionIdAndPortfolio(updated as any);
    if (!portfolio) {
      setError('Cannot determine portfolio for update.');
      return false;
    }
    if (!id) {
      setError('Cannot update a transaction without an id.');
      return false;
    }
    setError(null);
    try {
      const resp = await fetch(`http://localhost:5000/api/portfolio/${portfolio}/transaction/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify(updated)
      });
      const data = await resp.json();
      if (resp.ok) {
        // Refresh transactions after successful edit
        await handleLoadTransactions(portfolio);
        // Also post any locally cached holding metadata and ask server to save status
        try {
          const metaKey = `status_meta:${portfolio}`;
          const localMeta = await idbGet(metaKey);
          if (localMeta && idToken) {
            await fetch(`http://localhost:5000/api/portfolio/${portfolio}/status/metadata`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
              body: JSON.stringify({ metadata: localMeta })
            });
          }
        } catch (metaErr) {
          console.warn('Failed to POST local metadata after edit save:', metaErr);
        }
        try {
          if (idToken) localStorage.setItem('idToken', idToken);
          const result = await savePortfolioStatus(portfolio);
          if (result && result.status !== 'error') setStatusRefreshKey(k => k + 1);
        } catch (e) {
          // ignore status save error
        }
        return true;
      } else {
        setError(data.error || 'Failed to update transaction.');
        return false;
      }
    } catch (e) {
      setError('Failed to update transaction.');
      console.error('Edit save error', e);
      return false;
    }
  };

  // Only show transactions for the selected portfolio in the table
  const filteredMovements = React.useMemo(() => {
    if (!selectedPortfolio) return [];
    // Debug: log selectedPortfolio and all movement portfolio fields
    console.log('selectedPortfolio:', selectedPortfolio);
    console.log('All movements:', sortedMovements);
    const allPortfolios = sortedMovements.map(mov => (mov as any).portfolio || (mov as any).portfolio_name);
    console.log('All movement portfolio fields:', allPortfolios);
    // Normalize comparison: case-insensitive, trimmed
    const filtered = sortedMovements.filter(mov => {
      const movPortfolio = ((mov as any).portfolio || (mov as any).portfolio_name || '').toString().trim().toLowerCase();
      const selPortfolio = selectedPortfolio.toString().trim().toLowerCase();
      if (movPortfolio !== selPortfolio) {
        console.warn('Portfolio mismatch:', { movPortfolio, selPortfolio, mov });
      }
      return movPortfolio === selPortfolio;
    });
    console.log('filteredMovements:', filtered);
    if (filtered.length > 0) {
      console.log('First filtered movement:', filtered[0]);
    } else {
      console.warn('No transactions found for selected portfolio:', selectedPortfolio);
      // Show a summary of all unique portfolio names in loaded movements
      const uniquePortfolios = Array.from(new Set(allPortfolios));
      console.warn('Unique portfolio names in loaded transactions:', uniquePortfolios);
    }
    return filtered;
  }, [sortedMovements, selectedPortfolio]);

  // Debug: log movements array every time it changes
  useEffect(() => {
    console.log('[DEBUG] movements state:', movements);
    if (movements.length > 0) {
      console.log('[DEBUG] First movement object:', movements[0]);
      // Log all keys in the first movement for field inspection
      console.log('[DEBUG] First movement keys:', Object.keys(movements[0]));
    } else {
      console.log('[DEBUG] No movements loaded');
    }
  }, [movements]);


  // --- MAIN RENDER ---
  return (
    <div className="space-y-8">
      <TransactionImportModal
        open={showImportModal}
        mode={modalMode}
        portfolioNames={portfolioNames}
        importPortfolioName={importPortfolioName}
        setImportPortfolioName={setImportPortfolioName}
        importText={importText}
        setImportText={setImportText}
        uploadFiles={uploadFiles}
        setUploadFiles={setUploadFiles}
        importing={importing}
        importError={importError}
        setImportError={setImportError}
        onClose={() => setShowImportModal(false)}
        onSubmit={handleImportSubmit}
      />

      {loading ? (
        <div className="flex flex-col gap-6">
          <div className="flex justify-center items-center py-10">
            <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-indigo-500"></div>
            <p className="ml-4 text-lg md:text-xl text-gray-300 font-medium tracking-wide">Loading Transactions...</p>
          </div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center h-full p-8">
          <p className="text-center text-red-400 text-xl mb-4">{error}</p>
          <ActionButton variant="secondary" size="md" onClick={handleImportClick} className="flex items-center gap-2">
            <CloudArrowUpIcon className="h-5 w-5" />
            Add Transactions to Portfolio
          </ActionButton>
        </div>
      ) : !isLoggedIn ? (
        <div className="text-center text-yellow-400 text-xl p-8">Please sign in to access transactions.</div>
      ) : portfolioNames.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-gradient-to-br from-gray-800/60 to-gray-900/60 rounded-2xl border border-gray-700 backdrop-blur">
          <p className="text-gray-200 text-xl font-semibold mb-2 tracking-wide">No portfolios yet</p>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <ActionButton variant="secondary" size="md" onClick={handleImportClick} className="p-3 rounded-full" title="New portfolio (import)" aria-label="New portfolio">
              <CloudArrowUpIcon className="h-5 w-5" />
            </ActionButton>
            <ActionButton variant="primary" size="md" onClick={() => { setModalMode('add'); setImportPortfolioName(''); setShowImportModal(true); }} className="p-3 rounded-full" title="Add single transaction" aria-label="Add single transaction">
              <PlusIcon className="h-5 w-5" />
            </ActionButton>
          </div>
        </div>
      ) : (
        <div>
          <PortfolioToolbar
            portfolioNames={portfolioNames}
            selectedPortfolio={selectedPortfolio}
            onSelect={(name) => { setSelectedPortfolio(name); handleLoadTransactions(name); }}
            onImportClick={handleImportClick}
            onDeleteClick={() => { setShowDeleteModal(true); setDeleteError(null); }}
          />

          {selectedPortfolio && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-0">
                <h2 className="text-2xl font-bold text-indigo-300 flex items-center mb-0 cursor-pointer" onClick={() => setStatusCollapsed(s => !s)} role="button" aria-expanded={!statusCollapsed} aria-controls={`portfolio-status-${selectedPortfolio}`}>
                  Portfolio Status
                  <span className="ml-3 text-sm text-gray-400">{statusCollapsed ? '(Show)' : '(Hide)'}</span>
                </h2>
              </div>
              {!statusCollapsed && (
                <div id={`portfolio-status-${selectedPortfolio}`} className="bg-gray-800 rounded-xl shadow-2xl overflow-hidden p-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="md:col-span-3">
                            <PortfolioStatusCard
                              key={statusRefreshKey}
                              portfolioName={selectedPortfolio}
                              onConfigureTargets={(assetTypes, riskOptions) => {
                                setPassedAssetTypes(assetTypes || null);
                                setPassedRiskOptions(riskOptions || null);
                                setShowTargetsModal(true);
                              }}
                            />
                          </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {portfolioNames.filter(name => name === selectedPortfolio).map(portfolioName => (
            <CollapsibleTransactionsSection
              key={portfolioName}
              portfolioName={portfolioName}
              filteredMovements={filteredMovements}
              pendingDeletes={pendingDeletes}
              getTransactionIdAndPortfolio={getTransactionIdAndPortfolio}
              handleUnmarkDelete={handleUnmarkDelete}
              requestSort={requestSort}
              getSortIcon={getSortIcon}
              onEditTransaction={(mov: any) => { setEditTransaction(mov); setShowEditModal(true); }}
              onAddTransaction={() => { setModalMode('add'); setImportPortfolioName(portfolioName); setShowImportModal(true); }}
              onRequestDelete={(mov: any) => { setTransactionToDelete(mov); setShowDeleteTransactionModal(true); }}
            />
          ))}

          <ConfirmDeleteModal
            open={showDeleteModal}
            title="Delete Portfolio"
            message={<><div>This action <strong className="text-red-400">cannot be undone</strong>.<br />To confirm deletion, type the portfolio name below:</div></>}
            confirmTextRequired={selectedPortfolio}
            confirmLabel="Delete"
            error={deleteError}
            loading={false}
            onCancel={() => setShowDeleteModal(false)}
            onConfirm={async () => {
              setDeleteError(null);
              try {
                const resp = await fetch(`http://localhost:5000/api/portfolio/${selectedPortfolio}`, {
                  method: 'DELETE',
                  headers: { 'Authorization': `Bearer ${idToken}` }
                });
                const data = await resp.json();
                if (resp.ok && data.status === 'deleted') {
                  const updatedNames = portfolioNames.filter(name => name !== selectedPortfolio);
                  setSelectedPortfolio(updatedNames[0] || '');
                  fetchAllPortfolioNames().then(setAllPortfolioNames);
                  setMovements([]);
                  setError(null);
                  setShowDeleteModal(false);
                } else {
                  setDeleteError(data.error || 'Failed to delete portfolio.');
                }
              } catch (err) {
                setDeleteError('Failed to delete portfolio.');
              }
            }}
          />

          {showDeleteTransactionModal && transactionToDelete && ReactDOM.createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-transaction-title">
              <div className="bg-gray-900 p-6 rounded-xl shadow-2xl w-full max-w-md">
                <h2 id="delete-transaction-title" className="text-2xl font-bold text-red-400 mb-4">Confirm Delete</h2>
                <p className="text-gray-300 mb-4">Are you sure you want to delete this transaction? This action cannot be undone.</p>
                <div className="mb-3 text-sm text-gray-200">
                  <div><strong>Date:</strong> {transactionToDelete.date ? new Date(transactionToDelete.date).toLocaleDateString() : 'N/A'}</div>
                  <div><strong>Asset:</strong> {transactionToDelete.assetSymbol || transactionToDelete.ticker || 'N/A'}</div>
                  <div><strong>Qty:</strong> {transactionToDelete.quantity ?? '-' } <strong>Price:</strong> {transactionToDelete.price != null ? transactionToDelete.price.toLocaleString() : '-'}</div>
                </div>
                <div className="flex justify-end gap-2">
                  <ActionButton variant="ghost" size="md" onClick={() => { setShowDeleteTransactionModal(false); setTransactionToDelete(null); }}>Cancel</ActionButton>
                  <ActionButton variant="danger" size="md" onClick={async () => {
                    try {
                      await handleDeleteNow(transactionToDelete);
                    } catch (e) {
                      console.error('Failed to delete transaction via confirm modal', e);
                    }
                    setShowDeleteTransactionModal(false);
                    setTransactionToDelete(null);
                  }}>
                    Delete
                  </ActionButton>
                </div>
              </div>
            </div>,
            document.getElementById('modal-root') as Element
          )}

          {showTargetsModal && ReactDOM.createPortal(
            <TargetAllocationPanel
              open={showTargetsModal}
              onClose={() => { setShowTargetsModal(false); setPassedAssetTypes(null); setPassedRiskOptions(null); }}
              portfolioName={selectedPortfolio}
              idToken={idToken}
              assetTypes={passedAssetTypes || undefined}
              riskOptions={passedRiskOptions || undefined}
              onSaved={() => { setStatusRefreshKey(k=>k+1); setPassedAssetTypes(null); setPassedRiskOptions(null); }}
            />,
            document.getElementById('modal-root') as Element
          )}

          {ReactDOM.createPortal(
            <EditTransactionModal
              transaction={editTransaction}
              open={showEditModal}
              onClose={() => setShowEditModal(false)}
              onSave={async (updated: any) => {
                return await handleEditSave(updated);
              }}
            />,
            document.getElementById('modal-root') as Element
          )}
        </div>
      )}
    </div>
  );
});

export default function TransactionsPageWithBoundary() {
  return (
    <ErrorBoundary>
      <TransactionsPage />
    </ErrorBoundary>
  );
}



