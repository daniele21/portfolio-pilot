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


# Map various operation synonyms to canonical operation types
NORMALIZED_OPERATIONS = {
    'buy': 'Buy',
    'acquisto': 'Buy',
    'purchase': 'Buy',
    'sell': 'Sell',
    'vendita': 'Sell',
    'sale': 'Sell',
    'dividend': 'Dividend',
    'dividendo': 'Dividend',
    'fee': 'Fee',
    'commission': 'Commission',
    'commissione': 'Commission',
    'tax': 'Tax'
}


def _normalize_operation(op: Optional[str]) -> Optional[str]:
    if not op:
        return None
    s = str(op).strip().lower()
    return NORMALIZED_OPERATIONS.get(s, str(op).strip().title())


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
    "operation": {"type", "operation", "label", "azione"},
    "description": {"description", "descr", "note", "details"},
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
            t.get("operation"),
        )
        if key in seen:
            continue
        seen.add(key)
        out.append(t)
    return out


def parse_tabular_transactions(rows: Iterable[Dict[str, Any]], portfolio: str) -> List[Dict[str, Any]]:
    txs: List[Dict[str, Any]] = []
    for row in rows:
        t = {k: row.get(k) for k in ["ticker", "quantity", "price", "date", "operation", "description", "name"] if k in row}
        # Normalize
        t["ticker"] = (t.get("ticker") or "").strip().upper()
        t["quantity"] = _coerce_float(t.get("quantity"))
        t["price"] = _coerce_float(t.get("price"))
        t["date"] = _parse_date(str(t.get("date") or ""))
        t["operation"] = _normalize_operation(t.get("operation"))
        t["description"] = (t.get("description") or "").strip()
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
    """Backward-compatible wrapper that performs two-step validation & resolution.

    1. Basic validation/normalization (no network calls) via `validate_transactions_basic`.
    2. Symbol resolution / enrichment (network calls, dedupe by yahoo_ticker) via `resolve_transactions`.

    NOTE: Existing callers expecting the final cleaned list can keep using this
    function. New code can call the two steps separately if it wants to batch
    or inspect between phases.
    """
    basic = validate_transactions_basic(transactions, portfolio)
    return resolve_transactions(basic)


def validate_transactions_basic(transactions: List[Dict[str, Any]], portfolio: str) -> List[Dict[str, Any]]:
    """First-stage validation & normalization without external lookups.

    Rules:
      - Strip & normalize raw fields (ticker/isin/yahoo_ticker/name/description)
      - Parse date; discard rows with invalid date
      - Coerce numeric fields to float
      - Normalize operation label
      - KEEP rows that have at least one potential identifier among (ticker, isin, yahoo_ticker)
      - Do NOT perform network resolution (no fetch_with_cache calls here)

    Returns a list of partially-normalized transaction dicts still carrying
    original identifiers; ticker at this stage is just the raw ticker (not yet
    resolved from ISIN or yahoo_ticker).
    """
    cleaned: List[Dict[str, Any]] = []
    for t in transactions:
        ticker_raw = (t.get("ticker") or "").strip()
        isin_raw = (t.get("isin") or "").strip()
        yahoo_raw = (t.get("yahoo_ticker") or "").strip()
        # parse/validate date early
        date = _parse_date(str(t.get("date") or ""))
        if not date:
            continue
        if not (ticker_raw or isin_raw or yahoo_raw):
            # nothing to potentially resolve later
            continue
        cleaned.append({
            "ticker": ticker_raw.upper() if ticker_raw else "",
            "isin": isin_raw or None,
            "quantity": _coerce_float(t.get("quantity")),
            "price": _coerce_float(t.get("price")),
            "date": date,
            "operation": _normalize_operation(t.get("operation")) or "Buy",
            "description": (t.get("description") or "").strip(),
            "portfolio": portfolio,
            "name": (t.get("name") or "").strip(),
        })
    return cleaned


def resolve_transactions(transactions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Second-stage enrichment: resolve final ticker using yahoo_ticker when possible.

    Strategy:
      - Collect unique yahoo_ticker values (non-empty) for Buy/Sell operations.
      - Call `fetch_with_cache` once per unique yahoo_ticker (batched logically via loop).
      - If resolved_symbol present, use it as final ticker.
      - Fallback: use the yahoo_ticker itself; if absent, keep existing ticker field.
      - Drop any transaction that still lacks a ticker after attempts.

    This intentionally does NOT (yet) re-implement ISIN resolution logic to
    keep the split focused on the request (yahoo_ticker batch resolution). If
    needed, similar batching for ISINs can be added later.
    """
    try:
        from services.data_fetcher import fetch_with_cache
    except Exception:  # pragma: no cover
        fetch_with_cache = None  # type: ignore

    # Build mapping yahoo_ticker -> fetched data (or None)
    yahoo_targets = {t["yahoo_ticker"] for t in transactions if t.get("yahoo_ticker")}
    yahoo_fetched: Dict[str, Optional[Dict[str, Any]]] = {}
    if fetch_with_cache:
        for yt in yahoo_targets:
            try:
                data, src = fetch_with_cache(yt)
                yahoo_fetched[yt] = data
            except Exception:
                yahoo_fetched[yt] = None
    else:
        for yt in yahoo_targets:
            yahoo_fetched[yt] = None

    # For any yahoo_ticker that failed to fetch, or for transactions without
    # yahoo_ticker, collect ISINs to attempt resolution/fetch by ISIN.
    isins_to_fetch = set()
    for t in transactions:
        yt = t.get("yahoo_ticker")
        if yt:
            if yahoo_fetched.get(yt) is None and t.get("isin"):
                isins_to_fetch.add(t.get("isin"))
        else:
            if t.get("isin"):
                isins_to_fetch.add(t.get("isin"))

    isin_fetched: Dict[str, Optional[Dict[str, Any]]] = {}
    if fetch_with_cache:
        for isin in isins_to_fetch:
            try:
                data, src = fetch_with_cache(isin)
                isin_fetched[isin] = data
            except Exception:
                isin_fetched[isin] = None
    else:
        for isin in isins_to_fetch:
            isin_fetched[isin] = None

    # Enrich transactions: prefer yahoo_fetched result if available; otherwise
    # prefer ISIN-fetched result. Do not drop transactions — the purpose is to
    # load/update ticker info+history, not to filter rows.
    enriched: List[Dict[str, Any]] = []
    for t in transactions:
        out = dict(t)
        final_ticker = out.get("ticker") or ""
        yt = out.get("yahoo_ticker")
        isin = out.get("isin")

        # Prefer yahoo_ticker fetch
        if yt:
            yf_data = yahoo_fetched.get(yt)
            if yf_data and isinstance(yf_data, dict):
                resolved = yf_data.get('resolved_symbol') or yf_data.get('resolved_symbol'.upper())
                if resolved:
                    final_ticker = str(resolved).strip().upper()
                else:
                    # If yahoo returned some info but no resolved symbol, keep yt as fallback
                    final_ticker = final_ticker or yt
            else:
                # Yahoo fetch failed -> fall back to ISIN if present
                if isin:
                    isin_data = isin_fetched.get(isin)
                    if isin_data and isinstance(isin_data, dict):
                        resolved = isin_data.get('resolved_symbol') or isin_data.get('resolved_symbol'.upper())
                        if resolved:
                            final_ticker = str(resolved).strip().upper()
        else:
            # No yahoo_ticker; try ISIN fetch
            if isin:
                isin_data = isin_fetched.get(isin)
                if isin_data and isinstance(isin_data, dict):
                    resolved = isin_data.get('resolved_symbol') or isin_data.get('resolved_symbol'.upper())
                    if resolved:
                        final_ticker = str(resolved).strip().upper()

        # Update the transaction's ticker (if resolved, otherwise leave original)
        if final_ticker:
            out["ticker"] = final_ticker

        # Leave other fields intact; fetch_with_cache already persists ticker info/history
        enriched.append(out)

    return enriched


class TransactionResolutionResult:
    """Result object for human-in-the-loop ticker resolution.

    NOTE: After the refactor to a *pure suggestion* model we never pre-fetch
    instrument data here. All identifiers are returned as pending so the UI
    can present uniform choices and trigger fetches only after the user picks
    a concrete symbol. (Previously we auto-resolved when no suggestions were
    found; that behavior is intentionally removed.)
    """
    def __init__(self, resolved_transactions: List[Dict[str, Any]],
                 pending_resolutions: List[Dict[str, Any]] = None):
        self.resolved_transactions = resolved_transactions
        self.pending_resolutions = pending_resolutions or []
        self.has_pending = len(self.pending_resolutions) > 0


def resolve_transactions_with_suggestions(transactions: List[Dict[str, Any]]) -> TransactionResolutionResult:
    """Pure suggestion phase for human-in-the-loop symbol resolution.

    New behavior (aligned with TickerInfoPage):
      * We NEVER pre-fetch instrument / price data here.
      * For each unique primary identifier (ticker if present else ISIN) we run
        Yahoo-style searches (ISIN first, then ticker) to gather up to 10
        suggestions.
      * Regardless of whether suggestions are found, we create a
        pending_resolutions entry. If no external suggestions are found we
        still include the original identifier as a fallback suggestion (source
        = 'original') so the UI can let the user explicitly confirm it.
      * resolved_transactions is always empty; nothing is persisted until the
        user submits their choices.

    Returns:
      TransactionResolutionResult with:
        - resolved_transactions = [] (always at this stage)
        - pending_resolutions = list of groups each containing:
            original_ticker, suggestions[], sample_transaction, affected_transaction_count
    """
    import re
    from services.yahoo_search import search_instruments

    def _classify(raw: str) -> str:
        v = (raw or "").strip().upper()
        if not v:
            return 'name'
        if re.match(r'^[A-Z]{2}[A-Z0-9]{9}[0-9]$', v):
            return 'isin'
        if re.match(r'^[A-Z0-9][A-Z0-9\.\-]{0,14}$', v):
            return 'symbol'
        return 'name'

    # Group transactions by primary identifier (ticker first, else ISIN)
    ticker_groups: Dict[str, List[Dict[str, Any]]] = {}
    for t in transactions:
        primary = (t.get('ticker') or '').strip().upper()
        primary_isin = (t.get('isin') or '').strip().upper()
        if not primary and not primary_isin:
            continue
        group_key = primary if primary else primary_isin
        ticker_groups.setdefault(group_key, []).append(t)

    pending_resolutions: List[Dict[str, Any]] = []

    for group_key, tx_list in ticker_groups.items():
        suggestions: List[Dict[str, Any]] = []
        _raw_isins = [ (t.get('isin') or '').strip().upper() for t in tx_list if (t.get('isin') or '').strip() ]
        unique_isins = list(dict.fromkeys(_raw_isins))
        _raw_tickers = [ (t.get('ticker') or '').strip().upper() for t in tx_list if (t.get('ticker') or '').strip() ]
        unique_tickers = list(dict.fromkeys(_raw_tickers))

        # Search by ISIN first
        for isin in unique_isins:
            try:
                search_resp = search_instruments(isin)
                if search_resp and not search_resp.get('error') and search_resp.get('results'):
                    for res in search_resp.get('results', [])[:10]:
                        sym = res.get('symbol')
                        if not sym or any(s['symbol'] == sym for s in suggestions):
                            continue
                        suggestions.append({
                            'symbol': sym,
                            'name': res.get('shortname') or res.get('longname') or '',
                            'source': 'yahoo',
                            'exchange': res.get('exchDisp', ''),
                            'quoteType': res.get('quoteType', '')
                        })
                if suggestions:
                    break
            except Exception:
                continue

        # If still empty, search by raw tickers
        if not suggestions:
            for tk in unique_tickers:
                try:
                    search_resp = search_instruments(tk)
                    if search_resp and not search_resp.get('error') and search_resp.get('results'):
                        for res in search_resp.get('results', [])[:10]:
                            sym = res.get('symbol')
                            if not sym or any(s['symbol'] == sym for s in suggestions):
                                continue
                            suggestions.append({
                                'symbol': sym,
                                'name': res.get('shortname') or res.get('longname') or '',
                                'source': 'yahoo',
                                'exchange': res.get('exchDisp', ''),
                                'quoteType': res.get('quoteType', '')
                            })
                    if suggestions:
                        break
                except Exception:
                    continue

        # Always add the original identifier as a selectable fallback if not present
        if group_key and not any(s['symbol'] == group_key for s in suggestions):
            suggestions.insert(0, {
                'symbol': group_key,
                'name': '(original input)',
                'source': 'original',
                'exchange': '',
                'quoteType': _classify(group_key)
            })

        sample = tx_list[0]
        pending_resolutions.append({
            'original_ticker': group_key,
            'suggestions': suggestions,
                'sample_transaction': {
                    'name': sample.get('name', ''),
                    'description': sample.get('description', ''),
                    'date': sample.get('date', ''),
                    'quantity': sample.get('quantity', 0),
                    'price': sample.get('price', 0),
                    'operation': sample.get('operation', ''),
                    'isin': sample.get('isin', '')
                },
            'affected_transaction_count': len(tx_list)
        })

    # No transactions are considered resolved at this stage
    return TransactionResolutionResult([], pending_resolutions)
