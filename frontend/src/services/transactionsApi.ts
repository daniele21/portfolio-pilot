// Lightweight helpers for transaction-related backend fetches.
// Centralizes endpoints so the page can call them instead of inlining fetch code.
import { authFetch, googleRefreshIdToken } from '../utils/authFetch';
import { API_BASE_URL, cleanApiBaseUrl } from '../apiBase';

export async function fetchPortfolioTransactions(portfolio: string, idToken?: string | null) {
  const base = cleanApiBaseUrl(API_BASE_URL);
  const apiUrl = `${base}/api/portfolio/${encodeURIComponent(portfolio)}/transactions`;
  const resp = await authFetch(apiUrl, {
    method: 'GET',
    idToken,
    refresh: googleRefreshIdToken,
  });
  const data = await resp.json().catch(() => null);
  if (resp.ok) {
    if (data && Array.isArray(data.transactions)) return data.transactions;
    if (data && Array.isArray(data)) return data;
    return [];
  }
  throw new Error((data && data.error) ? data.error : `Failed to fetch transactions (${resp.status})`);
}

export async function fetchPortfolioStatus(portfolio: string, idToken?: string | null) {
  const base = cleanApiBaseUrl(API_BASE_URL);
  const apiUrl = `${base}/api/portfolio/${encodeURIComponent(portfolio)}/status`;
  const resp = await authFetch(apiUrl, {
    method: 'GET',
    idToken,
    refresh: googleRefreshIdToken,
  });
  const data = await resp.json().catch(() => null);
  if (resp.ok) return data;
  throw new Error((data && data.error) ? data.error : `Failed to fetch status (${resp.status})`);
}
