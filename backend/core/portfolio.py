from collections import defaultdict
from datetime import datetime
import pandas as pd
from db.database import (
    aggregate_positions,
    get_ticker_history,
    save_ticker_data,
    get_ticker_data,
)
from services import data_fetcher
import time
from threading import Lock
from datetime import timezone, timedelta
import os

# --- In-memory day-reset caches (expire at next UTC midnight) ---
# Caches store entries as: key -> (expiry_ts_utc, data)
_CACHE_LOCK = Lock()
# per-portfolio performance cache: key=portfolio_name
_PERFORMANCE_CACHE: dict = {}
# per-portfolio+ticker performance cache: key=(portfolio_name, ticker, start_date_str)
_TICKER_PERFORMANCE_CACHE: dict = {}
# multi-ticker per-portfolio cache: key=(portfolio_name, tuple(sorted(tickers)), start_date_str)
_MULTI_TICKER_PERFORMANCE_CACHE: dict = {}


def _next_utc_midnight_ts() -> float:
    now = datetime.now(timezone.utc)
    next_midnight = datetime(year=now.year, month=now.month, day=now.day, tzinfo=timezone.utc) + timedelta(days=1)
    return next_midnight.timestamp()


def _get_cache_entry(cache: dict, key):
    entry = cache.get(key)
    if not entry:
        return None
    expiry_ts, data = entry
    if datetime.now(timezone.utc).timestamp() < expiry_ts:
        return data
    # expired
    try:
        cache.pop(key, None)
    except Exception:
        pass
    return None


def _set_cache_entry(cache: dict, key, data):
    expiry_ts = _next_utc_midnight_ts()
    cache[key] = (expiry_ts, data)


# Helper to clear caches (call after transaction changes)
def clear_performance_caches(portfolio_name=None, tickers=None):
    with _CACHE_LOCK:
        if portfolio_name:
            # remove portfolio-level performance
            try:
                _PERFORMANCE_CACHE.pop(portfolio_name, None)
            except Exception:
                pass
            # remove multi-ticker entries for this portfolio
            try:
                keys_multi = [k for k in list(_MULTI_TICKER_PERFORMANCE_CACHE.keys()) if k[0] == portfolio_name]
                for k in keys_multi:
                    _MULTI_TICKER_PERFORMANCE_CACHE.pop(k, None)
            except Exception:
                pass
            # remove ticker-level entries for this portfolio
            try:
                if tickers:
                    # remove specific tickers
                    for t in tickers:
                        keys_to_remove = [k for k in list(_TICKER_PERFORMANCE_CACHE.keys()) if k[0] == portfolio_name and k[1] == t]
                        for k in keys_to_remove:
                            _TICKER_PERFORMANCE_CACHE.pop(k, None)
                else:
                    # remove all tickers for this portfolio
                    keys_to_remove = [k for k in list(_TICKER_PERFORMANCE_CACHE.keys()) if k[0] == portfolio_name]
                    for k in keys_to_remove:
                        _TICKER_PERFORMANCE_CACHE.pop(k, None)
            except Exception:
                pass
        else:
            _PERFORMANCE_CACHE.clear()
            _TICKER_PERFORMANCE_CACHE.clear()
            _MULTI_TICKER_PERFORMANCE_CACHE.clear()


# --- Caching wrappers ---
def get_cached_portfolio_performance(portfolio_name):
    with _CACHE_LOCK:
        cached = _get_cache_entry(_PERFORMANCE_CACHE, portfolio_name)
        if cached is not None:
            return cached
    data = compute_portfolio_performance(portfolio_name, _skip_cache=True)
    with _CACHE_LOCK:
        try:
            _set_cache_entry(_PERFORMANCE_CACHE, portfolio_name, data)
        except Exception:
            pass
    return data


def get_cached_ticker_performance(portfolio_name, ticker, start_date=None):
    key = (portfolio_name, ticker, str(start_date) if start_date else '')
    with _CACHE_LOCK:
        cached = _get_cache_entry(_TICKER_PERFORMANCE_CACHE, key)
        if cached is not None:
            return cached
    data = compute_ticker_performance(portfolio_name, ticker, start_date, _skip_cache=True)
    with _CACHE_LOCK:
        try:
            _set_cache_entry(_TICKER_PERFORMANCE_CACHE, key, data)
        except Exception:
            pass
    return data


# def get_cached_multi_ticker_performance(portfolio_name, tickers, start_date=None):
#     now = time.time()
#     key = (portfolio_name, tuple(sorted(tickers)), str(start_date) if start_date else '')
#     with _CACHE_LOCK:
#         entry = _MULTI_TICKER_PERFORMANCE_CACHE.get(key)
#         if entry and now - entry['ts'] < _CACHE_TTL:
#             return entry['data']
#     data = compute_multi_ticker_performance(portfolio_name, tickers, start_date, _skip_cache=True)
#     with _CACHE_LOCK:
#         _MULTI_TICKER_PERFORMANCE_CACHE[key] = {'data': data, 'ts': now}
#     return data


def get_portfolio_status(portfolio_name):
    """Return current holdings with latest prices using the new normalized ticker tables."""
    from db.database import get_transactions  # Local import to avoid circular import
    txs = get_transactions(portfolio_name)
    positions = aggregate_positions(txs)
    holdings = []
    total_value = 0.0
    for ticker, qty in positions.items():
        if qty == 0:
            continue
        # Get latest price from ticker_info (Firestore)
        try:
            data, _ = get_ticker_data(ticker)
            info = (data or {}).get('info', {})
            price = info.get('regularMarketPrice') or 0
            name = info.get('shortName') or ticker
        except Exception:
            price = 0
            name = ticker
        value = price * qty
        total_value += value
        holdings.append({
            "ticker": ticker,
            "name": name,
            "quantity": qty,
            "price": price,
            "value": value,
        })
    return {"holdings": holdings, "total_value": total_value}


def get_performance(portfolio_name):
    """Compute simple performance trend using daily closes."""
    from db.database import get_transactions  # Local import to avoid circular import
    txs = get_transactions(portfolio_name)
    if not txs:
        return []
    first_date = min(t["date"] for t in txs)
    positions = aggregate_positions(txs)
    history_dict = {}
    for ticker, qty in positions.items():
        if qty == 0:
            continue
        data, _ = data_fetcher.fetch_with_cache(ticker)
        hist = (data or {}).get("history", [])
        if not hist:
            continue
        df = pd.DataFrame(hist)
        if df.empty or "Date" not in df.columns or "Close" not in df.columns:
            continue
        df["Date"] = pd.to_datetime(df["Date"])
        df.set_index("Date", inplace=True)
        df = df[df.index >= first_date]
        history_dict[ticker] = df["Close"]
    if not history_dict:
        return []
    df = pd.DataFrame(history_dict)
    df.sort_index(inplace=True)
    df.ffill(inplace=True)
    values = []
    for date, row in df.iterrows():
        total = 0.0
        for ticker, qty in positions.items():
            price = row.get(ticker, 0)
            total += price * qty
        values.append({"date": date.strftime("%Y-%m-%d"), "value": total})
    return values


def compute_portfolio_performance(portfolio_name, _skip_cache=False):
    if not _skip_cache:
        return get_cached_portfolio_performance(portfolio_name)
    from db.database import get_transactions  # Local import to avoid circular import
    """
    Compute the historical portfolio value over time, using each ticker's historical price and the portfolio's transaction history.
    Returns a list of dicts: [{date: ..., value: ..., abs_value: ..., pct: ..., pct_from_first: ...}, ...]
    'value' is the absolute value, 'pct' is the performance % relative to the cost basis (total invested up to that date).
    'pct_from_first' is the % change from the first abs_value (start of series).
    """
    txs = get_transactions(portfolio_name)
    if not txs:
        return []
    df_txs = pd.DataFrame(txs)
    if df_txs.empty or 'date' not in df_txs.columns or 'ticker' not in df_txs.columns or 'quantity' not in df_txs.columns or 'price' not in df_txs.columns:
        return []
    df_txs['date'] = pd.to_datetime(df_txs['date'])
    tickers = df_txs['ticker'].unique()
    all_dates = set()
    ticker_histories = {}
    for ticker in tickers:
        hist = get_ticker_history(ticker)
        if not hist:
            data, _ = data_fetcher.fetch_with_cache(ticker)
            history = (data or {}).get('history', [])
            if history:
                save_ticker_data(ticker, data)
                hist = get_ticker_history(ticker)
        if not hist:
            continue
        df_hist = pd.DataFrame(hist)
        if df_hist.empty or 'date' not in df_hist.columns or 'close' not in df_hist.columns:
            continue
        df_hist['date'] = pd.to_datetime(df_hist['date'])
        df_hist.set_index('date', inplace=True)
        ticker_histories[ticker] = df_hist['close']
        all_dates.update(df_hist.index)
    if not ticker_histories:
        return []
    # --- Fill date gaps: create a complete date range from min to max date ---
    if all_dates:
        min_date = min(all_dates)
        max_date = max(all_dates)
        all_dates = pd.date_range(start=min_date, end=max_date, freq='D')
    else:
        all_dates = []
    values = []
    first_abs_value = None
    for date in all_dates:
        total_value = 0.0
        total_cost = 0.0
        total_abs_value = 0.0
        for ticker in tickers:
            txs_ticker = df_txs[(df_txs['ticker'] == ticker) & (df_txs['date'] <= date)]
            qty = txs_ticker['quantity'].sum() if not txs_ticker.empty else 0.0
            # Cost basis: sum of all buy transactions up to this date
            cost = txs_ticker[txs_ticker['quantity'] > 0]
            cost_sum = (cost['quantity'] * cost['price']).sum() if not cost.empty else 0.0
            total_cost += cost_sum
            series = ticker_histories.get(ticker, pd.Series())
            price = series.get(date, None)
            # Treat NaN as missing: try forward-fill, otherwise default to 0.0
            if price is None or pd.isna(price):
                try:
                    ffilled = series.loc[:date].ffill()
                    last = ffilled.iloc[-1] if not ffilled.empty else None
                    price = last if (last is not None and not pd.isna(last)) else 0.0
                except Exception:
                    price = 0.0
            abs_value = qty * (price if price is not None else 0.0)
            net_value = abs_value - cost_sum
            total_value += net_value
            total_abs_value += abs_value
        pct = ((total_value) / total_cost * 100) if total_cost else 0.0
        if first_abs_value is None and total_abs_value != 0.0:
            first_abs_value = total_abs_value
        pct_from_first = ((total_abs_value - first_abs_value) / first_abs_value * 100) if first_abs_value else 0.0
        values.append({'date': date.strftime('%Y-%m-%d'), 'value': total_value, 'abs_value': total_abs_value, 'pct': pct, 'pct_from_first': pct_from_first})
    return values


def compute_ticker_performance(portfolio_name, ticker, start_date=None, _skip_cache=False):
    if not _skip_cache:
        return get_cached_ticker_performance(portfolio_name, ticker, start_date)
    from db.database import get_transactions  # Local import to avoid circular import
    """
    Compute the historical value of a single ticker in a portfolio over time, using its transaction history and price history.
    Returns a list of dicts: [{date: ..., value: ..., abs_value: ..., pct: ..., pct_from_start: ...}, ...]
    'value' is the net value (market value minus cost spent), 'pct' is the performance % relative to the cost spent for that ticker up to that date.
    'pct_from_start' is the % change from the abs_value at the start_date (or first date if not provided).
    The first entry in the returned list will always have pct_from_start = 0.
    """
    txs = [t for t in get_transactions(portfolio_name) if t.get('ticker') == ticker]
    if not txs:
        return []
    import pandas as pd
    df_txs = pd.DataFrame(txs)
    if df_txs.empty or 'date' not in df_txs.columns or 'quantity' not in df_txs.columns or 'price' not in df_txs.columns:
        return []
    df_txs['date'] = pd.to_datetime(df_txs['date'])
    hist = get_ticker_history(ticker)
    if not hist:
        data, _ = data_fetcher.fetch_with_cache(ticker)
        history = (data or {}).get('history', [])
        if history:
            save_ticker_data(ticker, data)
            hist = get_ticker_history(ticker)
    if not hist:
        return []
    df_hist = pd.DataFrame(hist)
    if df_hist.empty or 'date' not in df_hist.columns or 'close' not in df_hist.columns:
        return []
    df_hist['date'] = pd.to_datetime(df_hist['date'])
    df_hist.set_index('date', inplace=True)
    all_dates = sorted(df_hist.index)
    # Filter dates if start_date is provided
    if start_date is not None:
        start_dt = pd.to_datetime(start_date)
        all_dates = [d for d in all_dates if d >= start_dt]
        if not all_dates:
            return []  # No data on or after start_date
    # --- Fill date gaps: create a complete date range from min to max date ---
    if all_dates:
        min_date = min(all_dates)
        max_date = max(all_dates)
        all_dates = pd.date_range(start=min_date, end=max_date, freq='D')
    else:
        all_dates = []
    values = []
    abs_value_at_start = None
    for idx, date in enumerate(all_dates):
        qty = df_txs[df_txs['date'] <= date]['quantity'].sum() if not df_txs.empty else 0.0
        # Cost basis: sum of all buy transactions up to this date
        cost = df_txs[(df_txs['date'] <= date) & (df_txs['quantity'] > 0)]
        cost_sum = (cost['quantity'] * cost['price']).sum() if not cost.empty else 0.0
        series = df_hist['close']
        price = series.get(date, None)
        if price is None or pd.isna(price):
            try:
                ffilled = series.loc[:date].ffill()
                last = ffilled.iloc[-1] if not ffilled.empty else None
                price = last if (last is not None and not pd.isna(last)) else 0.0
            except Exception:
                price = 0.0
        abs_value = qty * (price if price is not None else 0.0)
        net_value = abs_value - cost_sum
        pct = (net_value / cost_sum * 100) if cost_sum else 0.0
        # Set abs_value_at_start to the first nonzero abs_value in the filtered range
        if idx == 0:
            abs_value_at_start = abs_value
        # pct_from_start: always 0 for the first entry, else normal calculation (guard for zero)
        if idx == 0:
            pct_from_start = 0.0
        else:
            if abs_value_at_start:
                pct_from_start = ((abs_value - abs_value_at_start) / abs_value_at_start * 100)
            else:
                pct_from_start = 0.0
        values.append({'date': date.strftime('%Y-%m-%d'), 'value': net_value, 'abs_value': abs_value, 'pct': pct, 'pct_from_start': pct_from_start})
    return values


def compute_benchmark_performance(ticker):
    """
    Compute the historical performance of a benchmark ticker (not tied to a portfolio).
    Returns a list of dicts: [{date: ..., value: ..., abs_value: ..., pct: ..., pct_from_first: ...}, ...]
    'value' and 'abs_value' are the same (no cost basis), 'pct' is percent change from the first value, 'pct_from_first' is also percent change from the first value (for frontend consistency).
    """
    hist = get_ticker_history(ticker)
    if not hist:
        data, _ = data_fetcher.fetch_with_cache(ticker)
        history = (data or {}).get('history', [])
        if history:
            save_ticker_data(ticker, data)
            hist = get_ticker_history(ticker)
    if not hist:
        return []
    df_hist = pd.DataFrame(hist)
    if df_hist.empty or 'date' not in df_hist.columns or 'close' not in df_hist.columns:
        return []
    df_hist['date'] = pd.to_datetime(df_hist['date'])
    df_hist.set_index('date', inplace=True)
    all_dates = sorted(df_hist.index)
    # --- Fill date gaps: create a complete date range from min to max date ---
    if all_dates:
        min_date = min(all_dates)
        max_date = max(all_dates)
        all_dates = pd.date_range(start=min_date, end=max_date, freq='D')
    else:
        all_dates = []
    values = []
    first_value = None
    for date in all_dates:
        series = df_hist['close']
        price = series.get(date, None)
        if price is None or pd.isna(price):
            try:
                ffilled = series.loc[:date].ffill()
                last = ffilled.iloc[-1] if not ffilled.empty else None
                price = last if (last is not None and not pd.isna(last)) else 0.0
            except Exception:
                price = 0.0
        abs_value = price if price is not None else 0.0
        if first_value is None and abs_value != 0.0:
            first_value = abs_value
        pct = ((abs_value - first_value) / first_value * 100) if first_value else 0.0
        pct_from_first = pct  # For consistency with portfolio performance
        values.append({'date': date.strftime('%Y-%m-%d'), 'value': abs_value, 'abs_value': abs_value, 'pct': pct, 'pct_from_first': pct_from_first})
    return values


def get_overall_asset_allocation(portfolio_name):
    """
    Returns a list of dicts: [{ticker, value, quantity, name, allocation_pct} ...] for all tickers in the portfolio, with their current value, quantity, and allocation as a percentage of total portfolio value.
    """
    from db.database import get_transactions  # Local import to avoid circular import
    txs = get_transactions(portfolio_name)
    positions = aggregate_positions(txs)
    allocation = []
    total_value = 0.0
    temp_alloc = []
    for ticker, qty in positions.items():
        if qty == 0:
            continue
        try:
            data, _ = get_ticker_data(ticker)
            info = (data or {}).get('info', {})
            price = info.get('regularMarketPrice') or 0
            name = info.get('shortName') or ticker
        except Exception:
            price = 0
            name = ticker
        value = price * qty
        total_value += value
        temp_alloc.append({
            'ticker': ticker,
            'name': name,
            'quantity': qty,
            'value': value
        })
    # Now calculate allocation percentage for each ticker
    for item in temp_alloc:
        allocation_pct = (item['value'] / total_value * 100) if total_value else 0.0
        item['allocation_pct'] = allocation_pct
        allocation.append(item)
    return allocation


# def get_asset_allocation_by_quote_type(portfolio_name):
#     """
#     Returns a dict: {quoteType: allocation_percentage, ...} for all tickers in the portfolio, using quoteType from ticker_info.
#     The allocation is the percentage of each quoteType's value over the total portfolio value.
#     """
#     from db.database import get_transactions  # Local import to avoid circular import
#     txs = get_transactions(portfolio_name)
#     positions = aggregate_positions(txs)
#     allocation = {}
#     total_value = 0.0
#     temp = {}
#     for ticker, qty in positions.items():
#         if qty == 0:
#             continue
#         try:
#             data, _ = get_ticker_data(ticker)
#             info = (data or {}).get('info', {})
#             price = info.get('regularMarketPrice') or 0
#             quote_type = info.get('quoteType') or 'Unknown'
#         except Exception:
#             price = 0
#             quote_type = 'Unknown'
#         value = price * qty
#         total_value += value
#         if quote_type not in temp:
#             temp[quote_type] = 0.0
#         temp[quote_type] += value
#     # Now calculate allocation percentage for each quoteType
#     for quote_type, value in temp.items():
#         allocation[quote_type] = (value / total_value * 100) if total_value else 0.0
#     return allocation


def get_asset_allocation_by_category_and_risk(portfolio_name):
    """
    Returns allocation grouped by user-defined 'category' and 'risk' fields stored
    in the `portfolio_holdings` Firestore document for the portfolio (if present).

    The returned structure is a dict with keys:
      - "total_value": float
      - "by_category": { category: { value: float, pct: float, tickers: [ticker,...] }, ... }
      - "by_risk": { risk: { value: float, pct: float, tickers: [ticker,...] }, ... }

    If holdings are not present in Firestore this function returns empty groupings
    (but does not try to compute live holdings). Percentages are 0 when total_value is 0.
    """
    # Local import to avoid circular imports
    try:
        from db.portfolios import get_portfolio_status_saved
    except Exception:
        # If import fails, return empty structure
        return {"total_value": 0.0, "by_category": {}, "by_risk": {}}

    try:
        status_doc, _, _ = get_portfolio_status_saved(portfolio_name)
        holdings = status_doc.get("holdings", []) or []
        # Compute total_value from holdings to ensure percentages are
        # derived from the actual summed holdings values. Use the saved
        # `total_value` only as a fallback when holdings are empty or
        # when parsing fails.
        computed_total = 0.0
        for h in holdings:
            try:
                computed_total += float(h.get("value", 0) or 0.0)
            except Exception:
                continue
        total_value = float(computed_total) if computed_total else float(status_doc.get("total_value", 0) or 0.0)
    except Exception:
        return {"total_value": 0.0, "by_category": {}, "by_risk": {}}

    by_category = {}
    by_risk = {}

    # Group values by category and risk
    for h in holdings:
        try:
            ticker = h.get("ticker") or h.get("ticker_symbol") or None
            value = float(h.get("value", 0) or 0.0)
            # Use only the explicit 'category' field from saved holdings.
            # Do NOT fall back to 'asset_type' here because that mixes
            # different classification schemes and can produce unexpected
            # category keys (e.g. asset-type codes like 'aaa', 'bbb').
            category = h.get("category") if h.get("category") is not None else "Uncategorized"
            risk = h.get("risk") or "Unknown"
        except Exception:
            continue

        # Category
        if category not in by_category:
            by_category[category] = {"value": 0.0, "tickers": []}
        by_category[category]["value"] += value
        if ticker and ticker not in by_category[category]["tickers"]:
            by_category[category]["tickers"].append(ticker)

        # Risk
        if risk not in by_risk:
            by_risk[risk] = {"value": 0.0, "tickers": []}
        by_risk[risk]["value"] += value
        if ticker and ticker not in by_risk[risk]["tickers"]:
            by_risk[risk]["tickers"].append(ticker)

    # Convert values to percentages
    def _attach_pct(group_map):
        for k, v in group_map.items():
            val = float(v.get("value", 0) or 0.0)
            pct = (val / total_value * 100.0) if total_value else 0.0
            v["pct"] = pct
    _attach_pct(by_category)
    _attach_pct(by_risk)

    return {"total_value": total_value, "by_category": by_category, "by_risk": by_risk}


def get_asset_allocation_by_category(portfolio_name):
    """
    Return allocation grouped by category only.
    Returns { 'total_value': float, 'by_category': { category: { value, pct, tickers }, ... } }
    """
    try:
        full = get_asset_allocation_by_category_and_risk(portfolio_name)
        return { 'total_value': full.get('total_value', 0.0), 'by_category': full.get('by_category', {}) }
    except Exception:
        return { 'total_value': 0.0, 'by_category': {} }


def get_asset_allocation_by_risk(portfolio_name):
    """
    Return allocation grouped by risk only.
    Returns { 'total_value': float, 'by_risk': { risk: { value, pct, tickers }, ... } }
    """
    try:
        full = get_asset_allocation_by_category_and_risk(portfolio_name)
        return { 'total_value': full.get('total_value', 0.0), 'by_risk': full.get('by_risk', {}) }
    except Exception:
        return { 'total_value': 0.0, 'by_risk': {} }


def get_asset_allocation_by_asset_type_and_total(portfolio_name):
    """
    Returns allocation grouped by the user-specified 'asset_type' field stored
    in the `portfolio_holdings` Firestore document for the portfolio (if present).

    Returned structure:
      { 'total_value': float, 'by_asset_type': { asset_type: { value: float, pct: float, tickers: [...] }, ... } }

    If holdings are not present this returns empty groupings.
    Percentages are computed against the summed holdings values (computed_total).
    """
    try:
        from db.portfolios import get_portfolio_status_saved
    except Exception:
        return { 'total_value': 0.0, 'by_asset_type': {} }

    try:
        status_doc, _, _ = get_portfolio_status_saved(portfolio_name)
        holdings = status_doc.get('holdings', []) or []
        # compute total from holdings values
        computed_total = 0.0
        for h in holdings:
            try:
                computed_total += float(h.get('value', 0) or 0.0)
            except Exception:
                continue
        total_value = float(computed_total) if computed_total else float(status_doc.get('total_value', 0) or 0.0)
    except Exception:
        return { 'total_value': 0.0, 'by_asset_type': {} }

    by_asset_type = {}
    for h in holdings:
        try:
            ticker = h.get('ticker') or h.get('ticker_symbol') or None
            value = float(h.get('value', 0) or 0.0)
            asset_type = h.get('asset_type') or 'Unknown'
        except Exception:
            continue

        if asset_type not in by_asset_type:
            by_asset_type[asset_type] = { 'value': 0.0, 'tickers': [] }
        by_asset_type[asset_type]['value'] += value
        if ticker and ticker not in by_asset_type[asset_type]['tickers']:
            by_asset_type[asset_type]['tickers'].append(ticker)

    # attach pct
    for k, v in by_asset_type.items():
        try:
            val = float(v.get('value', 0) or 0.0)
            pct = (val / total_value * 100.0) if total_value else 0.0
            v['pct'] = pct
        except Exception:
            v['pct'] = 0.0

    return { 'total_value': total_value, 'by_asset_type': by_asset_type }


def get_asset_allocation_by_asset_type(portfolio_name):
    """
    Thin wrapper that returns only the by_asset_type mapping with total_value.
    """
    try:
        full = get_asset_allocation_by_asset_type_and_total(portfolio_name)
        return { 'total_value': full.get('total_value', 0.0), 'by_asset_type': full.get('by_asset_type', {}) }
    except Exception:
        return { 'total_value': 0.0, 'by_asset_type': {} }


def compute_returns_since(portfolio_name, start_date):
    """
    Compute the portfolio and per-ticker returns since a given start_date (YYYY-MM-DD).
    Returns a dict:
    {
        'portfolio': { 'start_value': ..., 'end_value': ..., 'return_pct': ... },
        'tickers': { ticker: { 'start_value': ..., 'end_value': ..., 'return_pct': ... }, ... }
    }
    """
    from db.database import get_transactions  # Local import to avoid circular import
    import pandas as pd
    txs = get_transactions(portfolio_name)
    if not txs:
        return {'portfolio': None, 'tickers': {}}
    df_txs = pd.DataFrame(txs)
    if df_txs.empty or 'date' not in df_txs.columns or 'ticker' not in df_txs.columns or 'quantity' not in df_txs.columns or 'price' not in df_txs.columns:
        return {'portfolio': None, 'tickers': {}}
    df_txs['date'] = pd.to_datetime(df_txs['date'])
    tickers = df_txs['ticker'].unique()
    ticker_histories = {}
    for ticker in tickers:
        hist = get_ticker_history(ticker)
        if not hist:
            data, _ = data_fetcher.fetch_with_cache(ticker)
            history = (data or {}).get('history', [])
            if history:
                save_ticker_data(ticker, data)
                hist = get_ticker_history(ticker)
        if not hist:
            continue
        df_hist = pd.DataFrame(hist)
        if df_hist.empty or 'date' not in df_hist.columns or 'close' not in df_hist.columns:
            continue
        df_hist['date'] = pd.to_datetime(df_hist['date'])
        df_hist.set_index('date', inplace=True)
        ticker_histories[ticker] = df_hist['close']
    if not ticker_histories:
        return {'portfolio': None, 'tickers': {}}
    # Find all dates in the range
    all_dates = set()
    for s in ticker_histories.values():
        all_dates.update(s.index)
    all_dates = sorted([d for d in all_dates if d >= pd.to_datetime(start_date)])
    if not all_dates:
        return {'portfolio': None, 'tickers': {}}
    start_dt = all_dates[0]
    end_dt = all_dates[-1]
    # Portfolio values
    def get_portfolio_value(dt):
        total = 0.0
        for ticker in tickers:
            txs_ticker = df_txs[(df_txs['ticker'] == ticker) & (df_txs['date'] <= dt)]
            qty = txs_ticker['quantity'].sum() if not txs_ticker.empty else 0.0
            price = ticker_histories.get(ticker, pd.Series()).get(dt, None)
            if price is None:
                price = ticker_histories.get(ticker, pd.Series()).loc[:dt].ffill().iloc[-1] if not ticker_histories.get(ticker, pd.Series()).loc[:dt].empty else 0.0
            total += qty * (price if price is not None else 0.0)
        return total
    start_value = get_portfolio_value(start_dt)
    end_value = get_portfolio_value(end_dt)
    portfolio_return = ((end_value - start_value) / start_value * 100) if start_value else 0.0
    # Per-ticker values
    ticker_returns = {}
    for ticker in tickers:
        txs_ticker = df_txs[(df_txs['ticker'] == ticker) & (df_txs['date'] <= end_dt)]
        if txs_ticker.empty:
            continue
        qty_start = df_txs[(df_txs['ticker'] == ticker) & (df_txs['date'] <= start_dt)]['quantity'].sum() if not df_txs.empty else 0.0
        qty_end = txs_ticker['quantity'].sum() if not txs_ticker.empty else 0.0
        price_start = ticker_histories.get(ticker, pd.Series()).get(start_dt, None)
        if price_start is None:
            price_start = ticker_histories.get(ticker, pd.Series()).loc[:start_dt].ffill().iloc[-1] if not ticker_histories.get(ticker, pd.Series()).loc[:start_dt].empty else 0.0
        price_end = ticker_histories.get(ticker, pd.Series()).get(end_dt, None)
        if price_end is None:
            price_end = ticker_histories.get(ticker, pd.Series()).loc[:end_dt].ffill().iloc[-1] if not ticker_histories.get(ticker, pd.Series()).loc[:end_dt].empty else 0.0
        start_val = qty_start * (price_start if price_start is not None else 0.0)
        end_val = qty_end * (price_end if price_end is not None else 0.0)
        ticker_return = ((end_val - start_val) / start_val * 100) if start_val else 0.0
        # Get ticker name from ticker_info (Firestore)
        try:
            data, _ = get_ticker_data(ticker)
            info = (data or {}).get('info', {})
            ticker_name = info.get('shortName') or ticker
            norm_ticker = info.get('ticker') or ticker
        except Exception:
            ticker_name = ticker
            norm_ticker = ticker
        ticker_returns[norm_ticker] = {
            'ticker_name': ticker_name,
            'start_value': start_val,
            'end_value': end_val,
            'return_pct': ticker_return
        }
    return {
        'portfolio': {
            'start_value': start_value,
            'end_value': end_value,
            'return_pct': portfolio_return
        },
        'tickers': ticker_returns
    }

# Helper functions for common periods
def get_last_day_possible_returns(portfolio_name):
    from db.database import get_transactions  # Local import to avoid circular import
    import pandas as pd
    txs = get_transactions(portfolio_name)
    if not txs:
        return {'portfolio': None, 'tickers': {}}
    df_txs = pd.DataFrame(txs)
    if df_txs.empty or 'ticker' not in df_txs.columns:
        return {'portfolio': None, 'tickers': {}}
    tickers = df_txs['ticker'].unique()
    all_dates = set()
    for ticker in tickers:
        hist = get_ticker_history(ticker)
        if not hist:
            data, _ = data_fetcher.fetch_with_cache(ticker)
            history = (data or {}).get('history', [])
            if history:
                save_ticker_data(ticker, data)
                hist = get_ticker_history(ticker)
        if not hist:
            continue
        df_hist = pd.DataFrame(hist)
        if df_hist.empty or 'date' not in df_hist.columns:
            continue
        df_hist['date'] = pd.to_datetime(df_hist['date'])
        all_dates.update(df_hist['date'].tolist())
    if not all_dates:
        return {'portfolio': None, 'tickers': {}}
    all_dates_sorted = sorted(all_dates)
    if len(all_dates_sorted) < 2:
        return {'portfolio': None, 'tickers': {}}
    # Use the second-to-last date as the start date
    start_day = all_dates_sorted[-2]
    return compute_returns_since(portfolio_name, start_day.strftime('%Y-%m-%d'))

def get_weekly_returns(portfolio_name):
    import pandas as pd
    today = pd.Timestamp.today().normalize()
    week_ago = today - pd.Timedelta(days=7)
    return compute_returns_since(portfolio_name, week_ago.strftime('%Y-%m-%d'))

def get_monthly_returns(portfolio_name):
    import pandas as pd
    today = pd.Timestamp.today().normalize()
    month_ago = today - pd.Timedelta(days=30)
    return compute_returns_since(portfolio_name, month_ago.strftime('%Y-%m-%d'))

def get_three_month_returns(portfolio_name):
    import pandas as pd
    today = pd.Timestamp.today().normalize()
    three_months_ago = today - pd.Timedelta(days=90)
    return compute_returns_since(portfolio_name, three_months_ago.strftime('%Y-%m-%d'))

def get_ytd_returns(portfolio_name):
    import pandas as pd
    today = pd.Timestamp.today().normalize()
    ytd = pd.Timestamp(year=today.year, month=1, day=1)
    return compute_returns_since(portfolio_name, ytd.strftime('%Y-%m-%d'))

def get_one_year_return(portfolio_name):
    """
    Compute the portfolio and per-ticker returns for the last 365 days.
    Returns a dict:
    {
        'portfolio': { 'start_value': ..., 'end_value': ..., 'return_pct': ... },
        'tickers': { ticker: { 'start_value': ..., 'end_value': ..., 'return_pct': ... }, ... }
    }
    """
    today = pd.Timestamp.today().normalize()
    one_year_ago = today - pd.Timedelta(days=365)
    return compute_returns_since(portfolio_name, one_year_ago.strftime('%Y-%m-%d'))

def get_ticker_returns_since(portfolio_name, ticker, start_date):
    from db.database import get_transactions  # Local import to avoid circular import
    import pandas as pd
    txs = [t for t in get_transactions(portfolio_name) if t.get('ticker') == ticker]
    if not txs:
        return None
    df_txs = pd.DataFrame(txs)
    if df_txs.empty or 'date' not in df_txs.columns or 'quantity' not in df_txs.columns or 'price' not in df_txs.columns:
        return None
    df_txs['date'] = pd.to_datetime(df_txs['date'])
    hist = get_ticker_history(ticker)
    if not hist:
        data, _ = data_fetcher.fetch_with_cache(ticker)
        history = (data or {}).get('history', [])
        if history:
            save_ticker_data(ticker, data)
            hist = get_ticker_history(ticker)
    if not hist:
        return None
    df_hist = pd.DataFrame(hist)
    if df_hist.empty or 'date' not in df_hist.columns or 'close' not in df_hist.columns:
        return None
    df_hist['date'] = pd.to_datetime(df_hist['date'])
    df_hist.set_index('date', inplace=True)
    all_dates = sorted([d for d in df_hist.index if d >= pd.to_datetime(start_date)])
    if not all_dates:
        return None
    start_dt = all_dates[0]
    end_dt = all_dates[-1]
    qty_start = df_txs[df_txs['date'] <= start_dt]['quantity'].sum() if not df_txs.empty else 0.0
    qty_end = df_txs[df_txs['date'] <= end_dt]['quantity'].sum() if not df_txs.empty else 0.0
    price_start = df_hist['close'].get(start_dt, None)
    if price_start is None:
        price_start = df_hist['close'].loc[:start_dt].ffill().iloc[-1] if not df_hist['close'].loc[:start_dt].empty else 0.0
    price_end = df_hist['close'].get(end_dt, None)
    if price_end is None:
        price_end = df_hist['close'].loc[:end_dt].ffill().iloc[-1] if not df_hist['close'].loc[:end_dt].empty else 0.0
    start_val = qty_start * (price_start if price_start is not None else 0.0)
    end_val = qty_end * (price_end if price_end is not None else 0.0)
    ticker_return = ((end_val - start_val) / start_val * 100) if start_val else 0.0
    return {
        'start_value': start_val,
        'end_value': end_val,
        'return_pct': ticker_return
    }

def get_ticker_last_day_possible_returns(portfolio_name, ticker):
    import pandas as pd
    hist = get_ticker_history(ticker)
    if not hist:
        data, _ = data_fetcher.fetch_with_cache(ticker)
        history = (data or {}).get('history', [])
        if history:
            save_ticker_data(ticker, data)
            hist = get_ticker_history(ticker)
    if not hist:
        return None
    df_hist = pd.DataFrame(hist)
    if df_hist.empty or 'date' not in df_hist.columns:
        return None
    df_hist['date'] = pd.to_datetime(df_hist['date'])
    last_day = df_hist['date'].max()
    return get_ticker_returns_since(portfolio_name, ticker, last_day.strftime('%Y-%m-%d'))

def get_ticker_weekly_returns(portfolio_name, ticker):
    import pandas as pd
    today = pd.Timestamp.today().normalize()
    week_ago = today - pd.Timedelta(days=7)
    return get_ticker_returns_since(portfolio_name, ticker, week_ago.strftime('%Y-%m-%d'))

def get_ticker_monthly_returns(portfolio_name, ticker):
    import pandas as pd
    today = pd.Timestamp.today().normalize()
    month_ago = today - pd.Timedelta(days=30)
    return get_ticker_returns_since(portfolio_name, ticker, month_ago.strftime('%Y-%m-%d'))

def get_ticker_three_month_returns(portfolio_name, ticker):
    import pandas as pd
    today = pd.Timestamp.today().normalize()
    three_months_ago = today - pd.Timedelta(days=90)
    return get_ticker_returns_since(portfolio_name, ticker, three_months_ago.strftime('%Y-%m-%d'))

def get_ticker_ytd_returns(portfolio_name, ticker):
    import pandas as pd
    today = pd.Timestamp.today().normalize()
    ytd = pd.Timestamp(year=today.year, month=1, day=1)
    return get_ticker_returns_since(portfolio_name, ticker, ytd.strftime('%Y-%m-%d'))

def get_last_three_days_returns(portfolio_name):
    """
    Compute the portfolio and per-ticker returns for the last three days (i.e., from three days ago to today).
    Returns a dict:
    {
        'portfolio': { 'start_value': ..., 'end_value': ..., 'return_pct': ... },
        'tickers': { ticker: { 'ticker_name': ..., 'start_value': ..., 'end_value': ..., 'return_pct': ... }, ... }
    }
    """
    import pandas as pd
    today = pd.Timestamp.today().normalize()
    three_days_ago = today - pd.Timedelta(days=3)
    return compute_returns_since(portfolio_name, three_days_ago.strftime('%Y-%m-%d'))

def get_ticker_three_days_returns(portfolio_name, ticker):
    """
    Compute the returns for a single ticker in the portfolio for the last three days (from three days ago to today).
    Returns a dict:
        { 'start_value': ..., 'end_value': ..., 'return_pct': ... }
    """
    import pandas as pd
    today = pd.Timestamp.today().normalize()
    three_days_ago = today - pd.Timedelta(days=3)
    return get_ticker_returns_since(portfolio_name, ticker, three_days_ago.strftime('%Y-%m-%d'))

DEFAULT_VOLATILITY_WINDOW = 30
VALID_VOLATILITY_WINDOWS = {30, 90, 252}
DEFAULT_EWM_SPAN = 30


def compute_volatility(returns, window=None, *, method='rolling'):
    """Compute annualized volatility for a returns series."""
    import numpy as np
    import pandas as pd

    if not isinstance(returns, pd.Series):
        returns = pd.Series(returns)

    returns = returns.dropna()
    if len(returns) == 0:
        return np.nan if window is None else pd.Series(dtype=float)

    ann_factor = np.sqrt(252)

    if method == 'ewm':
        span = max(int(window or DEFAULT_EWM_SPAN), 2)
        return returns.ewm(span=span, adjust=False).std(bias=False) * ann_factor

    if window is None:
        return returns.std(ddof=1) * ann_factor

    rolling_window = max(int(window), 2)
    return returns.rolling(window=rolling_window, min_periods=min(rolling_window, 2)).std(ddof=1) * ann_factor


def _latest_volatility_value(volatility):
    """Return the most recent non-NaN volatility observation."""
    import math
    import pandas as pd

    if isinstance(volatility, pd.Series):
        clean = volatility.dropna()
        if clean.empty:
            return float('nan')
        return float(clean.iloc[-1])

    try:
        value = float(volatility)
    except (TypeError, ValueError):
        return float('nan')

    return value if not math.isnan(value) else float('nan')

def compute_portfolio_volatility_1d(portfolio_name, window=DEFAULT_VOLATILITY_WINDOW, *, method='rolling'):
    """Compute rolling annualized portfolio volatility for the requested window."""
    perf = compute_portfolio_performance(portfolio_name)
    import pandas as pd
    if not perf or len(perf) < 2:
        return pd.Series(dtype=float)
    df = pd.DataFrame(perf)
    # Use 'pct' as daily return in percent, convert to decimal
    if 'pct' not in df.columns:
        return pd.Series(dtype=float)
    returns = df['pct'] / 100.0
    return compute_volatility(returns, window=window, method=method)

def compute_portfolio_volatility(portfolio_name, window=None, *, method='rolling'):
    """Compute annualized portfolio volatility using full-history or rolling metrics."""
    perf = compute_portfolio_performance(portfolio_name)
    import pandas as pd
    if not perf or len(perf) < 2:
        return float('nan')
    df = pd.DataFrame(perf)
    # Use 'pct' as daily return in percent, convert to decimal
    if 'pct' not in df.columns:
        return float('nan')
    returns = df['pct'] / 100.0
    volatility = compute_volatility(returns, window=window, method=method)
    return _latest_volatility_value(volatility)

def compute_ticker_volatility(portfolio_name, window=None, *, method='rolling'):
    """Compute annualized volatility for each ticker, optionally using rolling windows."""
    from db.database import get_transactions
    import pandas as pd
    txs = get_transactions(portfolio_name)
    if not txs:
        return {}
    df_txs = pd.DataFrame(txs)
    if df_txs.empty or 'ticker' not in df_txs.columns:
        return {}
    tickers = df_txs['ticker'].unique()
    result = {}
    for ticker in tickers:
        perf = compute_ticker_performance(portfolio_name, ticker)
        if not perf or len(perf) < 2:
            result[ticker] = float('nan')
            continue
        df = pd.DataFrame(perf)
        if 'pct' not in df.columns:
            result[ticker] = float('nan')
            continue
        returns = df['pct'] / 100.0
        volatility = compute_volatility(returns, window=window, method=method)
        result[ticker] = _latest_volatility_value(volatility)
    return result

def compute_ticker_volatility_1d(portfolio_name, window=DEFAULT_VOLATILITY_WINDOW, *, method='rolling'):
    """Compute rolling annualized volatility series for each ticker."""
    from db.database import get_transactions
    import pandas as pd
    txs = get_transactions(portfolio_name)
    if not txs:
        return {}
    df_txs = pd.DataFrame(txs)
    if df_txs.empty or 'ticker' not in df_txs.columns:
        return {}
    tickers = df_txs['ticker'].unique()
    result = {}
    for ticker in tickers:
        perf = compute_ticker_performance(portfolio_name, ticker)
        if not perf or len(perf) < 2:
            result[ticker] = pd.Series(dtype=float)
            continue
        df = pd.DataFrame(perf)
        if 'pct' not in df.columns:
            result[ticker] = pd.Series(dtype=float)
            continue
        returns = df['pct'] / 100.0
        result[ticker] = compute_volatility(returns, window=window, method=method)
    return result


def get_six_month_returns(portfolio_name):
    """
    Convenience helper to compute returns for the last ~182 days (~6 months).
    Returns the same structure as other period helpers (compute_returns_since).
    """
    import pandas as pd
    today = pd.Timestamp.today().normalize()
    six_months_ago = today - pd.Timedelta(days=182)
    return compute_returns_since(portfolio_name, six_months_ago.strftime('%Y-%m-%d'))


def compute_portfolio_volatility_for_period(portfolio_name, days):
    """
    Compute annualized volatility for the given lookback period (in days).
    Returns a float (annualized volatility) computed on the returns inside the lookback window.
    """
    import pandas as pd
    perf = compute_portfolio_performance(portfolio_name)
    if not perf or len(perf) < 2:
        return float('nan')
    df = pd.DataFrame(perf)
    if 'pct' not in df.columns:
        return float('nan')
    df['date'] = pd.to_datetime(df['date'])
    # Use the last `days` from available data
    cutoff = df['date'].max() - pd.Timedelta(days=days)
    window_df = df[df['date'] > cutoff]
    if window_df.empty or len(window_df) < 2:
        return float('nan')
    returns = window_df['pct'] / 100.0
    return compute_volatility(returns, window=None)


def compute_ticker_volatility_for_period(portfolio_name, days):
    """
    Compute annualized volatility for each ticker using a lookback in days.
    Returns dict {ticker: volatility}
    """
    from db.database import get_transactions
    import pandas as pd
    txs = get_transactions(portfolio_name)
    if not txs:
        return {}
    df_txs = pd.DataFrame(txs)
    if df_txs.empty or 'ticker' not in df_txs.columns:
        return {}
    tickers = df_txs['ticker'].unique()
    result = {}
    for ticker in tickers:
        perf = compute_ticker_performance(portfolio_name, ticker)
        if not perf or len(perf) < 2:
            result[ticker] = float('nan')
            continue
        df = pd.DataFrame(perf)
        df['date'] = pd.to_datetime(df['date'])
        cutoff = df['date'].max() - pd.Timedelta(days=days)
        window_df = df[df['date'] > cutoff]
        if window_df.empty or 'pct' not in window_df.columns or len(window_df) < 2:
            result[ticker] = float('nan')
            continue
        returns = window_df['pct'] / 100.0
        result[ticker] = compute_volatility(returns, window=None)
    return result


def get_asset_allocation_by_region(portfolio_name):
    """
    Returns a dict: {region: allocation_percentage, ...} for all tickers in the portfolio.
    Uses the `region` column from `ticker_info` when present; falls back to 'Unknown'.
    """
    from db.database import get_transactions  # Local import
    txs = get_transactions(portfolio_name)
    positions = aggregate_positions(txs)
    allocation = {}
    total_value = 0.0
    temp = {}
    for ticker, qty in positions.items():
        if qty == 0:
            continue
        try:
            data, _ = get_ticker_data(ticker)
            info = (data or {}).get('info', {})
            price = info.get('regularMarketPrice') or 0
            region = info.get('region') or 'Unknown'
        except Exception:
            price = 0
            region = 'Unknown'
        value = price * qty
        total_value += value
        temp[region] = temp.get(region, 0.0) + value
    for region, value in temp.items():
        allocation[region] = (value / total_value * 100) if total_value else 0.0
    return allocation


def _compute_max_drawdown_from_series(values):
    """Compute maximum drawdown from a list/series of absolute portfolio values.
    Returns a float (fraction, e.g. 0.2 for 20% max drawdown).
    """
    import pandas as pd
    if not values:
        return 0.0
    s = pd.Series(values).astype(float)
    if s.empty:
        return 0.0
    peak = s.cummax()
    drawdown = (peak - s) / peak
    return float(drawdown.max()) if not drawdown.empty else 0.0


def evaluate_portfolio_alerts(portfolio_name, thresholds=None):
    """
    Evaluate portfolio alerts using provided thresholds. Returns a list of triggered alerts.

    thresholds is a dict that can contain:
      - volatility: {"30d": pct_value, "90d": pct_value, "1y": pct_value} (pct as decimal, e.g. 0.3 for 30%)
      - weight_pct: float (e.g. 0.25 for 25%)
      - drawdown_pct: float (e.g. 0.2 for 20%)

    Example return:
      [{"type": "volatility", "ticker": null, "period": "30d", "value": 0.32, "threshold": 0.3}, ...]
    """
    import pandas as pd
    if thresholds is None:
        thresholds = {}
    alerts = []
    # 1) Volatility checks (portfolio-level and per-ticker if requested)
    vol_cfg = thresholds.get('volatility', {})
    for label, days in (('30d', 30), ('90d', 90), ('1y', 365)):
        if label in vol_cfg:
            thr = vol_cfg[label]
            vol = compute_portfolio_volatility_for_period(portfolio_name, days)
            if isinstance(vol, float) and not pd.isna(vol) and vol > thr:
                alerts.append({'type': 'volatility', 'scope': 'portfolio', 'period': label, 'value': vol, 'threshold': thr})
    # 2) Weight threshold per asset
    weight_thr = thresholds.get('weight_pct')
    if weight_thr is not None:
        alloc = get_overall_asset_allocation(portfolio_name)
        for item in alloc:
            if item.get('allocation_pct', 0) / 100.0 > weight_thr:
                alerts.append({'type': 'weight', 'ticker': item.get('ticker'), 'value': item.get('allocation_pct') / 100.0, 'threshold': weight_thr})
    # 3) Drawdown check
    drawdown_thr = thresholds.get('drawdown_pct')
    if drawdown_thr is not None:
        perf = compute_portfolio_performance(portfolio_name)
        if perf:
            abs_values = [p.get('abs_value', 0.0) for p in perf]
            mdd = _compute_max_drawdown_from_series(abs_values)
            if mdd > drawdown_thr:
                alerts.append({'type': 'drawdown', 'value': mdd, 'threshold': drawdown_thr})

    return alerts
