import yfinance as yf
from datetime import datetime, timedelta, timezone
from db import database
import pandas as pd
from typing import Optional, Dict, Any, List, Tuple


def _classify_yf_error(exc: Exception) -> str:
    msg = str(exc).lower()
    if '404' in msg or 'not found' in msg:
        return 'symbol_not_found'
    if 'timed out' in msg or 'timeout' in msg:
        return 'network_timeout'
    if '429' in msg or 'too many requests' in msg or 'rate' in msg:
        return 'rate_limited'
    if 'ssl' in msg:
        return 'ssl_error'
    return 'unknown'


def _generate_symbol_variants(symbol: str) -> List[str]:
    variants = []
    core = symbol.strip()
    variants.append(core)
    # If it has a suffix like .MI try without it
    if '.' in core:
        base, suffix = core.split('.', 1)
        if base and suffix:
            variants.append(base)  # no suffix
    # Uppercase variant
    up = core.upper()
    if up not in variants:
        variants.append(up)
    return list(dict.fromkeys([v for v in variants if v]))  # dedupe


def _extract_history(ticker: yf.Ticker, period: str = '1y') -> List[Dict[str, Any]]:
    hist = ticker.history(period=period)
    if hist.empty:
        return []
    hist.reset_index(inplace=True)
    # Normalize the date index/column name
    if 'Date' not in hist.columns:
        if 'index' in hist.columns:
            hist.rename(columns={"index": "Date"}, inplace=True)
        else:
            hist.rename(columns={hist.columns[0]: "Date"}, inplace=True)
    hist['Date'] = pd.to_datetime(hist['Date'], errors='coerce')
    hist['Date'] = hist['Date'].dt.strftime('%Y-%m-%d')
    # Normalize column names to lowercase canonical keys
    col_map = {}
    for c in hist.columns:
        lc = c.strip().lower()
        if lc == 'date':
            col_map[c] = 'date'
        elif lc.startswith('open'):
            col_map[c] = 'open'
        elif lc.startswith('close'):
            col_map[c] = 'close'
        elif lc.startswith('high'):
            col_map[c] = 'high'
        elif lc.startswith('low'):
            col_map[c] = 'low'
        elif lc.startswith('volume'):
            col_map[c] = 'volume'
        else:
            col_map[c] = lc
    hist.rename(columns=col_map, inplace=True)
    records = hist.to_dict(orient='records')
    # Dedupe by date keeping the last occurrence
    seen = {}
    for r in records:
        d = r.get('date')
        if not d:
            continue
        seen[d] = {k: v for k, v in r.items() if k in {'date', 'open', 'close', 'high', 'low', 'volume'}}
    # Return list sorted by date
    out = [seen[k] for k in sorted(seen.keys())]
    return out


def _normalize_df(df: Optional[pd.DataFrame]) -> List[Dict[str, Any]]:
    if df is None or df.empty:
        return []
    df = df.reset_index()
    if 'Date' not in df.columns:
        if 'index' in df.columns:
            df.rename(columns={'index': 'Date'}, inplace=True)
        else:
            df.rename(columns={df.columns[0]: 'Date'}, inplace=True)
    df['Date'] = pd.to_datetime(df['Date'], errors='coerce')
    df['Date'] = df['Date'].dt.strftime('%Y-%m-%d')
    # Normalize column names and return canonical keys
    col_map = {}
    for c in df.columns:
        lc = c.strip().lower()
        if lc == 'date':
            col_map[c] = 'date'
        elif lc.startswith('open'):
            col_map[c] = 'open'
        elif lc.startswith('close'):
            col_map[c] = 'close'
        elif lc.startswith('high'):
            col_map[c] = 'high'
        elif lc.startswith('low'):
            col_map[c] = 'low'
        elif lc.startswith('volume'):
            col_map[c] = 'volume'
        else:
            col_map[c] = lc
    df.rename(columns=col_map, inplace=True)
    records = df.to_dict(orient='records')
    # Dedupe by date
    seen = {}
    for r in records:
        d = r.get('date')
        if not d:
            continue
        seen[d] = {k: v for k, v in r.items() if k in {'date', 'open', 'close', 'high', 'low', 'volume'}}
    out = [seen[k] for k in sorted(seen.keys())]
    return out


def fetch_from_yfinance(ticker_symbol: str) -> Optional[Dict[str, Any]]:
    """Fetch details about a ticker using yfinance with fallback variants and error classification.

    Returns None if the ticker cannot be resolved. Callers relying on previous behavior remain compatible.
    """
    print(f"\033[91m[fetch_from_yfinance] Fetching data from yfinance for {ticker_symbol}\033[0m")
    variants = _generate_symbol_variants(ticker_symbol)
    last_error: Optional[Tuple[str, str]] = None  # (variant, category)

    for variant in variants:
        try:
            print(f"\033[91m[yf.Ticker] Trying variant '{variant}'\033[0m")
            ticker = yf.Ticker(variant)
            info = ticker.info or {}
            if not info.get('shortName') and not info.get('longName'):
                print(f"[fetch_from_yfinance] Variant '{variant}' returned no shortName/longName; trying next.")
                last_error = (variant, 'symbol_not_found')
                continue

            history_records = _extract_history(ticker, '1y')
            print(f"[fetch_from_yfinance] history_records count={len(history_records)} for variant {variant}")
            actions_dict = _normalize_df(getattr(ticker, 'actions', None))
            dividends_dict = _normalize_df(getattr(ticker, 'dividends', None))
            recommendations_dict = _normalize_df(getattr(ticker, 'recommendations', None))

            response_data = {
                'requested_symbol': ticker_symbol,
                'resolved_symbol': variant,
                'info': info,
                'history': history_records,
                'events': {
                    'actions': actions_dict,
                    'dividends': dividends_dict,
                    'recommendations': recommendations_dict,
                },
                'meta': {
                    'fetched_at': datetime.utcnow().isoformat() + 'Z',
                    'variant_attempts': variants,
                }
            }
            return response_data
        except Exception as e:  # noqa: BLE001 (broad but we classify)
            category = _classify_yf_error(e)
            last_error = (variant, category)
            print(f"[fetch_from_yfinance] Error for variant '{variant}' ({category}): {e}")
            # Continue trying next variant unless rate limited
            if category in ('rate_limited', 'network_timeout'):
                print("[fetch_from_yfinance] Aborting further variants due to rate/timeout.")
                break

    if last_error:
        print(f"[fetch_from_yfinance] All variants failed. Last: {last_error[0]} ({last_error[1]}). Returning None.")
    else:
        print("[fetch_from_yfinance] No variants produced data and no explicit error tracked.")
    return None


def fetch_with_cache(ticker_symbol, cache_duration=timedelta(hours=24)):
    """Return ticker data from cache if fresh, otherwise fetch from Yahoo Finance.

    Fixes naive vs. aware datetime subtraction by coercing all timestamps to UTC-aware.
    """
    cached, last_updated = database.get_ticker_data(ticker_symbol)

    def _coerce_utc(dt: datetime | None) -> datetime | None:
        if dt is None:
            return None
        if dt.tzinfo is None:
            # Assume stored naive timestamps are UTC
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)

    now_utc = datetime.now(timezone.utc)
    last_updated_utc = _coerce_utc(last_updated)

    if cached and last_updated_utc and (now_utc - last_updated_utc) < cache_duration:
        print(f"\033[92m[fetch_with_cache] Returning cached data for {ticker_symbol}\033[0m")
        return cached, "CACHE"

    fresh = fetch_from_yfinance(ticker_symbol)
    if fresh:
        database.save_ticker_data(ticker_symbol, fresh)
        return fresh, "YAHOO_FINANCE_API"

    return None, None
