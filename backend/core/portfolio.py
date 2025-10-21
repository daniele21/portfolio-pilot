from collections import defaultdict
from datetime import datetime
import pandas as pd
from db.database import (
    aggregate_positions,
    get_ticker_history,
    save_ticker_data,
    get_ticker_data,
)
# Local helper: attempt to call user-scoped db functions when uid provided.
def _get_transactions_for(portfolio_name, uid=None):
    # defer import to avoid circulars
    try:
        if uid:
            from db.portfolios import get_transactions_user
            return get_transactions_user(uid, portfolio_name)
    except Exception:
        pass
    try:
        from db.database import get_transactions
        return get_transactions(portfolio_name)
    except Exception:
        return []

def _get_all_transactions(uid=None):
    try:
        if uid:
            from db.portfolios import get_transactions_user
            return get_transactions_user(uid, None)
    except Exception:
        pass
    try:
        from db.database import get_transactions
        return get_transactions(None)
    except Exception:
        return []

def _get_portfolio_status_saved_for(portfolio_name, uid=None):
    try:
        if uid:
            from db.portfolios import get_portfolio_status_saved_user
            return get_portfolio_status_saved_user(uid, portfolio_name)
    except Exception:
        pass
    try:
        from db.database import get_portfolio_status_saved
        return get_portfolio_status_saved(portfolio_name)
    except Exception:
        return ({'total_value': 0.0, 'holdings': []}, None, None)

def _get_ticker_history_for(ticker, uid=None):
    # ticker history and ticker data remain global; still call get_ticker_history
    try:
        from db.database import get_ticker_history
        return get_ticker_history(ticker)
    except Exception:
        return []

def _get_ticker_data_for(ticker, uid=None):
    try:
        from db.database import get_ticker_data
        return get_ticker_data(ticker)
    except Exception:
        return (None, None)


def _normalize_transactions_signs(txs):
    """Return a copy of txs where quantities are normalized so buys are positive and sells negative.

    Uses the 'operation' field when present. If operation is missing, preserves existing sign.
    """
    if not txs:
        return txs
    sell_ops = {'sell', 's', 'withdraw', 'withdrawal', 'out'}
    buy_ops = {'buy', 'b', 'deposit', 'in'}
    normalized = []
    for t in txs:
        try:
            tt = dict(t)
        except Exception:
            tt = t
        try:
            qty = float(tt.get('quantity', 0) or 0)
        except Exception:
            qty = 0.0
        try:
            op = (tt.get('operation') or '').strip().lower()
        except Exception:
            op = ''
        if op in sell_ops and qty > 0:
            qty = -abs(qty)
        elif op in buy_ops and qty < 0:
            qty = abs(qty)
        # preserve other cases
        tt['quantity'] = qty
        normalized.append(tt)
    return normalized
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
def clear_performance_caches(portfolio_name=None, tickers=None, uid=None):
    """Clear in-memory performance caches.

    When uid is provided, clears namespaced keys (f"{uid}:{portfolio}") to ensure
    user-scoped data is recomputed. If portfolio_name is None, clears all caches.
    """
    with _CACHE_LOCK:
        if portfolio_name is None:
            # Global clear
            _PERFORMANCE_CACHE.clear()
            _TICKER_PERFORMANCE_CACHE.clear()
            _MULTI_TICKER_PERFORMANCE_CACHE.clear()
            return
        namespaced = f"{uid}:{portfolio_name}" if uid else portfolio_name
        # Portfolio-level cache
        _PERFORMANCE_CACHE.pop(namespaced, None)
        # Ticker-level cache entries
        if tickers:
            tickers_set = set(tickers)
            to_remove = [k for k in list(_TICKER_PERFORMANCE_CACHE.keys()) if k[0] == namespaced and k[1] in tickers_set]
        else:
            to_remove = [k for k in list(_TICKER_PERFORMANCE_CACHE.keys()) if k[0] == namespaced]
        for k in to_remove:
            _TICKER_PERFORMANCE_CACHE.pop(k, None)
        # Multi-ticker cache entries
        if tickers:
            tickers_set = set(tickers)
            multi_remove = [k for k in list(_MULTI_TICKER_PERFORMANCE_CACHE.keys()) if k[0] == namespaced and (set(k[1]) & tickers_set)]
        else:
            multi_remove = [k for k in list(_MULTI_TICKER_PERFORMANCE_CACHE.keys()) if k[0] == namespaced]
        for k in multi_remove:
            _MULTI_TICKER_PERFORMANCE_CACHE.pop(k, None)


# --- Caching wrappers ---
def get_cached_portfolio_performance(portfolio_name, uid=None, debug: bool = False):
    # Namespace the cache key by uid when provided to avoid collisions
    key = f"{uid}:{portfolio_name}" if uid else portfolio_name
    with _CACHE_LOCK:
        cached = _get_cache_entry(_PERFORMANCE_CACHE, key)
        if cached is not None:
            return cached
    data = compute_portfolio_performance(portfolio_name, _skip_cache=True, uid=uid, debug=debug)
    with _CACHE_LOCK:
        try:
            _set_cache_entry(_PERFORMANCE_CACHE, key, data)
        except Exception:
            pass
    return data


def get_cached_ticker_performance(portfolio_name, ticker, start_date=None, uid=None):
    namespaced = f"{uid}:{portfolio_name}" if uid else portfolio_name
    key = (namespaced, ticker, str(start_date) if start_date else '')
    with _CACHE_LOCK:
        cached = _get_cache_entry(_TICKER_PERFORMANCE_CACHE, key)
        if cached is not None:
            return cached
    data = compute_ticker_performance(portfolio_name, ticker, start_date, _skip_cache=True, uid=uid)
    with _CACHE_LOCK:
        try:
            _set_cache_entry(_TICKER_PERFORMANCE_CACHE, key, data)
        except Exception:
            pass
    return data


def get_portfolio_status(portfolio_name, uid=None):
    """Return current holdings with latest prices using the new normalized ticker tables."""
    txs = _get_transactions_for(portfolio_name, uid=uid)
    txs = _normalize_transactions_signs(txs)
    positions = aggregate_positions(txs)
    holdings = []
    # total_value is reported as the cost-basis (avg_cost * abs(qty))
    total_value = 0.0
    # also keep total_market_value so callers can access the market valuation
    total_market_value = 0.0
    # aggregate unrealized (market - cost_basis) across holdings
    total_unrealized = 0.0
    for ticker, qty in positions.items():
        if qty == 0:
            continue
        # Compute average cost (PMC) for the ticker using a simple moving-average
        # method: iterate transactions in chronological order, accumulate buys
        # into total_cost/total_qty, and on sells reduce total_qty and total_cost
        # proportionally. This produces the average cost per remaining share.
        try:
            # Filter ticker transactions and sort by date
            txs_for_tk = [t for t in (txs or []) if (t.get('ticker') or '').strip().upper() == (ticker or '').strip().upper()]
            def _parse_date(d):
                try:
                    return pd.to_datetime(d)
                except Exception:
                    return None
            txs_for_tk.sort(key=lambda x: (_parse_date(x.get('date')) or datetime.min))
            total_qty = 0.0
            total_cost = 0.0
            for t in txs_for_tk:
                try:
                    t_qty = float(t.get('quantity', 0) or 0)
                except Exception:
                    t_qty = 0.0
                # Interpret explicit operation flags (sell) similarly to db.aggregate_positions
                try:
                    op = (t.get('operation') or '').strip().lower()
                except Exception:
                    op = ''
                if t_qty >= 0 and op in ('sell', 's', 'withdraw', 'withdrawal', 'out'):
                    t_qty = -abs(t_qty)
                try:
                    t_price = float(t.get('price', 0) or 0)
                except Exception:
                    t_price = 0.0
                if t_qty > 0:
                    total_cost += t_qty * t_price
                    total_qty += t_qty
                elif t_qty < 0:
                    sell_qty = -t_qty
                    if total_qty > 0:
                        cost_per_unit = (total_cost / total_qty) if total_qty else 0.0
                        reduction_qty = min(sell_qty, total_qty)
                        total_cost -= reduction_qty * cost_per_unit
                        total_qty -= reduction_qty
                    else:
                        # selling without prior buys — set totals to zero (no cost basis)
                        total_qty = max(total_qty - sell_qty, 0.0)
                        total_cost = 0.0
            avg_cost = (total_cost / total_qty) if total_qty else 0.0
        except Exception:
            avg_cost = 0.0
        # Get latest price from ticker_info (Firestore)
        try:
            data, _ = _get_ticker_data_for(ticker, uid=uid)
            info = (data or {}).get('info', {})
            # Try the canonical field first; if missing try to fetch live data and persist it
            price = info.get('regularMarketPrice')
            if not price:
                # attempt to fetch live data and save it so future calls hit the DB
                try:
                    fetched, _ = data_fetcher.fetch_with_cache(ticker)
                    if fetched:
                        try:
                            save_ticker_data(ticker, fetched)
                        except Exception:
                            # non-fatal if save fails
                            pass
                        info = (fetched or {}).get('info', {}) or info
                except Exception:
                    # ignore fetch errors and fall back to existing info
                    pass
            # Accept a few common alternative field names
            price = price or info.get('currentPrice') or info.get('lastPrice') or 0
            name = info.get('shortName') or info.get('name') or ticker
        except Exception:
            price = 0
            name = ticker
        market_value = price * qty
        # accumulate market value separately
        total_market_value += market_value
        # Ensure avg_cost is non-negative and use absolute qty for cost-basis
        try:
            avg_cost = abs(float(avg_cost) if avg_cost is not None else 0.0)
        except Exception:
            avg_cost = 0.0
        # Use avg_cost (PMC) for reported holding 'value' and for total_value; make them positive
        cost_value = avg_cost * abs(qty)
        # total_value represents the cost-basis of the portfolio (sum of cost_value)
        total_value += cost_value
        # Unrealized P/L relative to average cost (PMC) - preserves sign to show gain/loss
        try:
            unrealized_pnl = qty * (price - avg_cost)
        except Exception:
            unrealized_pnl = 0.0
        # accumulate net unrealized pnl for portfolio-level metric
        try:
            total_unrealized += float(unrealized_pnl or 0.0)
        except Exception:
            pass
        holdings.append({
            "ticker": ticker,
            "name": name,
            # Keep both signed and absolute quantity for clarity
            "signed_quantity": qty,
            "quantity": abs(qty),
            "price": price,
            "market_value": market_value,
            # 'value' is cost-basis (avg_cost * abs(qty)) and is non-negative
            "value": cost_value,
            "avg_cost": avg_cost,
            "unrealized_pnl": unrealized_pnl,
        })
    # Return both American and British spelling aliases for compatibility
    return {
        "holdings": holdings,
        "total_value": total_value,
        "total_market_value": total_market_value,
        # British and American spellings for compatibility
        "net_unrealised_pnl": total_unrealized,
        "net_unrealized_pnl": total_unrealized,
    }


def get_performance(portfolio_name, uid=None):
    """Compute simple performance trend using daily closes."""
    txs = _get_transactions_for(portfolio_name, uid=uid)
    txs = _normalize_transactions_signs(txs)
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


def compute_portfolio_performance(portfolio_name, _skip_cache=False, uid=None, debug: bool = False):
    if not _skip_cache:
        # Use the uid-aware cached wrapper to avoid collisions
        return get_cached_portfolio_performance(portfolio_name, uid=uid)
    """Compute daily portfolio snapshots using the same PMC average-cost logic as `get_portfolio_status`.

    For each day we compute:
      - total_value: cost-basis of remaining holdings (sum of avg_cost * abs(qty) per ticker)
      - total_market_value: market valuation using historical close for that date
      - net_unrealised_pnl / net_unrealized_pnl: total unrealized pnl (market - cost basis)

    The implementation mirrors `get_portfolio_status` per-ticker accounting but scoped to transactions
    up to each date in the historical series so the per-day snapshots are consistent with the snapshot logic.
    """
    txs = _get_transactions_for(portfolio_name, uid=uid)
    txs = _normalize_transactions_signs(txs)
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
        hist = _get_ticker_history_for(ticker, uid=uid)
        if not hist:
            data, _ = data_fetcher.fetch_with_cache(ticker)
            history = (data or {}).get('history', [])
            if history:
                save_ticker_data(ticker, data)
                hist = _get_ticker_history_for(ticker, uid=uid)
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
    # NOTE: Do not infer missing BUY prices here; align with /kpis snapshot semantics.
    # Transactions with price <= 0 contribute zero to cost basis (same as get_portfolio_status).
    # --- Fill date gaps: create a complete date range from min to max date ---
    if all_dates:
        # Compute global max date and per-ticker earliest date. We choose the
        # start_date as the max of the transaction first date and the latest
        # among tickers' first-history dates. This prevents starting on a day
        # where some tickers have no prior price (which would yield price=0).
        max_hist_date = max(all_dates)
        # Compute per-ticker first history date and take the max
        first_hist_dates = []
        for tk, series in ticker_histories.items():
            try:
                idx = series.index
                if len(idx) > 0:
                    first_hist_dates.append(min(idx))
            except Exception:
                continue
        max_first_hist_date = max(first_hist_dates) if first_hist_dates else None
        first_tx_date = df_txs['date'].min()
        # start at the later of first_tx_date and the latest per-ticker first history
        if first_tx_date is not None and max_first_hist_date is not None:
            start_date = max(first_tx_date, max_first_hist_date)
        elif first_tx_date is not None:
            start_date = first_tx_date
        elif max_first_hist_date is not None:
            start_date = max_first_hist_date
        else:
            start_date = min(all_dates)
        if start_date > max_hist_date:
            return []  # no overlapping window
        all_dates = pd.date_range(start=start_date, end=max_hist_date, freq='D')
    else:
        all_dates = []
    # Pre-sort transactions per ticker for efficient cumulative traversal
    txs_by_ticker = {}
    for ticker in tickers:
        df_t = df_txs[df_txs['ticker'] == ticker].sort_values('date').copy()
        txs_by_ticker[ticker] = df_t.to_dict('records') if not df_t.empty else []

    # State trackers per ticker
    state = {
        ticker: {
            'idx': 0,  # next transaction index to apply
            'remaining_qty': 0.0,
            'running_cost_basis': 0.0  # cost basis of remaining shares (active invested capital)
        } for ticker in tickers
    }

    values = []
    first_market = None
    # --- NEW: TWR / cash bookkeeping ---
    cash_balance = 0.0          # running cash in base currency
    equity_prev = None          # previous day's equity (market + cash)
    twr_cum = 1.0               # cumulative TWR multiplier
    external_ops = {'deposit', 'withdraw', 'withdrawal', 'transfer', 'transfer in', 'transfer out'}
    # For each date, compute per-ticker PMC average cost and use that to build totals
    for date in all_dates:
        total_value = 0.0
        total_market_value = 0.0
        total_unrealized = 0.0
        # cumulative realized P/L up to this date (portfolio-level)
        total_realized = 0.0
        # cumulative total cost spent (sum of buy quantity * price) up to this date
        total_cost_spent = 0.0
        day_details = [] if debug else None
        for ticker in tickers:
            # Filter transactions for this ticker up to the date
            txs_ticker = df_txs[(df_txs['ticker'] == ticker) & (df_txs['date'] <= date)].copy()
            # replicate the PMC avg-cost algorithm from get_portfolio_status
            total_qty = 0.0
            total_cost = 0.0
            # realized P/L for this ticker up to the date (cumulative)
            realized_for_ticker = 0.0
            # total cost spent for this ticker up to the date (sum of buys)
            spent_for_ticker = 0.0
            if not txs_ticker.empty:
                # Sort by date to ensure chronological order
                txs_ticker.sort_values('date', inplace=True)
                for _, t in txs_ticker.iterrows():
                    try:
                        t_qty = float(t.get('quantity', 0) or 0)
                    except Exception:
                        t_qty = 0.0
                    try:
                        op = (t.get('operation') or '').strip().lower()
                    except Exception:
                        op = ''
                    if t_qty >= 0 and op in ('sell', 's', 'withdraw', 'withdrawal', 'out'):
                        t_qty = -abs(t_qty)
                    try:
                        t_price = float(t.get('price', 0) or 0)
                    except Exception:
                        t_price = 0.0
                    if t_qty > 0:
                        total_cost += t_qty * t_price
                        total_qty += t_qty
                        try:
                            spent_for_ticker += t_qty * t_price
                        except Exception:
                            spent_for_ticker += 0.0
                    elif t_qty < 0:
                        sell_qty = -t_qty
                        if total_qty > 0:
                            cost_per_unit = (total_cost / total_qty) if total_qty else 0.0
                            reduction_qty = min(sell_qty, total_qty)
                            # realized P/L = quantity sold * (sell_price - cost_per_unit)
                            try:
                                realized_for_ticker += reduction_qty * (t_price - cost_per_unit)
                            except Exception:
                                realized_for_ticker += 0.0
                            total_cost -= reduction_qty * cost_per_unit
                            total_qty -= reduction_qty
                        else:
                            # Selling without prior buys: no cost basis to match against
                            # follow existing logic: set totals to zero
                            total_qty = max(total_qty - sell_qty, 0.0)
                            total_cost = 0.0
            # avg_cost for remaining shares
            avg_cost = (total_cost / total_qty) if total_qty else 0.0
            # accumulate per-ticker spent into portfolio-level total_cost_spent
            try:
                total_cost_spent += float(abs(spent_for_ticker) or 0.0)
            except Exception:
                total_cost_spent += 0.0

            # get price for the date
            series = ticker_histories.get(ticker, pd.Series())
            price = series.get(date, None)
            if price is None or pd.isna(price):
                try:
                    ffilled = series.loc[:date].ffill()
                    last = ffilled.iloc[-1] if not ffilled.empty else None
                    price = last if (last is not None and not pd.isna(last)) else 0.0
                except Exception:
                    price = 0.0

            qty = total_qty
            market_value = qty * (price if price is not None else 0.0)
            cost_value = abs(avg_cost) * abs(qty)
            if debug:
                day_details.append({
                    'ticker': ticker,
                    'qty': qty,
                    'avg_cost': avg_cost,
                    'price': (price if price is not None else None),
                    'market_value': market_value,
                    'cost_value': cost_value,
                })
            try:
                unrealized_pnl = qty * (price - avg_cost)
            except Exception:
                unrealized_pnl = 0.0
            # accumulate totals for this ticker (always)
            total_market_value += market_value
            total_value += cost_value
            # accumulate realized P/L for the portfolio (cumulative up to this date)
            try:
                total_realized += float(realized_for_ticker or 0.0)
            except Exception:
                total_realized += 0.0


        if first_market is None and total_market_value != 0.0:
            first_market = total_market_value
        # Removed pct_from_first computation - frontend will compute this from total_market_value

        # --- NEW: compute today's cash flow from transactions and external flows ---
        # Select only transactions on this date (normalized to day)
        today_mask = df_txs['date'].dt.normalize() == pd.Timestamp(date).normalize()
        today_txs = df_txs[today_mask] if not df_txs.empty else df_txs.iloc[0:0]

        cash_change = 0.0
        external_flow = 0.0

        for _, tx in (today_txs.iterrows() if not today_txs.empty else []):
            op = (tx.get('operation') or '').strip().lower()
            try:
                q = float(tx.get('quantity') or 0.0)
            except Exception:
                q = 0.0
            try:
                p = float(tx.get('price') or 0.0)
            except Exception:
                p = 0.0

            if q != 0.0:
                # Economic cash rule with existing conventions:
                # Buy:  q>0  -> cash out (negative)
                # Sell: q<0  -> cash in  (positive)
                gross = abs(q) * abs(p)
                cash_effect = (-gross) if q > 0 else (+gross)
            else:
                # qty==0: fees/commissions/taxes (p<0) reduce cash; dividends (p>0) increase cash
                cash_effect = p

            cash_change += cash_effect

            if op in external_ops:
                external_flow += cash_effect  # deposits/withdrawals/transfers excluded from returns

        # Update cash & compute equity
        cash_balance += cash_change
        equity = total_market_value + cash_balance

        # --- NEW: daily TWR ---
        if equity_prev is None or abs(equity_prev) < 1e-12:
            r_t = 0.0
        else:
            r_t = (equity - equity_prev - external_flow) / equity_prev

        twr_cum *= (1.0 + r_t)
        equity_prev = equity

        # Compute portfolio-level net unrealised pnl defensively from totals
        # net_unrealised should reflect unrealised P/L = market_value - cost-basis
        # (total_value is the cost-basis of remaining holdings). Previously this
        # used total_cost_spent (cumulative buys) which is incorrect once sells
        # reduce the remaining cost-basis.
        net_unrealised = float(total_market_value - total_value)
        # Compute performance as (net_realized + unrealized) / total_cost_spent
        # effective_cost = total_cost_spent if total_cost_spent > 1e-9 else 0.0
        try:
            # keep existing pct behavior (legacy): uses total_cost_spent gating
            pct = net_unrealised / total_value * 100.0 if total_cost_spent else 0.0
        except Exception:
            pct = 0.0

        # Unrealized ROI on remaining cost basis (explicit, always computed when cost basis exists)
        try:
            pct_unrealized = (net_unrealised / total_value * 100.0) if total_value else 0.0
        except Exception:
            pct_unrealized = 0.0

        row = {
            'date': date.strftime('%Y-%m-%d'),
            'total_value': total_value,
            'total_market_value': total_market_value,
            'net_unrealized_pnl': net_unrealised,
            'pct': pct,
            # cumulative realized gains (portfolio-level)
            'realized_pnl': total_realized,
            # cumulative total cost spent (sum of buy amounts up to this date)
            'total_cost_spent': total_cost_spent,
            # Removed pct_from_first - frontend normalizes total_market_value to percent-from-first
        }
        # --- NEW: expose cash, equity and TWR metrics while keeping existing fields ---
        try:
            row.update({
                'cash': float(cash_balance),
                'equity': float(equity),
                'twr_daily_pct': float(r_t * 100.0),
                'twr_cum_pct': float((twr_cum - 1.0) * 100.0),
                'unrealized_pct': float(pct_unrealized),
            })
        except Exception:
            # Defensive: if conversion fails, still return base row
            pass
        if debug:
            row['details'] = day_details
        values.append(row)
    return values


def compute_ticker_performance(portfolio_name, ticker, start_date=None, _skip_cache=False, uid=None):
    if not _skip_cache:
        return get_cached_ticker_performance(portfolio_name, ticker, start_date)
    """
    Compute the historical value of a single ticker in a portfolio over time, using its transaction history and price history.
    Returns a list of dicts: [{date: ..., value: ..., abs_value: ..., pct: ...}, ...]
    'value' is the net value (market value minus cost spent), 'pct' is the performance % relative to the cost spent for that ticker up to that date.
    'abs_value' contains the absolute market value - frontend can compute percent-from-first using normalizeToPercent.
    """
    # Normalize matching: consider common alternate fields and compare uppercase trimmed values
    def _extract_ticker_from_tx(t):
        for key in ('ticker', 'assetSymbol', 'asset_symbol', 'symbol'):
            v = t.get(key)
            if isinstance(v, str) and v.strip():
                return v.strip().upper()
        return None

    ticker_norm = ticker.strip().upper() if isinstance(ticker, str) else ticker
    txs_all = _get_transactions_for(portfolio_name, uid=uid) or []
    txs_all = _normalize_transactions_signs(txs_all)
    txs = [t for t in txs_all if _extract_ticker_from_tx(t) == ticker_norm]
    if not txs:
        return []
    import pandas as pd
    df_txs = pd.DataFrame(txs)
    # Diagnostic: ensure required columns are present; require 'date' and 'quantity'
    required_cols = {'date', 'quantity'}
    missing = required_cols - set(df_txs.columns)
    if df_txs.empty or missing:
        try:
            import logging
            logger = None
            try:
                # prefer flask logger when available
                from flask import current_app
                logger = current_app.logger
            except Exception:
                logger = logging.getLogger('backend.core.portfolio')
            logger.info(f"[DIAG] compute_ticker_performance early return for portfolio={portfolio_name} ticker={ticker} uid={uid} df_txs_empty={df_txs.empty} missing_cols={sorted(list(missing))} txs_sample={txs[:5]}")
        except Exception:
            pass
        return []
    # If 'price' column is missing, fill with zeros (we can still compute market value via ticker history)
    if 'price' not in df_txs.columns:
        try:
            from flask import current_app
            current_app.logger.info(f"[DIAG] compute_ticker_performance: 'price' missing for portfolio={portfolio_name} ticker={ticker}, filling with zeros")
        except Exception:
            pass
        df_txs['price'] = 0.0
    df_txs['date'] = pd.to_datetime(df_txs['date'])
    hist = _get_ticker_history_for(ticker, uid=uid)
    if not hist:
        data, _ = data_fetcher.fetch_with_cache(ticker)
        history = (data or {}).get('history', [])
        if history:
            save_ticker_data(ticker, data)
            hist = _get_ticker_history_for(ticker, uid=uid)
    if not hist:
        return []
    df_hist = pd.DataFrame(hist)
    if df_hist.empty or 'date' not in df_hist.columns or 'close' not in df_hist.columns:
        try:
            import logging
            logger = None
            try:
                from flask import current_app
                logger = current_app.logger
            except Exception:
                logger = logging.getLogger('backend.core.portfolio')
            logger.info(f"[DIAG] compute_ticker_performance: bad history for ticker={ticker} portfolio={portfolio_name} uid={uid} df_hist_empty={df_hist.empty} cols={list(df_hist.columns)} sample_hist={(hist[:3] if isinstance(hist, list) else None)}")
        except Exception:
            pass
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
        # Reconstruct remaining quantity and running cost basis using PMC logic identical to portfolio-level
        txs_to_date = df_txs[df_txs['date'] <= date].sort_values('date') if not df_txs.empty else pd.DataFrame()
        remaining_qty = 0.0
        running_cost = 0.0
        hist_series = df_hist['close']
        if not txs_to_date.empty:
            for _, row in txs_to_date.iterrows():
                try:
                    t_qty = float(row.get('quantity', 0) or 0)
                except Exception:
                    t_qty = 0.0
                try:
                    t_price = float(row.get('price', 0) or 0)
                except Exception:
                    t_price = 0.0
                if t_qty > 0 and (not t_price or t_price <= 0):
                    # attempt amount inference
                    for k in ('amount', 'total', 'cost'):
                        try:
                            amt = float(row.get(k, 0) or 0)
                        except Exception:
                            amt = 0.0
                        if amt > 0 and t_qty != 0:
                            inferred = amt / t_qty
                            if inferred > 0:
                                t_price = inferred
                                break
                    if t_price <= 0:
                        try:
                            tx_date = row.get('date')
                            tx_price = hist_series.loc[:tx_date].ffill().iloc[-1] if not hist_series.loc[:tx_date].empty else None
                            if tx_price is not None and not pd.isna(tx_price):
                                t_price = float(tx_price)
                        except Exception:
                            pass
                if t_qty > 0:
                    running_cost += t_qty * t_price
                    remaining_qty += t_qty
                elif t_qty < 0:
                    sell_qty = -t_qty
                    if remaining_qty > 0:
                        if sell_qty >= remaining_qty:
                            running_cost = 0.0
                            remaining_qty = 0.0
                        else:
                            try:
                                cost_removed = (sell_qty / remaining_qty) * running_cost if remaining_qty else 0.0
                            except Exception:
                                cost_removed = 0.0
                            running_cost -= cost_removed
                            remaining_qty -= sell_qty
                            if running_cost < 0:
                                running_cost = 0.0
                            if remaining_qty < 0:
                                remaining_qty = 0.0
                    else:
                        remaining_qty = 0.0
                        running_cost = 0.0
        qty = remaining_qty
        cost_sum = running_cost
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
        # Removed pct_from_start computation - frontend will compute this from abs_value using normalizeToPercent
        values.append({'date': date.strftime('%Y-%m-%d'), 'value': net_value, 'abs_value': abs_value, 'pct': pct})
    return values


def compute_benchmark_performance(ticker, uid=None):
    """
    Compute the historical performance of a benchmark ticker (not tied to a portfolio).
    Returns a list of dicts: [{date: ..., value: ..., abs_value: ..., pct: ...}, ...]
    'value' and 'abs_value' are the same (no cost basis), 'pct' is percent change from the first value.
    Frontend can compute percent-from-first using normalizeToPercent on the abs_value series.
    """
    hist = _get_ticker_history_for(ticker, uid=uid)
    if not hist:
        data, _ = data_fetcher.fetch_with_cache(ticker)
        history = (data or {}).get('history', [])
        if history:
            save_ticker_data(ticker, data)
            hist = _get_ticker_history_for(ticker, uid=uid)
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
        # Removed pct_from_first - frontend will compute this from abs_value using normalizeToPercent
        values.append({'date': date.strftime('%Y-%m-%d'), 'value': abs_value, 'abs_value': abs_value, 'pct': pct})
    return values


def get_overall_asset_allocation(portfolio_name, uid=None):
    """
    Returns a list of dicts: [{ticker, value, quantity, name, allocation_pct} ...] for all tickers in the portfolio, with their current value, quantity, and allocation as a percentage of total portfolio value.
    """
    txs = _get_transactions_for(portfolio_name, uid=uid)
    positions = aggregate_positions(txs)
    allocation = []
    total_value = 0.0
    temp_alloc = []
    for ticker, qty in positions.items():
        if qty == 0:
            continue
        try:
            data, _ = _get_ticker_data_for(ticker, uid=uid)
            info = (data or {}).get('info', {})
            price = info.get('regularMarketPrice')
            if not price:
                try:
                    fetched, _ = data_fetcher.fetch_with_cache(ticker)
                    if fetched:
                        try:
                            save_ticker_data(ticker, fetched)
                        except Exception:
                            pass
                        info = (fetched or {}).get('info', {}) or info
                except Exception:
                    pass
            price = price or info.get('currentPrice') or info.get('lastPrice') or 0
            name = info.get('shortName') or info.get('name') or ticker
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


def get_asset_allocation_by_category_and_risk(portfolio_name, uid=None):
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
    # Local import to avoid circular imports. Prefer user-scoped variant when uid is provided.
    try:
        if uid:
            from db.portfolios import get_portfolio_status_saved_user
            status_doc, _, _ = get_portfolio_status_saved_user(uid, portfolio_name)
        else:
            from db.portfolios import get_portfolio_status_saved
            status_doc, _, _ = get_portfolio_status_saved(portfolio_name)
        holdings = status_doc.get("holdings", []) or []
        # Compute total_value from holdings to ensure percentages are
        # derived from the actual summed holdings values. Use the saved
        # `total_market_value` (preferred) or per-holding `market_value` is
        # now the canonical measure for current allocations. Fall back to
        # the legacy `value` when market_value is not present for
        # compatibility with older docs.
        computed_total = 0.0
        for h in holdings:
            try:
                # prefer market_value, fall back to legacy value
                val = h.get("market_value")
                if val is None:
                    val = h.get("value", 0)
                computed_total += float(val or 0.0)
            except Exception:
                continue
        # Prefer an explicit total_market_value when present; otherwise
        # fall back to computed per-holding totals or the legacy total_value.
        total_value = float(computed_total) if computed_total else float(status_doc.get("total_market_value", status_doc.get("total_value", 0) or 0.0))
    except Exception:
        return {"total_value": 0.0, "by_category": {}, "by_risk": {}}

    by_category = {}
    by_risk = {}

    # Group values by category and risk
    for h in holdings:
        try:
            ticker = h.get("ticker") or h.get("ticker_symbol") or None
            # prefer market_value when present, fall back to legacy 'value'
            _val = h.get('market_value')
            if _val is None:
                _val = h.get('value', 0)
            value = float(_val or 0.0)
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


def get_asset_allocation_by_asset_type_and_total(portfolio_name, uid=None):
    """
    Returns allocation grouped by the user-specified 'asset_type' field stored
    in the `portfolio_holdings` Firestore document for the portfolio (if present).

    Returned structure:
      { 'total_value': float, 'by_asset_type': { asset_type: { value: float, pct: float, tickers: [...] }, ... } }

    If holdings are not present this returns empty groupings.
    Percentages are computed against the summed holdings values (computed_total).
    """
    try:
        if uid:
            from db.portfolios import get_portfolio_status_saved_user
            status_doc, _, _ = get_portfolio_status_saved_user(uid, portfolio_name)
        else:
            from db.portfolios import get_portfolio_status_saved
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
            # prefer market_value (current valuation) and fall back to legacy 'value'
            _v = h.get('market_value')
            if _v is None:
                _v = h.get('value', 0)
            value = float(_v or 0.0)
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


def get_asset_allocation_by_asset_type(portfolio_name, uid=None):
    """
    Thin wrapper that returns only the by_asset_type mapping with total_value.
    """
    try:
        full = get_asset_allocation_by_asset_type_and_total(portfolio_name, uid=uid)
        return { 'total_value': full.get('total_value', 0.0), 'by_asset_type': full.get('by_asset_type', {}) }
    except Exception:
        return { 'total_value': 0.0, 'by_asset_type': {} }


def compute_returns_since(portfolio_name, start_date, uid=None):
    """
    Compute the portfolio and per-ticker returns since a given start_date (YYYY-MM-DD).
    Returns a dict:
    {
        'portfolio': { 'start_value': ..., 'end_value': ..., 'return_pct': ... },
        'tickers': { ticker: { 'start_value': ..., 'end_value': ..., 'return_pct': ... }, ... }
    }
    """
    import pandas as pd
    txs = _get_transactions_for(portfolio_name, uid=uid)
    txs = _normalize_transactions_signs(txs)
    if not txs:
        return {'portfolio': None, 'tickers': {}}
    if not txs:
        return {'portfolio': None, 'tickers': {}}
    df_txs = pd.DataFrame(txs)
    if df_txs.empty or 'date' not in df_txs.columns or 'ticker' not in df_txs.columns or 'quantity' not in df_txs.columns or 'price' not in df_txs.columns:
        return {'portfolio': None, 'tickers': {}}
    df_txs['date'] = pd.to_datetime(df_txs['date'])
    tickers = df_txs['ticker'].unique()
    ticker_histories = {}
    for ticker in tickers:
        hist = _get_ticker_history_for(ticker, uid=uid)
        if not hist:
            data, _ = data_fetcher.fetch_with_cache(ticker)
            history = (data or {}).get('history', [])
            if history:
                save_ticker_data(ticker, data)
                hist = _get_ticker_history_for(ticker, uid=uid)
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
    # Collect all available dates across tickers
    all_dates = set()
    for s in ticker_histories.values():
        all_dates.update(s.index)
    if not all_dates:
        return {'portfolio': None, 'tickers': {}}
    # Use the requested start_date (so we can ffill prices at-or-before it)
    start_dt = pd.to_datetime(start_date)
    # Use the latest available date across tickers as the end date
    end_dt = max(all_dates)
    # If there's no available data on or after the requested start_date, return empty
    if end_dt < start_dt:
        return {'portfolio': None, 'tickers': {}}
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
        # If there were holdings at the start, compute returns based on holding values
        if start_val:
            ticker_return = ((end_val - start_val) / start_val * 100)
        else:
            # Fallback: compute price-based percent change for the ticker
            try:
                ps = float(price_start) if price_start is not None else 0.0
            except Exception:
                ps = 0.0
            try:
                pe = float(price_end) if price_end is not None else 0.0
            except Exception:
                pe = 0.0
            if ps:
                ticker_return = ((pe - ps) / ps * 100)
            else:
                ticker_return = 0.0
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
def get_last_day_possible_returns(portfolio_name, uid=None):
    import pandas as pd
    txs = _get_transactions_for(portfolio_name, uid=uid)
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
    return compute_returns_since(portfolio_name, start_day.strftime('%Y-%m-%d'), uid=uid)

def get_weekly_returns(portfolio_name, uid=None):
    import pandas as pd
    today = pd.Timestamp.today().normalize()
    week_ago = today - pd.Timedelta(days=7)
    return compute_returns_since(portfolio_name, week_ago.strftime('%Y-%m-%d'), uid=uid)

def get_monthly_returns(portfolio_name, uid=None):
    import pandas as pd
    today = pd.Timestamp.today().normalize()
    month_ago = today - pd.Timedelta(days=30)
    return compute_returns_since(portfolio_name, month_ago.strftime('%Y-%m-%d'), uid=uid)

def get_three_month_returns(portfolio_name, uid=None):
    import pandas as pd
    today = pd.Timestamp.today().normalize()
    three_months_ago = today - pd.Timedelta(days=90)
    return compute_returns_since(portfolio_name, three_months_ago.strftime('%Y-%m-%d'), uid=uid)

def get_ytd_returns(portfolio_name, uid=None):
    import pandas as pd
    today = pd.Timestamp.today().normalize()
    ytd = pd.Timestamp(year=today.year, month=1, day=1)
    return compute_returns_since(portfolio_name, ytd.strftime('%Y-%m-%d'), uid=uid)

def get_one_year_return(portfolio_name, uid=None):
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
    return compute_returns_since(portfolio_name, one_year_ago.strftime('%Y-%m-%d'), uid=uid)

def get_ticker_returns_since(portfolio_name, ticker, start_date, uid=None):
    import pandas as pd
    def _extract_ticker_from_tx(t):
        for key in ('ticker', 'assetSymbol', 'asset_symbol', 'symbol'):
            v = t.get(key)
            if isinstance(v, str) and v.strip():
                return v.strip().upper()
        return None

    ticker_norm = ticker.strip().upper() if isinstance(ticker, str) else ticker
    txs_all = _get_transactions_for(portfolio_name, uid=uid) or []
    txs_all = _normalize_transactions_signs(txs_all)
    txs = [t for t in txs_all if _extract_ticker_from_tx(t) == ticker_norm]
    if not txs:
        return None
    df_txs = pd.DataFrame(txs)
    if df_txs.empty or 'date' not in df_txs.columns or 'quantity' not in df_txs.columns or 'price' not in df_txs.columns:
        return None
    df_txs['date'] = pd.to_datetime(df_txs['date'])
    hist = _get_ticker_history_for(ticker, uid=uid)
    if not hist:
        data, _ = data_fetcher.fetch_with_cache(ticker)
        history = (data or {}).get('history', [])
        if history:
            save_ticker_data(ticker, data)
            hist = _get_ticker_history_for(ticker, uid=uid)
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

def get_ticker_monthly_returns(portfolio_name, ticker, uid=None):
    import pandas as pd
    today = pd.Timestamp.today().normalize()
    month_ago = today - pd.Timedelta(days=30)
    return get_ticker_returns_since(portfolio_name, ticker, month_ago.strftime('%Y-%m-%d'), uid=uid)

def get_ticker_three_month_returns(portfolio_name, ticker, uid=None):
    import pandas as pd
    today = pd.Timestamp.today().normalize()
    three_months_ago = today - pd.Timedelta(days=90)
    return get_ticker_returns_since(portfolio_name, ticker, three_months_ago.strftime('%Y-%m-%d'), uid=uid)

def get_ticker_ytd_returns(portfolio_name, ticker, uid=None):
    import pandas as pd
    today = pd.Timestamp.today().normalize()
    ytd = pd.Timestamp(year=today.year, month=1, day=1)
    return get_ticker_returns_since(portfolio_name, ticker, ytd.strftime('%Y-%m-%d'), uid=uid)

def get_last_three_days_returns(portfolio_name, uid=None):
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
    return compute_returns_since(portfolio_name, three_days_ago.strftime('%Y-%m-%d'), uid=uid)

def get_ticker_three_days_returns(portfolio_name, ticker, uid=None):
    """
    Compute the returns for a single ticker in the portfolio for the last three days (from three days ago to today).
    Returns a dict:
        { 'start_value': ..., 'end_value': ..., 'return_pct': ... }
    """
    import pandas as pd
    today = pd.Timestamp.today().normalize()
    three_days_ago = today - pd.Timedelta(days=3)
    return get_ticker_returns_since(portfolio_name, ticker, three_days_ago.strftime('%Y-%m-%d'), uid=uid)

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

def compute_portfolio_volatility_1d(portfolio_name, window=DEFAULT_VOLATILITY_WINDOW, *, method='rolling', uid=None):
    """Compute rolling annualized portfolio volatility for the requested window.

    Added `uid` so user-scoped transaction data can be used (when present).
    """
    perf = compute_portfolio_performance(portfolio_name, uid=uid)
    import pandas as pd
    if not perf or len(perf) < 2:
        return pd.Series(dtype=float)
    df = pd.DataFrame(perf)
    # Use 'pct' as daily return in percent, convert to decimal
    if 'pct' not in df.columns:
        return pd.Series(dtype=float)
    returns = df['pct'] / 100.0
    return compute_volatility(returns, window=window, method=method)

def compute_portfolio_volatility(portfolio_name, window=None, *, method='rolling', uid=None):
    """Compute annualized portfolio volatility using full-history or rolling metrics."""
    perf = compute_portfolio_performance(portfolio_name, uid=uid)
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


def compute_ticker_volatility_for_period(portfolio_name, days, uid=None):
    """
    Compute annualized volatility for each ticker using a lookback in days.
    Returns dict {ticker: volatility}
    """
    import pandas as pd
    txs = _get_transactions_for(portfolio_name, uid=uid)
    if not txs:
        return {}
    df_txs = pd.DataFrame(txs)
    if df_txs.empty or 'ticker' not in df_txs.columns:
        return {}
    tickers = df_txs['ticker'].unique()
    result = {}
    for ticker in tickers:
        perf = compute_ticker_performance(portfolio_name, ticker, uid=uid)
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


def get_asset_allocation_by_region(portfolio_name, uid=None):
    """
    Returns a dict: {region: allocation_percentage, ...} for all tickers in the portfolio.
    Uses the `region` column from `ticker_info` when present; falls back to 'Unknown'.
    """
    txs = _get_transactions_for(portfolio_name, uid=uid)
    positions = aggregate_positions(txs)
    allocation = {}
    total_value = 0.0
    temp = {}
    for ticker, qty in positions.items():
        if qty == 0:
            continue
        try:
            data, _ = _get_ticker_data_for(ticker, uid=uid)
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
