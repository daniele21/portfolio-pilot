"""Ingestion utilities for portfolio transaction data.

Supports extracting transactions from:
  - Raw text (LLM-assisted via Gemini)
  - PDF (text extraction then LLM)
  - CSV / TSV (direct structured parse; falls back to LLM if headers not recognized)
  - XLSX (direct structured parse; falls back to LLM)

Design goals:
  1. Minimize LLM tokens when a clearly tabular file already matches the schema.
  2. Provide deterministic validation & normalization (date format, numeric casting, label normalization).
  3. Deduplicate obvious duplicates before persisting.
"""
from __future__ import annotations

from typing import List, Dict, Any, Tuple, Optional, Iterable
from datetime import datetime, timezone
from dateutil import parser as _dateutil_parser
import io
import csv
import re

try:
    import pandas as _pd  # already in requirements
except Exception:  # pragma: no cover
    _pd = None

from werkzeug.datastructures import FileStorage

ALLOWED_EXTENSIONS = {"pdf", "csv", "tsv", "txt", "text", "xlsx", "xls"}
DATE_FORMATS = ["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y", "%Y/%m/%d"]
NORMALIZED_LABELS = {
    "buy": "Buy",
    "acquisto": "Buy",
    "purchase": "Buy",
    "sell": "Sell",
    "vendita": "Sell",
    "sale": "Sell",
    "dividend": "Dividend",
    "dividendo": "Dividend",
    "fee": "Fee",
    "commission": "Fee",
    "commissione": "Fee",
    "transfer in": "Transfer In",
    "transfer out": "Transfer Out",
}


def _normalize_label(label: Optional[str]) -> Optional[str]:
    if not label:
        return label
    l = label.strip().lower()
    return NORMALIZED_LABELS.get(l, label.strip().title())


def _parse_date(val: str) -> Optional[str]:
    if not val:
        return None
    s = val.strip()
    # Remove potential time part
    # Fast path: numeric epoch seconds or milliseconds
    if re.match(r"^\d{10,}$", s):
        try:
            ts = int(s)
            # Treat >=13 digits as milliseconds
            if len(s) >= 13:
                dt = datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
            else:
                dt = datetime.fromtimestamp(ts, tz=timezone.utc)
            return dt.strftime("%Y-%m-%d")
        except Exception:
            pass

    # Try explicit formats first (fast and predictable)
    token = s.split()[0]
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(token, fmt).strftime("%Y-%m-%d")
        except Exception:
            continue

    # Last resort: dateutil's parser which handles many free-form formats
    try:
        dt = _dateutil_parser.parse(s)
        # Convert to date in UTC if timezone-aware, otherwise keep local interpretation
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc)
        return dt.date().isoformat()
    except Exception:
        # Try dayfirst fallback
        try:
            dt = _dateutil_parser.parse(s, dayfirst=True)
            if dt.tzinfo is not None:
                dt = dt.astimezone(timezone.utc)
            return dt.date().isoformat()
        except Exception:
            return None
    # Try regex YYYYMMDD
    if re.match(r"^\d{8}$", s):
        try:
            return datetime.strptime(s, "%Y%m%d").strftime("%Y-%m-%d")
        except Exception:
            pass
    return None


def _coerce_float(v: Any) -> float:
    try:
        if v in (None, ""):
            return 0.0
        return float(str(v).replace(',', '.'))
    except Exception:
        return 0.0


TABULAR_HEADER_MAP = {
    # Each tuple lists acceptable synonyms -> canonical key
    "ticker": {"ticker", "symbol", "isin"},
    "quantity": {"qty", "quantity", "shares", "qta"},
    "price": {"price", "px", "prezzo", "cost"},
    "date": {"date", "data", "trade_date", "execution_date"},
    "label": {"type", "label", "operation", "azione"},
    "name": {"name", "descr", "description", "company", "issuer"},
}


def _canonical_header(h: str) -> Optional[str]:
    h_clean = h.strip().lower()
    for canon, variants in TABULAR_HEADER_MAP.items():
        if h_clean in variants:
            return canon
    return None


def _deduplicate(transactions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen = set()
    out = []
    for t in transactions:
        key = (
            t.get("ticker"),
            t.get("date"),
            str(t.get("quantity")),
            str(t.get("price")),
            t.get("label"),
        )
        if key in seen:
            continue
        seen.add(key)
        out.append(t)
    return out


def parse_tabular_transactions(rows: Iterable[Dict[str, Any]], portfolio: str) -> List[Dict[str, Any]]:
    txs: List[Dict[str, Any]] = []
    for row in rows:
        t = {k: row.get(k) for k in ["ticker", "quantity", "price", "date", "label", "name"] if k in row}
        # Normalize
        t["ticker"] = (t.get("ticker") or "").strip().upper()
        t["quantity"] = _coerce_float(t.get("quantity"))
        t["price"] = _coerce_float(t.get("price"))
        t["date"] = _parse_date(str(t.get("date") or ""))
        t["label"] = _normalize_label(t.get("label"))
        t["name"] = (t.get("name") or "").strip()
        t["portfolio"] = portfolio
        if t["ticker"] and t["date"]:
            txs.append(t)
    return txs


def extract_from_csv(file: FileStorage, portfolio: str) -> Optional[List[Dict[str, Any]]]:
    try:
        text = file.read().decode("utf-8", errors="ignore")
        file.seek(0)
    except Exception:
        return None
    sniffer = csv.Sniffer()
    try:
        dialect = sniffer.sniff(text.splitlines()[0])
        delimiter = dialect.delimiter
    except Exception:
        delimiter = ',' if ',' in text.splitlines()[0] else ';'
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    headers = reader.fieldnames or []
    canon_headers = [_canonical_header(h) for h in headers]
    if not any(canon_headers):  # unrecognized -> fallback to LLM
        return None
    mapped_rows = []
    for row in reader:
        mapped = {}
        for h_raw, canon in zip(headers, canon_headers):
            if canon:
                mapped[canon] = row.get(h_raw)
        mapped_rows.append(mapped)
    return parse_tabular_transactions(mapped_rows, portfolio)


def extract_from_excel(file: FileStorage, portfolio: str) -> Optional[List[Dict[str, Any]]]:
    if _pd is None:
        return None
    try:
        content = file.read()
        file.seek(0)
        df = _pd.read_excel(io.BytesIO(content))
    except Exception:
        return None
    headers = list(df.columns)
    canon_headers = [_canonical_header(str(h)) for h in headers]
    if not any(canon_headers):
        return None
    rows = []
    for _, r in df.iterrows():
        row_map = {}
        for h_raw, canon in zip(headers, canon_headers):
            if canon:
                row_map[canon] = r[h_raw]
        rows.append(row_map)
    return parse_tabular_transactions(rows, portfolio)


def extract_text_from_pdf(file: FileStorage) -> str:
    try:
        import PyPDF2  # lightweight
    except Exception:  # pragma: no cover
        return ""
    try:
        reader = PyPDF2.PdfReader(file)
        texts = []
        for page in reader.pages:
            try:
                texts.append(page.extract_text() or "")
            except Exception:
                continue
        file.seek(0)
        return "\n".join(texts)
    except Exception:
        return ""


def extract_text_generic(file: FileStorage) -> str:
    try:
        data = file.read()
        file.seek(0)
        return data.decode("utf-8", errors="ignore")
    except Exception:
        return ""


def extract_transactions_from_file(file: FileStorage, portfolio: str) -> Tuple[List[Dict[str, Any]], bool, str]:
    """Return (transactions, used_llm, debug_source).

    Attempts structured parse first for CSV/XLSX; falls back to LLM for all other cases.
    """
    filename = file.filename or "upload"
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    used_llm = False
    debug_source = ""
    if ext in {"csv", "tsv"}:
        txs = extract_from_csv(file, portfolio)
        if txs:
            return _deduplicate(txs), False, f"csv-structured({len(txs)})"
    if ext in {"xlsx", "xls"}:
        txs = extract_from_excel(file, portfolio)
        if txs:
            return _deduplicate(txs), False, f"excel-structured({len(txs)})"
    # Otherwise fallback to text + LLM
    if ext == "pdf":
        text = extract_text_from_pdf(file)
    else:
        text = extract_text_generic(file)
    debug_source = f"llm-text:{ext or 'raw'}:{len(text)}chars"
    from core.gemini_helper import parse_transactions  # local import to avoid circular
    txs = parse_transactions(text, portfolio)
    used_llm = True
    return _deduplicate(txs), used_llm, debug_source


def validate_transactions(transactions: List[Dict[str, Any]], portfolio: str) -> List[Dict[str, Any]]:
    cleaned: List[Dict[str, Any]] = []
    for t in transactions:
        ticker = (t.get("ticker") or "").strip().upper()
        if not ticker:
            continue
        date = _parse_date(str(t.get("date") or ""))
        if not date:
            continue  # skip invalid dates
        cleaned.append({
            "ticker": ticker,
            "quantity": _coerce_float(t.get("quantity")),
            "price": _coerce_float(t.get("price")),
            "date": date,
            "label": _normalize_label(t.get("label")) or "Buy",
            "portfolio": portfolio,
            "name": (t.get("name") or "").strip(),
        })
    return _deduplicate(cleaned)
