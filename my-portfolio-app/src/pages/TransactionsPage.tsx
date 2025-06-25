import React, { useEffect, useState } from 'react';
import { StandardizedMovement } from '../types';
import { getAppliedMovementsLog, isUsingCustomData as checkIsCustomData, isPortfolioInitialized, initialLoad as initialPortfolioLoad, fetchTickerName, fetchAllPortfolioNames } from '../services/portfolioService';
import { ArrowUpIcon, ArrowDownIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../AuthContext';
import { ErrorBoundary } from '../components/ErrorBoundary';
import PortfolioStatusCard from '../components/PortfolioStatusCard';


type SortableKeys = 'date' | 'type' | 'assetName' | 'quantity' | 'price' | 'amount' | 'currency';

const TransactionsPage: React.FC = () => {
  const [movements, setMovements] = useState<StandardizedMovement[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  // const [isCustomDataActive, setIsCustomDataActive] = useState<boolean>(false);
  const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' } | null>(null);
  const [manualLoading, setManualLoading] = useState<boolean>(false);
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
  // Add a state to trigger PortfolioStatusCard refresh
  const [statusRefreshKey, setStatusRefreshKey] = useState(0);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);


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
  useEffect(() => {
    if (portfolioNames.length > 0 && !portfolioNames.includes(selectedPortfolio)) {
      setSelectedPortfolio(portfolioNames[0]);
      // Automatically load transactions for the first available portfolio
      handleLoadTransactions(portfolioNames[0]);
    }
    // If there are no portfolios, clear selection
    if (portfolioNames.length === 0 && selectedPortfolio !== '') {
      setSelectedPortfolio('');
    }
  }, [portfolioNames, selectedPortfolio]);

  // Update handleLoadTransactions to never fallback to 'Imported'
  const handleLoadTransactions = async (portfolioOverride?: string) => {
    setManualLoading(true);
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
        setManualLoading(false);
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
        setManualLoading(false);
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
      setManualLoading(false);
    }
  };

  const handleImportClick = () => {
    setModalMode('import');
    setImportText('');
    setImportPortfolioName('');
    setImportError(null);
    setShowImportModal(true);
  };
  const handleAddTransactionClick = () => {
    setModalMode('add');
    setImportText('');
    setImportPortfolioName(selectedPortfolio || (portfolioNames[0] || ''));
    setImportError(null);
    setShowImportModal(true);
  };

  const handleImportSubmit = async () => {
    if (!importPortfolioName.trim()) {
      setImportError('Portfolio name is required for import.');
      return;
    }
    if (!importText.trim()) {
      setImportError('Please paste your transactions.');
      return;
    }
    setImporting(true);
    setImportError(null);
    try {
      const response = await fetch('http://localhost:5000/api/transactions/standardize-and-save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ raw: importText, portfolio_name: importPortfolioName })
      });
      const data = await response.json();
      if (response.ok && data.status === 'saved') {
        setError(null);
        setShowImportModal(false);
        setImportText('');
        setImportPortfolioName('');
        // Load transactions for the imported portfolio
        await handleLoadTransactions(data.portfolio || importPortfolioName);
        // Always refresh portfolio names after import
        fetchAllPortfolioNames().then(setAllPortfolioNames);
      } else {
        setImportError(data.error || 'Failed to import transactions.');
      }
    } catch (err) {
      setImportError('Failed to import transactions.');
    } finally {
      setImporting(false);
    }
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

  useEffect(() => {
    // For all movements missing assetName but with assetSymbol, fetch the name from backend
    const missingNames = sortedMovements.filter(mov => mov.assetSymbol && !mov.assetName);
    if (missingNames.length === 0) return;
    const fetchNames = async () => {
      const updates: Record<string, string> = {};
      await Promise.all(missingNames.map(async (mov) => {
        if (!mov.assetSymbol || tickerNames[mov.assetSymbol]) return;
        try {
          const name = await fetchTickerName(mov.assetSymbol, idToken);
          if (name) updates[mov.assetSymbol] = name;
        } catch { }
      }));
      if (Object.keys(updates).length > 0) setTickerNames(prev => ({ ...prev, ...updates }));
    };
    fetchNames();
  }, [sortedMovements, idToken]);

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
      // Refetch from backend to ensure log is up to date
      await handleLoadTransactions();
      setPendingDeletes([]);
      setError(null);
      // Automatically update portfolio status after deletes
      if (selectedPortfolio) {
        try {
          const resp = await fetch(`http://localhost:5000/api/portfolio/${selectedPortfolio}/status/save`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${idToken}` }
          });
          if (resp.ok) {
            setStatusRefreshKey(k => k + 1);
          }
        } catch (e) {
          // Optionally handle error
        }
      }
    } else {
      setError('Some deletes failed. Please try again.');
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
          <div className="bg-gray-900 p-8 rounded-xl shadow-2xl w-full max-w-lg">
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
            <textarea
              className="w-full h-40 p-3 rounded-lg bg-gray-800 text-gray-100 border border-gray-700 focus:ring-2 focus:ring-indigo-500 mb-4"
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder={modalMode === 'add' ? 'e.g. Buy 10 AAPL at $150 on 2024-01-01' : 'e.g. Buy 10 AAPL at $150 on 2024-01-01\nSell 5 TSLA at $700 on 2024-02-15\n...'}
              disabled={importing}
            />
            {importError && <div className="text-red-400 mb-2">{importError}</div>}
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded bg-gray-700 text-gray-200 hover:bg-gray-600"
                onClick={() => setShowImportModal(false)}
                disabled={importing}
              >Cancel</button>
              <button
                className="px-4 py-2 rounded bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:opacity-50"
                onClick={handleImportSubmit}
                disabled={importing || !importText.trim() || !importPortfolioName.trim()}
              >{importing ? (modalMode === 'add' ? 'Adding...' : 'Importing...') : (modalMode === 'add' ? 'Add' : 'Import')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex justify-center items-center h-full">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-500"></div>
          <p className="ml-4 text-xl text-gray-300">Loading Transactions...</p>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="flex flex-col items-center justify-center h-full p-8">
          <p className="text-center text-red-400 text-xl mb-4">{error.toLowerCase().includes('no such table: transactions') ? 'No transactions table found in the backend database.' : error}</p>
          {error.toLowerCase().includes('no such table: transactions') && (
            <>
              <p className="text-center text-gray-300 mb-4">It looks like your database is not initialized or is missing the transactions table. You can add transactions to a portfolio to create the table.</p>
              <button
                className="px-6 py-3 rounded bg-blue-600 text-white font-semibold hover:bg-blue-500 text-lg"
                onClick={handleImportClick}
              >
                Add Transactions to Portfolio
              </button>
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
        <div className="flex flex-col items-center justify-center h-full p-8">
          <p className="text-center text-gray-300 text-xl mb-4">No portfolios found.</p>
          <p className="text-center text-gray-400 mb-4">You have not imported or added any transactions yet. Start by importing your transactions to create your first portfolio.</p>
          <button
            className="px-6 py-3 rounded bg-blue-600 text-white font-semibold hover:bg-blue-500 text-lg"
            onClick={handleImportClick}
          >
            Import Transactions
          </button>
        </div>
      )}

      {/* Main content: only show if not loading, not error, and logged in, and there are portfolios */}
      {!loading && !error && isLoggedIn && portfolioNames.length > 0 && (
        <>


          {/* Unified control bar: Portfolios in Transactions, selector, Import, Update */}
          {portfolioNames.length > 0 && (
            <div className="flex flex-wrap items-center gap-4 mb-6 bg-gray-800 rounded-xl px-6 py-4 shadow-lg">
              {/* Portfolios in Transactions */}
              <div className="flex items-center gap-2">
                <span className="text-lg text-white font-semibold mr-2">Portfolios in Transactions:</span>
                <ul className="flex flex-wrap gap-2">
                  {portfolioNames.map(name => (
                    <li key={name} className={`px-3 py-1 rounded-lg text-base font-medium shadow flex items-center justify-center ${name === selectedPortfolio ? 'bg-indigo-700 text-white' : 'bg-gray-700 text-gray-200'}`}>
                      {name}
                    </li>
                  ))}
                </ul>
              </div>
              {/* Portfolio selector */}
              <div className="flex items-center gap-2 ml-4">
                <label htmlFor="portfolio-select" className="text-base text-gray-200 font-semibold">Select:</label>
                <select
                  id="portfolio-select"
                  className="px-3 py-1 rounded bg-gray-900 text-white border border-gray-600 text-base font-semibold"
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
                {/* Remove Portfolio Button */}
                <button
                  className="ml-2 px-3 py-1 rounded bg-red-700 text-white font-semibold hover:bg-red-600 disabled:opacity-50"
                  disabled={!selectedPortfolio || importing || !isLoggedIn || !idToken}
                  onClick={() => {
                    setShowDeleteModal(true);
                    setDeleteConfirmText('');
                    setDeleteError(null);
                  }}
                  title="Delete this portfolio and all its transactions"
                >
                  Delete Portfolio
                </button>
              </div>
              {/* Import Transactions */}
              <button
                className="ml-4 px-4 py-2 rounded bg-blue-600 text-white font-semibold hover:bg-blue-500 disabled:opacity-50"
                onClick={handleImportClick}
                disabled={importing || !isLoggedIn || !idToken}
              >
                {importing ? 'Importing...' : 'Import Transactions'}
              </button>
              {/* Add Transaction */}
              <button
                className="ml-2 px-4 py-2 rounded bg-green-600 text-white font-semibold hover:bg-green-500 disabled:opacity-50"
                onClick={handleAddTransactionClick}
                disabled={importing || !isLoggedIn || !idToken}
              >
                + Add Transaction
              </button>
              {/* Update (Apply Deletes) */}
              <button
                className="ml-2 px-4 py-2 rounded bg-red-700 text-white font-semibold hover:bg-red-600 disabled:opacity-50"
                onClick={handleApplyDeletes}
                disabled={pendingDeletes.length === 0 || !isLoggedIn || !idToken}
              >
                Update ({pendingDeletes.length} to delete)
              </button>
            </div>
          )}

          {/* Portfolio status above transactions */}
          {selectedPortfolio && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-0">
                <h2 className="text-2xl font-bold text-indigo-300 flex items-center mb-0">Portfolio Status</h2>
                <button
                  className="ml-2 px-3 py-1 rounded bg-yellow-600 text-white font-semibold hover:bg-yellow-500 text-sm disabled:opacity-50"
                  style={{ minWidth: '70px' }}
                  onClick={async () => {
                    if (!selectedPortfolio) return;
                    try {
                      const resp = await fetch(`http://localhost:5000/api/portfolio/${selectedPortfolio}/status/save`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${idToken}` }
                      });
                      if (resp.ok) {
                        // Force PortfolioStatusCard to re-render by updating key
                        setStatusRefreshKey(k => k + 1);
                      }
                    } catch (e) {
                      // Optionally handle error
                    }
                  }}
                  disabled={!selectedPortfolio || !isLoggedIn || !idToken}
                >
                  Update
                </button>
              </div>
              <div className="bg-gray-800 rounded-xl shadow-2xl overflow-hidden p-6">
                <PortfolioStatusCard key={statusRefreshKey} portfolioName={selectedPortfolio} />
              </div>
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
              handleMarkForDelete={handleMarkForDelete}
              requestSort={requestSort}
              getSortIcon={getSortIcon}
            />
          ))}
        </>
      )}

      {/* Delete Portfolio Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
          <div className="bg-gray-900 p-8 rounded-xl shadow-2xl w-full max-w-md">
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
              <button
                className="px-4 py-2 rounded bg-gray-700 text-gray-200 hover:bg-gray-600"
                onClick={() => setShowDeleteModal(false)}
              >Cancel</button>
              <button
                className="px-4 py-2 rounded bg-red-700 text-white font-semibold hover:bg-red-600 disabled:opacity-50"
                disabled={deleteConfirmText.trim() !== selectedPortfolio}
                onClick={async () => {
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
                }}
              >Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

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
  handleMarkForDelete: (mov: any) => void;
  requestSort: (key: SortableKeys) => void;
  getSortIcon: (key: SortableKeys) => React.ReactNode;
}> = ({ portfolioName, filteredMovements, pendingDeletes, getTransactionIdAndPortfolio, handleUnmarkDelete, handleMarkForDelete, requestSort, getSortIcon }) => {
  const [collapsed, setCollapsed] = React.useState(false);
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-2xl font-bold text-indigo-300 flex items-center mb-0">Transactions</h2>
        <button
          className="px-3 py-1 rounded bg-gray-700 text-white font-semibold hover:bg-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          onClick={() => setCollapsed(c => !c)}
          aria-expanded={!collapsed}
          aria-controls={`transactions-table-${portfolioName}`}
        >
          {collapsed ? 'Show Transactions' : 'Hide Transactions'}
        </button>
      </div>
      <div className="bg-gray-800 rounded-xl shadow-2xl overflow-hidden">
        {!collapsed ? (
          filteredMovements.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-700" id={`transactions-table-${portfolioName}`}>
                <thead className="bg-gray-750">
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
                        className={
                          `hover:bg-gray-750 transition-colors` + (isSell ? ' bg-red-900/60' : '') + (isPendingDelete ? ' bg-yellow-900/40' : '')
                        }
                      >
                        <td className={"px-4 py-3 whitespace-nowrap text-sm text-gray-300" + (isPendingDelete ? " line-through opacity-50" : "")}>{new Date(mov.date).toLocaleDateString()}</td>
                        <td className={"px-4 py-3 whitespace-nowrap text-sm text-gray-300 capitalize" + (isPendingDelete ? " line-through opacity-50" : "")}>{(() => {
                          if (!rawType) return '-';
                          const formatted = rawType.replace(/_/g, ' ').toLowerCase();
                          return formatted.charAt(0).toUpperCase() + formatted.slice(1);
                        })()}</td>
                        <td className={"px-4 py-3 whitespace-nowrap text-sm font-medium text-white" + (isPendingDelete ? " line-through opacity-50" : "")}>{mov.name || 'N/A'}</td>
                        <td className={"px-4 py-3 whitespace-nowrap text-sm font-medium text-white" + (isPendingDelete ? " line-through opacity-50" : "")}>{mov.assetSymbol || mov.ticker || 'N/A'}</td>
                        <td className={"px-4 py-3 whitespace-nowrap text-sm text-gray-300 text-right" + (isPendingDelete ? " line-through opacity-50" : "")}>{mov.quantity != null ? mov.quantity.toLocaleString() : '-'}</td>
                        <td className={"px-4 py-3 whitespace-nowrap text-sm text-gray-300 text-right" + (isPendingDelete ? " line-through opacity-50" : "")}>{mov.price != null ? mov.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '-'}</td>
                        <td className={"px-4 py-3 whitespace-nowrap text-sm text-gray-300 text-right" + (isPendingDelete ? " line-through opacity-50" : "")}>{
                          (typeof mov.quantity === 'number' && typeof mov.price === 'number')
                            ? (mov.quantity * mov.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                            : '-'
                        }</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300 text-center">
                          {isPendingDelete ? (
                            <button
                              type="button"
                              className="px-2 py-1 rounded bg-gray-500 text-white font-semibold hover:bg-gray-400 text-xs focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 animate-pulse relative z-10"
                              onClick={function onUndoClick(e) {
                                e.preventDefault();
                                e.stopPropagation();
                                handleUnmarkDelete(mov);
                              }}
                              tabIndex={0}
                              aria-label="Undo delete for this transaction"
                              title="Undo delete for this transaction"
                            >
                              <span role="img" aria-label="Undo">↩️</span> Undo
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="px-2 py-1 rounded bg-red-600 text-white font-semibold hover:bg-red-500 text-xs focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-400 relative z-10"
                              onClick={function onDeleteClick(e) {
                                e.preventDefault();
                                e.stopPropagation();
                                handleMarkForDelete(mov);
                              }}
                              tabIndex={0}
                              aria-label="Mark this transaction for delete"
                              title="Mark this transaction for delete"
                            >
                              <span role="img" aria-label="Delete">🗑️</span> Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-gray-400">
              <p>No transactions found for <span className="font-bold text-indigo-300">{portfolioName}</span>.</p>
              <p className="mt-2 text-sm">Available portfolio names in loaded transactions: <span className="text-yellow-300">{Array.from(new Set(filteredMovements.map(mov => (mov as any).portfolio)).values()).join(', ') || 'None'}</span></p>
              <p className="mt-2 text-xs text-gray-500">Check the browser console for detailed debug info.</p>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
};
