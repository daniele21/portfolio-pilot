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
from typing import Dict, Any, List
import requests

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


def search_instruments(query: str, lang: str = "en-US", region: str = "US") -> Dict[str, Any]:
    """Search Yahoo Finance for instruments matching `query`.

    Returns normalized dict: { query, count, results: [ {symbol, shortname, longname, exchDisp, quoteType, currency, score} ] }
    """
    q = (query or "").strip()
    if len(q) < 2:
        return {"query": q, "count": 0, "results": []}
    cache_key = f"{q.lower()}::{lang}::{region}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    params = {"q": q, "lang": lang, "region": region}
    try:
        resp = requests.get(SEARCH_URL, params=params, timeout=5)
        resp.raise_for_status()
        raw = resp.json() or {}
    except Exception as e:  # noqa: BLE001
        return {"query": q, "error": str(e), "count": 0, "results": []}

    quotes: List[Dict[str, Any]] = raw.get("quotes", []) or []
    results: List[Dict[str, Any]] = []
    for item in quotes:
        # Filter out symbols with no symbol key (defensive)
        symbol = item.get("symbol")
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

    payload = {"query": q, "count": len(results), "results": results}
    _cache.set(cache_key, payload)
    return payload


__all__ = ["search_instruments"]
