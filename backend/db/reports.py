"""
Report persistence helpers.
"""
from typing import Any, Dict, Optional
from datetime import datetime
from .firestore_client import _ensure_client, COL_PORTFOLIO_REPORTS, COL_TICKER_REPORTS, COL_PORTFOLIO_SUMUP, firestore


def save_portfolio_report(portfolio: str, report: Dict[str, Any], reference_date: Optional[str] = None, cost: Optional[float] = None) -> None:
    client = _ensure_client()
    if reference_date is None:
        reference_date = datetime.now().isoformat()
    # Persist as a single named document per portfolio for easy retrieval and update.
    # New document id format: '{portfolio}_risk'
    payload = {"report": report, "cost": float(cost) if cost is not None else None, "reference_date": reference_date, "created_at": firestore.SERVER_TIMESTAMP}
    client.collection(COL_PORTFOLIO_REPORTS).document(f"{portfolio}_risk").set(payload)


def get_portfolio_report(portfolio: str, reference_date: Optional[str] = None) -> Optional[Dict[str, Any]]:
    client = _ensure_client()
    col = client.collection(COL_PORTFOLIO_REPORTS)
    if reference_date:
        # Support legacy per-date documents as well as the new single-document naming.
        # Try new id first
        doc = col.document(f"{portfolio}_risk").get()
        if doc.exists:
            data = doc.to_dict() or {}
            # If caller requested a specific reference_date, verify it matches
            if data.get('reference_date') == reference_date:
                return {"report": data.get("report"), "cost": data.get("cost"), "reference_date": data.get("reference_date")}
        # Fallback to legacy per-date document id
        legacy_doc = col.document(f"{portfolio}__{reference_date}").get()
        if not legacy_doc.exists:
            return None
        data = legacy_doc.to_dict() or {}
        return {"report": data.get("report"), "cost": data.get("cost"), "reference_date": data.get("reference_date")}
    else:
        # First try the new single-document id
        doc = col.document(f"{portfolio}_risk").get()
        if doc.exists:
            data = doc.to_dict() or {}
            return {"report": data.get("report"), "cost": data.get("cost"), "reference_date": data.get("reference_date")}

        # Fallback to legacy per-date documents (ids starting with '{portfolio}__')
        docs = [d for d in client.collection(COL_PORTFOLIO_REPORTS).stream() if d.id.startswith(f"{portfolio}__")]
        if not docs:
            return None
        docs_sorted = sorted(docs, key=lambda d: (d.to_dict() or {}).get("created_at") or datetime.min, reverse=True)
        data = docs_sorted[0].to_dict() or {}
        return {"report": data.get("report"), "cost": data.get("cost"), "reference_date": data.get("reference_date")}


def save_ticker_report(ticker: str, report: Dict[str, Any], reference_date: Optional[str] = None, cost: Optional[float] = None) -> None:
    client = _ensure_client()
    if reference_date is None:
        reference_date = datetime.now().isoformat()
    payload = {"report": report, "cost": float(cost) if cost is not None else None, "reference_date": reference_date, "created_at": firestore.SERVER_TIMESTAMP}
    client.collection(COL_TICKER_REPORTS).document(f"{ticker}__{reference_date}").set(payload)


def get_ticker_report(ticker: str, reference_date: Optional[str] = None) -> Optional[Dict[str, Any]]:
    client = _ensure_client()
    col = client.collection(COL_TICKER_REPORTS)
    if reference_date:
        doc = col.document(f"{ticker}__{reference_date}").get()
        if not doc.exists:
            return None
        data = doc.to_dict() or {}
        return {"report": data.get("report"), "cost": data.get("cost"), "reference_date": data.get("reference_date")}
    else:
        docs = [d for d in client.collection(COL_TICKER_REPORTS).stream() if d.id.startswith(f"{ticker}__")]
        if not docs:
            return None
        docs_sorted = sorted(docs, key=lambda d: (d.to_dict() or {}).get("created_at") or datetime.min, reverse=True)
        data = docs_sorted[0].to_dict() or {}
        return {"report": data.get("report"), "cost": data.get("cost"), "reference_date": data.get("reference_date")}

# ---- Portfolio Sumup (daily) ----

def save_portfolio_sumup(portfolio: str, sumup: Dict[str, Any], reference_date: Optional[str] = None, cost: Optional[float] = None) -> None:
    """Persist a single daily sumup document. One per day.

    Document id pattern: {portfolio}_YYYY_MM_DD
    Collection: portfolio_sumup
    """
    client = _ensure_client()
    if reference_date is None:
        reference_date = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
    # derive date portion (UTC) for id
    try:
        dt = datetime.strptime(reference_date, '%Y-%m-%d %H:%M:%S')
    except Exception:
        dt = datetime.utcnow()
    doc_id = f"{portfolio}_{dt.strftime('%Y_%m_%d')}"
    payload = {
        "sumup": sumup,
        "cost": float(cost) if cost is not None else None,
        "reference_date": reference_date,
        "created_at": firestore.SERVER_TIMESTAMP,
    }
    client.collection(COL_PORTFOLIO_SUMUP).document(doc_id).set(payload)


def get_portfolio_sumup(portfolio: str, date: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Retrieve today's (UTC) sumup or a specific date.

    date format expected: YYYY-MM-DD. If None, uses today's UTC date.
    """
    client = _ensure_client()
    if date is None:
        date = datetime.utcnow().strftime('%Y-%m-%d')
    # Build id
    try:
        dt = datetime.strptime(date, '%Y-%m-%d')
    except Exception:
        return None
    doc_id = f"{portfolio}_{dt.strftime('%Y_%m_%d')}"
    doc = client.collection(COL_PORTFOLIO_SUMUP).document(doc_id).get()
    if not doc.exists:
        return None
    data = doc.to_dict() or {}
    return {"sumup": data.get("sumup"), "cost": data.get("cost"), "reference_date": data.get("reference_date")}
