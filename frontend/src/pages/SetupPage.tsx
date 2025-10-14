import * as React from 'react';
import { useEffect, useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../utils/apiFetch';
import type { StandardizedMovement } from '../types';
import { getAppliedMovementsLog, isUsingCustomData as checkIsCustomData, fetchTickerName, fetchAllPortfolioNames, ingestTransactions, savePortfolioStatus } from '../services/portfolioService';
import { usePortfolioTransactions } from '../services/transactionsApi';
import { ArrowUpIcon, ArrowDownIcon, PlusIcon, CloudArrowUpIcon, ChartBarIcon, BellIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../AuthContext';
import { useSelectedPortfolio } from '../SelectedPortfolioContext';
import { idbGet, idbSet } from '../utils/idbCache';
import { ErrorBoundary } from '../components/ErrorBoundary';
import PageShell from '../components/PageShell';
import PortfolioStatusCard from '../components/PortfolioStatusCard';
import TargetAllocationPanel from '../components/TargetAllocationPanel';
import AlertSetupModal from '../components/AlertSetupModal';
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
// Portfolio toolbar removed: selection is provided by SelectedPortfolioContext
import { API_BASE_URL, cleanApiBaseUrl } from '../apiBase';

const TransactionsPage: React.FC = React.memo(() => {
  const [movements, setMovements] = useState<StandardizedMovement[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  // const [isCustomDataActive, setIsCustomDataActive] = useState<boolean>(false);
  const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' } | null>(null);
  const [tickerNames, setTickerNames] = useState<Record<string, string>>({});
  const { isLoggedIn, idToken } = useAuth();
  const queryClient = useQueryClient();
  const [importing, setImporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [importPortfolioName, setImportPortfolioName] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingDeletes, setPendingDeletes] = useState<{ id: any, portfolio: any }[]>([]);
  const [allPortfolioNames, setAllPortfolioNames] = useState<string[]>([]);
  // Use global selected portfolio
  const { selectedPortfolio, setSelectedPortfolio, clearSelectedPortfolio } = useSelectedPortfolio();
  const [modalMode, setModalMode] = useState<'import' | 'add'>('import');
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  // Add a state to trigger PortfolioStatusCard refresh
  const [statusRefreshKey, setStatusRefreshKey] = useState(0);
  const [showTargetsModal, setShowTargetsModal] = useState(false);
  const [showBenchmarksModal, setShowBenchmarksModal] = useState(false);
  const [showAlertsModal, setShowAlertsModal] = useState(false);
  const [portfolioHoldings, setPortfolioHoldings] = useState<{ ticker: string; name?: string }[]>([]);
  // Benchmarks management (global app-level list stored in IndexedDB)
  const [benchmarks, setBenchmarks] = useState<{ symbol: string; name: string }[]>([]);
  const [benchmarksLoading, setBenchmarksLoading] = useState(false);
  const BENCHMARKS_CACHE_KEY = 'benchmarks_list_v1';

  const DEFAULT_BENCHMARKS = [
    { symbol: '^GSPC', name: 'S&P 500' },
    { symbol: '^NDX', name: 'NASDAQ 100' },
    { symbol: '^RUT', name: 'Russell 2000' },
    { symbol: '^STOXX50E', name: 'Euro Stoxx 50' },
    { symbol: 'FTSEMIB.MI', name: 'FTSE MIB' }
  ];

  useEffect(() => {
    let mounted = true;
    (async () => {
      setBenchmarksLoading(true);
      try {
        const stored = await idbGet(BENCHMARKS_CACHE_KEY);
        if (mounted && Array.isArray(stored) && stored.length > 0) {
          setBenchmarks(stored.filter((b: any) => b && b.symbol).map((b: any) => ({ symbol: String(b.symbol), name: String(b.name || '') })));
        } else if (mounted) {
          // No stored benchmarks: persist the default preset immediately so dashboard and header use it
          try {
            await idbSet(BENCHMARKS_CACHE_KEY, DEFAULT_BENCHMARKS);
          } catch (e) {
            // ignore write errors
          }
          setBenchmarks(DEFAULT_BENCHMARKS);
        }
      } catch (e) {
        if (mounted) setBenchmarks(DEFAULT_BENCHMARKS);
      } finally {
        if (mounted) setBenchmarksLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const saveBenchmarksToCache = async (next: { symbol: string; name: string }[]) => {
    try {
      await idbSet(BENCHMARKS_CACHE_KEY, next);
      setBenchmarks(next);
    } catch (e) {
      console.warn('Failed to save benchmarks to cache', e);
    }
  };

  // Benchmarks editor UI state
  const [newBenchmarkSymbol, setNewBenchmarkSymbol] = useState('');
  const [newBenchmarkName, setNewBenchmarkName] = useState('');

  const handleAddBenchmark = () => {
    const sym = newBenchmarkSymbol.trim();
    if (!sym) return;
    const name = newBenchmarkName.trim() || sym;
    const exists = benchmarks.find(b => b.symbol.toLowerCase() === sym.toLowerCase());
    if (exists) return;
    const next = [...benchmarks, { symbol: sym, name }];
    saveBenchmarksToCache(next);
    setNewBenchmarkSymbol('');
    setNewBenchmarkName('');
  };

  const handleRemoveBenchmark = (symbol: string) => {
    const next = benchmarks.filter(b => b.symbol !== symbol);
    saveBenchmarksToCache(next);
  };
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
        setError('Please sign in to view transactions.');
        setMovements([]);
        return;
      }
      setLoading(true);
      try {
        const customDataActive = checkIsCustomData();
        if (customDataActive) {
          // Fetch all portfolio names from backend
          const names = await fetchAllPortfolioNames();
          setAllPortfolioNames(names);
          // Set selection to first portfolio; transactions will be loaded by the selectedPortfolio effect.
          const firstPortfolio = names[0];
          if (firstPortfolio) {
            setSelectedPortfolio(firstPortfolio);
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
        setError('Failed to load transaction data.');
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
      sortableItems.sort((a: any, b: any) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];
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
        return sortConfig!.direction === 'ascending' ? comparison : comparison * -1;
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
        // selectedPortfolio effect will trigger loading; no direct call here to avoid duplicates
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

  // React Query based transactions fetch (prevents continuous manual triggering)
  const { data: rqTransactions, error: rqTxError } = usePortfolioTransactions(selectedPortfolio, idToken, { enabled: !!selectedPortfolio && !!isLoggedIn });

  // Synchronize query data into existing local state used for sorting & filters
  useEffect(() => {
    if (Array.isArray(rqTransactions)) {
      setMovements(rqTransactions as StandardizedMovement[]);
      if (rqTxError == null) setError(null);
    }
  }, [rqTransactions, rqTxError]);

  useEffect(() => {
    if (rqTxError) {
      setError(rqTxError instanceof Error ? rqTxError.message : 'Failed to load transactions');
    }
  }, [rqTxError]);

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
  try { queryClient.invalidateQueries({ queryKey: ['transactions', resp.portfolio || importPortfolioName, true] }); } catch {}
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
      const base = cleanApiBaseUrl(API_BASE_URL);
      const { ok, data } = await apiFetch<any>(`${base}/api/portfolio/${portfolio}/transaction/${id}`, { method: 'DELETE', idToken });
      if (!(ok && data && data.status === 'deleted')) { setError(data?.error || 'Failed to delete transaction.'); return; }
      // Refresh transactions from backend
  try { queryClient.invalidateQueries({ queryKey: ['transactions', portfolio, true] }); } catch {}

      // Post any locally cached metadata before saving status
      try {
        const metaKey = `status_meta:${portfolio}`;
        const localMeta = await idbGet(metaKey);
        if (localMeta && idToken) {
          await apiFetch(`${base}/api/portfolio/${portfolio}/status/metadata`, { method: 'POST', idToken, body: JSON.stringify({ metadata: localMeta }) });
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
      const base = cleanApiBaseUrl(API_BASE_URL);
      const { ok, data } = await apiFetch<any>(`${base}/api/portfolio/${portfolio}/transaction/${id}`, { method: 'PUT', idToken, body: JSON.stringify(updated) });
      if (ok) {
        // Refresh transactions after successful edit
  try { queryClient.invalidateQueries({ queryKey: ['transactions', portfolio, true] }); } catch {}
        // Also post any locally cached holding metadata and ask server to save status
        try {
          const metaKey = `status_meta:${portfolio}`;
          const localMeta = await idbGet(metaKey);
          if (localMeta && idToken) {
            await apiFetch(`${base}/api/portfolio/${portfolio}/status/metadata`, { method: 'POST', idToken, body: JSON.stringify({ metadata: localMeta }) });
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
      const candidate = (mov as any);
      const movPortfolio = (
        candidate.portfolio ||
        candidate.portfolio_name ||
        candidate.portfolioName ||
        candidate.owner ||
        candidate.accountName ||
        ''
      ).toString().trim().toLowerCase();
      const selPortfolio = (selectedPortfolio || '').toString().trim().toLowerCase();
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
  const loadingRoot = loading || false;

  return (
    <PageShell
      title={`Portfolio Configuration | ${selectedPortfolio || 'No Portfolio Selected'}`}
      icon={<ChartBarIcon className="h-4 w-4 text-white" />}
      actions={(
        // Make action buttons stack on small screens and align on larger screens
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <ActionButton variant="secondary" size="md" onClick={handleImportClick} className="w-full sm:w-auto flex items-center gap-2">
            <CloudArrowUpIcon className="h-4 w-4" />
            Import
          </ActionButton>
          <ActionButton variant="primary" size="md" onClick={() => { setModalMode('add'); setImportPortfolioName(selectedPortfolio || ''); setShowImportModal(true); }} className="w-full sm:w-auto flex items-center gap-2">
            <PlusIcon className="h-4 w-4" />
            Add
          </ActionButton>
          <ActionButton variant="danger" size="md" onClick={() => { setShowDeleteModal(true); setDeleteError(null); }} className="w-full sm:w-auto flex items-center gap-2">
            Delete
          </ActionButton>
        </div>
      )}
    >
  <div className="space-y-8 px-4 sm:px-6 lg:px-8">
        {loadingRoot ? (
          <div className="min-h-[260px] flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-indigo-500 mx-auto"></div>
              <p className="mt-4 text-lg text-gray-300">Loading Transactions...</p>
            </div>
          </div>
        ) : error ? (
          <div className="p-8">
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center text-red-400">
              <h2 className="text-2xl font-bold mb-2">Error Loading Transactions</h2>
              <p>{String(error)}</p>
            </div>
          </div>
        ) : !isLoggedIn ? (
          <div className="p-8">
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-6 text-center text-yellow-400">
              <h2 className="text-2xl font-bold mb-2">Authentication Required</h2>
              <p>Please sign in to access transactions.</p>
            </div>
          </div>
        ) : (
          <>
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

              <div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
            <div className="flex items-center gap-4">
              {/* <h1 className="text-2xl font-bold text-indigo-300">{selectedPortfolio || 'No portfolio selected'}</h1> */}
              {/* <span className="text-sm text-gray-400">Transactions</span> */}
            </div>
          </div>

          {selectedPortfolio && (
            <div className="mb-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-0 gap-3">
                <div className="flex items-center gap-2 cursor-pointer" onClick={() => setStatusCollapsed(s => !s)} role="button" aria-expanded={!statusCollapsed} aria-controls={`portfolio-status-${selectedPortfolio}`}>
                  <div className="w-1 h-5 bg-gradient-to-b from-blue-400 to-blue-600 rounded-full"></div>
                  <h2 className="text-lg font-bold text-white">Portfolio Status</h2>
                  <span className="ml-3 text-sm text-gray-400">{statusCollapsed ? '(Show)' : '(Hide)'}</span>
                </div>
                  <div className="flex items-center gap-2">
                    <ActionButton variant="secondary" size="sm" onClick={() => setShowBenchmarksModal(true)}>Benchmarks</ActionButton>
                    <ActionButton variant="secondary" size="sm" onClick={() => setShowAlertsModal(true)}>
                      <BellIcon className="h-4 w-4" />
                      Alerts
                    </ActionButton>
                  </div>
                  {/* actions moved to PageShell.actions prop */}
              </div>
              {!statusCollapsed && (
                <div id={`portfolio-status-${selectedPortfolio}`} className="bg-gray-800 rounded-xl shadow-2xl overflow-hidden p-4 sm:p-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="md:col-span-3">
                            <PortfolioStatusCard
                              key={statusRefreshKey}
                              portfolioName={selectedPortfolio ?? ''}
                              onConfigureTargets={(assetTypes, riskOptions) => {
                                setPassedAssetTypes(assetTypes || null);
                                setPassedRiskOptions(riskOptions || null);
                                setShowTargetsModal(true);
                              }}
                              onHoldingsLoaded={(holdings) => {
                                setPortfolioHoldings(holdings);
                              }}
                            />
                          </div>
                  </div>
                </div>
              )}
              {/* Benchmark editor is available via modal opened from the 'Benchmarks' button */}
            </div>
          )}

          {portfolioNames.filter(name => name === selectedPortfolio).map(portfolioName => (
            <CollapsibleTransactionsSection
              key={portfolioName}
              portfolioName={portfolioName}
              filteredMovements={filteredMovements}
              availablePortfolioNames={portfolioNames}
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
            confirmTextRequired={selectedPortfolio ?? undefined}
            confirmLabel="Delete"
            error={deleteError}
            loading={false}
            onCancel={() => setShowDeleteModal(false)}
            onConfirm={async () => {
              setDeleteError(null);
              try {
                const base = cleanApiBaseUrl(API_BASE_URL);
                const { ok, data } = await apiFetch<any>(`${base}/api/portfolio/${selectedPortfolio}`, { method: 'DELETE', idToken });
                if (ok && data && data.status === 'deleted') {
                  const updatedNames = portfolioNames.filter(name => name !== selectedPortfolio);
                  if (updatedNames[0]) {
                    setSelectedPortfolio(updatedNames[0]);
                  } else {
                    // No portfolios left: clear selection so localStorage doesn't keep a deleted name
                    try {
                      clearSelectedPortfolio();
                    } catch (e) {
                      // Fallback
                      setSelectedPortfolio(null);
                    }
                  }
                  // Invalidate react-query cache for header portfolio names so dropdowns refresh
                  try {
                    queryClient.invalidateQueries({ queryKey: ['headerPortfolioNames'] });
                    // Also clear any local cached portfolio_names in IndexedDB used by service
                    idbSet && idbSet('portfolio_names', updatedNames).catch(() => {});
                  } catch (e) {
                    // Fallback: directly refresh via service
                    fetchAllPortfolioNames().then(setAllPortfolioNames);
                  }
                  setMovements([]);
                  setError(null);
                  setShowDeleteModal(false);
                } else {
                  setDeleteError(data?.error || 'Failed to delete portfolio.');
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
              portfolioName={selectedPortfolio ?? ''}
              idToken={idToken}
              assetTypes={passedAssetTypes || undefined}
              riskOptions={passedRiskOptions || undefined}
              onSaved={() => { setStatusRefreshKey(k=>k+1); setPassedAssetTypes(null); setPassedRiskOptions(null); }}
            />,
            document.getElementById('modal-root') as Element
          )}

          {showBenchmarksModal && ReactDOM.createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4" role="dialog" aria-modal="true" aria-labelledby="benchmarks-title">
              <div className="bg-gray-900 p-6 rounded-xl shadow-2xl w-full max-w-2xl">
                <div className="flex items-center justify-between mb-4">
                  <h2 id="benchmarks-title" className="text-2xl font-bold text-white">Manage Benchmarks</h2>
                  <div className="text-sm text-gray-400">Saved list used across dashboard and header</div>
                </div>
                <div className="bg-gray-800 rounded-xl p-4 border border-gray-700/60">
                  {benchmarksLoading ? (
                    <div className="text-gray-400">Loading...</div>
                  ) : (
                    <>
                      <div className="space-y-2 mb-4">
                        {benchmarks.length === 0 ? (
                          <div className="text-sm text-gray-300">No custom benchmarks defined. Defaults will be used.</div>
                        ) : (
                          <ul className="space-y-1 max-h-60 overflow-auto">
                            {benchmarks.map(b => (
                              <li key={b.symbol} className="flex items-center justify-between bg-gray-900/40 p-2 rounded">
                                <div className="text-sm text-gray-200"><strong className="text-indigo-300">{b.symbol}</strong> — <span className="text-gray-400">{b.name}</span></div>
                                <div>
                                  <ActionButton variant="ghost" size="sm" onClick={() => handleRemoveBenchmark(b.symbol)}>Remove</ActionButton>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
                        <input className="col-span-1 bg-gray-900/40 p-2 rounded text-sm text-white" placeholder="Symbol e.g. ^GSPC" value={newBenchmarkSymbol} onChange={(e) => setNewBenchmarkSymbol(e.target.value)} />
                        <input className="col-span-1 bg-gray-900/40 p-2 rounded text-sm text-white" placeholder="Display name (optional)" value={newBenchmarkName} onChange={(e) => setNewBenchmarkName(e.target.value)} />
                        <div className="col-span-1 flex gap-2">
                          <ActionButton onClick={handleAddBenchmark} variant="primary" size="sm">Add</ActionButton>
                          <ActionButton onClick={async () => { await saveBenchmarksToCache([]); }} variant="danger" size="sm">Reset</ActionButton>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <ActionButton variant="ghost" size="md" onClick={() => setShowBenchmarksModal(false)}>Close</ActionButton>
                </div>
              </div>
            </div>,
            document.getElementById('modal-root') as Element
          )}

          {showAlertsModal && selectedPortfolio && ReactDOM.createPortal(
            <AlertSetupModal
              open={showAlertsModal}
              onClose={() => setShowAlertsModal(false)}
              portfolioName={selectedPortfolio}
              portfolioHoldings={portfolioHoldings}
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
          </>
        )}
      </div>
    </PageShell>
  );
});

export default function TransactionsPageWithBoundary() {
  return (
    <ErrorBoundary>
      <TransactionsPage />
    </ErrorBoundary>
  );
}



