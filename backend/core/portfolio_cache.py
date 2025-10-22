"""Shared caching utilities for portfolio computations."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Any, Callable, Dict, Hashable, Optional


def _next_utc_midnight_ts() -> float:
    now = datetime.now(timezone.utc)
    next_midnight = datetime(
        year=now.year,
        month=now.month,
        day=now.day,
        tzinfo=timezone.utc,
    ) + timedelta(days=1)
    return next_midnight.timestamp()


class DailyExpiryCache:
    """Cache whose entries expire at the next UTC midnight."""

    def __init__(self, name: str, lock: Optional[Lock] = None):
        self._name = name
        self._lock = lock or Lock()
        self._store: Dict[Hashable, tuple[float, Any]] = {}

    def get(self, key: Hashable) -> Any:
        with self._lock:
            entry = self._store.get(key)
            if not entry:
                return None
            expiry_ts, value = entry
            if datetime.now(timezone.utc).timestamp() >= expiry_ts:
                self._store.pop(key, None)
                return None
            return value

    def set(self, key: Hashable, value: Any) -> None:
        with self._lock:
            self._store[key] = (_next_utc_midnight_ts(), value)

    def invalidate(self, key: Hashable) -> None:
        with self._lock:
            self._store.pop(key, None)

    def invalidate_matching(self, predicate: Callable[[Hashable], bool]) -> None:
        with self._lock:
            for key in list(self._store.keys()):
                try:
                    if predicate(key):
                        self._store.pop(key, None)
                except Exception:
                    continue

    def clear(self) -> None:
        with self._lock:
            self._store.clear()

    @property
    def name(self) -> str:
        return self._name
