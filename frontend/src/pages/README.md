# Pages Directory Overview

This table summarizes the main features of each page in the `src/pages` folder, the backend APIs they call, and key details about their functionality.

| File                  | Main Feature(s)                                                                 | Backend APIs Called                                                                                                    | Details |
|-----------------------|--------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------|---------|
| HomePage.tsx          | Dashboard: portfolio KPIs, performance chart, asset allocation, ticker performance | `/api/portfolio/<name>/status`, `/api/portfolio/<name>/performance`, `/api/portfolio/<name>/allocation`, `/api/ticker/<symbol>`, `/api/benchmark/<symbol>` | Uses React Query for data fetching, supports portfolio selection, interactive charts, and KPI cards. |
| AssetsPage.old.tsx    | (Deprecated) Old asset list and chart page                                       | `/api/portfolio/<name>/status`, `/api/ticker/<symbol>`                                                                | Superseded by new AssetsPage. Retained for reference. |
| AllocationPage.tsx    | Asset allocation visualization (table, sunburst chart), risk/factor placeholders | `/api/portfolio/<name>/status`, `/api/portfolio/<name>/allocation`                                                    | Shows non-cash holdings, advanced analytics section is a placeholder. |
| CopilotPage.tsx       | (Legacy/experimental) AI copilot chat and analysis                              | `/api/gemini/chat` (if enabled)                                                                                       | May be deprecated; replaced by ChatInterface in components. |
| PortfolioStatusPage.tsx | Portfolio status summary, traffic light, KPIs                                  | `/api/portfolio/<name>/status`, `/api/portfolio/<name>/status/live`                                                   | Shows current and live-computed status, traffic light, and KPIs. |
| ReportPage.tsx        | AI-generated portfolio and ticker reports, evaluation, insights                  | `/api/portfolio/<name>/status`, `/api/report/portfolio`, `/api/report/ticker`, `/api/ticker/<symbol>`                 | Generates detailed reports using Gemini AI, includes tables, cards, and markdown rendering. |
| SettingsPage.tsx      | Import transactions, manage portfolio data, upload files                        | `/api/transactions/standardize-and-save`, `/api/portfolio/<name>/status/save`                                         | Handles file upload, transaction parsing, and portfolio data management. |
| TickerInfoPage.tsx    | Detailed info for a single ticker (company, price, news, etc.)                 | `/api/ticker/<symbol>`                                                                                                | Shows company info, price, and news for a selected ticker. |
| TickerLookupPage.tsx  | Search and lookup for tickers                                                   | `/api/ticker/<symbol>`                                                                                                | Lets users search for and select tickers to view details. |
| TransactionsPage.tsx  | View, import, and manage portfolio transactions                                | `/api/portfolio/<name>/transactions`, `/api/transactions/standardize-and-save`, `/api/portfolio/<name>/status/save`   | Shows transaction table, supports import, add, and delete, and portfolio selection. |

**Notes:**
- All pages use React and TypeScript, and most leverage React Query for data fetching.
- API endpoints are protected and require authentication (ID token in headers).
- Some pages (e.g., CopilotPage, AssetsPage.old) are deprecated or replaced by newer features.
- For more details on API endpoints, see the backend/api/README.md.
