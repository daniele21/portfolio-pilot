"""
Ticker-related Firestore operations.
"""
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime
from .firestore_client import _ensure_client, COL_TICKER_INFO, COL_TICKER_HISTORY, firestore, LOG_FIRESTORE


def get_ticker_data(ticker_symbol: str) -> Tuple[Optional[Dict[str, Any]], Optional[datetime]]:
    client = _ensure_client()
    # Read cached ticker info from the ticker_info collection. We intentionally
    # avoid storing a duplicate 'data' document under tickers_raw; use ticker_info
    # for metadata and ticker_history for daily values.
    if LOG_FIRESTORE:
        print(f"[firestore][read] ticker info -> {COL_TICKER_INFO}/{ticker_symbol}")
    doc = client.collection(COL_TICKER_INFO).document(ticker_symbol).get()
    if not doc.exists:
        if LOG_FIRESTORE:
            print(f"[firestore][miss] {COL_TICKER_INFO}/{ticker_symbol}")
        return None, None
    info = doc.to_dict() or {}
    if LOG_FIRESTORE:
        print(f"[firestore][hit] {COL_TICKER_INFO}/{ticker_symbol} fields={list(info.keys())}")
    # Return a minimal 'data' shape containing 'info' (history is fetched separately)
    updated_at = info.get("updated_at") if isinstance(info.get("updated_at"), datetime) else None
    return {"info": info}, updated_at


def save_ticker_data(ticker_symbol: str, data: Dict[str, Any], max_retries: int = 5, base_delay: float = 0.2) -> None:
    client = _ensure_client()
    attempt = 0
    while True:
        try:
            # Store info metadata with an 'updated_at' timestamp. We do not persist
            # the full combined 'data' object in a separate collection.
            info = data.get("info") or {}
            info_payload = dict(info)
            info_payload["updated_at"] = firestore.SERVER_TIMESTAMP
            if LOG_FIRESTORE:
                print(f"[firestore][write] {COL_TICKER_INFO}/{ticker_symbol} (info keys={list(info_payload.keys())})")
            client.collection(COL_TICKER_INFO).document(ticker_symbol).set(info_payload, merge=True)

            history = data.get("history") or []
            if history:
                # Store history as a single document per ticker under COL_TICKER_HISTORY.
                # Path: COL_TICKER_HISTORY / <TICKER> -> { history: [ {date, open, close, high, low, volume}, ... ] }
                hist_list = []
                for h in history:
                    h_date = h.get("date") or h.get("Date")
                    if not h_date:
                        continue
                    hist_list.append({
                        "date": str(h_date),
                        "open": h.get("open") if "open" in h else h.get("Open"),
                        "close": h.get("close") if "close" in h else h.get("Close"),
                        "high": h.get("high") if "high" in h else h.get("High"),
                        "low": h.get("low") if "low" in h else h.get("Low"),
                        "volume": h.get("volume") if "volume" in h else h.get("Volume"),
                    })
                # Write the history list to the ticker document. Note: this overwrites the 'history' field;
                # use merge to preserve other fields on the document.
                hist_payload = {"history": hist_list, "history_updated_at": firestore.SERVER_TIMESTAMP}
                if LOG_FIRESTORE:
                    print(f"[firestore][write] {COL_TICKER_HISTORY}/{ticker_symbol} (history entries={len(hist_list)})")
                client.collection(COL_TICKER_HISTORY).document(ticker_symbol).set(hist_payload, merge=True)
                # Verification readback (non-fatal) to help debugging during development
                try:
                    saved = client.collection(COL_TICKER_HISTORY).document(ticker_symbol).get()
                    if saved.exists:
                        saved_data = saved.to_dict() or {}
                        saved_hist = saved_data.get("history") or []
                        if LOG_FIRESTORE:
                            print(f"[firestore][verify] saved history entries={len(saved_hist)} for {ticker_symbol}")
                except Exception:
                    if LOG_FIRESTORE:
                        print(f"[firestore][verify] failed to read back history for {ticker_symbol}")
            return
        except Exception:
            if attempt < max_retries:
                import time
                time.sleep(base_delay * (2 ** attempt))
                attempt += 1
                continue
            raise


def get_ticker_history(ticker: str) -> List[Dict[str, Any]]:
    client = _ensure_client()
    try:
        doc = client.collection(COL_TICKER_HISTORY).document(ticker).get()
        if not doc.exists:
            return []
        d = doc.to_dict() or {}
        return d.get("history", [])
    except Exception:
        return []
