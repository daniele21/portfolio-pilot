/**
 * Central source of truth for the backend API base URL.
 * Priority:
 * 1. Vite env var VITE_API_URL (import.meta.env)
 * 2. window.__API_BASE_URL__ (optional runtime override)
 * 3. fallback to localhost:5000
 */
export const API_BASE_URL: string = (() => {
  try {
    const vite = (import.meta as any)?.env?.VITE_API_URL;
    if (vite && typeof vite === 'string' && vite.trim()) return vite.trim();
  } catch (_) {
    // import.meta may not be available in some test runners; ignore
  }

  if (typeof window !== 'undefined' && (window as any).__API_BASE_URL__) {
    const w = (window as any).__API_BASE_URL__;
    if (typeof w === 'string' && w.trim()) return w.trim();
  }

  return 'http://127.0.0.1:5000';
})();

export const cleanApiBaseUrl = (base: string = API_BASE_URL) => base.endsWith('/') ? base.slice(0, -1) : base;
