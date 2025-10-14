import { authFetch } from './authFetch';
import { API_BASE_URL, cleanApiBaseUrl } from '../apiBase';
import { jwtDecode } from 'jwt-decode';

// Helper to build full API URL with base
export function apiUrl(path: string) {
  const base = cleanApiBaseUrl(API_BASE_URL);
  if (path.startsWith('http')) return path; // already full
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

// Error shape from backend for auth
interface BackendErrorShape { error?: string; [k: string]: any }

export interface ApiFetchOptions extends RequestInit {
  idToken?: string | null;
  autoJson?: boolean; // default true: parse JSON if content-type includes json
  retryOnAuth?: boolean; // default true: retry once on token_expired
}

export async function apiFetch<T = any>(path: string, opts: ApiFetchOptions = {}): Promise<{ ok: boolean; status: number; data: T | null; error?: string; response: Response; }> {
  const { idToken, autoJson = true, retryOnAuth = true, headers, ...rest } = opts;
  const url = apiUrl(path);
  let resp: Response;
  try {
    resp = await authFetch(url, {
      idToken: idToken || localStorage.getItem('idToken') || undefined,
      headers: { 'Content-Type': 'application/json', ...(headers as any) },
      ...rest,
      // authFetch already retries on token_expired; keep default behavior
    });
  } catch (e: any) {
    return { ok: false, status: 0, data: null, error: e?.message || 'network error', response: new Response(null, { status: 0 }) };
  }

  let data: any = null;
  if (autoJson) {
    const ct = resp.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try { data = await resp.clone().json(); } catch {/* ignore */}
    } else {
      try { data = await resp.clone().text(); } catch {/* ignore */}
    }
  }

  if (!resp.ok) {
    const errorMessage = (data && typeof data === 'object' ? (data as BackendErrorShape).error : undefined) || `HTTP ${resp.status}`;

    // Dispatch invalid token event if needed
    if (resp.status === 401 && data && (data as BackendErrorShape).error === 'invalid_token') {
      try { window.dispatchEvent(new CustomEvent('auth:invalid_token', { detail: { url, data } })); } catch {/* ignore */}
    }
    if (resp.status === 401 && data && (data as BackendErrorShape).error === 'token_expired') {
      // authFetch already attempted refresh; if still 401, emit global event
      try { window.dispatchEvent(new CustomEvent('auth:token_expired', { detail: { url, data } })); } catch {/* ignore */}
    }
    return { ok: false, status: resp.status, data, error: errorMessage, response: resp };
  }
  return { ok: true, status: resp.status, data, response: resp };
}

export function decodeTokenExp(token: string | null): number | null {
  if (!token) return null;
  try { const decoded: any = jwtDecode(token); return typeof decoded.exp === 'number' ? decoded.exp : null; } catch { return null; }
}
