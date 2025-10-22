"""Transaction-centric helpers for the portfolio module."""

from __future__ import annotations

from datetime import datetime
from typing import Iterable, Mapping, MutableMapping, Sequence, TypeVar, Union

Number = TypeVar("Number", int, float)

SELL_OPERATIONS = {"sell", "s", "withdraw", "withdrawal", "out"}
BUY_OPERATIONS = {"buy", "b", "deposit", "in"}


def canonicalize_ticker(value: str) -> str:
    """Return a normalised uppercase ticker symbol."""
    if not isinstance(value, str):
        return value
    return value.strip().upper()


def _coerce_float(raw: Union[str, int, float, None], default: float = 0.0) -> float:
    try:
        return float(raw or 0)
    except Exception:
        return default


def normalize_transaction_signs(
    txs: Iterable[Mapping[str, object]]
) -> list[MutableMapping[str, object]]:
    """Normalize quantities so buys are positive and sells negative."""
    if not txs:
        return []
    normalized: list[MutableMapping[str, object]] = []
    for tx in txs:
        try:
            normalized_tx: MutableMapping[str, object] = dict(tx)  # type: ignore[arg-type]
        except Exception:
            normalized_tx = tx  # type: ignore[assignment]
        quantity = _coerce_float(normalized_tx.get("quantity"), 0.0)
        operation_raw = normalized_tx.get("operation")
        operation = str(operation_raw).strip().lower() if operation_raw else ""
        if operation in SELL_OPERATIONS and quantity > 0:
            quantity = -abs(quantity)
        elif operation in BUY_OPERATIONS and quantity < 0:
            quantity = abs(quantity)
        normalized_tx["quantity"] = quantity
        normalized.append(normalized_tx)
    return normalized


def calculate_average_cost(transactions: Sequence[Mapping[str, object]]) -> float:
    """Compute the running average cost (PMC) for a ticker."""
    if not transactions:
        return 0.0

    def _parse_date(raw_date: object) -> datetime:
        if isinstance(raw_date, datetime):
            return raw_date
        try:
            return datetime.fromisoformat(str(raw_date))
        except Exception:
            pass
        try:
            return datetime.strptime(str(raw_date), "%Y-%m-%d")
        except Exception:
            return datetime.min

    sorted_txs = sorted(transactions, key=lambda tx: _parse_date(tx.get("date")))
    total_qty = 0.0
    total_cost = 0.0

    for tx in sorted_txs:
        quantity = _coerce_float(tx.get("quantity"), 0.0)
        operation_raw = tx.get("operation")
        operation = str(operation_raw).strip().lower() if operation_raw else ""
        if quantity >= 0 and operation in SELL_OPERATIONS:
            quantity = -abs(quantity)
        price = _coerce_float(tx.get("price"), 0.0)

        if quantity > 0:
            total_cost += quantity * price
            total_qty += quantity
        elif quantity < 0:
            sell_qty = -quantity
            if total_qty > 0:
                cost_per_unit = (total_cost / total_qty) if total_qty else 0.0
                reduction_qty = min(sell_qty, total_qty)
                total_cost -= reduction_qty * cost_per_unit
                total_qty -= reduction_qty
            else:
                total_qty = max(total_qty - sell_qty, 0.0)
                total_cost = 0.0

    return abs(total_cost / total_qty) if total_qty else 0.0
