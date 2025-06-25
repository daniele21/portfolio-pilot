# PortfolioPilot Backend Database

This folder contains the database access logic and models for PortfolioPilot.

## Main File
- `database.py`: Implements all database operations, schema initialization, and data access functions for portfolios, transactions, tickers, and reports.

## Usage
- Import functions from `db/database.py` in your backend modules to interact with the database.
- The database file is `ticker_data.db` in the project root by default.

## Migrations
- The `init_db()` function ensures all tables are created and up to date.
- Use the `migrate_tickers_to_new_schema()` function to migrate old data if needed.

---

**Note:** Do not store sensitive data or secrets in this folder. Use `backend/config/key` for secrets.
