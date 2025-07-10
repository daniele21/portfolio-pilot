import { Kpi, Asset, PortfolioData, StandardizedMovement, MovementType, HistoricalDataPoint, ProcessMovementsResult, TrafficLightStatus, PortfolioStatusResponse, PortfolioPerformanceResponse, PortfolioHolding, BackendTransactionPayloadItem, BackendSaveTransactionsResponse, BackendTransactionPayloadStructured } from '../types';
import { MOCK_KPIS_DATA } from '../constants'; // Keep for structure and some default texts/icons
import { fetchTickerDetails, fetchHistoricalMarketPrices } from './marketDataService';
import { BanknotesIcon, PresentationChartLineIcon } from '@heroicons/react/24/outline';

// const API_BASE_URL = 'https://finance-data-server-335283962900.europe-west1.run.app';
const API_BASE_URL = 'http://127.0.0.1:5000';
const DEFAULT_PORTFOLIO_ID = 'main'; // Or make this dynamic if multiple portfolios are supported

let _isInitialized = false;
let localAppliedMovementsLog: StandardizedMovement[] = []; // Temporary client-side log

const getAuthIdToken = (): string | null => {
  return localStorage.getItem('idToken');
};

const commonPortfolioFetch = async <T>(endpoint: string, portfolioId: string): Promise<T | null> => {
  const cleanApiBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const apiUrl = `${cleanApiBaseUrl}/api/portfolio/${portfolioId}/${endpoint}`;
  
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
    const response = await fetch(apiUrl, { headers });
    if (!response.ok) {
      let errorMsg = `API request failed: ${response.status} ${response.statusText}`;
      try {
        const errData = await response.json();
        errorMsg += ` - ${errData.error || JSON.stringify(errData)}`;
      } catch (e) { /* ignore */ }
      console.error(`PortfolioService: Error fetching ${apiUrl}. ${errorMsg}`);
      throw new Error(errorMsg);
    }
    return await response.json() as T;
  } catch (error) {
    console.error(`PortfolioService: Network or parsing error fetching ${apiUrl}.`, error);
    return null;
  }
};

// Fetch portfolio status for a given portfolio name using the new endpoint
export const fetchPortfolioStatus = async (portfolioName: string): Promise<PortfolioStatusResponse | null> => {
  if (!portfolioName) return null;
  return await commonPortfolioFetch<PortfolioStatusResponse>('status', portfolioName);
};

// Fetch live (computed) portfolio status for a given portfolio name
export const fetchPortfolioStatusLive = async (portfolioName: string): Promise<PortfolioStatusResponse | null> => {
  if (!portfolioName) return null;
  return await commonPortfolioFetch<PortfolioStatusResponse>('status/live', portfolioName);
};

// Save the current computed status to the backend
export const savePortfolioStatus = async (portfolioName: string): Promise<{ status: string; portfolio: string; data?: any; error?: string }> => {
  if (!portfolioName) return { status: 'error', portfolio: portfolioName, error: 'No portfolio name provided' };
  const cleanApiBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const apiUrl = `${cleanApiBaseUrl}/api/portfolio/${portfolioName}/status/save`;
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const idToken = getAuthIdToken();
  if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
  else return { status: 'error', portfolio: portfolioName, error: 'No ID token' };
  try {
    const response = await fetch(apiUrl, { method: 'POST', headers });
    const data = await response.json();
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
      value: holding.value,
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
  const totalPortfolioValue = status.total_value || 0;
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
        kpi.value = cashHolding.value;
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
  return history || [];
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
  if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
  else {
    return { success: false, message: "User not authenticated. Cannot process transactions.", movementsProcessed: 0, movementsSkipped: 0, notes: ["User not authenticated."] };
  }

  console.log(`[PortfolioService] POST ${apiUrl}`, { raw: fileContent });
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ raw: fileContent }),
    });
    const backendResponse = await response.json();

    if (!response.ok || backendResponse.status !== 'saved') {
      return {
        success: false,
        message: backendResponse.message || response.statusText,
        error: backendResponse.error,
        movementsProcessed: backendResponse.count || 0,
        movementsSkipped: 0,
        notes: backendResponse.notes || [],
        successfullyProcessedMovements: backendResponse.transactions || []
      };
    }

    // Update local log with standardized transactions if present
    localAppliedMovementsLog = backendResponse.transactions || [];
    _isInitialized = false; // Force re-fetch on next access

    return {
      success: true,
      message: `Successfully processed and saved ${backendResponse.count || 0} transactions.`,
      movementsProcessed: backendResponse.count || 0,
      movementsSkipped: 0,
      notes: [],
      successfullyProcessedMovements: backendResponse.transactions || []
    };
  } catch (error) {
    console.error("Error posting movements to backend for standardization:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      movementsProcessed: 0,
      movementsSkipped: 0,
      notes: ["Error posting movements to backend."],
      successfullyProcessedMovements: []
    };
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
  const apiUrl = `http://localhost:5000/api/ticker/${ticker}`;
  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      }
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.data?.info?.shortName || data?.data?.info?.longName || null;
  } catch {
    return null;
  }
};

// New function to fetch all portfolio names
export const fetchAllPortfolioNames = async (): Promise<string[]> => {
  const apiUrl = `${API_BASE_URL}/api/portfolios`;
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const idToken = getAuthIdToken();
  if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
  try {
    const response = await fetch(apiUrl, { headers });
    if (!response.ok) throw new Error('Failed to fetch portfolio names');
    const data = await response.json();
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
    const response = await fetch(apiUrl, { headers });
    if (!response.ok) return [];
    const data = await response.json();
    // The backend returns a list of {date, value}
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
};

// Fetch ticker performance (historical value over time for a single ticker in a portfolio)
export const fetchTickerPerformance = async (portfolioName: string, ticker: string): Promise<HistoricalDataPoint[]> => {
  if (!portfolioName || !ticker) return [];
  const cleanApiBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const apiUrl = `${cleanApiBaseUrl}/api/portfolio/${portfolioName}/ticker/${ticker}/performance`;
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const idToken = getAuthIdToken();
  if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
  try {
    const response = await fetch(apiUrl, { headers });
    if (!response.ok) return [];
    const data = await response.json();
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
    const response = await fetch(apiUrl, { headers });
    if (!response.ok) return null;
    return await response.json();
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
    const response = await fetch(apiUrl, { headers });
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    return null;
  }
};

// Fetch asset allocation from backend API
export const fetchPortfolioAllocation = async (
  portfolioName: string,
  grouping: 'overall' | 'quoteType' = 'overall'
): Promise<{ grouping: string; allocation: any } | null> => {
  if (!portfolioName) return null;
  const cleanApiBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const apiUrl = `${cleanApiBaseUrl}/api/portfolio/${portfolioName}/allocation?grouping=${grouping}`;
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const idToken = getAuthIdToken();
  if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
  else return null;
  try {
    const response = await fetch(apiUrl, { headers });
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    return null;
  }
};

// Fetch Gemini report for a single ticker in a portfolio
export const fetchTickerReport = async (portfolioName: string, ticker: string): Promise<any | null> => {
  if (!portfolioName || !ticker) return null;
  const cleanApiBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const apiUrl = `${cleanApiBaseUrl}/api/portfolio/${portfolioName}/ticker/${ticker}/report`;
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const idToken = getAuthIdToken();
  if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
  else return null;
  try {
    const response = await fetch(apiUrl, { method: 'POST', headers });
    if (!response.ok) return null;
    return await response.json();
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
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ tickers })
    });
    if (!response.ok) return null;
    return await response.json();
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
    const response = await fetch(apiUrl, { method: 'POST', headers });
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    return null;
  }
};

// Fetch portfolio volatility from the backend API
export async function fetchPortfolioVolatility(portfolioName: string): Promise<number | null> {
  if (!portfolioName) return null;
  const cleanApiBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const apiUrl = `${cleanApiBaseUrl}/api/portfolio/${portfolioName}/volatility`;
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const idToken = getAuthIdToken();
  if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
  try {
    const res = await fetch(apiUrl, { headers });
    if (res.status === 401) {
      const data = await res.json().catch(() => ({}));
      throw { status: 401, message: data?.error || 'Invalid or expired token' };
    }
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.volatility === 'number' ? data.volatility : null;
  } catch (e) {
    return null;
  }
}
