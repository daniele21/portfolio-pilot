import type { AlertSettings, AlertCondition } from '../types';
import { idbGet, idbSet, idbDel } from '../utils/idbCache';

import { API_BASE_URL, cleanApiBaseUrl } from '../apiBase';
import { authFetch, googleRefreshIdToken } from '../utils/authFetch';

const getAuthIdToken = (): string | null => {
  try {
    return localStorage.getItem('idToken');
  } catch (e) {
    return null;
  }
};

const ALERTS_CACHE_KEY = 'portfolio_alerts_v1';

export const getAlertSettings = async (portfolioName: string): Promise<AlertSettings> => {
  try {
    // Try backend first
      try {
    const base = cleanApiBaseUrl(API_BASE_URL);
    const apiUrl = `${base}/api/alerts/${encodeURIComponent(portfolioName)}`;
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    const idToken = getAuthIdToken();
    // Use authFetch so expired tokens can be refreshed automatically via GSI
    const resp = await authFetch(apiUrl, { method: 'GET', headers, idToken, refresh: googleRefreshIdToken });
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.alerts) {
          // cache locally
          try { await idbSet(`${ALERTS_CACHE_KEY}:${portfolioName}`, data.alerts); } catch {};
          return data.alerts as AlertSettings;
        }
      }
    } catch (e) {
      // ignore network errors and fallback to cache
    }

    const stored = await idbGet(`${ALERTS_CACHE_KEY}:${portfolioName}`);
    if (stored && typeof stored === 'object') {
      return stored as AlertSettings;
    }
  } catch (e) {
    console.warn('Failed to load alert settings from cache', e);
  }

  // Return default settings
  return {
    portfolioName,
    conditions: [],
    emailNotifications: false,
    pushNotifications: false,
  };
};

export const saveAlertSettings = async (settings: AlertSettings): Promise<void> => {
  // Save to idb cache first
  try {
    await idbSet(`${ALERTS_CACHE_KEY}:${settings.portfolioName}`, settings);
  } catch (e) {
    console.warn('Failed to save alert settings to cache', e);
  }

  // Try to persist to backend (requires auth cookie or idToken handled by client)
  try {
  const base = cleanApiBaseUrl(API_BASE_URL);
  const apiUrl = `${base}/api/alerts/${encodeURIComponent(settings.portfolioName)}`;
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    const idToken = getAuthIdToken();
    const resp = await authFetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ alerts: settings }),
      idToken,
      refresh: googleRefreshIdToken,
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to save settings to server');
    }
  } catch (e) {
    console.warn('Failed to persist alert settings to server, will rely on local cache', e);
    // don't rethrow - offline mode allowed
  }
};

export const deleteAlertSettings = async (portfolioName: string): Promise<void> => {
  // Remove from idb cache
  try { await idbDel(`${ALERTS_CACHE_KEY}:${portfolioName}`); } catch (e) { /* ignore */ }

  try {
  const base = cleanApiBaseUrl(API_BASE_URL);
  const apiUrl = `${base}/api/alerts/${encodeURIComponent(portfolioName)}`;
  const headers: HeadersInit = {};
  const idToken = getAuthIdToken();
  const resp = await authFetch(apiUrl, { method: 'DELETE', headers, idToken, refresh: googleRefreshIdToken });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to delete alerts on server');
    }
  } catch (e) {
    console.warn('Failed to delete alerts on server; local cache cleared', e);
    // allow frontend to continue; server-side may still hold alerts if unauthenticated
  }
};

export const createDefaultAlertCondition = (type: AlertCondition['type']): Omit<AlertCondition, 'id'> => {
  const baseCondition = {
    enabled: true,
    comparison: 'above' as const,
    threshold: 0,
  };

  switch (type) {
    case 'volatility':
      return {
        ...baseCondition,
        type,
        name: 'Portfolio Volatility Alert',
        description: 'Alert when portfolio volatility exceeds threshold',
        period: '30d',
        threshold: 20, // 20% volatility
      };
    case 'portfolio_return':
      return {
        ...baseCondition,
        type,
        name: 'Portfolio Return Alert',
        description: 'Alert when portfolio return crosses threshold',
        timeframe: '1d',
        threshold: 5, // 5% return
        comparison: 'below', // Alert when portfolio drops
      };
    case 'ticker_return':
      return {
        ...baseCondition,
        type,
        name: 'Ticker Return Alert',
        description: 'Alert when specific ticker return crosses threshold',
        timeframe: '1d',
        threshold: 10, // 10% return
        ticker: '',
      };
    default:
      throw new Error(`Unknown alert type: ${type}`);
  }
};

export const generateAlertId = (): string => {
  return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Simulate checking alerts (in a real app, this would be done by a backend service)
export const checkAlerts = async (portfolioName: string): Promise<AlertCondition[]> => {
  const cacheKey = `${ALERTS_CACHE_KEY}:triggers:${portfolioName}`;
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  try {
    // Try to use cached triggered alerts if they are fresh (within 24h)
    try {
      const stored = await idbGet(cacheKey);
      if (stored && typeof stored === 'object') {
        const { ts, triggered } = stored as any;
        if (ts && (Date.now() - ts) < ONE_DAY_MS && Array.isArray(triggered)) {
          return triggered as AlertCondition[];
        }
      }
    } catch (e) {
      // ignore cache read errors and continue to network request
    }

    const base = cleanApiBaseUrl(API_BASE_URL);
    const apiUrl = `${base}/api/alerts/${encodeURIComponent(portfolioName)}/check`;
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    const idToken = getAuthIdToken();
    const resp = await authFetch(apiUrl, { method: 'GET', headers, idToken, refresh: googleRefreshIdToken });
    if (!resp.ok) {
      // If network failed, try to return stale cache if available
      try {
        const stale = await idbGet(cacheKey);
        if (stale && typeof stale === 'object' && Array.isArray((stale as any).triggered)) {
          return (stale as any).triggered as AlertCondition[];
        }
      } catch (e) {
        /* ignore */
      }
      return [];
    }
    const data = await resp.json();
    const triggered = (data && Array.isArray(data.triggered)) ? data.triggered as AlertCondition[] : [];
    // Cache the triggered results with timestamp
    try {
      await idbSet(cacheKey, { ts: Date.now(), triggered });
    } catch (e) {
      // ignore cache write failures
    }
    return triggered;
  } catch (e) {
    console.warn('Failed to check alerts', e);
    // final fallback: return empty array
    return [];
  }
};