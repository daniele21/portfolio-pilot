"""
Firestore client and collection constants.
"""
from typing import Any
from datetime import datetime
import os

LOG_FIRESTORE = os.environ.get("LOG_FIRESTORE", "0") in {"1", "true", "TRUE", "yes", "on"}
# If FIRESTORE_EMULATOR_HOST is set, the official google-cloud-firestore client automatically
# targets the emulator instead of production. We capture it here for diagnostics.
EMULATOR_HOST = os.environ.get("FIRESTORE_EMULATOR_HOST")  # format: host:port

try:
    from google.cloud import firestore as _firestore
except Exception:
    _firestore = None  # type: ignore

firestore = _firestore

_db_client = None

# Default Firestore database name; can be overridden with env var FIRESTORE_DATABASE
DEFAULT_FIRESTORE_DATABASE = os.environ.get("FIRESTORE_DATABASE", "portfolio")

# collection names
COL_TICKERS = "tickers_raw"
COL_TICKER_INFO = "ticker_info"
COL_TICKER_HISTORY = "ticker_history"
COL_PORTFOLIOS = "portfolios"
COL_TRANSACTIONS = "transactions"
COL_PORTFOLIO_STATUS = "portfolio_status"
COL_PORTFOLIO_HOLDINGS = "portfolio_holdings"
COL_PORTFOLIO_REPORTS = "portfolio_report"
COL_TICKER_REPORTS = "ticker_reports"
COL_PORTFOLIO_SUMUP = "portfolio_sumup"

# Root collection for user-scoped (tenant) data. All collections except the
# shared market data (ticker_info, ticker_history) will move under:
#   users/{uid}/<collection>
# during the multi-tenant refactor. We keep existing top-level collection
# names for backward compatibility / migration period.
COL_USERS_ROOT = "users"

def user_collection(client, uid: str, collection: str):
    """Return a CollectionReference for a user-scoped collection.

    Usage:
        col = user_collection(client, user_id, COL_PORTFOLIOS)
        col.document(<id>).set({...})

    This helper centralizes the path structure so future changes (e.g. adding a
    version prefix) only require editing here.
    """
    return client.collection(COL_USERS_ROOT).document(uid).collection(collection)


def _ensure_client():
    """Return an initialized Firestore client or raise if the SDK is missing."""
    global _db_client
    if _db_client is not None:
        if LOG_FIRESTORE:
            print("[firestore_client] Reusing existing Firestore client")
        return _db_client
    if firestore is None:
        raise RuntimeError("google-cloud-firestore is not installed. Install with: pip install google-cloud-firestore")
    # Allow specifying a Firestore database name via env var; default to 'portfolio'
    db_name = os.environ.get("FIRESTORE_DATABASE", DEFAULT_FIRESTORE_DATABASE)
    # google.cloud.firestore.Client accepts a `database` argument
    try:
        _db_client = firestore.Client(database=db_name)
        if LOG_FIRESTORE:
            env_state = (
                f"EMULATOR host={EMULATOR_HOST}" if EMULATOR_HOST else "PRODUCTION (no FIRESTORE_EMULATOR_HOST)"
            )
            print(f"[firestore_client] Created client (database={db_name}) -> {env_state}")
    except TypeError:
        # Older versions may not accept database kwarg; fall back to default client
        _db_client = firestore.Client()
        if LOG_FIRESTORE:
            env_state = (
                f"EMULATOR host={EMULATOR_HOST}" if EMULATOR_HOST else "PRODUCTION (no FIRESTORE_EMULATOR_HOST)"
            )
            print("[firestore_client] Created legacy client (no database kwarg) -> " + env_state)
    return _db_client


def init_db():
    client = _ensure_client()
    if LOG_FIRESTORE:
        db_name = os.environ.get("FIRESTORE_DATABASE", DEFAULT_FIRESTORE_DATABASE)
        creds = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        client_type = type(client).__name__
        project = getattr(client, "project", None)
        emulator = bool(EMULATOR_HOST)
        print("[firestore_client] Firestore client initialized.")
        print(f"[firestore_client] client_type={client_type} project={project} database={db_name}")
        print(f"[firestore_client] emulator={emulator} emulator_host={EMULATOR_HOST}")
