/**
 * Central source of truth for the backend API base URL.
 * Priority:
 * 1. Vite env var VITE_API_URL (import.meta.env)
 * 2. window.__API_BASE_URL__ (optional runtime override)
 * 3. fallback to localhost:5000
 */
export const API_BASE_URL: string = (() => {
  // Prefer a runtime-injected config (set by index.html loader) so the same build
  // can be deployed to different environments without rebuilding.
  if (typeof window !== 'undefined' && (window as any).__API_BASE_URL__) {
    const w = (window as any).__API_BASE_URL__;
    if (typeof w === 'string' && w.trim()) {
      // runtime override wins
      // eslint-disable-next-line no-console
      console.log('[config] using runtime window.__API_BASE_URL__ =', w.trim());
      return w.trim();
    }
  }

  try {
    const vite = (import.meta as any)?.env?.VITE_API_URL;
    if (vite && typeof vite === 'string' && vite.trim()) {
      // build-time Vite var
      // eslint-disable-next-line no-console
      console.log('[config] using build VITE_API_URL =', vite.trim());
      return vite.trim();
    }
  } catch (_) {
    // import.meta may not be available in some test runners; ignore
  }

  // fallback
  // eslint-disable-next-line no-console
  console.warn('[config] falling back to http://127.0.0.1:5000');
  return 'http://127.0.0.1:5000';
})();

export const cleanApiBaseUrl = (base: string = API_BASE_URL) => {
  if (!base || typeof base !== 'string') return base;
  let b = base.trim();
  // remove trailing slashes
  while (b.endsWith('/')) b = b.slice(0, -1);
  // if the base ends with '/api', strip that segment so callers can safely append '/api/...'
  if (b.toLowerCase().endsWith('/api')) b = b.slice(0, -4);
  return b;
};
