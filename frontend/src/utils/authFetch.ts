// Unified authenticated fetch with Google ID token refresh + retry.
// Uses window.google Identity Services to obtain new ID tokens when expired.
// Falls back gracefully if GSI not loaded.
import { jwtDecode } from 'jwt-decode';

export type RefreshStrategy = () => Promise<string | null>;

// Module-level global refresh strategy which can be set by app-level code (e.g. AuthContext)
export let globalRefreshStrategy: RefreshStrategy | null = null;

export function setGlobalRefreshStrategy(strategy: RefreshStrategy | null) {
  globalRefreshStrategy = strategy;
}

interface AuthFetchOptions extends RequestInit {
  idToken?: string | null;
  refresh?: RefreshStrategy; // function to get a fresh token if needed
  // seconds before real expiry when we proactively refresh
  refreshThresholdSeconds?: number;
  retryOnExpired?: boolean; // default true
}

function willExpireSoon(token: string, thresholdSeconds: number): boolean {
  try {
    const decoded: any = jwtDecode(token);
    const exp = decoded.exp;
    const now = Math.floor(Date.now() / 1000);
    return typeof exp === 'number' && exp - now < thresholdSeconds;
  } catch {
    return true; // treat undecodable tokens as needing refresh
  }
}

export async function authFetch(url: string, opts: AuthFetchOptions = {}): Promise<Response> {
  const {
    idToken,
    refresh,
    refreshThresholdSeconds = 60,
    retryOnExpired = true,
    headers,
    ...rest
  } = opts;

  let workingToken = idToken || null;

  // Decide which refresh strategy to use: per-call override or the global app-provided one
  const effectiveRefresh = refresh || globalRefreshStrategy;

  // Proactive refresh if token is near expiry
  if (workingToken && effectiveRefresh && willExpireSoon(workingToken, refreshThresholdSeconds)) {
    try {
      const newToken = await effectiveRefresh();
      if (newToken) workingToken = newToken;
    } catch (e) {
      console.warn('[authFetch] proactive refresh failed:', e);
    }
  }

  const baseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as any)
  };
  if (workingToken) baseHeaders['Authorization'] = `Bearer ${workingToken}`;

  let resp = await fetch(url, {
    ...rest,
    headers: baseHeaders
  });

  // If unauthorized and looks like token expired, attempt refresh+retry once
  if (resp.status === 401 && retryOnExpired && effectiveRefresh) {
    try {
      const body = await resp.clone().json().catch(() => null);
      if (body && body.error === 'token_expired') {
        const refreshed = await effectiveRefresh();
        if (refreshed) {
          const retryHeaders = { ...baseHeaders, Authorization: `Bearer ${refreshed}` };
          resp = await fetch(url, { ...rest, headers: retryHeaders });
          return resp; // return retry response
        }
      }
    } catch (e) {
      console.warn('[authFetch] refresh on 401 failed:', e);
    }
  }

  return resp;
}

// Default refresh implementation using Google Identity Services
export async function googleRefreshIdToken(): Promise<string | null> {
  // We rely on google.accounts.id to issue a fresh credential.
  if (!(window as any).google?.accounts?.id) {
    console.warn('[googleRefreshIdToken] GSI not available');
    return null;
  }
  return new Promise<string | null>((resolve) => {
    try {
      (window as any).google.accounts.id.initialize({
        client_id: (window as any).GOOGLE_CLIENT_ID || '',
        callback: (resp: any) => {
          if (resp && resp.credential) {
            localStorage.setItem('idToken', resp.credential);
            resolve(resp.credential);
          } else {
            resolve(null);
          }
        }
      });
      (window as any).google.accounts.id.prompt();
    } catch (e) {
      console.error('[googleRefreshIdToken] error prompting for new token', e);
      resolve(null);
    }
  });
}
