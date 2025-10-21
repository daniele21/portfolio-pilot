import { HistoricalDataPoint, BackendTickerResponse, BackendTickerHistoryItem } from '../types';
import { API_BASE_URL, cleanApiBaseUrl as _cleanApiBaseUrl } from '../apiBase';
import { apiFetch } from '../utils/apiFetch';
import { globalRefreshStrategy } from '../utils/authFetch';
import { jwtDecode } from 'jwt-decode';

export const getAuthIdToken = (): string | null => {
  return localStorage.getItem('idToken');
};

const commonFetch = async (apiUrl: string, symbolForLogging: string): Promise<BackendTickerResponse | null> => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  let idToken = getAuthIdToken();
  // Proactive refresh if token expiring within 2 minutes.
  if (idToken) {
    try {
      const decoded: any = jwtDecode(idToken);
      const exp = decoded?.exp;
      const now = Math.floor(Date.now() / 1000);
      if (typeof exp === 'number' && exp - now < 120 && globalRefreshStrategy) {
        try {
          const refreshed = await globalRefreshStrategy();
          if (refreshed) idToken = refreshed;
        } catch (e) {
          console.warn('MarketDataService: proactive refresh failed', e);
        }
      }
    } catch {/* ignore decode errors */}
  }
  if (idToken) {
    headers['Authorization'] = `Bearer ${idToken}`;
  } else {
    console.warn(`MarketDataService: No ID token found for ${symbolForLogging}. Request to ${apiUrl} will be unauthenticated.`);
    // Potentially return an error or allow the request to proceed if some endpoints are public
    // For this app, auth is generally required by the backend.
  }

  const { ok, data, error } = await apiFetch<BackendTickerResponse>(apiUrl, { headers });
  if (!ok || !data) {
    return { source: 'CLIENT_ERROR', ticker: symbolForLogging, error: error || 'API request failed' } as BackendTickerResponse;
  }
  if ((data as BackendTickerResponse).error) {
    console.warn(`MarketDataService: Backend returned an error for ${symbolForLogging}: ${(data as BackendTickerResponse).error}`);
  }
  return data as BackendTickerResponse;
};


export const fetchHistoricalMarketPrices = async (
  symbol: string,
  startDate: string, // YYYY-MM-DD
  endDate: string    // YYYY-MM-DD
): Promise<HistoricalDataPoint[] | null> => {
  const base = _cleanApiBaseUrl(API_BASE_URL);
  // The backend /api/ticker/<symbol> returns all available history. Filtering by date is done client-side.
  const apiUrl = `${base}/api/ticker/${encodeURIComponent(symbol.toUpperCase())}`;

  const backendResponse = await commonFetch(apiUrl, symbol);

  if (!backendResponse || backendResponse.error || !backendResponse.data || !backendResponse.data.history) {
    console.warn(`MarketDataService: Could not retrieve valid historical data for ${symbol}. Error: ${backendResponse?.error}`);
    return null;
  }
  
  const transformedData: HistoricalDataPoint[] = backendResponse.data.history
    .map((item: BackendTickerHistoryItem) => ({
      date: new Date(item.date).toISOString().split('T')[0], // Normalize date format
      value: item.close,
    }))
    .filter(point => {
      const pointDate = new Date(point.date);
      return pointDate >= new Date(startDate) && pointDate <= new Date(endDate);
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  // console.log(`MarketDataService: Successfully fetched and transformed historical prices for ${symbol}. Points: ${transformedData.length}`);
  return transformedData;
};

export const fetchTickerDetails = async (symbol: string): Promise<BackendTickerResponse | null> => {
  // Disabled: avoid calling /api/ticker/<symbol> directly from the frontend.
  // This prevents per-ticker fetches originating from callers such as portfolioService.getAssets().
  console.warn(`[MarketDataService] fetchTickerDetails is disabled in the frontend. Requested: ${symbol}`);
  // Emit a trace so developers can find remaining callers during dev/debugging.
  try { console.trace(); } catch (e) { /* ignore */ }
  // Return a sentinel response so callers receive a predictable shape they can handle.
  return { source: 'CLIENT_DISABLED', ticker: symbol, error: 'fetchTickerDetails disabled on client' } as BackendTickerResponse;
};

export interface TickerSearchResultItem {
  symbol: string;
  shortname?: string;
  longname?: string;
  exchDisp?: string;
  quoteType?: string;
  currency?: string;
  score?: number;
}

export interface TickerSearchResponse {
  query: string;
  count: number;
  results: TickerSearchResultItem[];
  error?: string;
}

// Symbol search is now Yahoo-only by default as per updated requirements (Gemini retained elsewhere for analytics)
export const searchTickers = async (query: string, provider: 'yahoo' | 'gemini' = 'yahoo'): Promise<TickerSearchResponse | null> => {
  const q = query.trim();
  if (q.length < 2) return { query: q, count: 0, results: [] };
  const base = _cleanApiBaseUrl(API_BASE_URL);
  const apiUrl = `${base}/api/tickers/search?q=${encodeURIComponent(q)}&provider=${provider}`;
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const idToken = getAuthIdToken();
  if (idToken) headers['Authorization'] = `Bearer ${idToken}`; // optional (endpoint currently public)
  const { ok, data, error } = await apiFetch<TickerSearchResponse>(apiUrl, { headers });
  if (!ok || !data) return { query: q, count: 0, results: [], error: error || 'request failed' };
  return data as TickerSearchResponse;
};

export const fetchBenchmarkPerformance = async (symbol: string): Promise<HistoricalDataPoint[] | null> => {
  const base = _cleanApiBaseUrl(API_BASE_URL);
  const apiUrl = `${base}/api/benchmark/${encodeURIComponent(symbol)}/performance`;
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const idToken = getAuthIdToken ? getAuthIdToken() : null;
  if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
  const { ok, data } = await apiFetch<any>(apiUrl, { headers });
  if (!ok || !data) return null;
  return Array.isArray(data) ? data : null;
};
