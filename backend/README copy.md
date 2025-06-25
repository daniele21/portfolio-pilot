# Finance Data Server

This Flask application exposes a small set of APIs for retrieving stock data and tracking simple portfolios. Data is fetched using [yfinance](https://github.com/ranaroussi/yfinance) and cached locally so repeated requests do not always hit Yahoo Finance.

## Running the Server

Install the dependencies and start the app:

```bash
pip install -r requirements.txt
python app.py
```

The app reads a few environment variables:

- `GOOGLE_CLIENT_ID` – OAuth client id used to verify Google ID tokens passed by the frontend.
- `GEMINI_API_KEY` – required for parsing raw transaction text via Google Gemini.
- `GEMINI_MODEL` – optional model name for Gemini (defaults to `gemini-pro`).

## Authentication

All endpoints require a valid Google ID token provided in the `Authorization` header:

```
Authorization: Bearer <YOUR_GOOGLE_ID_TOKEN>
```

Requests without a token or with an invalid one will receive `401` responses.

## Endpoints

### `GET /api/ticker/<symbol>`
Returns cached data about a ticker. Example response:

```json
{
  "source": "CACHE",
  "ticker": "AAPL",
  "data": {
    "info": {
      "shortName": "Apple Inc.",
      "regularMarketPrice": 189.5
    },
    "history": [
      {"Date": "2024-01-02", "Close": 180.5},
      ...
    ],
    "events": {
      "actions": [...],
      "dividends": [...],
      "recommendations": [...]
    }
  }
}
```

### `POST /api/transactions/<portfolio>`
Store transactions for a portfolio. The body can include either raw text or a list of transactions:

```json
{
  "raw": "Bought 1 share of AAPL at $100 on 2024-01-01"
}
```

or

```json
{
  "transactions": [
    {"ticker": "AAPL", "quantity": 1, "price": 100, "date": "2024-01-01", "label": "buy"}
  ]
}
```

The endpoint returns:

```json
{"status": "saved", "count": 1}
```

### `POST /api/transactions/standardize-and-save`
Parse a block of text describing transactions. Any referenced portfolios are
created automatically and the transactions are stored. The response includes the
standardized transactions.

```json
{
  "raw": "Bought 1 share of AAPL at $100 for portfolio p1"
}
```

Returns:

```json
{
  "status": "saved",
  "count": 1,
  "transactions": [
    {"ticker": "AAPL", "quantity": 1, "price": 100, "date": "2024-01-01", "label": "buy", "portfolio": "p1"}
  ]
}
```

### `GET /api/portfolio/<portfolio>/status`
Returns current holdings with the latest price and value per asset:

```json
{
  "holdings": [
    {"ticker": "AAPL", "quantity": 1.0, "price": 189.5, "value": 189.5}
  ],
  "total_value": 189.5
}
```

### `GET /api/portfolio/<portfolio>/performance`
Provides a simple time series of the portfolio value using daily closing prices:

```json
[
  {"date": "2024-01-01", "value": 180.5},
  {"date": "2024-01-02", "value": 181.0}
]
```

## Testing

Run the unit tests with:

```bash
python -m unittest discover -s tests -v
```

The optional integration test `tests/test_gemini_integration.py` makes a real call to Gemini. Set `GEMINI_API_KEY` and optionally `GEMINI_MODEL` to enable this test.
