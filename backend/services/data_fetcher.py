import os
import threading
import yfinance as yf
import requests
from datetime import datetime, timedelta, timezone
from db import database
import pandas as pd
from typing import Optional, Dict, Any, List, Tuple
from db.firestore_client import _ensure_client, COL_TICKER_INFO, COL_TICKER_HISTORY
from google.cloud import firestore as _firestore


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


def _looks_like_isin(s: Optional[str]) -> bool:
    """Return True if the provided string looks like an ISIN (basic validation)."""
    if not s or not isinstance(s, str):
        return False
    v = s.strip().upper()
    # Basic ISIN pattern: 2 letters (country) + 9 alphanumeric + 1 check digit
    import re
    return bool(re.fullmatch(r"[A-Z]{2}[A-Z0-9]{9}[0-9]", v))


def _yahoo_search_symbol(query: str) -> Optional[str]:
    """Search Yahoo Finance for a query (name or ISIN) and return the first symbol found."""
    try:
        url = "https://query2.finance.yahoo.com/v1/finance/search"
        resp = requests.get(url, params={'q': query, 'quotesCount': 10, 'newsCount': 0}, timeout=5)
        if resp.status_code != 200:
            return None
        data = resp.json()
        quotes = data.get('quotes', []) or []
        # prefer entries that look like equities (quoteType == 'EQUITY') but fall back to first symbol
        for q in quotes:
            if q.get('quoteType', '').upper() == 'EQUITY' and q.get('symbol'):
                return q.get('symbol')
        for q in quotes:
            if q.get('symbol'):
                return q.get('symbol')
        return None
    except Exception:
        return None


def _assemble_cached_response(ticker_symbol: str, cached: Dict[str, Any], last_updated: Optional[datetime]) -> Dict[str, Any]:
    """Build a response dict from cached 'info' and persisted history so the
    shape matches what fetch_from_yfinance returns for fresh fetches.
    """
    info = (cached or {}).get('info') or {}
    # Fetch stored history doc
    try:
        history_records = database.get_ticker_history(ticker_symbol) or []
    except Exception:
        history_records = []

    resolved_symbol = info.get('symbol') or info.get('shortName') or ticker_symbol
    meta = {
        'cached_at': (last_updated.isoformat() + 'Z') if last_updated is not None else None,
        'source': 'CACHE',
    }
    response = {
        'requested_symbol': ticker_symbol,
        'resolved_symbol': resolved_symbol,
        'info': info,
        'history': history_records,
        'events': {
            'actions': [],
            'dividends': [],
            'recommendations': [],
        },
        'meta': meta,
    }
    return response


def fetch_isin_by_name_and_ticker(name: Optional[str], ticker: Optional[str]) -> Optional[str]:
    """Try to find an ISIN by searching Yahoo using the asset name and ticker.

    Returns the ISIN string if found, otherwise None.
    """
    if not name and not ticker:
        return None
    query_parts = []
    if name:
        query_parts.append(str(name).strip())
    if ticker:
        query_parts.append(str(ticker).strip())
    query = " ".join(query_parts)
    try:
        found_symbol = _yahoo_search_symbol(query)
        if not found_symbol:
            return None
        # Try to fetch the ticker via yfinance and read an ISIN if exposed
        try:
            t = yf.Ticker(found_symbol)
            resolved_isin = None
            try:
                resolved_isin = t.get_isin() if hasattr(t, 'get_isin') else None
            except Exception:
                resolved_isin = None
            # Some yfinance versions may expose ISIN in info
            if not resolved_isin:
                info = getattr(t, 'info', None) or {}
                # attempt common keys
                resolved_isin = info.get('isin') or info.get('ISIN') or info.get('identifiers', {}).get('isin')
            if resolved_isin:
                return str(resolved_isin).strip().upper()
        except Exception:
            return None
    except Exception:
        return None
    return None


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
    last_error: Optional[Tuple[str, str]] = None  # (variant, category)

    # If the input looks like an ISIN, try letting yfinance resolve it first
    if _looks_like_isin(ticker_symbol):
        try:
            print(f"[fetch_from_yfinance] Input looks like ISIN; trying yfinance ISIN resolution for '{ticker_symbol}'")
            ticker = yf.Ticker(ticker_symbol)
            info = ticker.info or {}
            if info.get('shortName') or info.get('longName'):
                history_records = _extract_history(ticker, '1y')
                print(f"[fetch_from_yfinance] ISIN-resolved history_records count={len(history_records)} for {ticker_symbol}")
                actions_dict = _normalize_df(getattr(ticker, 'actions', None))
                dividends_dict = _normalize_df(getattr(ticker, 'dividends', None))
                recommendations_dict = _normalize_df(getattr(ticker, 'recommendations', None))
                response_data = {
                    'requested_symbol': ticker_symbol,
                    'resolved_symbol': getattr(ticker, 'ticker', ticker_symbol),
                    'info': info,
                    'history': history_records,
                    'events': {
                        'actions': actions_dict,
                        'dividends': dividends_dict,
                        'recommendations': recommendations_dict,
                    },
                    'meta': {
                        'fetched_at': datetime.utcnow().isoformat() + 'Z',
                        'variant_attempts': [ticker_symbol],
                    }
                }
                return response_data
            else:
                print(f"[fetch_from_yfinance] yfinance did not resolve ISIN '{ticker_symbol}' to a ticker name; trying Yahoo search for a symbol")
                # Try a Yahoo search for the asset name / ISIN to find a symbol
                found = _yahoo_search_symbol(ticker_symbol)
                if found:
                    try:
                        print(f"[fetch_from_yfinance] Yahoo search found symbol '{found}' for query '{ticker_symbol}'; attempting fetch")
                        ticker2 = yf.Ticker(found)
                        info2 = ticker2.info or {}
                        if info2.get('shortName') or info2.get('longName'):
                            history_records = _extract_history(ticker2, '1y')
                            print(f"[fetch_from_yfinance] Yahoo-found symbol history_records count={len(history_records)} for {found}")
                            actions_dict = _normalize_df(getattr(ticker2, 'actions', None))
                            dividends_dict = _normalize_df(getattr(ticker2, 'dividends', None))
                            recommendations_dict = _normalize_df(getattr(ticker2, 'recommendations', None))
                            # Attempt to read ISIN from the ticker object if yfinance exposes it
                            resolved_isin = None
                            try:
                                resolved_isin = ticker2.get_isin() if hasattr(ticker2, 'get_isin') else None
                            except Exception:
                                resolved_isin = None
                            response_data = {
                                'requested_symbol': ticker_symbol,
                                'resolved_symbol': found,
                                'resolved_isin': resolved_isin,
                                'info': info2,
                                'history': history_records,
                                'events': {
                                    'actions': actions_dict,
                                    'dividends': dividends_dict,
                                    'recommendations': recommendations_dict,
                                },
                                'meta': {
                                    'fetched_at': datetime.utcnow().isoformat() + 'Z',
                                    'variant_attempts': [ticker_symbol, found],
                                }
                            }
                            return response_data
                        else:
                            print(f"[fetch_from_yfinance] Yahoo-found symbol '{found}' did not return useful info; falling back to main flow")
                    except Exception as e:
                        print(f"[fetch_from_yfinance] Error fetching Yahoo-found symbol '{found}': {e}")
                else:
                    print(f"[fetch_from_yfinance] Yahoo search found no symbol for '{ticker_symbol}'")
        except Exception as e:
            category = _classify_yf_error(e)
            last_error = (ticker_symbol, category)
            print(f"[fetch_from_yfinance] Error while attempting ISIN resolution for '{ticker_symbol}' ({category}): {e}")

    # No symbol-variant fallback: either use ISIN-resolution or a single uppercase ticker lookup
    symbol_to_try = ticker_symbol.strip().upper()
    try:
        print(f"\033[91m[yf.Ticker] Trying symbol '{symbol_to_try}'\033[0m")
        ticker = yf.Ticker(symbol_to_try)
        info = ticker.info or {}
        if not info.get('shortName') and not info.get('longName'):
            print(f"[fetch_from_yfinance] Symbol '{symbol_to_try}' returned no shortName/longName; returning None.")
            return None

        history_records = _extract_history(ticker, '1y')
        print(f"[fetch_from_yfinance] history_records count={len(history_records)} for symbol {symbol_to_try}")
        actions_dict = _normalize_df(getattr(ticker, 'actions', None))
        dividends_dict = _normalize_df(getattr(ticker, 'dividends', None))
        recommendations_dict = _normalize_df(getattr(ticker, 'recommendations', None))

        response_data = {
            'requested_symbol': ticker_symbol,
            'resolved_symbol': symbol_to_try,
            'info': info,
            'history': history_records,
            'events': {
                'actions': actions_dict,
                'dividends': dividends_dict,
                'recommendations': recommendations_dict,
            },
            'meta': {
                'fetched_at': datetime.utcnow().isoformat() + 'Z',
                'variant_attempts': [symbol_to_try],
            }
        }
        return response_data
    except Exception as e:
        category = _classify_yf_error(e)
        print(f"[fetch_from_yfinance] Error for symbol '{symbol_to_try}' ({category}): {e}")
        return None


def fetch_with_cache(ticker_symbol, cache_duration=timedelta(hours=24)):
    """Return ticker data from cache if fresh, otherwise fetch from Yahoo Finance.

    Fixes naive vs. aware datetime subtraction by coercing all timestamps to UTC-aware.
    """
    # Allow default cache duration to be configured by env var TICKER_CACHE_HOURS
    if cache_duration is None:
        try:
            hours = int(os.getenv('TICKER_CACHE_HOURS', '24'))
            cache_duration = timedelta(hours=hours)
        except Exception:
            cache_duration = timedelta(hours=24)

    # In-process dedupe: avoid multiple threads in the same process fetching the same ticker
    # simultaneously which would cause duplicate external requests.
    # For cross-process coordination we use a Firestore-based lock document.
    _PENDING_FETCH_LOCKS = globals().setdefault('_PENDING_FETCH_LOCKS', {})
    lock = None
    try:
        cached, last_updated = database.get_ticker_data(ticker_symbol)
    except Exception:
        cached, last_updated = None, None

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
        try:
            assembled = _assemble_cached_response(ticker_symbol, cached, last_updated_utc)
            return assembled, "CACHE"
        except Exception:
            return cached, "CACHE"
    # Try to acquire a cross-process Firestore lock before fetching
    client = None
    try:
        client = _ensure_client()
    except Exception:
        client = None

    lock_acquired = False
    lock_doc_ref = None
    LOCK_COLLECTION = 'ticker_fetch_locks'
    LOCK_TTL_SECONDS = int(os.getenv('TICKER_FETCH_LOCK_TTL', '60'))
    try:
        if client:
            lock_doc_ref = client.collection(LOCK_COLLECTION).document(ticker_symbol)
            now_ts = datetime.utcnow().timestamp()
            expire_ts = now_ts + LOCK_TTL_SECONDS

            def _try_acquire(transaction):
                snap = lock_doc_ref.get(transaction=transaction)
                if snap.exists:
                    data = snap.to_dict() or {}
                    existing_expire = data.get('expire_at', 0)
                    # If existing lock expired, overwrite it
                    if existing_expire and existing_expire < now_ts:
                        transaction.set(lock_doc_ref, {'owner': os.environ.get('HOSTNAME', 'unknown'), 'ts': now_ts, 'expire_at': expire_ts})
                        return True
                    return False
                else:
                    transaction.set(lock_doc_ref, {'owner': os.environ.get('HOSTNAME', 'unknown'), 'ts': now_ts, 'expire_at': expire_ts})
                    return True

            try:
                client.transaction(_try_acquire)
                lock_acquired = True
            except Exception:
                lock_acquired = False
    except Exception:
        lock_acquired = False

    if lock_acquired:
        try:
            fresh = fetch_from_yfinance(ticker_symbol)
            if fresh:
                try:
                    database.save_ticker_data(ticker_symbol, fresh)
                except Exception:
                    pass
                return fresh, "YAHOO_FINANCE_API"
            return None, None
        finally:
            # release the lock document (best-effort)
            try:
                if lock_doc_ref and client:
                    lock_doc_ref.delete()
            except Exception:
                pass
    else:
        # Could not acquire lock: another process is likely fetching. Wait a short while and re-check DB.
        wait_seconds = int(os.getenv('TICKER_FETCH_LOCK_WAIT', '5'))
        try:
            import time
            time.sleep(wait_seconds)
            cached2, last_updated2 = database.get_ticker_data(ticker_symbol)
            if cached2 and last_updated2 and (now_utc - _coerce_utc(last_updated2)) < cache_duration:
                try:
                    assembled2 = _assemble_cached_response(ticker_symbol, cached2, _coerce_utc(last_updated2))
                    print(f"\033[92m[fetch_with_cache] Returning cached data after remote wait for {ticker_symbol}\033[0m")
                    return assembled2, "CACHE"
                except Exception:
                    print(f"\033[92m[fetch_with_cache] Returning raw cached data after remote wait for {ticker_symbol}\033[0m")
                    return cached2, "CACHE"
        except Exception:
            pass
        # Last resort: attempt a fetch ourselves (no coordination)
        try:
            fresh = fetch_from_yfinance(ticker_symbol)
            if fresh:
                try:
                    database.save_ticker_data(ticker_symbol, fresh)
                except Exception:
                    pass
                return fresh, "YAHOO_FINANCE_API"
        except Exception:
            pass
        return None, None
