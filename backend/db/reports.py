"""
Report persistence helpers.
"""
from typing import Any, Dict, Optional
from datetime import datetime
from .firestore_client import _ensure_client, COL_PORTFOLIO_REPORTS, COL_TICKER_REPORTS, firestore


def save_portfolio_report(portfolio: str, report: Dict[str, Any], reference_date: Optional[str] = None, cost: Optional[float] = None) -> None:
    client = _ensure_client()
    if reference_date is None:
        reference_date = datetime.now().isoformat()
    payload = {"report": report, "cost": float(cost) if cost is not None else None, "reference_date": reference_date, "created_at": firestore.SERVER_TIMESTAMP}
    client.collection(COL_PORTFOLIO_REPORTS).document(f"{portfolio}__{reference_date}").set(payload)


def get_portfolio_report(portfolio: str, reference_date: Optional[str] = None) -> Optional[Dict[str, Any]]:
    client = _ensure_client()
    col = client.collection(COL_PORTFOLIO_REPORTS)
    if reference_date:
        doc = col.document(f"{portfolio}__{reference_date}").get()
        if not doc.exists:
            return None
        data = doc.to_dict() or {}
        return {"report": data.get("report"), "cost": data.get("cost"), "reference_date": data.get("reference_date")}
    else:
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
