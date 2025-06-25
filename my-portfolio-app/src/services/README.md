# Frontend Services Documentation

This document provides detailed documentation for each service in the `src/services` directory. Each table lists the main functions/exports for the service file, their parameters, and a description of their purpose and usage.

---

## portfolioService.ts

| Function Name                  | Parameters                                 | Description                                                                                       |
|-------------------------------|--------------------------------------------|---------------------------------------------------------------------------------------------------|
| `fetchPortfolioStatus`           | `portfolioName: string`                      | Fetches the portfolio status for a given portfolio name. Returns holdings, value, and KPIs.        |
| `fetchPortfolioStatusLive`       | `portfolioName: string`                      | Fetches live (computed) portfolio status for a given portfolio name.                               |
| `savePortfolioStatus`            | `portfolioName: string`                      | Saves the current computed status to the backend for the given portfolio.                          |
| `isPortfolioInitialized`         | `(none)`                                     | Returns a boolean indicating if the portfolio has been initialized in this session.                |
| `markPortfolioAsInitialized`     | `(none)`                                     | Marks the portfolio as initialized for the current session.                                        |
| `isUsingCustomData`              | `(none)`                                     | Returns true if the user has uploaded or processed any custom data in this session.                |
| `getAssets`                      | `portfolioName: string`                      | Returns an array of Asset objects for the given portfolio, including ticker details.               |

---

## marketDataService.ts

| Function Name                  | Parameters                                 | Description                                                                                       |
|-------------------------------|--------------------------------------------|---------------------------------------------------------------------------------------------------|
| `getAuthIdToken`                 | `(none)`                                     | Retrieves the current user's ID token from localStorage.                                           |
| `fetchHistoricalMarketPrices`    | `symbol: string, startDate: string, endDate: string` | Fetches historical price data for a ticker between two dates. Returns an array of data points.     |
| `fetchTickerDetails`             | `symbol: string`                             | Fetches detailed information for a given ticker symbol from the backend.                           |

---

## kpiService.ts

This file is currently empty and does not export any functions.

---

## geminiService.ts

| Function Name                  | Parameters                                 | Description                                                                                       |
|-------------------------------|--------------------------------------------|---------------------------------------------------------------------------------------------------|
| `getChatResponse`                | `promptText: string`                         | Sends a prompt to the Gemini AI model and returns a response, optionally using search if needed.   |
| `getPortfolioAnalysis`           | `assets: Asset[]`                            | Analyzes a portfolio of assets using Gemini AI and returns a summary and suggestions.              |

---

**Note:** All service functions are asynchronous and typically return a Promise. See each function's implementation for error handling and return types.
