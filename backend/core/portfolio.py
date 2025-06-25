from collections import defaultdict
from datetime import datetime
import pandas as pd
import sqlite3
from db.database import (
    get_transactions,
    aggregate_positions,
    get_ticker_history,
    save_ticker_data,
    DATABASE_NAME
)
from services import data_fetcher


def get_portfolio_status(portfolio_name):
    """Return current holdings with latest prices using the new normalized ticker tables."""
    txs = get_transactions(portfolio_name)
    positions = aggregate_positions(txs)
    holdings = []
    total_value = 0.0
    conn = sqlite3.connect(DATABASE_NAME)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    for ticker, qty in positions.items():
        if qty == 0:
            continue
        # Get latest price from ticker_info
        cursor.execute('SELECT regularMarketPrice, shortName FROM ticker_info WHERE ticker = ?', (ticker,))
        row = cursor.fetchone()
        price = row['regularMarketPrice'] if row and row['regularMarketPrice'] is not None else 0
        name = row['shortName'] if row and row['shortName'] else ticker
        value = price * qty
        total_value += value
        holdings.append({
            "ticker": ticker,
            "name": name,
            "quantity": qty,
            "price": price,
            "value": value,
        })
    conn.close()
    return {"holdings": holdings, "total_value": total_value}


def get_performance(portfolio_name):
    """Compute simple performance trend using daily closes."""
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


def compute_portfolio_performance(portfolio_name):
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
    all_dates = sorted(all_dates)
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
            price = ticker_histories.get(ticker, pd.Series()).get(date, None)
            if price is None:
                price = ticker_histories.get(ticker, pd.Series()).loc[:date].ffill().iloc[-1] if not ticker_histories.get(ticker, pd.Series()).loc[:date].empty else 0.0
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


def compute_ticker_performance(portfolio_name, ticker):
    """
    Compute the historical value of a single ticker in a portfolio over time, using its transaction history and price history.
    Returns a list of dicts: [{date: ..., value: ..., pct: ...}, ...]
    'value' is the net value (market value minus cost spent), 'pct' is the performance % relative to the cost spent for that ticker up to that date.
    """
    txs = [t for t in get_transactions(portfolio_name) if t.get('ticker') == ticker]
    if not txs:
        return []
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
    values = []
    for date in all_dates:
        qty = df_txs[df_txs['date'] <= date]['quantity'].sum() if not df_txs.empty else 0.0
        # Cost basis: sum of all buy transactions up to this date
        cost = df_txs[(df_txs['date'] <= date) & (df_txs['quantity'] > 0)]
        cost_sum = (cost['quantity'] * cost['price']).sum() if not cost.empty else 0.0
        price = df_hist['close'].get(date, None)
        if price is None:
            price = df_hist['close'].loc[:date].ffill().iloc[-1] if not df_hist['close'].loc[:date].empty else 0.0
        abs_value = qty * (price if price is not None else 0.0)
        net_value = abs_value - cost_sum
        pct = (net_value / cost_sum * 100) if cost_sum else 0.0
        values.append({'date': date.strftime('%Y-%m-%d'), 'value': net_value, 'abs_value': abs_value, 'pct': pct})
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
    values = []
    first_value = None
    for date in all_dates:
        price = df_hist['close'].get(date, None)
        if price is None:
            price = df_hist['close'].loc[:date].ffill().iloc[-1] if not df_hist['close'].loc[:date].empty else 0.0
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
    txs = get_transactions(portfolio_name)
    positions = aggregate_positions(txs)
    allocation = []
    conn = sqlite3.connect(DATABASE_NAME)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    total_value = 0.0
    temp_alloc = []
    for ticker, qty in positions.items():
        if qty == 0:
            continue
        cursor.execute('SELECT regularMarketPrice, shortName FROM ticker_info WHERE ticker = ?', (ticker,))
        row = cursor.fetchone()
        price = row['regularMarketPrice'] if row and row['regularMarketPrice'] is not None else 0
        name = row['shortName'] if row and row['shortName'] else ticker
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
    conn.close()
    return allocation


def get_asset_allocation_by_quote_type(portfolio_name):
    """
    Returns a dict: {quoteType: allocation_percentage, ...} for all tickers in the portfolio, using quoteType from ticker_info.
    The allocation is the percentage of each quoteType's value over the total portfolio value.
    """
    txs = get_transactions(portfolio_name)
    positions = aggregate_positions(txs)
    allocation = {}
    conn = sqlite3.connect(DATABASE_NAME)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    total_value = 0.0
    temp = {}
    for ticker, qty in positions.items():
        if qty == 0:
            continue
        cursor.execute('SELECT regularMarketPrice, quoteType FROM ticker_info WHERE ticker = ?', (ticker,))
        row = cursor.fetchone()
        price = row['regularMarketPrice'] if row and row['regularMarketPrice'] is not None else 0
        quote_type = row['quoteType'] if row and row['quoteType'] else 'Unknown'
        value = price * qty
        total_value += value
        if quote_type not in temp:
            temp[quote_type] = 0.0
        temp[quote_type] += value
    # Now calculate allocation percentage for each quoteType
    for quote_type, value in temp.items():
        allocation[quote_type] = (value / total_value * 100) if total_value else 0.0
    conn.close()
    return allocation


def compute_returns_since(portfolio_name, start_date):
    """
    Compute the portfolio and per-ticker returns since a given start_date (YYYY-MM-DD).
    Returns a dict:
    {
        'portfolio': { 'start_value': ..., 'end_value': ..., 'return_pct': ... },
        'tickers': { ticker: { 'start_value': ..., 'end_value': ..., 'return_pct': ... }, ... }
    }
    """
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
    # print(f"[DEBUG] compute_returns_since: start_dt={start_dt}, end_dt={end_dt}")
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
    # print(f"[DEBUG] compute_returns_since: start_value={start_value}, end_value={end_value}")
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
        ticker_returns[ticker] = {
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

def get_ticker_returns_since(portfolio_name, ticker, start_date):
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

