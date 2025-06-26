# PortfolioPilot Backend API

This document describes all available API endpoints for the PortfolioPilot backend. All endpoints are prefixed with `/api/`.

---

## Table of Contents
- [Authentication](#authentication)
- [Ticker Endpoints](#ticker-endpoints)
- [Portfolio Endpoints](#portfolio-endpoints)
- [Transactions Endpoints](#transactions-endpoints)
- [Performance & KPIs](#performance--kpis)
- [Reports (Gemini)](#reports-gemini)
- [Benchmark Endpoints](#benchmark-endpoints)
- [Other](#other)

---

## Authentication
Some endpoints require a Google OAuth2 Bearer token in the `Authorization` header:

| Header         | Value                |
| -------------- | -------------------- |
| Authorization  | Bearer <id_token>    |

---

## Ticker Endpoints

| Method | Endpoint                                 | Args/Parameters         | Description |
| ------ | ----------------------------------------- | ---------------------- | ----------- |
| GET    | `/api/ticker/<ticker_symbol>`            | Path: `ticker_symbol` <br> Query: `update` (bool, default true) <br> Header: Authorization | Get ticker info and history. Returns suggestions if not found. |
| POST   | `/api/ticker/<ticker_symbol>`            | Path: `ticker_symbol` <br> Body: `{ info, history }` <br> Header: Authorization | Save ticker info/history to DB. |

---

## Portfolio Endpoints

| Method | Endpoint                                                      | Args/Parameters | Description |
| ------ | ------------------------------------------------------------- | --------------- | ----------- |
| GET    | `/api/portfolios`                                            | —               | List all portfolio names. |
| DELETE | `/api/portfolio/<portfolio_name>`                            | Path: `portfolio_name` <br> Header: Authorization | Delete a portfolio. |
| GET    | `/api/portfolio/<portfolio_name>/status/view`                | Path: `portfolio_name` <br> Header: Authorization | Get saved portfolio status. |
| POST   | `/api/portfolio/<portfolio_name>/status/save`                | Path: `portfolio_name` <br> Header: Authorization | Compute & save current status. |
| GET    | `/api/portfolio/<portfolio_name>/status/live`                | Path: `portfolio_name` <br> Header: Authorization | Compute & return live status. |
| GET    | `/api/portfolio/<portfolio_name>/status`                     | Path: `portfolio_name` <br> Header: Authorization | Get saved status (flattened). |
| GET    | `/api/portfolio/<portfolio_name>/transactions`               | Path: `portfolio_name` | Get all transactions for a portfolio. |
| GET    | `/api/portfolio/<portfolio_name>/tickers`                    | Path: `portfolio_name` | Get all distinct tickers for a portfolio. |
| DELETE | `/api/portfolio/<portfolio_name>/transaction/<transaction_id>` | Path: `portfolio_name`, `transaction_id` <br> Header: Authorization | Delete a transaction. |
| GET    | `/api/portfolio/<portfolio_name>/performance`                | Path: `portfolio_name` | Get historical portfolio performance. |
| GET    | `/api/portfolio/<portfolio_name>/allocation`                 | Path: `portfolio_name` <br> Query: `grouping` (overall/quoteType) <br> Header: Authorization | Get asset allocation data. |

---

## Transactions Endpoints

| Method | Endpoint                                         | Args/Parameters | Description |
| ------ | ------------------------------------------------ | --------------- | ----------- |
| POST   | `/api/transactions/<portfolio_name>`             | Path: `portfolio_name` <br> Body: `{ raw, transactions }` | Add transactions (raw or parsed). |
| POST   | `/api/transactions/standardize-and-save`         | Body: `{ raw, portfolio_name }` | Parse and save transactions from raw text. |

---

## Performance & KPIs

| Method | Endpoint                                                      | Args/Parameters | Description |
| ------ | ------------------------------------------------------------- | --------------- | ----------- |
| GET    | `/api/portfolio/<portfolio_name>/performance`                 | Path: `portfolio_name` | Get historical portfolio performance. |
| GET    | `/api/portfolio/<portfolio_name>/ticker/<ticker>/performance` | Path: `portfolio_name`, `ticker` <br> Query: `start_date` | Get historical performance for a ticker. |
| POST   | `/api/portfolio/<portfolio_name>/tickers/performance`         | Path: `portfolio_name` <br> Body: `{ tickers: [str], start_date? }` <br> Header: Authorization | Get historical value for multiple tickers. |
| GET    | `/api/portfolio/<portfolio_name>/kpis`                        | Path: `portfolio_name` | Get portfolio KPIs (value, best/worst ticker, etc). |
| GET    | `/api/portfolio/<portfolio_name>/returns`                     | Path: `portfolio_name` <br> Header: Authorization | Get yesterday, weekly, monthly, 3mo, YTD returns. |
| GET    | `/api/portfolio/<portfolio_name>/kpis/returns`                | Path: `portfolio_name` <br> Header: Authorization | Get return KPIs for dashboard cards. Now includes 1-year return as `one_year_return` and per-ticker 1-year returns as `one_year_ticker_returns`. |

---

## Reports (Gemini)

| Method | Endpoint                                                      | Args/Parameters | Description |
| ------ | ------------------------------------------------------------- | --------------- | ----------- |
| GET/POST | `/api/portfolio/<portfolio_name>/report`                    | Path: `portfolio_name` <br> Body: `{ status?, returns?, force? }` <br> Header: Authorization | Generate Gemini-based report for a portfolio. |
| POST   | `/api/portfolio/<portfolio_name>/tickers/report`              | Path: `portfolio_name` <br> Body: `{ tickers, holdings_list?, weights?, status?, returns_dict?, model_name? }` <br> Header: Authorization | Generate Gemini-based report for multiple tickers. |
| GET/POST | `/api/portfolio/<portfolio_name>/ticker/<ticker>/report`    | Path: `portfolio_name`, `ticker` <br> Body: `{ holdings?, weight?, status?, returns?, ticker_performance?, force? }` <br> Header: Authorization | Generate Gemini-based report for a ticker. |

---

## Benchmark Endpoints

| Method | Endpoint                                 | Args/Parameters | Description |
| ------ | ----------------------------------------- | --------------- | ----------- |
| GET    | `/api/benchmark/<ticker>/performance`    | Path: `ticker`  | Get historical performance for a benchmark ticker. |

---

## Error Handling
- All endpoints return JSON error messages with appropriate HTTP status codes.
- 404s return `{ "error": "Not found" }`.

---

## Notes
- All POST endpoints expect `Content-Type: application/json`.
- Some endpoints require Google OAuth2 Bearer token in the `Authorization` header.
- See backend/README.md for backend setup and structure.
