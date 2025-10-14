// Lightweight helpers for transaction-related backend fetches.
// Centralizes endpoints so the page can call them instead of inlining fetch code.
import { authFetch, googleRefreshIdToken } from '../utils/authFetch';
import { API_BASE_URL, cleanApiBaseUrl } from '../apiBase';
import { useQuery, UseQueryResult } from '@tanstack/react-query';

// Dedupe in-flight requests for the same portfolio to avoid duplicate network calls
const pendingTransactionsFetches: Map<string, Promise<any>> = new Map();
const pendingStatusFetches: Map<string, Promise<any>> = new Map();

// Short-lived response cache to absorb near-simultaneous repeated requests
const responseCache: Map<string, { ts: number; data: any }> = new Map();
const RESPONSE_CACHE_TTL_MS = 1000; // 1 second

export async function fetchPortfolioTransactions(portfolio: string, idToken?: string | null) {
  const base = cleanApiBaseUrl(API_BASE_URL);
  const apiUrl = `${base}/api/portfolio/${encodeURIComponent(portfolio)}/transactions`;
  const key = apiUrl; // use full url as dedupe key to avoid encoding/param differences
  // Quick response cache: if we served this URL recently, return cached result
  const now = Date.now();
  const recent = responseCache.get(key);
  if (recent && now - recent.ts < RESPONSE_CACHE_TTL_MS) {
    console.debug(`[transactionsApi] Returning cached response for ${key}`);
    return Promise.resolve(recent.data);
  }
  // Reuse pending promise if exists
  if (pendingTransactionsFetches.has(key)) {
    console.debug(`[transactionsApi] Reusing pending fetch for ${key}`);
    return pendingTransactionsFetches.get(key);
  }
  const promise = (async () => {
    console.info(`[transactionsApi] Sending network request for ${apiUrl}`);
    const resp = await authFetch(apiUrl, {
      method: 'GET',
      idToken,
      refresh: googleRefreshIdToken,
    });
    const data = await resp.json().catch(() => null);
    if (resp.ok) {
      if (data && Array.isArray(data.transactions)) {
        try { responseCache.set(key, { ts: Date.now(), data: data.transactions }); } catch (e) {}
        return data.transactions;
      }
      if (data && Array.isArray(data)) {
        try { responseCache.set(key, { ts: Date.now(), data }); } catch (e) {}
        return data;
      }
      try { responseCache.set(key, { ts: Date.now(), data: [] }); } catch (e) {}
      return [];
    }
    throw new Error((data && data.error) ? data.error : `Failed to fetch transactions (${resp.status})`);
  })();

  pendingTransactionsFetches.set(key, promise);
  // Ensure map is cleaned up when settled
  promise.finally(() => { pendingTransactionsFetches.delete(key); });
  return promise;
}

export async function fetchPortfolioStatus(portfolio: string, idToken?: string | null) {
  const key = String(portfolio || '');
  if (pendingStatusFetches.has(key)) {
    return pendingStatusFetches.get(key);
  }

  const promise = (async () => {
    const base = cleanApiBaseUrl(API_BASE_URL);
    const apiUrl = `${base}/api/portfolio/${encodeURIComponent(portfolio)}/status`;
    // quick response cache for status
    const now = Date.now();
    const recent = responseCache.get(apiUrl);
    if (recent && now - recent.ts < RESPONSE_CACHE_TTL_MS) {
      console.debug(`[transactionsApi] Returning cached status for ${apiUrl}`);
      return recent.data;
    }
    const resp = await authFetch(apiUrl, {
      method: 'GET',
      idToken,
      refresh: googleRefreshIdToken,
    });
    const data = await resp.json().catch(() => null);
    if (resp.ok) {
      try { responseCache.set(apiUrl, { ts: Date.now(), data }); } catch (e) {}
      return data;
    }
    throw new Error((data && data.error) ? data.error : `Failed to fetch status (${resp.status})`);
  })();

  pendingStatusFetches.set(key, promise);
  promise.finally(() => { pendingStatusFetches.delete(key); });
  return promise;
}

export async function fetchPortfolioStatusLive(portfolio: string, idToken?: string | null) {
  const base = cleanApiBaseUrl(API_BASE_URL);
  const apiUrl = `${base}/api/portfolio/${encodeURIComponent(portfolio)}/status/live`;
  const now = Date.now();
  const recent = responseCache.get(apiUrl);
  if (recent && now - recent.ts < RESPONSE_CACHE_TTL_MS) {
    console.debug(`[transactionsApi] Returning cached live status for ${apiUrl}`);
    return recent.data;
  }
  const resp = await authFetch(apiUrl, { method: 'GET', idToken, refresh: googleRefreshIdToken });
  const data = await resp.json().catch(() => null);
  if (resp.ok) {
    try { responseCache.set(apiUrl, { ts: Date.now(), data }); } catch {}
    return data;
  }
  throw new Error((data && data.error) ? data.error : `Failed to fetch live status (${resp.status})`);
}

// React Query hooks to eliminate continuous manual triggering loops
export function usePortfolioTransactions(portfolio: string | null | undefined, idToken: string | null, opts?: { enabled?: boolean; staleTimeMs?: number }): UseQueryResult<any[], unknown> {
  const enabled = !!portfolio && !!idToken && (opts?.enabled ?? true);
  const staleTime = opts?.staleTimeMs ?? 30_000;
  return useQuery({
    queryKey: ['transactions', portfolio, !!idToken],
    enabled,
    staleTime,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 1,
    queryFn: async () => {
      if (!portfolio) return [];
      return await fetchPortfolioTransactions(portfolio, idToken);
    }
  });
}

export function usePortfolioStatusLive(portfolio: string | null | undefined, idToken: string | null, opts?: { enabled?: boolean; staleTimeMs?: number }): UseQueryResult<any, unknown> {
  const enabled = !!portfolio && (opts?.enabled ?? true);
  const staleTime = opts?.staleTimeMs ?? 15_000;
  return useQuery({
    queryKey: ['portfolioStatusLive', portfolio],
    enabled,
    staleTime,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 1,
    queryFn: async () => {
      if (!portfolio) return null;
      return await fetchPortfolioStatusLive(portfolio, idToken);
    }
  });
}
