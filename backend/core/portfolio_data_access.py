"""Data access helpers for portfolio computations.

These utilities centralise all database interactions used by the portfolio
module so that higher-level code does not need to worry about user-scoped
imports, circular dependency avoidance, or fallback behaviour. Each helper
handles optional user identifiers and gracefully degrades to the legacy
database functions when user-specific tables are not available.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import logging

logger = logging.getLogger("core.portfolio.data_access")


def _safe_import(module: str, attr: str):
    """Attempt to import ``attr`` from ``module``; return ``None`` on failure."""
    try:
        mod = __import__(module, fromlist=[attr])
        return getattr(mod, attr)
    except Exception:
        logger.debug("Failed to import %s.%s", module, attr, exc_info=True)
        return None


def get_transactions_for_portfolio(
    portfolio_name: Optional[str],
    uid: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Return transactions for the given portfolio, optionally user scoped."""
    if not portfolio_name:
        return []

    if uid:
        get_user_transactions = _safe_import("db.portfolios", "get_transactions_user")
        if get_user_transactions:
            try:
                data = get_user_transactions(uid, portfolio_name)
                if data is not None:
                    return list(data)
            except Exception:
                logger.warning(
                    "get_transactions_user failed for uid=%s portfolio=%s",
                    uid,
                    portfolio_name,
                    exc_info=True,
                )

    get_transactions = _safe_import("db.database", "get_transactions")
    if get_transactions:
        try:
            data = get_transactions(portfolio_name)
            if data is not None:
                return list(data)
        except Exception:
            logger.warning(
                "get_transactions failed for portfolio=%s", portfolio_name, exc_info=True
            )
    return []


def get_all_transactions(uid: Optional[str] = None) -> List[Dict[str, Any]]:
    """Return all transactions, user scoped when possible."""
    if uid:
        get_user_transactions = _safe_import("db.portfolios", "get_transactions_user")
        if get_user_transactions:
            try:
                data = get_user_transactions(uid, None)
                if data is not None:
                    return list(data)
            except Exception:
                logger.warning(
                    "get_transactions_user failed for uid=%s (all portfolios)",
                    uid,
                    exc_info=True,
                )

    get_transactions = _safe_import("db.database", "get_transactions")
    if get_transactions:
        try:
            data = get_transactions(None)
            if data is not None:
                return list(data)
        except Exception:
            logger.warning(
                "get_transactions failed for all portfolios", exc_info=True
            )
    return []


def get_saved_portfolio_status(
    portfolio_name: Optional[str],
    uid: Optional[str] = None,
) -> Tuple[Dict[str, Any], Optional[str], Optional[str]]:
    """Return the persisted portfolio status snapshot."""
    if not portfolio_name:
        return ({"total_value": 0.0, "holdings": []}, None, None)

    if uid:
        get_saved_user = _safe_import(
            "db.portfolios", "get_portfolio_status_saved_user"
        )
        if get_saved_user:
            try:
                data = get_saved_user(uid, portfolio_name)
                if data:
                    return data
            except Exception:
                logger.warning(
                    "get_portfolio_status_saved_user failed for uid=%s portfolio=%s",
                    uid,
                    portfolio_name,
                    exc_info=True,
                )

    get_saved = _safe_import("db.database", "get_portfolio_status_saved")
    if get_saved:
        try:
            data = get_saved(portfolio_name)
            if data:
                return data
        except Exception:
            logger.warning(
                "get_portfolio_status_saved failed for portfolio=%s",
                portfolio_name,
                exc_info=True,
            )

    return ({"total_value": 0.0, "holdings": []}, None, None)


def get_ticker_history_for_symbol(ticker: str) -> List[Dict[str, Any]]:
    """Return the stored history for ``ticker``."""
    if not ticker:
        return []
    get_history = _safe_import("db.database", "get_ticker_history")
    if get_history:
        try:
            history = get_history(ticker)
            if history:
                return list(history)
        except Exception:
            logger.warning("get_ticker_history failed for %s", ticker, exc_info=True)
    return []


def get_ticker_data_for_symbol(
    ticker: str,
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """Return the cached ticker data tuple ``(data, last_updated)``."""
    if not ticker:
        return (None, None)
    get_data = _safe_import("db.database", "get_ticker_data")
    if get_data:
        try:
            data = get_data(ticker)
            if data:
                return data
        except Exception:
            logger.warning("get_ticker_data failed for %s", ticker, exc_info=True)
    return (None, None)
