"""
Portfolio and transaction related Firestore operations.
"""
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime
import os
import json
from .firestore_client import _ensure_client, COL_PORTFOLIOS, COL_TRANSACTIONS, COL_PORTFOLIO_STATUS, COL_PORTFOLIO_HOLDINGS, COL_TICKERS, firestore, LOG_FIRESTORE
from google.cloud.firestore_v1 import FieldFilter


def aggregate_positions(transactions: List[Dict[str, Any]]) -> Dict[str, float]:
    positions: Dict[str, float] = {}
    for t in transactions:
        try:
            qty = float(t.get("quantity", 0))
        except Exception:
            qty = 0.0
        ticker = t.get("ticker")
        if not ticker:
            continue
        positions[ticker] = positions.get(ticker, 0.0) + qty
    return positions


def create_portfolio(name: str) -> None:
    client = _ensure_client()
    if LOG_FIRESTORE:
        print(f"[firestore][write] {COL_PORTFOLIOS}/{name} (create/merge)")
    client.collection(COL_PORTFOLIOS).document(name).set({"name": name}, merge=True)


def save_transactions(portfolio: str, transactions: List[Dict[str, Any]], max_retries: int = 5, base_delay: float = 0.2) -> List[Dict[str, Any]]:
    client = _ensure_client()
    create_portfolio(portfolio)
    inserted: List[Dict[str, Any]] = []
    batch = client.batch()
    trans_col = client.collection(COL_TRANSACTIONS)
    for t in transactions:
        doc_ref = trans_col.document()
        payload = {
            "portfolio": portfolio,
            "ticker": t.get("ticker"),
            "quantity": float(t.get("quantity", 0)),
            "price": float(t.get("price", 0)),
            "date": t.get("date"),
            "label": t.get("label"),
            "name": t.get("name"),
            "created_at": firestore.SERVER_TIMESTAMP,
        }
        if LOG_FIRESTORE:
            print(f"[firestore][batch-write] {COL_TRANSACTIONS}/{doc_ref.id} ticker={payload['ticker']} date={payload['date']}")
        batch.set(doc_ref, payload)
        inserted.append({**payload, "id": doc_ref.id})

    unique = {t.get("ticker") for t in transactions if t.get("ticker")}
    from services import data_fetcher
    from .tickers import save_ticker_data
    for tk in unique:
        try:
            data, _ = data_fetcher.fetch_with_cache(tk)
            if data:
                save_ticker_data(tk, data, max_retries=max_retries, base_delay=base_delay)
        except Exception:
            pass

    batch.commit()
    if LOG_FIRESTORE:
        print(f"[firestore][batch-commit] Inserted {len(transactions)} transactions into {COL_TRANSACTIONS}")

    # Remove any Firestore sentinel values (e.g., SERVER_TIMESTAMP) from the
    # returned inserted payloads so they are JSON-serializable when returned
    # by the API.
    for item in inserted:
        if 'created_at' in item:
            # created_at is a sentinel (not JSON serializable) until Firestore
            # resolves it; unset it for API responses.
            item.pop('created_at', None)

    try:
        from core.portfolio import clear_performance_caches
        clear_performance_caches(portfolio)
    except Exception:
        pass
    return inserted


def get_transactions(portfolio: Optional[str] = None) -> List[Dict[str, Any]]:
    client = _ensure_client()
    col = client.collection(COL_TRANSACTIONS)
    if portfolio:
        if LOG_FIRESTORE:
            print(f"[firestore][query] {COL_TRANSACTIONS} WHERE portfolio == {portfolio} ORDER BY date")
        docs = col.where(filter=FieldFilter("portfolio", "==", portfolio)).order_by("date").stream()
    else:
        if LOG_FIRESTORE:
            print(f"[firestore][query] {COL_TRANSACTIONS} ORDER BY date (all portfolios)")
        docs = col.order_by("date").stream()
    rows: List[Dict[str, Any]] = []
    for d in docs:
        r = d.to_dict() or {}
        r["id"] = d.id
        rows.append(r)
    if LOG_FIRESTORE:
        print(f"[firestore][read-result] fetched {len(rows)} transactions")
    return rows


def get_transaction_by_id(transaction_id: str) -> Optional[Dict[str, Any]]:
    client = _ensure_client()
    if LOG_FIRESTORE:
        print(f"[firestore][read] {COL_TRANSACTIONS}/{transaction_id}")
    doc = client.collection(COL_TRANSACTIONS).document(transaction_id).get()
    if not doc.exists:
        return None
    r = doc.to_dict() or {}
    r["id"] = doc.id
    return r


def delete_transaction(portfolio_name: str, transaction_id: str) -> None:
    client = _ensure_client()
    if LOG_FIRESTORE:
        print(f"[firestore][delete] {COL_TRANSACTIONS}/{transaction_id}")
    client.collection(COL_TRANSACTIONS).document(transaction_id).delete()
    try:
        from core.portfolio import clear_performance_caches
        clear_performance_caches(portfolio_name)
    except Exception:
        pass


def update_transaction(portfolio_name: str, transaction_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update an existing transaction document with a restricted set of fields.

    Returns the updated transaction dict or None if not found.
    """
    client = _ensure_client()
    doc_ref = client.collection(COL_TRANSACTIONS).document(transaction_id)
    snap = doc_ref.get()
    if not snap.exists:
        return None
    current = snap.to_dict() or {}
    # Only allow mutating these fields
    allowed = {"ticker", "quantity", "price", "date", "label", "name"}
    payload: Dict[str, Any] = {}
    for k, v in updates.items():
        if k in allowed:
            if k in ("quantity", "price"):
                try:
                    payload[k] = float(v)
                except Exception:
                    continue  # skip invalid numeric
            else:
                payload[k] = v
    if not payload:
        return {**current, "id": transaction_id}  # nothing to change
    if LOG_FIRESTORE:
        print(f"[firestore][update] {COL_TRANSACTIONS}/{transaction_id} fields={list(payload.keys())}")
    doc_ref.set(payload, merge=True)
    updated = {**current, **payload, "id": transaction_id}
    try:
        from core.portfolio import clear_performance_caches
        clear_performance_caches(portfolio_name)
    except Exception:
        pass
    return updated


def get_all_portfolio_names() -> List[str]:
    client = _ensure_client()
    if LOG_FIRESTORE:
        print(f"[firestore][query] {COL_PORTFOLIOS} (all)")
    docs = client.collection(COL_PORTFOLIOS).stream()
    names = [d.id for d in docs]
    if LOG_FIRESTORE:
        print(f"[firestore][read-result] {len(names)} portfolios: {names}")
    return names


def delete_portfolio(portfolio_name: str) -> None:
    client = _ensure_client()
    # Stream all transaction documents for the portfolio and delete in batches
    trans_iter = client.collection(COL_TRANSACTIONS).where(filter=FieldFilter("portfolio", "==", portfolio_name)).stream()
    refs = [d.reference for d in trans_iter]
    try:
        # Firestore batch commit supports up to 500 operations; use a safe margin
        max_batch = 450
        for i in range(0, len(refs), max_batch):
            batch = client.batch()
            chunk = refs[i:i+max_batch]
            for ref in chunk:
                batch.delete(ref)
            if LOG_FIRESTORE:
                print(f"[firestore][batch-commit] Deleting {len(chunk)} transactions for portfolio {portfolio_name}")
            batch.commit()

        # Delete holdings and portfolio documents after transactions removed
        batch = client.batch()
        batch.delete(client.collection(COL_PORTFOLIO_HOLDINGS).document(portfolio_name))
        batch.delete(client.collection(COL_PORTFOLIOS).document(portfolio_name))
        batch.commit()
    except Exception as e:
        # Log and re-raise so callers can surface errors to clients
        if LOG_FIRESTORE:
            print(f"[firestore][error] Failed to delete portfolio {portfolio_name}: {e}")
        raise
    try:
        from core.portfolio import clear_performance_caches
        clear_performance_caches(portfolio_name)
    except Exception:
        pass


def save_portfolio_status(portfolio: str, status: Dict[str, Any]) -> None:
    client = _ensure_client()
    # Save total value metadata in portfolio_status collection
    payload = {"total_value": float(status.get("total_value", 0)), "last_updated": firestore.SERVER_TIMESTAMP, "updated_at": firestore.SERVER_TIMESTAMP}
    client.collection(COL_PORTFOLIO_STATUS).document(portfolio).set(payload, merge=True)
    # Save holdings as a single document under COL_PORTFOLIO_HOLDINGS with document id == portfolio
    # Merge any existing per-holding metadata (risk, category, asset_type) so a status save
    # doesn't wipe user-provided metadata or create placeholder-only entries.
    holdings_list: List[Dict[str, Any]] = []
    # Read existing holdings document to preserve metadata
    doc_ref = client.collection(COL_PORTFOLIO_HOLDINGS).document(portfolio)
    existing_doc = doc_ref.get()
    existing_holdings = []
    if existing_doc.exists:
        existing_holdings = existing_doc.to_dict().get('holdings', []) or []
    existing_meta_by_ticker: Dict[str, Dict[str, Any]] = { h.get('ticker'): dict(h) for h in existing_holdings if h.get('ticker') }

    for h in status.get("holdings", []) or []:
        ticker = h.get('ticker')
        payload_h: Dict[str, Any] = {
            "ticker": ticker,
            "name": h.get("name"),
            "quantity": float(h.get("quantity", 0)),
            "price": float(h.get("price", 0)),
            "value": float(h.get("value", 0)),
        }
        # Merge known metadata from existing holdings (if present)
        if ticker and ticker in existing_meta_by_ticker:
            existing_entry = existing_meta_by_ticker.get(ticker) or {}
            # Preserve user metadata keys if they exist
            if 'risk' in existing_entry:
                payload_h['risk'] = existing_entry.get('risk')
            if 'category' in existing_entry:
                payload_h['category'] = existing_entry.get('category')
            if 'asset_type' in existing_entry:
                payload_h['asset_type'] = existing_entry.get('asset_type')
        holdings_list.append(payload_h)

    # Do not include sentinel values inside array elements (Firestore cannot serialize sentinels inside arrays)
    doc_ref.set({'portfolio': portfolio, 'holdings': holdings_list, 'last_updated': firestore.SERVER_TIMESTAMP, 'updated_at': firestore.SERVER_TIMESTAMP}, merge=True)


def get_portfolio_status_saved(portfolio: str) -> Tuple[Dict[str, Any], Optional[datetime], Optional[datetime]]:
    client = _ensure_client()
    doc = client.collection(COL_PORTFOLIO_STATUS).document(portfolio).get()
    if not doc.exists:
        transactions = get_transactions(portfolio)
        positions = aggregate_positions(transactions)
        holdings: List[Dict[str, Any]] = []
        total_value = 0.0
        from services import data_fetcher
        from .tickers import get_ticker_data
        for ticker, qty in positions.items():
            if qty == 0:
                continue
            data, _ = data_fetcher.fetch_with_cache(ticker)
            info = (data or {}).get("info", {})
            price = info.get("regularMarketPrice") or 0
            name = info.get("shortName") or ticker
            value = price * qty
            total_value += value
            holdings.append({"ticker": ticker, "name": name, "quantity": qty, "price": price, "value": value})
        save_portfolio_status(portfolio, {"total_value": total_value, "holdings": holdings})
        now = datetime.now()
        return {"total_value": total_value, "holdings": holdings}, now, now
    data = doc.to_dict() or {}
    last_updated = data.get("last_updated") if isinstance(data.get("last_updated"), datetime) else None
    updated_at = data.get("updated_at") if isinstance(data.get("updated_at"), datetime) else None
    # Read single holdings document by portfolio id
    holdings_doc = client.collection(COL_PORTFOLIO_HOLDINGS).document(portfolio).get()
    holdings = []
    if holdings_doc.exists:
        hd = holdings_doc.to_dict() or {}
        holdings = hd.get('holdings', [])
    return {"total_value": data.get("total_value", 0), "holdings": holdings}, last_updated, updated_at


def save_holdings_metadata(portfolio: str, metadata_map: Dict[str, Dict[str, Any]]) -> None:
    """Save per-holding metadata into portfolio_holdings documents.

    metadata_map is expected to be { ticker: { risk: str, category: str, asset_type: str }, ... }
    """
    client = _ensure_client()
    if LOG_FIRESTORE:
        print(f"[firestore][write] save_holdings_metadata for {portfolio} entries={len(metadata_map)}")
    # Read single holdings document
    doc_ref = client.collection(COL_PORTFOLIO_HOLDINGS).document(portfolio)
    doc = doc_ref.get()
    existing_holdings = []
    if doc.exists:
        existing_holdings = doc.to_dict().get('holdings', []) or []
    # If we don't have existing holdings data for some tickers we will attempt
    # to compute live holdings (name/quantity/price/value) from portfolio status
    live_holdings_map: Dict[str, Dict[str, Any]] = {}
    try:
        from core.portfolio import get_portfolio_status
        live_status = get_portfolio_status(portfolio)
        for h in (live_status.get('holdings') or []):
            if h.get('ticker'):
                live_holdings_map[h.get('ticker')] = {
                    'ticker': h.get('ticker'),
                    'name': h.get('name'),
                    'quantity': float(h.get('quantity', 0) or 0),
                    'price': float(h.get('price', 0) or 0),
                    'value': float(h.get('value', 0) or 0),
                }
    except Exception:
        # If live computation fails, we silently continue and create placeholders
        live_holdings_map = {}
    # Build a map by ticker to merge
    holdings_by_ticker: Dict[str, Dict[str, Any]] = { h.get('ticker'): dict(h) for h in existing_holdings if h.get('ticker') }
    # Merge metadata into existing holdings or create new entries
    for ticker, meta in metadata_map.items():
        if ticker in holdings_by_ticker:
            entry = holdings_by_ticker[ticker]
            if 'risk' in meta:
                entry['risk'] = meta.get('risk')
            if 'category' in meta:
                entry['category'] = meta.get('category')
            if 'assetType' in meta:
                entry['asset_type'] = meta.get('assetType')
            # Ensure standard holding fields exist: if existing doc only contained
            # metadata (risk/category/asset_type) try to enrich with live-computed
            # values so consumers see ticker/name/quantity/price/value as well.
            live = live_holdings_map.get(ticker)
            if live:
                # Only fill missing or falsy fields so we don't overwrite user data
                if not entry.get('name') and live.get('name') is not None:
                    entry['name'] = live.get('name')
                if ('quantity' not in entry or entry.get('quantity') in (None, 0)) and live.get('quantity') is not None:
                    try:
                        entry['quantity'] = float(live.get('quantity', 0))
                    except Exception:
                        entry['quantity'] = 0.0
                if ('price' not in entry or entry.get('price') in (None, 0)) and live.get('price') is not None:
                    try:
                        entry['price'] = float(live.get('price', 0))
                    except Exception:
                        entry['price'] = 0.0
                if ('value' not in entry or entry.get('value') in (None, 0)) and live.get('value') is not None:
                    try:
                        entry['value'] = float(live.get('value', 0))
                    except Exception:
                        entry['value'] = 0.0
        else:
            # create new entry: prefer live computed holding details when available
            if ticker in live_holdings_map:
                new_entry = dict(live_holdings_map.get(ticker))
            else:
                new_entry = {
                    'ticker': ticker,
                    'name': None,
                    'quantity': 0.0,
                    'price': 0.0,
                    'value': 0.0,
                }
            if 'risk' in meta:
                new_entry['risk'] = meta.get('risk')
            if 'category' in meta:
                new_entry['category'] = meta.get('category')
            if 'assetType' in meta:
                new_entry['asset_type'] = meta.get('assetType')
            holdings_by_ticker[ticker] = new_entry
    # Write back combined holdings list
    combined = list(holdings_by_ticker.values())
    # Persist holdings and update portfolio_status updated_at timestamp too
    doc_ref.set({'portfolio': portfolio, 'holdings': combined, 'last_updated': firestore.SERVER_TIMESTAMP, 'updated_at': firestore.SERVER_TIMESTAMP}, merge=True)
    try:
        # Also mark portfolio status as updated so consumers know metadata changed
        client.collection(COL_PORTFOLIO_STATUS).document(portfolio).set({'updated_at': firestore.SERVER_TIMESTAMP}, merge=True)
    except Exception:
        pass


def save_portfolio_targets(portfolio: str, mode: str, targets: Dict[str, float]) -> None:
    """Persist user-defined target allocations under the portfolio status document.

    mode: 'asset_type' or 'risk'
    targets: map of key -> percent (numbers)
    """
    client = _ensure_client()
    if LOG_FIRESTORE:
        print(f"[firestore][write] save_portfolio_targets for {portfolio} mode={mode} entries={len(targets)}")
    doc_ref = client.collection(COL_PORTFOLIO_STATUS).document(portfolio)
    # write under 'targets' field: { asset_type: {...}, risk: {...} }
    payload = { 'targets': { mode: targets }, 'updated_at': firestore.SERVER_TIMESTAMP }
    # merge to preserve other fields
    doc_ref.set(payload, merge=True)


def migrate_from_sqlite(sqlite_path: str = "ticker_data.db") -> None:
    """Migrate legacy SQLite data (tickers and transactions) into Firestore.

    This is a best-effort importer. Run on a copy of the sqlite db if you
    want to be safe. It writes into the `tickers_raw` and `transactions`
    collections.
    """
    import sqlite3
    if not os.path.exists(sqlite_path):
        print(f"No sqlite db at {sqlite_path} found. Skipping migration.")
        return
    client = _ensure_client()
    conn = sqlite3.connect(sqlite_path)
    cursor = conn.cursor()
    # Migrate tickers
    try:
        cursor.execute('SELECT ticker, data, last_updated FROM tickers')
        for ticker, data_json, last_updated in cursor.fetchall():
            try:
                data = json.loads(data_json) if data_json else None
            except Exception:
                data = None
            payload = {"data": data, "last_updated": last_updated}
            client.collection(COL_TICKERS).document(ticker).set(payload)
    except Exception:
        pass
    # Migrate transactions
    try:
        cursor.execute('SELECT id, portfolio, ticker, quantity, price, date, label, name FROM transactions')
        for row in cursor.fetchall():
            tid, portfolio, ticker, quantity, price, date, label, name = row
            payload = {"portfolio": portfolio, "ticker": ticker, "quantity": quantity, "price": price, "date": date, "label": label, "name": name}
            client.collection(COL_TRANSACTIONS).document(str(tid)).set(payload)
    except Exception:
        pass
    conn.close()
    print("Migration to Firestore attempted. Verify data in Firestore console.")