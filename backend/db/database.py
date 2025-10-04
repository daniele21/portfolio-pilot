"""
Database facade: re-export commonly used functions from modular db submodules.
"""
from .firestore_client import init_db
from .tickers import get_ticker_data, save_ticker_data, get_ticker_history
from .portfolios import (
    aggregate_positions,
    create_portfolio,
    save_transactions,
    get_transactions,
    get_transaction_by_id,
    delete_transaction,
    update_transaction,
    get_all_portfolio_names,
    delete_portfolio,
    save_portfolio_status,
    get_portfolio_status_saved,
)
from .reports import (
    save_portfolio_report,
    get_portfolio_report,
    save_ticker_report,
    get_ticker_report,
)
from .portfolios import migrate_from_sqlite

__all__ = [
    "init_db",
    "get_ticker_data",
    "save_ticker_data",
    "get_ticker_history",
    "aggregate_positions",
    "create_portfolio",
    "save_transactions",
    "get_transactions",
    "get_transaction_by_id",
    "delete_transaction",
    "update_transaction",
    "get_all_portfolio_names",
    "delete_portfolio",
    "save_portfolio_status",
    "get_portfolio_status_saved",
    "save_portfolio_report",
    "get_portfolio_report",
    "save_ticker_report",
    "get_ticker_report",
    "migrate_from_sqlite",
]
