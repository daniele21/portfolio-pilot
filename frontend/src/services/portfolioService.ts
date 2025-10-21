import type { Kpi, Asset, PortfolioData, StandardizedMovement, HistoricalDataPoint, ProcessMovementsResult, PortfolioStatusResponse, PortfolioPerformanceResponse, PortfolioHolding } from '../types';
import { TrafficLightStatus } from '../types';
import { MOCK_KPIS_DATA } from '../constants';
import { fetchTickerDetails } from './marketDataService';
import { idbGet, idbSet, idbDel } from '../utils/idbCache';
import { API_BASE_URL, cleanApiBaseUrl } from '../apiBase';
import { apiFetch } from '../utils/apiFetch';
import { authFetch } from '../utils/authFetch';

// const API_BASE_URL = 'https://finance-data-server-335283962900.europe-west1.run.app';
const DEFAULT_PORTFOLIO_ID = 'main'; // Or make this dynamic if multiple portfolios are supported

// Cache TTLs (ms) - align with react-query defaults in main.tsx
const CACHE_TTL_SHORT = 10 * 60 * 1000; // 10 minutes
const CACHE_TTL_LONG = 15 * 60 * 1000; // 15 minutes

let _isInitialized = false;
let localAppliedMovementsLog: StandardizedMovement[] = []; // Temporary client-side log

const getAuthIdToken = (): string | null => {
  return localStorage.getItem('idToken');
};

const commonPortfolioFetch = async <T>(endpoint: string, portfolioId: string): Promise<T | null> => {
  const base = cleanApiBaseUrl(API_BASE_URL);
  const apiUrl = `${base}/api/portfolio/${portfolioId}/${endpoint}`;
  
  console.log(`[PortfolioService] GET ${apiUrl}`);
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const idToken = getAuthIdToken();
  if (idToken) {
    headers['Authorization'] = `Bearer ${idToken}`;
  } else {
    console.warn(`PortfolioService: No ID token for ${apiUrl}. Request will be unauthenticated.`);
    return null; // Or throw error, depending on desired strictness
  }

  try {
    const { ok, data, error } = await apiFetch<T>(apiUrl, { method: 'GET', headers });
    if (!ok) {
      const errorMsg = error || `API request failed: ${apiUrl}`;
      console.error(`PortfolioService: Error fetching ${apiUrl}. ${errorMsg}`);
      throw new Error(errorMsg);
    }
    return data as T;
  } catch (error) {
    console.error(`PortfolioService: Network or parsing error fetching ${apiUrl}.`, error);
    return null;
  }
};

// Fetch portfolio status for a given portfolio name using the new endpoint
export const fetchPortfolioStatus = async (portfolioName: string): Promise<PortfolioStatusResponse | null> => {
  if (!portfolioName) return null;
  const cacheKey = `status:${portfolioName}`;
  // Try cache first
  try {
    const cached = await idbGet(cacheKey);
    if (cached) return cached as PortfolioStatusResponse;
  } catch (e) {
    // ignore cache errors
  }
  const raw = await commonPortfolioFetch<any>('status', portfolioName);
  if (!raw) return null;
  // Backend may return { last_updated: ..., status: { holdings: [...], total_value: ... } }
  // Normalize to PortfolioStatusResponse { holdings, total_value, last_updated }
  let normalized: PortfolioStatusResponse;
  if (raw.status && (Array.isArray(raw.status.holdings) || raw.status.total_value !== undefined)) {
    normalized = {
      holdings: Array.isArray(raw.status.holdings) ? raw.status.holdings : [],
      // preserve legacy total_value while preferring total_market_value
      total_value: raw.status.total_value ?? 0,
      total_market_value: raw.status.total_market_value ?? raw.status.total_value ?? 0,
      last_updated: raw.last_updated ?? raw.status.last_updated ?? undefined
    };
  } else {
    normalized = raw as PortfolioStatusResponse;
  }
  // Cache normalized response
  try { await idbSet(cacheKey, normalized, CACHE_TTL_SHORT); } catch (e) {}
  return normalized;
};

// Fetch live (computed) portfolio status for a given portfolio name
export const fetchPortfolioStatusLive = async (portfolioName: string): Promise<PortfolioStatusResponse | null> => {
  if (!portfolioName) return null;
  const cacheKey = `status_live:${portfolioName}`;
  try {
    const cached = await idbGet(cacheKey);
    if (cached) return cached as PortfolioStatusResponse;
  } catch {}
  const raw = await commonPortfolioFetch<any>('status/live', portfolioName);
  if (!raw) return null;
  let normalized: PortfolioStatusResponse;
  if (raw.status && (Array.isArray(raw.status.holdings) || raw.status.total_value !== undefined)) {
    normalized = {
      holdings: Array.isArray(raw.status.holdings) ? raw.status.holdings : [],
      total_value: raw.status.total_value ?? 0,
      total_market_value: raw.status.total_market_value ?? raw.status.total_value ?? 0,
      last_updated: raw.last_updated ?? raw.status.last_updated ?? undefined
    };
  } else {
    normalized = raw as PortfolioStatusResponse;
  }
  try { await idbSet(cacheKey, normalized, CACHE_TTL_SHORT); } catch (e) {}
  return normalized;
};

// Save the current computed status to the backend
export const savePortfolioStatus = async (portfolioName: string): Promise<{ status: string; portfolio: string; data?: any; error?: string }> => {
  if (!portfolioName) return { status: 'error', portfolio: portfolioName, error: 'No portfolio name provided' };
  const base = cleanApiBaseUrl(API_BASE_URL);
  const apiUrl = `${base}/api/portfolio/${portfolioName}/status/save`;
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const idToken = getAuthIdToken();
  if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
  else return { status: 'error', portfolio: portfolioName, error: 'No ID token' };
  try {
    const { ok, data } = await apiFetch<any>(apiUrl, { method: 'POST', headers });
    if (!ok) return { status: 'error', portfolio: portfolioName, error: data?.error || 'request failed' };
    // Invalidate cached status so next read is fresh
    try { await idbDel(`status:${portfolioName}`); await idbDel(`status_live:${portfolioName}`); } catch {}
    return data;
  } catch (error) {
    return { status: 'error', portfolio: portfolioName, error: error instanceof Error ? error.message : String(error) };
  }
};

export const isPortfolioInitialized = (): boolean => _isInitialized;
export const markPortfolioAsInitialized = (): void => { _isInitialized = true; };
export const isUsingCustomData = (): boolean => {
  // Considered "custom" if any movements have been processed and potentially sent to backend.
  // This flag becomes less distinct when everything is backend-driven.
  // Perhaps, it means "has the user uploaded anything in this session?"
  return localAppliedMovementsLog.length > 0;
};


// Update getAssets to accept portfolioName and use fetchPortfolioStatus
export const getAssets = async (portfolioName: string): Promise<Asset[]> => {
  const status = await fetchPortfolioStatus(portfolioName);
  if (!status || !status.holdings) {
    _isInitialized = true;
    return [];
  }
  const assets: Asset[] = await Promise.all(status.holdings.map(async (holding: PortfolioHolding) => {
    const tickerDetails = await fetchTickerDetails(holding.ticker);
    const info = tickerDetails?.data?.info;
    return {
      id: holding.ticker,
      symbol: holding.ticker,
      name: info?.shortName || holding.ticker,
      quantity: holding.quantity,
      // prefer market_value when available
      value: (holding.market_value ?? holding.value) as number,
      averageCostPrice: null,
      category: info?.sector || 'Unknown',
      region: info?.country ? (info.country === 'United States' ? 'North America' : info.country) : 'Unknown',
      sector: info?.industry || 'Unknown',
      qualitativeRisk: 'Unknown',
      historicalValues: [],
      marketPriceHistory: [],
      currency: info?.currency || 'USD',
    };
  }));
  _isInitialized = true;
  return assets;
};

// Update getKpis to accept portfolioName and use fetchPortfolioStatus
export const getKpis = async (portfolioName: string): Promise<Kpi[]> => {
  const status = await fetchPortfolioStatus(portfolioName);
  const kpisOutput: Kpi[] = MOCK_KPIS_DATA.map(kpi => ({ ...kpi }));
  if (!status || !status.holdings) {
    // No data: return default KPIs with zero/neutral values
    kpisOutput.forEach(kpi => {
      if (kpi.id === 'totalPortfolioValue' || kpi.id === 'cashBuffer') {
        kpi.value = 0;
        kpi.unit = 'USD';
        kpi.status = TrafficLightStatus.NEUTRAL;
      } else if (kpi.id === 'portfolioPL') {
        kpi.value = 'N/A';
        kpi.status = TrafficLightStatus.NEUTRAL;
        kpi.description = "Profit/Loss calculation requires transaction history with cost basis, not fully available from current backend summary.";
      }
    });
    return kpisOutput;
  }
  // prefer market total when available
  const totalPortfolioValue = status.total_market_value ?? status.total_value ?? 0;
  const cashHolding = status.holdings.find(h => h.ticker.match(/^(USD|EUR|GBP|CASH)/i));
  kpisOutput.forEach(kpi => {
    if (kpi.id === 'totalPortfolioValue') {
      kpi.value = totalPortfolioValue;
      kpi.unit = cashHolding?.ticker.split(/[-_]/)[0] || 'USD';
      kpi.status = TrafficLightStatus.NEUTRAL;
    } else if (kpi.id === 'portfolioPL') {
      kpi.value = 'N/A';
      kpi.status = TrafficLightStatus.NEUTRAL;
      kpi.description = "Profit/Loss calculation requires transaction history with cost basis, not fully available from current backend summary.";
    } else if (kpi.id === 'cashBuffer') {
      if(cashHolding) {
          // prefer market_value for cash-holding display
          kpi.value = cashHolding.market_value ?? cashHolding.value;
        kpi.unit = cashHolding.ticker.split(/[-_]/)[0] || 'USD';
        kpi.status = cashHolding.value > 10000 ? TrafficLightStatus.GREEN : cashHolding.value > 5000 ? TrafficLightStatus.AMBER : TrafficLightStatus.RED;
      } else {
        kpi.value = 0;
        kpi.unit = 'USD';
        kpi.status = TrafficLightStatus.NEUTRAL;
        kpi.description = "Cash balance from dedicated cash holdings. If cash is not a tracked asset, this will be 0 or N/A.";
      }
    } else if (["ytdReturn", "riskScore", "allocationDrift"].includes(kpi.id)) {
      kpi.value = 'N/A';
      kpi.status = TrafficLightStatus.NEUTRAL;
      const originalDesc = MOCK_KPIS_DATA.find(mk => mk.id === kpi.id)?.description || "";
      kpi.description = `${originalDesc} (Calculation not supported by current backend summary.)`;
    }
  });
  return kpisOutput;
};

// Update getPortfolioData to accept portfolioName and use new functions
export const getPortfolioData = async (portfolioName: string): Promise<PortfolioData> => {
  if (!_isInitialized) {
    await getAssets(portfolioName);
  }
  const [kpis, assets, history] = await Promise.all([
    getKpis(portfolioName),
    getAssets(portfolioName),
    getPortfolioHistory(), // TODO: update to use portfolioName if endpoint supports it
  ]);
  return { kpis, assets, portfolioHistory: history };
};


export const getPortfolioHistory = async (): Promise<HistoricalDataPoint[]> => {
  const history = await commonPortfolioFetch<PortfolioPerformanceResponse>('performance', DEFAULT_PORTFOLIO_ID);
  _isInitialized = true; // Mark as initialized even if empty
  if (!history || !Array.isArray(history)) return [];
  // Backend now returns per-day objects with fields like:
  //  { date, total_value, total_market_value, net_unrealised_pnl, pct }
  // Normalize into HistoricalDataPoint expected by the app: { date, value, abs_value, pct }
  try {
    const normalized: HistoricalDataPoint[] = history.map((h: any) => ({
      date: h.date,
      // 'value' in the app is net value (market - cost basis)
      value: Number(h.net_unrealised_pnl ?? h.net_unrealized_pnl ?? h.value ?? 0) || 0,
      abs_value: Number(h.total_market_value ?? h.abs_value ?? 0) || 0,
  pct: Number(h.pct ?? 0) || 0,
  // realized P&L (backend may provide either spelling)
  realized: Number(h.realized_pnl ?? h.realised_pnl ?? 0) || 0,
  // pct_from_first removed - calculated client-side when needed
      // Backend fields for compatibility
      total_value: Number(h.total_value ?? 0) || 0,
      total_market_value: Number(h.total_market_value ?? h.abs_value ?? 0) || 0,
      net_unrealised_pnl: Number(h.net_unrealised_pnl ?? h.net_unrealized_pnl ?? 0) || 0,
      net_unrealized_pnl: Number(h.net_unrealized_pnl ?? h.net_unrealised_pnl ?? 0) || 0,
    }));
    return normalized;
  } catch (e) {
    console.error('Failed to normalize portfolio performance payload', e, history);
    return [];
  }
};

// Fetch Gemini-backed daily risk analysis for a portfolio
export const fetchPortfolioRisk = async (portfolioName: string): Promise<any | null> => {
  if (!portfolioName) return null;
  return await commonPortfolioFetch<any>('risk', portfolioName);
};

// Fetch Gemini-backed daily structured summary (sumup) for a portfolio
export const fetchPortfolioSummary = async (portfolioName: string): Promise<any | null> => {
  if (!portfolioName) return null;
  return await commonPortfolioFetch<any>('summary', portfolioName);
};

export const getAppliedMovementsLog = async (): Promise<StandardizedMovement[]> => {
    // This returns the local, session-only log. It's not fetched from backend.
    return [...localAppliedMovementsLog];
};

export const processAndApplyMovements = async (fileContent: string): Promise<ProcessMovementsResult> => {
  // Use new API: POST /api/transactions/standardize-and-save with { raw: fileContent }
  const cleanApiBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const apiUrl = `${cleanApiBaseUrl}/api/transactions/standardize-and-save`;
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const idToken = getAuthIdToken();
  if (!idToken) {
    return { success: false, message: 'User not authenticated. Cannot process transactions.', movementsProcessed: 0, movementsSkipped: 0, notes: ['User not authenticated.'], successfullyProcessedMovements: [] };
  }

  try {
    const { ok, data } = await apiFetch<any>(apiUrl, { method: 'POST', headers, body: JSON.stringify({ raw: fileContent }) });
    if (!ok || !data) {
      return {
        success: false,
        message: data?.message || data?.error || 'Failed to process movements',
        error: data?.error,
        movementsProcessed: data?.count || 0,
        movementsSkipped: 0,
        notes: data?.notes || [],
        successfullyProcessedMovements: data?.transactions || []
      } as ProcessMovementsResult;
    }

    // Update local log with standardized transactions if present
    localAppliedMovementsLog = data.transactions || [];
    _isInitialized = false; // Force re-fetch on next access

    return {
      success: true,
      message: `Successfully processed and saved ${data.count || 0} transactions.`,
      movementsProcessed: data.count || 0,
      movementsSkipped: 0,
      notes: data.notes || [],
      successfullyProcessedMovements: data.transactions || []
    } as ProcessMovementsResult;
  } catch (error) {
    console.error('Error posting movements to backend for standardization:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      movementsProcessed: 0,
      movementsSkipped: 0,
      notes: ['Error posting movements to backend.'],
      successfullyProcessedMovements: []
    } as ProcessMovementsResult;
  }
};

// New: ingest transactions via new backend endpoint (files or raw)
// export const ingestTransactions = async (portfolioName: string, files: File[], rawText: string | null): Promise<BackendIngestTransactionsResponse> => {
//   // DEPRECATED: prefer `ingestTransactionsWithResolution` which provides a
//   // human-in-the-loop suggestion flow for ambiguous ticker lookups. This
//   // legacy function remains for compatibility but new UI code should call
//   // `ingestTransactionsWithResolution` instead.
//   console.warn('DEPRECATED: ingestTransactions is deprecated. Use ingestTransactionsWithResolution for interactive ingestion.');
//   const cleanApiBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
//   const endpoint = `${cleanApiBaseUrl}/api/transactions/ingest/${encodeURIComponent(portfolioName)}`;
//   const idToken = getAuthIdToken();
//   if (!idToken) return { status: 'error', message: 'Not authenticated' };
//   try {
//     let data: any = null;
//     if (files.length > 0) {
//       // Use authFetch directly for multipart form upload so we don't force JSON content-type
//       const form = new FormData();
//       files.forEach(f => form.append('file', f, f.name));
//       const resp = await authFetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${idToken}` }, body: form });
//       data = await resp.json().catch(() => null);
//       if (!resp.ok) return { status: data?.status || 'error', message: data?.error || data?.message || 'Ingestion failed', error: data?.error };
//     } else if (rawText) {
//       const { ok, data: respData } = await apiFetch<any>(endpoint, { method: 'POST', idToken, body: JSON.stringify({ raw: rawText }) });
//       data = respData;
//       if (!ok) return { status: data?.status || 'error', message: data?.error || data?.message || 'Ingestion failed', error: data?.error };
//     } else {
//       return { status: 'error', message: 'No files or raw text provided' };
//     }
//     // On successful ingestion, invalidate relevant caches so UI reloads fresh data
//     try {
//       await idbDel('portfolio_names');
//       await idbDel(`status:${portfolioName}`);
//       await idbDel(`status_live:${portfolioName}`);
//     } catch {
//       // ignore cache errors
//     }
//     return data as BackendIngestTransactionsResponse;
//   } catch (e) {
//     return { status: 'error', message: e instanceof Error ? e.message : String(e) };
//   }
// };

// New: ingest transactions with human-in-the-loop ticker resolution
export const ingestTransactionsWithResolution = async (portfolioName: string, files: File[], rawText: string | null): Promise<any> => {
  const cleanApiBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const endpoint = `${cleanApiBaseUrl}/api/transactions/ingest-with-resolution/${encodeURIComponent(portfolioName)}`;
  const idToken = getAuthIdToken();
  if (!idToken) return { status: 'error', message: 'Not authenticated' };
  
  try {
    let data: any = null;
    if (files.length > 0) {
      // Use authFetch directly for multipart form upload
      const form = new FormData();
      files.forEach(f => form.append('file', f, f.name));
      const resp = await authFetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${idToken}` }, body: form });
      data = await resp.json().catch(() => null);
      if (!resp.ok) return { status: data?.status || 'error', message: data?.error || data?.message || 'Ingestion failed', error: data?.error };
    } else if (rawText) {
      const { ok, data: respData } = await apiFetch<any>(endpoint, { method: 'POST', idToken, body: JSON.stringify({ raw: rawText }) });
      data = respData;
      if (!ok) return { status: data?.status || 'error', message: data?.error || data?.message || 'Ingestion failed', error: data?.error };
    } else {
      return { status: 'error', message: 'No files or raw text provided' };
    }
    
    // Clear caches on successful request (whether saved or pending)
    try {
      await idbDel('portfolio_names');
      await idbDel(`status:${portfolioName}`);
      await idbDel(`status_live:${portfolioName}`);
    } catch {
      // ignore cache errors
    }
    
    return data;
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : String(e) };
  }
};

// Resolve ticker choices and complete transaction saving
export const resolveTickerChoices = async (
  portfolioName: string, 
  tickerResolutions: Array<{original_ticker: string, chosen_symbol: string}>,
  resolvedTransactions: any[] = [],
  allTransactions: any[] = []
): Promise<any> => {
  const cleanApiBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const endpoint = `${cleanApiBaseUrl}/api/transactions/resolve-ticker/${encodeURIComponent(portfolioName)}`;
  const idToken = getAuthIdToken();
  if (!idToken) return { status: 'error', message: 'Not authenticated' };
  
  try {
    const { ok, data } = await apiFetch<any>(endpoint, {
      method: 'POST',
      idToken,
      body: JSON.stringify({
        ticker_resolutions: tickerResolutions,
        resolved_transactions: resolvedTransactions,
        all_transactions: allTransactions
      })
    });
    
    if (!ok) {
      return { status: data?.status || 'error', message: data?.error || data?.message || 'Resolution failed', error: data?.error };
    }
    
    // Clear caches on successful save
    try {
      await idbDel('portfolio_names');
      await idbDel(`status:${portfolioName}`);
      await idbDel(`status_live:${portfolioName}`);
    } catch {
      // ignore cache errors
    }
    
    return data;
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : String(e) };
  }
};

export const resetPortfolioDataToMocks = async (): Promise<void> => {
  localAppliedMovementsLog = [];
  _isInitialized = false; // Force re-fetch on next access
  console.log(`Portfolio data state cleared locally. Next load will be from backend.`);
};

// Initial data load when app starts or user logs in.
// This might be called from App.tsx or a root component effect.
export const initialLoad = async (portfolioName: string) => {
    if (!_isInitialized) {
        console.log("PortfolioService: Performing initial load.");
        await getPortfolioData(portfolioName); // Fetches all core data and sets _isInitialized
    }
};

// Fetch ticker name from backend
export const fetchTickerName = async (ticker: string, idToken: string | null): Promise<string | null> => {
  if (!ticker || !idToken) return null;
  const cleanApiBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const apiUrl = `${cleanApiBaseUrl}/api/ticker/${encodeURIComponent(ticker)}`;
  try {
    const { ok, data } = await apiFetch<any>(apiUrl, { method: 'GET', idToken });
    if (!ok || !data) return null;
    return data?.data?.info?.shortName || data?.data?.info?.longName || null;
  } catch {
    return null;
  }
};

// Fetch saved targets for a portfolio. Returns an object like { asset_type: {...}, risk: {...} }
export const fetchPortfolioTargets = async (portfolioName: string): Promise<Record<string, any> | null> => {
  if (!portfolioName) return null;
  const cleanApiBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const apiUrl = `${cleanApiBaseUrl}/api/portfolio/${encodeURIComponent(portfolioName)}/targets`;
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const idToken = getAuthIdToken();
  if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
  try {
    const { ok, data } = await apiFetch<any>(apiUrl, { method: 'GET', headers });
    if (!ok || !data) { console.warn('fetchPortfolioTargets: non-ok response'); return null; }
    return data.targets || null;
  } catch (e) {
    console.error('fetchPortfolioTargets error', e);
    return null;
  }
};

// Save targets for a portfolio. Expects mode and targets object. Returns backend JSON or error object.
export const savePortfolioTargets = async (portfolioName: string, mode: 'asset_type' | 'risk', targets: Record<string, number>) => {
  if (!portfolioName) return { status: 'error', error: 'No portfolio provided' };
  const cleanApiBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const apiUrl = `${cleanApiBaseUrl}/api/portfolio/${encodeURIComponent(portfolioName)}/targets`;
  const idToken = getAuthIdToken();
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
  try {
  const { data } = await apiFetch<any>(apiUrl, { method: 'POST', idToken: getAuthIdToken(), body: JSON.stringify({ mode, targets }) });
  return data;
  } catch (e) {
    console.error('savePortfolioTargets error', e);
    return { status: 'error', error: e instanceof Error ? e.message : String(e) };
  }
};

// New function to fetch all portfolio names
export const fetchAllPortfolioNames = async (): Promise<string[]> => {
  const apiUrl = `${API_BASE_URL}/api/portfolios`;
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const idToken = getAuthIdToken();
  if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
  const cacheKey = 'portfolio_names';
  try {
    const cached = await idbGet(cacheKey);
    if (Array.isArray(cached) && cached.length > 0) return cached;
  } catch {}
  try {
    const { ok, data } = await apiFetch<any>(apiUrl, { method: 'GET', headers });
    if (!ok || !data) throw new Error('Failed to fetch portfolio names');
    const toCache = Array.isArray(data.portfolios) ? data.portfolios : [];
    try { await idbSet(cacheKey, toCache, CACHE_TTL_LONG); } catch {}
    return Array.isArray(data.portfolios) ? data.portfolios : [];
  } catch (e) {
    console.error('Error fetching portfolio names', e);
    return [];
  }
};

// Fetch portfolio performance (historical value over time)
export const fetchPortfolioPerformance = async (portfolioName: string): Promise<HistoricalDataPoint[]> => {
  if (!portfolioName) return [];
  const cleanApiBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const apiUrl = `${cleanApiBaseUrl}/api/portfolio/${portfolioName}/performance`;
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const idToken = getAuthIdToken();
  if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
  try {
    const { ok, data } = await apiFetch<any>(apiUrl, { method: 'GET', headers });
    if (!ok || !data) return [];
    if (!Array.isArray(data)) return [];
    try {
      return data.map((h: any) => ({
        date: h.date,
        value: Number(h.net_unrealised_pnl ?? h.net_unrealized_pnl ?? h.value ?? 0) || 0,
        abs_value: Number(h.total_market_value ?? h.abs_value ?? 0) || 0,
        pct: Number(h.pct ?? 0) || 0,
        // New TWR-compatible backend fields (optional)
        cash: Number(h.cash ?? 0) || 0,
        equity: Number(h.equity ?? 0) || 0,
        twr_daily_pct: Number(h.twr_daily_pct ?? 0) || 0,
        twr_cum_pct: Number(h.twr_cum_pct ?? 0) || 0,
        twr_index: (() => {
          const raw = Number(h.twr_index);
          return Number.isFinite(raw) ? raw : undefined;
        })(),
        twr_index_pct: (() => {
          const indexRaw = Number(h.twr_index);
          if (Number.isFinite(indexRaw)) {
            return (indexRaw - 1) * 100;
          }
          const pct = Number(h.twr_index_pct ?? h.twr_cum_pct);
          return Number.isFinite(pct) ? pct : undefined;
        })(),
        flow: (() => {
          const value = Number(h.flow ?? h.net_flow);
          return Number.isFinite(value) ? value : undefined;
        })(),
        cumulative_flow: (() => {
          const value = Number(h.cumulative_flow ?? h.flow_cumulative);
          return Number.isFinite(value) ? value : undefined;
        })(),
        net_value: (() => {
          const value = Number(h.net_value);
          return Number.isFinite(value) ? value : undefined;
        })(),
        // pct_from_first removed - calculated client-side when needed
        // Backend fields for compatibility
        total_value: Number(h.total_value ?? 0) || 0,
        total_market_value: Number(h.total_market_value ?? h.abs_value ?? 0) || 0,
        net_unrealised_pnl: Number(h.net_unrealised_pnl ?? h.net_unrealized_pnl ?? 0) || 0,
        net_unrealized_pnl: Number(h.net_unrealized_pnl ?? h.net_unrealised_pnl ?? 0) || 0,
      }));
    } catch (e) {
      console.error('Failed to normalize performance payload', e, data);
      return [];
    }
  } catch (e) {
    return [];
  }
};

// Fetch ticker performance (historical value over time for a single ticker in a portfolio)
export const fetchTickerPerformance = async (portfolioName: string, ticker: string): Promise<HistoricalDataPoint[]> => {
  if (!portfolioName || !ticker) return [];
  const cleanApiBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  // Ensure both portfolioName and ticker are URL-encoded to avoid path issues
  const apiUrl = `${cleanApiBaseUrl}/api/portfolio/${encodeURIComponent(portfolioName)}/ticker/${encodeURIComponent(ticker)}/performance`;
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const idToken = getAuthIdToken();
  if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
  try {
    const { ok, data } = await apiFetch<any>(apiUrl, { method: 'GET', headers });
    if (!ok || !data) return [];
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
};

// Fetch KPIs from new backend endpoint
export const fetchPortfolioKpis = async (portfolioName: string): Promise<any> => {
  if (!portfolioName) return null;
  const cleanApiBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const apiUrl = `${cleanApiBaseUrl}/api/portfolio/${portfolioName}/kpis`;
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const idToken = getAuthIdToken();
  if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
  try {
    const { ok, data } = await apiFetch<any>(apiUrl, { method: 'GET', headers });
    if (!ok) return null;
    return data;
  } catch (e) {
    return null;
  }
};

// Fetch returns KPIs (yesterday, weekly, monthly) for the portfolio dashboard
export const fetchPortfolioReturnsKpis = async (portfolioName: string): Promise<any> => {
  if (!portfolioName) return null;
  const cleanApiBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const apiUrl = `${cleanApiBaseUrl}/api/portfolio/${portfolioName}/kpis/returns`;
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const idToken = getAuthIdToken();
  if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
  else return null;
  try {
    const { ok, data } = await apiFetch<any>(apiUrl, { method: 'GET', headers });
    if (!ok) return null;
    return data;
  } catch (e) {
    return null;
  }
};

// Fetch asset allocation from backend API
export const fetchPortfolioAllocation = async (
  portfolioName: string,
  grouping: 'overall' | 'asset_type' | 'assetType' | 'category' | 'risk' | 'category_risk' = 'overall'
): Promise<{ grouping: string; allocation: any } | null> => {
  if (!portfolioName) return null;
  const cleanApiBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const apiUrl = `${cleanApiBaseUrl}/api/portfolio/${portfolioName}/allocation?grouping=${grouping}`;
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const idToken = getAuthIdToken();
  if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
  else return null;
  try {
    const { ok, data } = await apiFetch<any>(apiUrl, { method: 'GET', headers });
    if (!ok) return null;
    return data;
  } catch (e) {
    return null;
  }
};

// Fetch Gemini report for a single ticker in a portfolio
export const fetchTickerReport = async (portfolioName: string, ticker: string): Promise<any | null> => {
  if (!portfolioName || !ticker) return null;
  const cleanApiBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const apiUrl = `${cleanApiBaseUrl}/api/portfolio/${encodeURIComponent(portfolioName)}/ticker/${encodeURIComponent(ticker)}/report`;
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const idToken = getAuthIdToken();
  if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
  else return null;
  try {
    const { ok, data } = await apiFetch<any>(apiUrl, { method: 'POST', headers });
    if (!ok) return null;
    return data;
  } catch (e) {
    return null;
  }
};

// Fetch Gemini report for multiple tickers in a portfolio (multi-ticker report)
export const fetchMultiTickerReport = async (portfolioName: string, tickers: string[]): Promise<any | null> => {
  if (!portfolioName || !tickers || tickers.length < 2) return null;
  const cleanApiBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const apiUrl = `${cleanApiBaseUrl}/api/portfolio/${portfolioName}/tickers/report`;
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const idToken = getAuthIdToken();
  if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
  else return null;
  try {
    const { ok, data } = await apiFetch<any>(apiUrl, { method: 'POST', headers, body: JSON.stringify({ tickers }) });
    if (!ok) return null;
    return data;
  } catch (e) {
    return null;
  }
};

// Fetch Gemini report for a portfolio (calls /api/portfolio/<portfolio_name>/report)
export const fetchPortfolioReport = async (portfolioName: string, force: boolean = false): Promise<any | null> => {
  if (!portfolioName) return null;
  const cleanApiBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const apiUrl = `${cleanApiBaseUrl}/api/portfolio/${portfolioName}/report${force ? '?force=true' : ''}`;
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const idToken = getAuthIdToken();
  if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
  else return null;
  try {
    const { ok, data } = await apiFetch<any>(apiUrl, { method: 'POST', headers });
    if (!ok) return null;
    return data;
  } catch (e) {
    return null;
  }
};

export interface PortfolioVolatilityResponse {
  volatility: number | null;
  window: number | null;
  method: 'rolling' | 'ewm' | string;
}

// Fetch portfolio volatility from the backend API
export async function fetchPortfolioVolatility(
  portfolioName: string,
  options: { window?: string | number } = {}
): Promise<PortfolioVolatilityResponse | null> {
  if (!portfolioName) return null;
  const cleanApiBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const windowParam = options.window ?? '30';
  const params = new URLSearchParams();
  if (windowParam !== undefined && windowParam !== null) {
    params.set('window', String(windowParam));
  }
  const queryString = params.toString();
  const apiUrl = `${cleanApiBaseUrl}/api/portfolio/${portfolioName}/volatility${queryString ? `?${queryString}` : ''}`;
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const idToken = getAuthIdToken();
  if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
  try {
    const { ok, data, error } = await apiFetch<any>(apiUrl, { method: 'GET', headers });
    if (!ok) {
      if (typeof error === 'string' && error.includes('401')) throw { status: 401, message: error };
      return null;
    }
    return {
      volatility: typeof data?.volatility === 'number' ? data.volatility : null,
      window: typeof data?.window === 'number' ? data.window : null,
      method: typeof data?.method === 'string' ? data.method : 'rolling'
    };
  } catch (e) {
    return null;
  }
}

export interface PortfolioVolatilityPoint {
  date: string;
  volatility: number | null;
}

/** Fetch rolling volatility series (time-series) from the backend API
 * Returns an array of { date, volatility } points where volatility is a decimal (e.g. 0.12 = 12%).
 */
export async function fetchPortfolioVolatilitySeries(
  portfolioName: string,
  options: { window?: string | number } = {}
): Promise<PortfolioVolatilityPoint[] | null> {
  if (!portfolioName) return null;
  const cleanApiBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const windowParam = options.window ?? '30';
  const params = new URLSearchParams();
  params.set('series', '1');
  if (windowParam !== undefined && windowParam !== null) {
    params.set('window', String(windowParam));
  }
  const queryString = params.toString();
  const apiUrl = `${cleanApiBaseUrl}/api/portfolio/${portfolioName}/volatility${queryString ? `?${queryString}` : ''}`;
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const idToken = getAuthIdToken();
  if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
  try {
    const { ok, data } = await apiFetch<any>(apiUrl, { method: 'GET', headers });
    if (!ok || !data) return null;
    if (!data || !Array.isArray(data.series)) return [];
    return data.series.map((pt: any) => ({ date: String(pt.date), volatility: typeof pt.volatility === 'number' ? pt.volatility : null }));
  } catch (e) {
    return null;
  }
}
