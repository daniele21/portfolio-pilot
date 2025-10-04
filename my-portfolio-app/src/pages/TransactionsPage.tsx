import React, { useEffect, useState, useRef } from 'react';
import type { StandardizedMovement } from '../types';
import { getAppliedMovementsLog, isUsingCustomData as checkIsCustomData, fetchTickerName, fetchAllPortfolioNames, ingestTransactions, savePortfolioStatus } from '../services/portfolioService';
import { ArrowUpIcon, ArrowDownIcon, TrashIcon, PencilSquareIcon, PlusIcon, CloudArrowUpIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../AuthContext';
import { idbGet } from '../utils/idbCache';
import { ErrorBoundary } from '../components/ErrorBoundary';
import PortfolioStatusCard from '../components/PortfolioStatusCard';
import ReactDOM from 'react-dom';

// Ensure modal-root exists synchronously in browser (prevents portal target null errors)
if (typeof window !== 'undefined' && typeof document !== 'undefined' && !document.getElementById('modal-root')) {
  const _modalRoot = document.createElement('div');
  _modalRoot.id = 'modal-root';
  document.body.appendChild(_modalRoot);
}


type SortableKeys = 'date' | 'type' | 'assetName' | 'quantity' | 'price' | 'amount' | 'currency';

// Reusable action button to keep styles consistent across the page
const ActionButton: React.FC<React.PropsWithChildren<{
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  title?: string;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
}>> = ({ variant = 'primary', size = 'md', onClick, disabled, title, type = 'button', children, className }) => {
  // Use inline-flex so icon-only and icon+label buttons align consistently
  const base = 'inline-flex items-center justify-center gap-2 rounded-lg font-semibold shadow transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed';
  const sizeMap: Record<string, string> = {
    sm: 'px-2 py-1 text-sm h-8',
    md: 'px-3 py-2 text-sm h-10',
  };
  const variantMap: Record<string, string> = {
    primary: 'bg-indigo-600/95 hover:bg-indigo-500 text-white focus:ring-indigo-400',
    secondary: 'bg-blue-600/95 hover:bg-blue-500 text-white focus:ring-blue-400',
    success: 'bg-green-600/95 hover:bg-green-500 text-white focus:ring-green-400',
    danger: 'bg-red-700/95 hover:bg-red-600 text-white focus:ring-red-400',
    ghost: 'bg-gray-700/70 hover:bg-gray-600 text-gray-200 focus:ring-gray-500',
  };
  const cls = `${base} ${sizeMap[size]} ${variantMap[variant]} ${className ?? ''}`.trim();
  return (
    <button type={type} className={cls} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
};


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
  const [dragActive, setDragActive] = useState(false);
  const [ingestProgress, setIngestProgress] = useState<'idle' | 'uploading' | 'parsing' | 'saving' | 'done' | 'error'>('idle');
  const [ingestMessage, setIngestMessage] = useState<string | null>(null);
  // Add a state to trigger PortfolioStatusCard refresh
  const [statusRefreshKey, setStatusRefreshKey] = useState(0);
  // Whether the Portfolio Status card is collapsed
  const [statusCollapsed, setStatusCollapsed] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
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
            const apiUrl = `http://localhost:5000/api/portfolio/${firstPortfolio}/transactions`;
            const response = await fetch(apiUrl, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
              }
            });
            const data = await response.json();
            if (response.ok && Array.isArray(data.transactions)) {
              setMovements(data.transactions);
              setSelectedPortfolio(firstPortfolio);
              setError(null);
              console.log('API loaded transactions:', data.transactions);
              if (data.transactions.length > 0) {
                console.log('[DEBUG] First transaction object:', data.transactions[0]);
              }
            } else if (response.ok && Array.isArray(data)) {
              setMovements(data);
              setSelectedPortfolio(firstPortfolio);
              setError(null);
              console.log('API loaded transactions:', data);
              if (data.length > 0) {
                console.log('[DEBUG] First transaction object:', data[0]);
              }
            } else {
              setMovements([]);
              setError(data.error || 'Failed to load transactions from backend.');
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
      const apiUrl = `http://localhost:5000/api/portfolio/${portfolioToLoad}/transactions`;
      console.log('[DEBUG] Fetching transactions for portfolio:', portfolioToLoad, 'API URL:', apiUrl);
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        }
      });
      console.log('[DEBUG] Fetch response status:', response.status);
      console.log('[DEBUG] Fetch response headers:', Array.from(response.headers.entries()));
      let data;
      try {
        data = await response.json();
      } catch (jsonErr) {
        console.error('[DEBUG] Failed to parse JSON from API:', jsonErr);
        setMovements([]);
        setError('Failed to parse backend response.');
  // manualLoading state removed
        return;
      }
      console.log('[DEBUG] API response for transactions:', data);
      if (response.ok && Array.isArray(data.transactions)) {
        setMovements(data.transactions);
        setError(null);
        setSelectedPortfolio(portfolioToLoad);
        console.log('[DEBUG] API loaded transactions:', data.transactions);
        if (data.transactions.length > 0) {
          console.log('[DEBUG] First transaction object:', data.transactions[0]);
        }
      } else if (response.ok && Array.isArray(data)) {
        setMovements(data);
        setError(null);
        setSelectedPortfolio(portfolioToLoad);
        console.log('[DEBUG] API loaded transactions:', data);
        if (data.length > 0) {
          console.log('[DEBUG] First transaction object:', data[0]);
        }
      } else {
        setMovements([]);
        setError(data.error || 'Failed to load transactions from backend.');
        console.error('[DEBUG] API error or unexpected response:', data);
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
    setIngestProgress('uploading');
    setIngestMessage('Uploading & parsing...');
    const resp = await ingestTransactions(importPortfolioName.trim(), uploadFiles, importText.trim() ? importText : null);
    if (resp.status === 'saved') {
      setIngestProgress('done');
      setIngestMessage(`Imported ${resp.count || 0} transactions (${resp.used_llm ? 'LLM assisted' : 'structured parse'}).`);
      setTimeout(() => {
        setShowImportModal(false);
        setImportText('');
        setUploadFiles([]);
        setImportPortfolioName('');
        handleLoadTransactions(resp.portfolio || importPortfolioName);
        fetchAllPortfolioNames().then(setAllPortfolioNames);
        setIngestProgress('idle');
        setIngestMessage(null);
      }, 800);
    } else {
      setIngestProgress('error');
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

  const handleMarkForDelete = (transaction: any) => {
    let { id, portfolio } = getTransactionIdAndPortfolio(transaction);
    if (!id || !portfolio) return;
    setPendingDeletes(prev => prev.some(d => d.id === id && d.portfolio === portfolio) ? prev : [...prev, { id, portfolio }]);
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

  const handleApplyDeletes = async () => {
    if (pendingDeletes.length === 0) return;
    setError(null);
    let failed = false;
    for (const { id, portfolio } of pendingDeletes) {
      if (!id) continue; // Only try to delete if id exists
      try {
        const response = await fetch(`http://localhost:5000/api/portfolio/${portfolio}/transaction/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${idToken}` }
        });
        const data = await response.json();
        if (!(response.ok && data.status === 'deleted')) {
          failed = true;
        }
      } catch {
        failed = true;
      }
    }
    if (!failed) {
        // Refetch from backend to ensure log is up to date for current selection
        await handleLoadTransactions();
        // Capture affected portfolios before clearing pendingDeletes
        const affectedPortfolios = Array.from(new Set(pendingDeletes.map(d => d.portfolio).filter(Boolean)));
        setPendingDeletes([]);
        setError(null);
        // For each affected portfolio, POST any local metadata then request server to save computed status
        await Promise.all(affectedPortfolios.map(async (p) => {
          try {
            try {
              const metaKey = `status_meta:${p}`;
              const localMeta = await idbGet(metaKey);
              if (localMeta && idToken) {
                await fetch(`http://localhost:5000/api/portfolio/${p}/status/metadata`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                  body: JSON.stringify({ metadata: localMeta })
                });
              }
            } catch (metaErr) {
              console.warn('Failed to POST local metadata before status save after deletes for', p, metaErr);
            }
            try {
              if (idToken) localStorage.setItem('idToken', idToken);
              const result = await savePortfolioStatus(p);
              if (result && result.status !== 'error') {
                setStatusRefreshKey(k => k + 1);
              }
            } catch (e) {
              console.warn('Failed to request status save for portfolio', p, e);
            }
          } catch (e) {
            console.warn('Failed to request status save for portfolio', p, e);
          }
        }));
    } else {
      setError('Some deletes failed. Please try again.');
    }
  };

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
      {/* Always render the import modal at the top level */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4 overflow-y-auto">
          <div className="bg-gray-900 p-8 rounded-xl shadow-2xl w-full max-w-lg my-auto mx-auto max-h-screen overflow-y-auto">
            <h2 className="text-2xl font-bold text-white mb-4">{modalMode === 'add' ? 'Add Transaction' : 'Import Transactions'}</h2>
            <p className="text-gray-300 mb-4">{modalMode === 'add' ? 'Enter a single transaction below. Select the portfolio to add it to.' : 'Paste your transactions in free text format below. This will be sent to the backend for parsing and import.'}</p>
            {modalMode === 'add' ? (
              <div className="mb-3">
                <label htmlFor="add-portfolio-select" className="block text-gray-200 font-semibold mb-1">Portfolio</label>
                <select
                  id="add-portfolio-select"
                  className="w-full p-2 rounded bg-gray-800 text-gray-100 border border-gray-700 focus:ring-2 focus:ring-indigo-500"
                  value={importPortfolioName}
                  onChange={e => setImportPortfolioName(e.target.value)}
                  disabled={importing}
                >
                  {portfolioNames.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <input
                className="w-full mb-3 p-2 rounded bg-gray-800 text-gray-100 border border-gray-700 focus:ring-2 focus:ring-indigo-500"
                type="text"
                placeholder="Portfolio name"
                value={importPortfolioName}
                onChange={e => setImportPortfolioName(e.target.value)}
                disabled={importing}
              />
            )}
            {/* Drag & Drop Upload + Raw Text Area */}
            <div
              className={`w-full mb-4 p-4 border-2 border-dashed rounded-lg text-center transition-colors ${dragActive ? 'border-indigo-400 bg-gray-700' : 'border-gray-600 bg-gray-800'} ${uploadFiles.length > 0 ? 'ring-1 ring-indigo-500' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={e => { e.preventDefault(); setDragActive(false); }}
              onDrop={e => {
                e.preventDefault();
                setDragActive(false);
                const files = Array.from(e.dataTransfer.files);
                const accepted = files.filter(f => /\.(csv|tsv|xlsx|xls|pdf|txt|text)$/i.test(f.name));
                if (accepted.length !== files.length) {
                  setImportError('Some files were skipped (unsupported type).');
                }
                setUploadFiles(prev => [...prev, ...accepted]);
              }}
            >
              <p className="text-gray-300 text-sm mb-2 font-semibold">Drag & Drop transaction files (CSV, Excel, PDF, TXT)</p>
              <input
                type="file"
                multiple
                className="hidden"
                id="file-input"
                onChange={e => {
                  const files = Array.from(e.target.files || []);
                  const accepted = files.filter(f => /\.(csv|tsv|xlsx|xls|pdf|txt|text)$/i.test(f.name));
                  if (accepted.length !== files.length) {
                    setImportError('Some files were skipped (unsupported type).');
                  }
                  setUploadFiles(prev => [...prev, ...accepted]);
                }}
                disabled={importing}
              />
              <label htmlFor="file-input" className="cursor-pointer inline-block px-3 py-1 mt-1 rounded bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500">Browse Files</label>
              {uploadFiles.length > 0 && (
                <ul className="mt-3 text-left max-h-28 overflow-auto text-xs divide-y divide-gray-700 bg-gray-900 rounded-md">
                  {uploadFiles.map((f, i) => (
                    <li key={i} className="flex items-center justify-between px-2 py-1">
                      <span className="truncate mr-2 text-gray-300">{f.name}</span>
                      <button
                        className="text-red-400 hover:text-red-300 text-[10px]"
                        onClick={() => setUploadFiles(prev => prev.filter((_, idx) => idx !== i))}
                        disabled={importing}
                      >Remove</button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-[10px] text-gray-500">Files with recognizable tabular headers skip LLM usage. Others are parsed via Gemini.</p>
            </div>
            <textarea
              className="w-full h-36 p-3 rounded-lg bg-gray-800 text-gray-100 border border-gray-700 focus:ring-2 focus:ring-indigo-500 mb-4"
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder={modalMode === 'add' ? 'e.g. Buy 10 AAPL at $150 on 2024-01-01' : 'Optional: Paste free-form transactions text here'}
              disabled={importing}
            />
            {ingestProgress !== 'idle' && (
              <div className="flex items-center justify-between mb-2 text-xs text-gray-300">
                <span>{ingestMessage}</span>
                {ingestProgress === 'uploading' && <span className="animate-pulse text-indigo-400">Working...</span>}
                {ingestProgress === 'error' && <span className="text-red-400">Error</span>}
                {ingestProgress === 'done' && <span className="text-green-400">Done</span>}
              </div>
            )}
            {importError && <div className="text-red-400 mb-2">{importError}</div>}
            <div className="flex justify-end gap-2">
              <ActionButton variant="ghost" size="md" onClick={() => setShowImportModal(false)} disabled={importing}>
                Cancel
              </ActionButton>
              <ActionButton variant="primary" size="md" onClick={handleImportSubmit} disabled={importing || !importPortfolioName.trim() || (!importText.trim() && uploadFiles.length === 0)}>
                {importing ? 'Processing...' : (modalMode === 'add' ? 'Add / Import' : 'Import')}
              </ActionButton>
            </div>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col gap-6">
          <div className="flex justify-center items-center py-10">
            <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-indigo-500"></div>
            <p className="ml-4 text-lg md:text-xl text-gray-300 font-medium tracking-wide">Loading Transactions...</p>
          </div>
          {/* Skeleton for control bar */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-pulse">
            {Array.from({length:4}).map((_,i)=>(
              <div key={i} className="h-16 rounded-xl bg-gray-800/60 border border-gray-700" />
            ))}
          </div>
          {/* Skeleton rows */}
          <div className="rounded-xl overflow-hidden border border-gray-700">
            {Array.from({length:5}).map((_,i)=>(
              <div key={i} className="h-14 bg-gray-800/60 border-b border-gray-700 animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="flex flex-col items-center justify-center h-full p-8">
          <p className="text-center text-red-400 text-xl mb-4">{error.toLowerCase().includes('no such table: transactions') ? 'No transactions table found in the backend database.' : error}</p>
          {error.toLowerCase().includes('no such table: transactions') && (
            <>
              <p className="text-center text-gray-300 mb-4">It looks like your database is not initialized or is missing the transactions table. You can add transactions to a portfolio to create the table.</p>
              <ActionButton variant="secondary" size="md" onClick={handleImportClick} className="flex items-center gap-2">
                <CloudArrowUpIcon className="h-5 w-5" />
                Add Transactions to Portfolio
              </ActionButton>
            </>
          )}
        </div>
      )}

      {/* Not logged in state */}
      {!loading && !isLoggedIn && !error && (
        <div className="text-center text-yellow-400 text-xl p-8">Please sign in to access transactions.</div>
      )}

      {/* No portfolios: prompt to import transactions */}
      {!loading && isLoggedIn && !error && portfolioNames.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-gradient-to-br from-gray-800/60 to-gray-900/60 rounded-2xl border border-gray-700 backdrop-blur">
          <p className="text-gray-200 text-xl font-semibold mb-2 tracking-wide">No portfolios yet</p>
          <p className="text-gray-400 mb-6 max-w-md text-sm leading-relaxed">Import your first set of transactions to automatically create and populate a portfolio. You can also add a single transaction manually.</p>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <ActionButton variant="secondary" size="md" onClick={handleImportClick} className="p-3 rounded-full" title="New portfolio (import)" aria-label="New portfolio">
              <CloudArrowUpIcon className="h-5 w-5" />
            </ActionButton>
            <ActionButton variant="primary" size="md" onClick={() => { setModalMode('add'); setImportPortfolioName(''); setShowImportModal(true); }} className="p-3 rounded-full" title="Add single transaction" aria-label="Add single transaction">
              <PlusIcon className="h-5 w-5" />
            </ActionButton>
          </div>
        </div>
      )}

      {/* Empty current portfolio (but there are portfolio names or selection) */}
      {!loading && isLoggedIn && !error && portfolioNames.length > 0 && filteredMovements.length === 0 && (
        <div className="p-6 bg-gradient-to-br from-gray-800 to-gray-850 rounded-2xl border border-gray-700 flex flex-col md:flex-row md:items-center md:justify-between gap-4 shadow-inner">
          <div>
            <h3 className="text-lg font-semibold text-white">No transactions for this portfolio yet</h3>
            <p className="text-sm text-gray-400 mt-1">Add or import transactions to start tracking performance and holdings.</p>
          </div>
          <div className="flex gap-2">
            <ActionButton variant="primary" size="sm" className="flex items-center gap-2" onClick={() => { setModalMode('add'); setImportPortfolioName(selectedPortfolio || (portfolioNames[0] || '')); setShowImportModal(true); }} title="Add single transaction">
              <PlusIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Add Single</span>
            </ActionButton>
            <ActionButton variant="secondary" size="sm" className="flex items-center gap-2" onClick={() => { setModalMode('import'); setImportPortfolioName(selectedPortfolio || (portfolioNames[0] || '')); setShowImportModal(true); }} title="Import / Paste transactions">
              <CloudArrowUpIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Import / Paste</span>
            </ActionButton>
          </div>
        </div>
      )}

      {/* Main content: only show if not loading, not error, and logged in, and there are portfolios */}
      {!loading && !error && isLoggedIn && portfolioNames.length > 0 && (
        <>


          {/* Unified control bar: Portfolios in Transactions, selector, Import, Update */}
          {portfolioNames.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-4 mb-6 bg-gradient-to-br from-gray-800 to-gray-850 rounded-2xl px-4 sm:px-6 py-5 shadow-lg border border-gray-700/70 backdrop-blur">
              {/* Portfolios in Transactions */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:flex-1 min-w-[200px]">
                <ActionButton
                  variant="secondary"
                  size="sm"
                  className="p-2"
                  onClick={handleImportClick}
                  disabled={importing || !isLoggedIn || !idToken}
                  title="Import transactions / new portfolio"
                  aria-label="Import transactions"
                >
                  <CloudArrowUpIcon className="h-4 w-4" />
                </ActionButton>
                <span className="text-sm uppercase tracking-wider text-gray-400 font-medium">Portfolios</span>
                <ul className="flex flex-row flex-nowrap overflow-x-auto gap-2 pb-1 hide-scrollbar">
                  {portfolioNames.map(name => {
                    const active = name === selectedPortfolio;
                    return (
                      <li
                        key={name}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors shadow-sm border ${active ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-gray-700/70 text-gray-200 border-gray-600 hover:bg-gray-700'} cursor-pointer`}
                        onClick={() => { setSelectedPortfolio(name); handleLoadTransactions(name); }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedPortfolio(name);
                            handleLoadTransactions(name);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        title={`Select portfolio ${name}`}
                        aria-current={active ? 'true' : 'false'}
                      >
                        {name}
                      </li>
                    );
                  })}
                </ul>
                
              </div>
              {/* Portfolio selector + import (import placed next to selector for easier discovery) */}
              <div className="flex items-center gap-2 sm:ml-4">
                <label htmlFor="portfolio-select" className="text-base text-gray-200 font-semibold">Select:</label>
                <select
                  id="portfolio-select"
                  className="px-3 py-2 rounded-lg bg-gray-900/80 text-white border border-gray-600 focus:ring-2 focus:ring-indigo-500 text-sm font-medium shadow-inner"
                  value={selectedPortfolio}
                  onChange={e => {
                    setSelectedPortfolio(e.target.value);
                    handleLoadTransactions(e.target.value);
                  }}
                >
                  {portfolioNames.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                {/* Remove Portfolio Button (icon-only) */}
                <ActionButton
                  variant="danger"
                  size="sm"
                  className="p-2"
                  disabled={!selectedPortfolio || importing || !isLoggedIn || !idToken}
                  onClick={() => { setShowDeleteModal(true); setDeleteConfirmText(''); setDeleteError(null); }}
                  title="Delete this portfolio and all its transactions"
                >
                  <TrashIcon className="h-4 w-4"/>
                </ActionButton>
                {/* Apply pending deletes (icon with badge)
                <ActionButton
                  variant="danger"
                  size="sm"
                  className="p-2 relative"
                  onClick={handleApplyDeletes}
                  disabled={pendingDeletes.length === 0 || !isLoggedIn || !idToken}
                  title="Apply pending deletes"
                >
                  <TrashIcon className="h-4 w-4" />
                  {pendingDeletes.length > 0 && (
                    <span className="absolute -top-1 -right-1 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold leading-none text-white bg-yellow-500 rounded-full">{pendingDeletes.length}</span>
                  )}
                </ActionButton> */}
              </div>
            </div>
          )}

          {/* Portfolio status above transactions */}
          {selectedPortfolio && (
            <div className="mb-4">
                <div className="flex items-center justify-between mb-0">
                  <h2
                    className="text-2xl font-bold text-indigo-300 flex items-center mb-0 cursor-pointer"
                    onClick={() => setStatusCollapsed(s => !s)}
                    role="button"
                    aria-expanded={!statusCollapsed}
                    aria-controls={`portfolio-status-${selectedPortfolio}`}
                  >
                    Portfolio Status
                    <span className="ml-3 text-sm text-gray-400">{statusCollapsed ? '(Show)' : '(Hide)'}</span>
                  </h2>
                  {/* Save button removed — automatic updates occur after mutating actions */}
                </div>
                {!statusCollapsed && (
                  <div id={`portfolio-status-${selectedPortfolio}`} className="bg-gray-800 rounded-xl shadow-2xl overflow-hidden p-6">
                    <PortfolioStatusCard key={statusRefreshKey} portfolioName={selectedPortfolio} />
                  </div>
                )}
              </div>
          )}

          {/* Collapsible Transactions Section */}
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
        </>
      )}

      {/* Delete Portfolio Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4 overflow-y-auto">
          <div className="bg-gray-900 p-8 rounded-xl shadow-2xl w-full max-w-md my-auto mx-auto">
            <h2 className="text-2xl font-bold text-red-400 mb-4">Delete Portfolio</h2>
            <p className="text-gray-300 mb-4">
              This action <span className="font-bold text-red-400">cannot be undone</span>.<br />
              To confirm deletion, type the portfolio name below:
            </p>
            <div className="mb-4">
              <input
                className="w-full p-2 rounded bg-gray-800 text-gray-100 border border-gray-700 focus:ring-2 focus:ring-red-500"
                type="text"
                placeholder={selectedPortfolio}
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                autoFocus
              />
            </div>
            {deleteError && <div className="text-red-400 mb-2">{deleteError}</div>}
            <div className="flex justify-end gap-2">
              <ActionButton variant="ghost" size="md" onClick={() => setShowDeleteModal(false)}>Cancel</ActionButton>
              <ActionButton variant="danger" size="md" disabled={deleteConfirmText.trim() !== selectedPortfolio} onClick={async () => {
                  if (deleteConfirmText.trim() !== selectedPortfolio) return;
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
                }}>Delete</ActionButton>
            </div>
          </div>
        </div>
      )}

      {/* Per-transaction Delete Confirmation Modal */}
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
                  if (typeof handleDeleteNow === 'function') {
                    await handleDeleteNow(transactionToDelete);
                  } else {
                    handleMarkForDelete(transactionToDelete);
                    await handleApplyDeletes();
                  }
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

        {/* Edit Transaction Modal */}
        {ReactDOM.createPortal(
          <EditTransactionModal
            transaction={editTransaction}
            open={showEditModal}
            onClose={() => setShowEditModal(false)}
            onSave={async (updated) => {
              return await handleEditSave(updated);
            }}
          />,
          document.getElementById('modal-root') as Element
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

// Add CollapsibleTransactionsSection component at the bottom of the file
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
  onRequestDelete?: (mov: any) => void; // ask parent to confirm/remove
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
          {/* Add transaction button lives inside transactions section (circular icon) */}
          <ActionButton variant="primary" size="sm" className="p-2 rounded-full" onClick={() => { if (onAddTransaction) onAddTransaction(); }} title="Add transaction" aria-label="Add transaction">
            <PlusIcon className="h-4 w-4" />
          </ActionButton>
        </div>
      </div>
      <div className="bg-gray-800 rounded-xl shadow-2xl overflow-hidden">
        {!collapsed && (
          filteredMovements.length > 0 ? (
            <>
              {/* Mobile Card View */}
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
              {/* Desktop Table View */}
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

// Edit modal component placed at bottom-level of file so it can reuse styles
const EditTransactionModal: React.FC<{
  transaction: any | null;
  open: boolean;
  onClose: () => void;
  onSave: (updated: any) => Promise<boolean>;
}> = ({ transaction, open, onClose, onSave }) => {
  const [formState, setFormState] = React.useState<any>({});
  const [saving, setSaving] = React.useState(false);
  useEffect(() => {
    if (transaction) setFormState({ ...transaction });
    else setFormState({});
  }, [transaction]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4 overflow-y-auto">
      <div className="bg-gray-900 p-6 rounded-xl shadow-2xl w-full max-w-2xl my-auto mx-auto">
        <h2 className="text-2xl font-bold text-white mb-4">Edit Transaction</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <label className="text-xs text-gray-300">Date
            <input type="date" value={formState.date ? new Date(formState.date).toISOString().slice(0,10) : ''} onChange={e => setFormState((s:any)=>({...s, date: e.target.value}))} className="w-full p-2 rounded bg-gray-800 text-gray-100 border border-gray-700" />
          </label>
          <label className="text-xs text-gray-300">Ticker
            <input type="text" value={formState.assetSymbol || formState.ticker || ''} onChange={e => setFormState((s:any)=>({...s, assetSymbol: e.target.value, ticker: e.target.value}))} className="w-full p-2 rounded bg-gray-800 text-gray-100 border border-gray-700" />
          </label>
          <label className="text-xs text-gray-300">Name
            <input type="text" value={formState.name || formState.assetName || ''} onChange={e => setFormState((s:any)=>({...s, name: e.target.value, assetName: e.target.value}))} className="w-full p-2 rounded bg-gray-800 text-gray-100 border border-gray-700" />
          </label>
          <label className="text-xs text-gray-300">Quantity
            <input type="number" value={formState.quantity ?? ''} onChange={e => setFormState((s:any)=>({...s, quantity: parseFloat(e.target.value)}))} className="w-full p-2 rounded bg-gray-800 text-gray-100 border border-gray-700" />
          </label>
          <label className="text-xs text-gray-300">Price
            <input type="number" value={formState.price ?? ''} onChange={e => setFormState((s:any)=>({...s, price: parseFloat(e.target.value)}))} className="w-full p-2 rounded bg-gray-800 text-gray-100 border border-gray-700" />
          </label>
          <label className="text-xs text-gray-300 col-span-1 sm:col-span-2">Notes
            <input type="text" value={formState.notes || ''} onChange={e => setFormState((s:any)=>({...s, notes: e.target.value}))} className="w-full p-2 rounded bg-gray-800 text-gray-100 border border-gray-700" />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button className="px-4 py-2 rounded bg-gray-700 text-gray-200 hover:bg-gray-600" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="px-4 py-2 rounded bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:opacity-50" onClick={async () => { setSaving(true); const ok = await onSave(formState); setSaving(false); if (ok) onClose(); }} disabled={saving}> {saving ? 'Saving...' : 'Save changes'}</button>
        </div>
      </div>
    </div>
  );
};

