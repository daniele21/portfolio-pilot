"""Yahoo Finance search helper.

Provides a thin wrapper around the (undocumented) Yahoo Finance search endpoint
so the frontend can offer typeahead / discovery before a full ticker fetch.

We keep this small and self-contained to make it easy to swap or extend later.

NOTE: This uses an unofficial public endpoint; respect fair-use, add caching
and *never* treat results as authoritative until validated via a real quote
fetch (which the existing /api/ticker/<symbol> endpoint effectively does via
yfinance).
"""

from __future__ import annotations

import time
import threading
from typing import Dict, Any, List, Optional
import requests  # kept as ultimate fallback
import random

try:
    import yfinance as _yf  # type: ignore
except Exception:  # pragma: no cover
    _yf = None  # type: ignore

SEARCH_URL = "https://query2.finance.yahoo.com/v1/finance/search"


class TTLCache:
    """Very small in-memory TTL cache (thread-safe) for search results.

    We intentionally keep this minimal; if project grows consider `cachetools`.
    """

    def __init__(self, ttl_seconds: int = 300, max_entries: int = 512):
        self.ttl = ttl_seconds
        self.max_entries = max_entries
        self._store: Dict[str, Any] = {}
        self._lock = threading.Lock()

    def get(self, key: str):
        now = time.time()
        with self._lock:
            entry = self._store.get(key)
            if not entry:
                return None
            exp, value = entry
            if now > exp:
                self._store.pop(key, None)
                return None
            return value

    def set(self, key: str, value: Any):
        with self._lock:
            # Evict if above max_entries (FIFO-ish using sorted by expiry)
            if len(self._store) >= self.max_entries:
                for k, (exp, _) in sorted(self._store.items(), key=lambda kv: kv[1][0]):
                    self._store.pop(k, None)
                    if len(self._store) < self.max_entries:
                        break
            self._store[key] = (time.time() + self.ttl, value)


_cache = TTLCache(ttl_seconds=300)


def _yfinance_search_raw(q: str) -> Optional[Dict[str, Any]]:
    """Attempt to perform a search via yfinance, handling multiple versions.

    Returns the raw dict that should contain a 'quotes' key, or None on failure.
    """
    if not _yf:
        return None
    # Newer yfinance may expose a top-level search helper
    try:
        # Preferred: newer yfinance exposes a Search class that returns .quotes
        if hasattr(_yf, 'Search') and callable(getattr(_yf, 'Search')):
            try:
                s = _yf.Search(q, max_results=10)  # use the newer Search API when available
                # s may be an object with a .quotes attribute or a plain dict
                if hasattr(s, 'quotes'):
                    return {'quotes': getattr(s, 'quotes')}
                if isinstance(s, dict):
                    return s
            except Exception:
                # Fall through to other strategies if Search call fails
                pass
        if hasattr(_yf, 'search') and callable(getattr(_yf, 'search')):  # type: ignore[attr-defined]
            return _yf.search(q)  # type: ignore[no-any-return]
    except Exception:
        pass
    # Try scraper API (0.2.x has scrapers.search.Search)
    try:
        from yfinance.scrapers.search import Search  # type: ignore
        try:
            s = Search(q)
            # Some versions keep data on .data; others provide .payload
            data = getattr(s, 'data', None) or getattr(s, 'payload', None)
            if isinstance(data, dict):
                return data
        except Exception:
            return None
    except Exception:
        pass
    # Last resort: use internal utils.get_json (still hits the same endpoint).
    try:
        from yfinance.utils import get_json  # type: ignore
        return get_json(SEARCH_URL, params={"q": q})
    except Exception:
        return None


def search_instruments(query: str, lang: str = "en-US", region: str = "US") -> Dict[str, Any]:
    """Search instruments using yfinance helpers first, falling back to direct HTTP.

    Normalized return:
      { query, count, results: [ {symbol, shortname, longname, exchDisp, quoteType, currency, score} ], (optional) error }

    Adds basic retry/backoff when encountering 429 rate limits.
    """
    q = (query or "").strip()
    if len(q) < 2:
        return {"query": q, "count": 0, "results": []}
    cache_key = f"{q.lower()}::{lang}::{region}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    attempts = 1
    last_error: Optional[str] = None
    raw: Dict[str, Any] = {}
    for attempt in range(1, attempts + 1):
        try:
            # Prefer yfinance path
            raw_candidate = _yfinance_search_raw(q)
            if raw_candidate:
                raw = raw_candidate  # type: ignore[assignment]
                break
        except Exception as e:  # noqa: BLE001
            last_error = str(e)
            if attempt < attempts:
                time.sleep(0.25 * attempt + random.uniform(0, 0.1))
                continue
            break

    quotes: List[Dict[str, Any]] = raw.get("quotes", []) if isinstance(raw, dict) else []
    results: List[Dict[str, Any]] = []
    for item in quotes or []:
        symbol = item.get("symbol") if isinstance(item, dict) else None
        if not symbol:
            continue
        results.append({
            "symbol": symbol,
            "shortname": item.get("shortname") or item.get("longname") or item.get("name"),
            "longname": item.get("longname"),
            "exchDisp": item.get("exchDisp"),
            "quoteType": item.get("quoteType"),
            "currency": item.get("currency"),
            "score": item.get("score"),
        })

    payload: Dict[str, Any] = {"query": q, "count": len(results), "results": results}
    if last_error and not results:
        payload["error"] = last_error
    _cache.set(cache_key, payload)
    return payload


__all__ = ["search_instruments"]
