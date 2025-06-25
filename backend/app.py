from flask import Flask, jsonify, request
import logging
from datetime import datetime, timedelta
import database
from functools import wraps
import data_fetcher
import os
from flask_cors import CORS
import gemini_helper
import portfolio
from google.oauth2 import id_token
from google.auth.transport import requests
from gemini_cost import GEMINI_2_0_FLASH
import requests as ext_requests  # To avoid conflict with Flask's request

# --- Robust JSON parsing helper ---
def safe_get_json():
    """
    Safely get JSON from request, returning an empty dict if body is empty,
    or returning a 400 error if JSON is invalid.
    """
    try:
        if not request.data or request.data.strip() == b'':
            return {}
        return request.get_json(force=True) or {}
    except Exception as e:
        # Return a 400 error with a clear message
        return jsonify({'error': f'Invalid JSON: {e}'}), 400

app = Flask(__name__)

# Configure basic logging to stdout
logging.basicConfig(level=logging.INFO)

CORS(app, origins=[
    "http://localhost:8000",
    "http://localhost:8080",
    "https://portfoliopilot-335283962900.us-west1.run.app"
], supports_credentials=True)


@app.before_request
def log_api_call():
    """Log each incoming API request."""
    app.logger.info("%s %s", request.method, request.path)


@app.after_request
def log_errors(response):
    """Log details of any error responses."""
    if response.status_code >= 400:
        app.logger.error(
            "%s %s -> %s %s",
            request.method,
            request.path,
            response.status_code,
            response.get_data(as_text=True),
        )
    return response


@app.after_request
def add_cors_headers(response):
    # Always echo the request's Origin if present, otherwise default
    origin = request.headers.get('Origin')
    if origin:
        response.headers['Access-Control-Allow-Origin'] = origin
    else:
        response.headers['Access-Control-Allow-Origin'] = 'http://localhost:8000'
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    response.headers['Access-Control-Allow-Headers'] = request.headers.get('Access-Control-Request-Headers', 'Content-Type,Authorization')
    response.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,OPTIONS'
    return response

# Ensure the database is set up before the server starts
database.init_db()

GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID')


def require_google_token(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return jsonify({"error": "Authorization header is missing"}), 401

        parts = auth_header.split()
        if parts[0].lower() != 'bearer' or len(parts) != 2:
            return jsonify({"error": "Invalid Authorization header format. Must be 'Bearer <token>'"}), 401

        token = parts[1]

        if not GOOGLE_CLIENT_ID:
            print("ERROR: GOOGLE_CLIENT_ID environment variable not set on the server.")
            return jsonify({"error": "Server configuration error"}), 500

        try:
            # Verify the token against Google's public keys.
            # This checks the signature, expiration, and that it was issued to your client ID.
            id_info = id_token.verify_oauth2_token(token, requests.Request(), GOOGLE_CLIENT_ID)

            # You can optionally store the user info from the token if needed
            # request.user = id_info

            print(f"Authenticated user: {id_info.get('email')}")

        except ValueError as e:
            # This catches invalid tokens (bad signature, expired, wrong audience, etc.)
            print(f"Token validation failed: {e}")
            return jsonify({"error": f"Invalid or expired token: {e}"}), 401

        return f(*args, **kwargs)

    return decorated_function


# Define how old the data can be before we refresh it from the API
CACHE_DURATION = timedelta(hours=24)


# --- Yahoo Finance Ticker Lookup Helper ---
def lookup_ticker(query):
    import time
    from yfinance import Search
    max_retries = 3
    for attempt in range(max_retries):
        try:
            s = Search(query, max_results=8)
            quotes = s.quotes
            if not quotes:
                raise ValueError(f"Nessun risultato per {query!r}")
            return quotes
        except Exception as e:
            if attempt == max_retries - 1:
                raise ValueError(f"Yahoo Finance lookup failed: {e}")
            time.sleep(2 ** attempt)


@app.route('/api/ticker/<string:ticker_symbol>', methods=['GET'])
@require_google_token
def get_ticker(ticker_symbol):
    ticker_symbol = ticker_symbol.upper()
    update = request.args.get('update', 'true').lower() == 'true'
    conn = database.sqlite3.connect(database.DATABASE_NAME)
    conn.row_factory = database.sqlite3.Row
    cursor = conn.cursor()
    # Check if info exists and is recent
    cursor.execute('SELECT * FROM ticker_info WHERE ticker = ?', (ticker_symbol,))
    info_row = cursor.fetchone()
    data_is_stale = False
    if info_row:
        last_updated = info_row['last_updated']
        if last_updated:
            try:
                last_dt = datetime.fromisoformat(last_updated)
                if datetime.now() - last_dt > CACHE_DURATION:
                    data_is_stale = True
            except Exception:
                data_is_stale = True
        else:
            data_is_stale = True
    else:
        data_is_stale = True
    # If update requested or data is missing/stale, fetch and store
    if update or data_is_stale:
        data, source = data_fetcher.fetch_with_cache(ticker_symbol, CACHE_DURATION)
        if not data:
            # Try Yahoo Finance lookup for suggestions
            try:
                suggestions = lookup_ticker(ticker_symbol)
                conn.close()
                if suggestions:
                    # Return 200 with suggestions if any are found
                    return jsonify(suggestions), 200
                else:
                    return jsonify({'error': f'Could not retrieve data for ticker {ticker_symbol}', 'suggestions': []}), 404
            except Exception as e:
                conn.close()
                return jsonify({'error': f'Could not retrieve data for ticker {ticker_symbol}', 'suggestions': [], 'lookup_error': str(e)}), 404
        # Use the unified save_ticker_data function to store info and history
        database.save_ticker_data(ticker_symbol, data)
        conn.commit()
    # Re-fetch info_row for response
    cursor.execute('SELECT * FROM ticker_info WHERE ticker = ?', (ticker_symbol,))
    info_row = cursor.fetchone()
    if not info_row:
        conn.close()
        return jsonify({'error': f'No info found for ticker {ticker_symbol}'}), 404
    info = dict(info_row)
    # Fetch history
    cursor.execute('SELECT date, open, close, high, low, volume FROM ticker_history WHERE ticker = ? ORDER BY date ASC', (ticker_symbol,))
    history = [
        {
            'date': row['date'],
            'open': row['open'],
            'close': row['close'],
            'high': row['high'],
            'low': row['low'],
            'volume': row['volume']
        }
        for row in cursor.fetchall()
    ]
    # Fetch ticker_info row (all columns)
    cursor.execute('SELECT * FROM ticker_info WHERE ticker = ?', (ticker_symbol,))
    ticker_info_row = cursor.fetchone()
    ticker_info = dict(ticker_info_row) if ticker_info_row else None
    conn.close()
    response = {
        'source': 'db',
        'ticker': ticker_symbol,
        'data': {
            'info': info,
            'history': history
        }
    }
    return jsonify(response)


@app.route('/api/transactions/<string:portfolio_name>', methods=['POST'])
def add_transactions(portfolio_name):
    data = safe_get_json()
    if isinstance(data, tuple):  # error response from safe_get_json
        return data
    raw = data.get('raw')
    transactions = data.get('transactions')
    if raw:
        try:
            transactions = gemini_helper.parse_transactions(raw, portfolio_name)
        except Exception as e:
            return jsonify({'error': str(e)}), 400
    if not transactions:
        return jsonify({'error': 'No transactions provided'}), 400
    inserted = database.save_transactions(portfolio_name, transactions)
    for transaction in inserted:
        transaction['name'] = transaction.get('name')  # Ensure name field is present
    return jsonify({'status': 'saved', 'count': len(inserted), 'transactions': inserted})


@app.route('/api/transactions/standardize-and-save', methods=['POST'])
def standardize_and_save():
    data = safe_get_json()
    if isinstance(data, tuple):  # error response from safe_get_json
        return data
    raw = data.get('raw')
    portfolio_name = data.get('portfolio_name')
    if not raw:
        return jsonify({'error': 'No raw text provided'}), 400
    try:
        transactions = gemini_helper.parse_transactions(raw, portfolio_name)
    except Exception as e:
        return jsonify({'error': str(e)}), 400
    inserted = database.save_transactions(portfolio_name, transactions)
    for transaction in inserted:
        transaction['name'] = transaction.get('name')
    return jsonify({'status': 'saved', 'count': len(inserted), 'transactions': inserted})


@app.route('/api/portfolio/<string:portfolio_name>/performance', methods=['GET'])
def portfolio_performance(portfolio_name):
    perf = portfolio.compute_portfolio_performance(portfolio_name)
    return jsonify(perf)


@app.route('/api/portfolio/<string:portfolio_name>/transactions', methods=['GET'])
def get_portfolio_transactions(portfolio_name):
    app.logger.info(f"[API] /api/portfolio/{portfolio_name}/transactions called")
    """
    API endpoint to get all transactions for a given portfolio from the database.
    Returns a JSON list of transactions.
    """
    try:
        transactions = database.get_transactions(portfolio_name)
        # Include 'name' field in each transaction
        for transaction in transactions:
            transaction['name'] = transaction.get('name')  # Ensure name field is present
        return jsonify({'transactions': transactions})
    except Exception as e:
        app.logger.error(f"Failed to fetch transactions for portfolio {portfolio_name}: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/portfolio/<string:portfolio_name>/status/save', methods=['POST'])
@require_google_token
def save_portfolio_status_api(portfolio_name):
    """Compute and save the current portfolio status to the DB."""
    status = portfolio.get_portfolio_status(portfolio_name)
    database.save_portfolio_status(portfolio_name, status)
    return jsonify({'status': 'saved', 'portfolio': portfolio_name, 'data': status})


@app.route('/api/portfolio/<string:portfolio_name>/status/view', methods=['OPTIONS'])
def view_portfolio_status_options(portfolio_name):
    response = app.make_response(('', 204))
    response.headers['Access-Control-Allow-Origin'] = request.headers.get('Origin', 'http://localhost:8000')
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    response.headers['Access-Control-Allow-Headers'] = request.headers.get('Access-Control-Request-Headers', 'Content-Type,Authorization')
    response.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,OPTIONS'
    return response

@app.route('/api/portfolio/<string:portfolio_name>/status/view', methods=['GET'])
@require_google_token
def view_portfolio_status_api(portfolio_name):
    status, last_updated = database.get_portfolio_status_saved(portfolio_name)
    if status:
        return jsonify({'portfolio': portfolio_name, 'status': status, 'last_updated': last_updated})
    else:
        return jsonify({'error': 'No saved status for this portfolio.'}), 404


@app.route('/api/portfolio/<string:portfolio_name>/status', methods=['GET'])
@require_google_token
def get_portfolio_status_api(portfolio_name):
    """API endpoint to get the saved portfolio status (GET)."""
    try:
        from database import get_portfolio_status_saved
        status, last_updated = get_portfolio_status_saved(portfolio_name)
        if status is not None:
            # Flatten the response for frontend compatibility
            response = dict(status)
            response['last_updated'] = last_updated
            return jsonify(response)
        else:
            return jsonify({'error': 'No status found.'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/portfolio/<string:portfolio_name>', methods=['DELETE'])
@require_google_token
def delete_portfolio_api(portfolio_name):
    try:
        database.delete_portfolio(portfolio_name)
        return jsonify({'status': 'deleted', 'portfolio': portfolio_name})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/portfolio/<string:portfolio_name>/transaction/<int:transaction_id>', methods=['DELETE'])
@require_google_token
def delete_transaction_api(portfolio_name, transaction_id):
    try:
        database.delete_transaction(portfolio_name, transaction_id)
        return jsonify({'status': 'deleted', 'transaction_id': transaction_id})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/portfolios', methods=['GET'])
def get_all_portfolios():
    """API endpoint to get all portfolio names."""
    try:
        names = database.get_all_portfolio_names()
        return jsonify({'portfolios': names})
    except Exception as e:
        app.logger.error(f"Failed to fetch portfolio names: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/portfolio/<string:portfolio_name>/status/live', methods=['GET'])
@require_google_token
def get_portfolio_status_live_api(portfolio_name):
    """Compute and return the live portfolio status (and save it to the DB)."""
    try:
        app.logger.info(f"[LIVE STATUS] Fetching transactions for portfolio: {portfolio_name}")
        # Get all transactions for the portfolio
        transactions = database.get_transactions(portfolio_name)
        app.logger.info(f"[LIVE STATUS] Loaded {len(transactions)} transactions: {transactions}")
        if not transactions or len(transactions) == 0:
            app.logger.warning(f"[LIVE STATUS] No transactions found for portfolio: {portfolio_name}")
            return jsonify({'error': 'No transactions found for this portfolio.'}), 404
        # Aggregate quantities by ticker
        from collections import defaultdict
        asset_quantities = defaultdict(float)
        for t in transactions:
            ticker = t.get('ticker')
            qty = t.get('quantity', 0)
            label = t.get('label') or t.get('type')
            app.logger.info(f"[LIVE STATUS] Processing transaction: ticker={ticker}, qty={qty}, label={label}")
            if label.lower() == 'buy':
                asset_quantities[ticker] += qty
            elif label.lower() in ['sell', 'sale']:
                asset_quantities[ticker] -= qty
            # else: ignore other types for now
        app.logger.info(f"[LIVE STATUS] Aggregated asset quantities: {dict(asset_quantities)}")
        # Fetch current prices from yfinance
        import yfinance as yf
        holdings = []
        total_value = 0.0
        for ticker, quantity in asset_quantities.items():
            if not ticker or quantity == 0:
                app.logger.info(f"[LIVE STATUS] Skipping ticker: {ticker} (quantity={quantity})")
                continue
            try:
                app.logger.info(f"[LIVE STATUS] Fetching price for ticker: {ticker}")
                ticker_obj = yf.Ticker(ticker)
                price = ticker_obj.info.get('regularMarketPrice')
                app.logger.info(f"[LIVE STATUS] yfinance info for {ticker}: {ticker_obj.info}")
                if price is None:
                    price = ticker_obj.history(period='1d')['Close'][-1]
                    app.logger.info(f"[LIVE STATUS] Fallback price from history for {ticker}: {price}")
            except Exception as e:
                app.logger.error(f"[LIVE STATUS] Error fetching price for {ticker}: {e}")
                price = None
            value = (price or 0) * quantity
            holdings.append({
                'ticker': ticker,
                'quantity': quantity,
                'price': price,
                'value': value
            })
            total_value += value
        app.logger.info(f"[LIVE STATUS] Holdings: {holdings}")
        app.logger.info(f"[LIVE STATUS] Total portfolio value: {total_value}")
        # Save the computed status to the DB
        status = {'holdings': holdings, 'total_value': total_value}
        database.save_portfolio_status(portfolio_name, status)
        return jsonify({
            'holdings': holdings,
            'total_value': total_value
        })
    except Exception as e:
        app.logger.error(f"[LIVE STATUS] Exception in live status computation: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/ticker/<string:ticker_symbol>', methods=['POST'])
@require_google_token
def save_ticker(ticker_symbol):
    """
    API endpoint to save ticker data (info and history) to the new normalized tables.
    Expects JSON with 'info' and 'history' fields.
    """
    data = safe_get_json()
    if isinstance(data, tuple):  # error response from safe_get_json
        return data
    info = data.get('info')
    history = data.get('history')
    if not info or not history:
        return jsonify({'error': 'Both info and history fields are required.'}), 400
    conn = database.sqlite3.connect(database.DATABASE_NAME)
    cursor = conn.cursor()
    # Save info
    cursor.execute('''
        INSERT OR REPLACE INTO ticker_info (
            ticker, shortName, longName, symbol, sector, industry, country, website, marketCap, currency, exchange, quoteType, regularMarketPrice, previousClose, open, dayHigh, dayLow, fiftyTwoWeekHigh, fiftyTwoWeekLow, volume, averageVolume, trailingPE, forwardPE, dividendYield, longBusinessSummary, last_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        ticker_symbol,
        info.get('shortName'),
        info.get('longName'),
        info.get('symbol'),
        info.get('sector'),
        info.get('industry'),
        info.get('country'),
        info.get('website'),
        info.get('marketCap'),
        info.get('currency'),
        info.get('exchange'),
        info.get('quoteType'),
        info.get('regularMarketPrice'),
        info.get('previousClose'),
        info.get('open'),
        info.get('dayHigh'),
        info.get('dayLow'),
        info.get('fiftyTwoWeekHigh'),
        info.get('fiftyTwoWeekLow'),
        info.get('volume'),
        info.get('averageVolume'),
        info.get('trailingPE'),
        info.get('forwardPE'),
        info.get('dividendYield'),
        info.get('longBusinessSummary'),
        info.get('last_updated') or datetime.now().isoformat()
    ))
    # Save history (delete old, insert new)
    cursor.execute('DELETE FROM ticker_history WHERE ticker = ?', (ticker_symbol,))
    for h in history:
        cursor.execute('''
            INSERT INTO ticker_history (ticker, date, open, close, high, low, volume)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            ticker_symbol,
            h.get('date'),
            h.get('open'),
            h.get('close'),
            h.get('high'),
            h.get('low'),
            h.get('volume')
        ))
    conn.commit()
    conn.close()
    return jsonify({'status': 'saved', 'ticker': ticker_symbol})


@app.errorhandler(404)
def handle_404(e):
    # If the request is a CORS preflight (OPTIONS), return 204 with CORS headers
    if request.method == 'OPTIONS':
        response = app.make_response(('', 204))
        response.headers['Access-Control-Allow-Origin'] = request.headers.get('Origin', 'http://localhost:8000')
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Allow-Headers'] = request.headers.get('Access-Control-Request-Headers', 'Content-Type,Authorization')
        response.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,OPTIONS'
        return response
    return jsonify({'error': 'Not found'}), 404


@app.route('/api/portfolio/<string:portfolio_name>/ticker/<string:ticker>/performance', methods=['GET'])
def ticker_performance_api(portfolio_name, ticker):
    """API endpoint to get the historical value of a single ticker in a portfolio."""
    perf = portfolio.compute_ticker_performance(portfolio_name, ticker)
    return jsonify(perf)


@app.route('/api/benchmark/<ticker>/performance', methods=['GET'])
def api_benchmark_performance(ticker):
    """
    API endpoint to get the historical performance of a benchmark ticker (not tied to a portfolio).
    Returns a list of dicts: [{date: ..., value: ..., abs_value: ..., pct: ...}, ...]
    """
    from portfolio import compute_benchmark_performance
    result = compute_benchmark_performance(ticker)
    return jsonify(result)


@app.route('/api/portfolio/<string:portfolio_name>/kpis', methods=['GET'])
def get_portfolio_kpis_api(portfolio_name):
    """
    API endpoint to get key KPIs for the portfolio dashboard cards.
    Returns a dict with:
      - portfolio_value: {abs_value, net_value}
      - net_performance: %
      - best_ticker: {symbol, pct}
      - highest_value_ticker: {symbol, abs_value}
      - worst_ticker: {symbol, pct}
    """
    perf = portfolio.compute_portfolio_performance(portfolio_name)
    tickers = set()
    for t in portfolio.database.get_transactions(portfolio_name):
        if t.get('ticker'):
            tickers.add(t['ticker'])
    # Portfolio value and net value
    last = perf[-1] if perf else None
    abs_value = last['abs_value'] if last and 'abs_value' in last else 0.0
    net_value = last['value'] if last and 'value' in last else 0.0
    net_performance = last['pct'] if last and 'pct' in last else 0.0
    # Best/worst/highest tickers
    best_ticker = None
    best_pct = float('-inf')
    worst_ticker = None
    worst_pct = float('inf')
    highest_value_ticker = None
    highest_value = float('-inf')
    for ticker in tickers:
        ticker_perf = portfolio.compute_ticker_performance(portfolio_name, ticker)
        if ticker_perf:
            last_t = ticker_perf[-1]
            pct = last_t.get('pct', 0.0)
            abs_val = last_t.get('abs_value', 0.0)
            if pct > best_pct:
                best_pct = pct
                best_ticker = ticker
            if pct < worst_pct:
                worst_pct = pct
                worst_ticker = ticker
            if abs_val > highest_value:
                highest_value = abs_val
                highest_value_ticker = ticker
    return jsonify({
        'portfolio_value': {'abs_value': abs_value, 'net_value': net_value},
        'net_performance': net_performance,
        'best_ticker': {'symbol': best_ticker, 'pct': best_pct} if best_ticker else None,
        'highest_value_ticker': {'symbol': highest_value_ticker, 'abs_value': highest_value} if highest_value_ticker else None,
        'worst_ticker': {'symbol': worst_ticker, 'pct': worst_pct} if worst_ticker else None
    })


@app.route('/api/portfolio/<string:portfolio_name>/allocation', methods=['GET'])
@require_google_token
def get_portfolio_allocation_api(portfolio_name):
    """
    API endpoint to get asset allocation data for the portfolio dashboard chart.
    Query param 'grouping' can be 'overall' or 'quoteType'.
    Returns allocation data as JSON.
    """
    grouping = request.args.get('grouping', 'overall')
    if grouping == 'quoteType':
        data = portfolio.get_asset_allocation_by_quote_type(portfolio_name)
    else:
        data = portfolio.get_overall_asset_allocation(portfolio_name)
    return jsonify({'grouping': grouping, 'allocation': data})


@app.route('/api/portfolio/<string:portfolio_name>/returns', methods=['GET'])
@require_google_token
def get_portfolio_returns_api(portfolio_name):
    """
    API endpoint to get yesterday, weekly, and monthly returns for the portfolio and each ticker.
    Returns a dict:
    {
        'yesterday': { 'portfolio': ..., 'tickers': ... },
        'weekly': { ... },
        'monthly': { ... }
    }
    """
    y = portfolio.get_last_day_possible_returns(portfolio_name)
    w = portfolio.get_weekly_returns(portfolio_name)
    m = portfolio.get_monthly_returns(portfolio_name)
    three_month = portfolio.get_three_month_returns(portfolio_name)
    ytd = portfolio.get_ytd_returns(portfolio_name)
    return jsonify({
        'yesterday': y,
        'weekly': w,
        'monthly': m,
        'three_month': three_month,
        'ytd': ytd
    })


@app.route('/api/portfolio/<string:portfolio_name>/kpis/returns', methods=['GET'])
@require_google_token
def get_portfolio_return_kpis_api(portfolio_name):
    """
    API endpoint to get return KPIs for the portfolio dashboard cards (yesterday, weekly, monthly returns).
    Returns a dict with:
      - yesterday_return: {portfolio, tickers}
      - weekly_return: {portfolio, tickers}
      - monthly_return: {portfolio, tickers}
    """
    y = portfolio.get_last_day_possible_returns(portfolio_name)
    w = portfolio.get_weekly_returns(portfolio_name)
    m = portfolio.get_monthly_returns(portfolio_name)
    three_month = portfolio.get_three_month_returns(portfolio_name)
    ytd = portfolio.get_ytd_returns(portfolio_name)
    # For KPI cards, just return the portfolio return_pct for each period
    return jsonify({
        'yesterday_return': y['portfolio']['return_pct'] if y['portfolio'] else None,
        'weekly_return': w['portfolio']['return_pct'] if w['portfolio'] else None,
        'monthly_return': m['portfolio']['return_pct'] if m['portfolio'] else None,
        'three_month_return': three_month['portfolio']['return_pct'] if three_month['portfolio'] else None,
        'ytd_return': ytd['portfolio']['return_pct'] if ytd['portfolio'] else None,
        'yesterday_ticker_returns': y['tickers'],
        'weekly_ticker_returns': w['tickers'],
        'monthly_ticker_returns': m['tickers'],
        'three_month_ticker_returns': three_month['tickers'],
        'ytd_ticker_returns': ytd['tickers']
    })



@app.route('/api/portfolio/<string:portfolio_name>/report', methods=['GET', 'POST'])
@require_google_token
def generate_portfolio_report_api(portfolio_name):
    """
    API endpoint to generate a Gemini-based report for a portfolio.
    Expects JSON body with optional overrides for status, returns, performance, tickers, etc.
    If not provided, will compute/fetch them.
    Accepts 'force' as a query param or in the JSON body.
    Supports both GET and POST requests.
    """
    from report_generator import generate_portfolio_report_with_gemini
    import portfolio as pf
    if request.method == 'POST':
        data = safe_get_json()
    else:
        data = {}
    # Try to get status, returns, performance, tickers from request or compute them
    status = data.get('status') if isinstance(data, dict) else None
    if not status:
        status = pf.get_portfolio_status(portfolio_name)
    returns = data.get('returns') if isinstance(data, dict) else None
    if not returns:
        returns = {
            'yesterday': pf.get_last_day_possible_returns(portfolio_name),
            'weekly': pf.get_weekly_returns(portfolio_name),
            'monthly': pf.get_monthly_returns(portfolio_name),
            'three_month': pf.get_three_month_returns(portfolio_name),
            'ytd': pf.get_ytd_returns(portfolio_name)
        }
    # Parse 'force' from query string or JSON body
    force = False
    if 'force' in request.args:
        force_val = request.args.get('force', 'false').lower()
        force = force_val in ['1', 'true', 'yes', 'on']
    elif isinstance(data, dict) and 'force' in data:
        force = bool(data.get('force'))
    app.logger.info(f"[LLM INPUT] Portfolio report for {portfolio_name}:\nStatus: {status}\nReturns: {returns}\nForce: {force}\n")
    report, cost = generate_portfolio_report_with_gemini(
        portfolio_name,
        status,
        returns,
        force
    )
    return jsonify({'portfolio': portfolio_name, 'report': report, 'cost': cost})


@app.route('/api/portfolio/<string:portfolio_name>/tickers/report', methods=['POST'])
@require_google_token
def generate_multi_ticker_report_api(portfolio_name):
    """
    API endpoint to generate a Gemini-based report for multiple tickers in a portfolio.
    Expects JSON body with:
      - tickers: list of ticker symbols
      - holdings_list: list of holding dicts (optional, will compute if not provided)
      - weights: list of weights (optional, will compute if not provided)
      - status: portfolio status (optional, will compute if not provided)
      - returns_dict: dict mapping ticker to returns (optional, will compute if not provided)
      - model_name: Gemini model name (optional)
    """
    from report_generator import generate_multi_ticker_report_with_gemini
    import portfolio as pf
    data = safe_get_json()
    tickers = data.get('tickers')
    if not tickers or not isinstance(tickers, list) or len(tickers) < 2:
        return jsonify({'error': 'At least two tickers must be provided.'}), 400
    status = data.get('status') or pf.get_portfolio_status(portfolio_name)
    holdings_list = data.get('holdings_list')
    if not holdings_list:
        # Compute holdings for each ticker
        all_holdings = status.get('holdings', [])
        holdings_list = [next((h for h in all_holdings if h['ticker'].upper() == t.upper()), {}) for t in tickers]
    weights = data.get('weights')
    if not weights:
        total_value = status.get('total_value', 0.0) or 1.0
        weights = [(h.get('value', 0.0) / total_value) if total_value else 0.0 for h in holdings_list]
    returns_dict = data.get('returns_dict')
    if not returns_dict:
        returns_dict = {}
        for t in tickers:
            returns_dict[t] = {
                'yesterday': pf.get_ticker_last_day_possible_returns(portfolio_name, t),
                'weekly': pf.get_ticker_weekly_returns(portfolio_name, t),
                'monthly': pf.get_ticker_monthly_returns(portfolio_name, t),
                'three_month': pf.get_ticker_three_month_returns(portfolio_name, t),
                'ytd': pf.get_ticker_ytd_returns(portfolio_name, t)
            }
    model_name = data.get('model_name') or GEMINI_2_0_FLASH
    # Call the report generator
    app.logger.info(f"[LLM INPUT] Multi-ticker report for {portfolio_name}:\nTickers: {tickers}\nHoldings: {holdings_list}\nWeights: {weights}\nStatus: {status}\nReturns: {returns_dict}\nModel: {model_name}")
    report = generate_multi_ticker_report_with_gemini(
        tickers,
        holdings_list,
        weights,
        status,
        returns_dict,
        model_name
    )
    # app.logger.info(f"[LLM OUTPUT] Multi-ticker report for {portfolio_name}: {report}")
    return jsonify({'portfolio': portfolio_name, 'tickers': tickers, 'report': report})


@app.route('/api/portfolio/<string:portfolio_name>/ticker/<string:ticker>/report', methods=['GET', 'POST'])
@require_google_token
def generate_ticker_report_api(portfolio_name, ticker):
    """
    API endpoint to generate a Gemini-based report for a ticker in a portfolio (GET/POST, with DB caching logic).
    Expects JSON body with optional overrides for holdings, weight, status, returns, ticker_performance.
    Accepts 'force' as a query param or in the JSON body.
    If not provided, will compute/fetch them.
    """
    from report_generator import generate_ticker_report_with_gemini
    import portfolio as pf
    import database as db
    if request.method == 'POST':
        data = safe_get_json()
    else:
        data = {}
    # Try to get holdings, weight, status, returns, ticker_performance from request or compute them
    status = data.get('status') if isinstance(data, dict) else None
    if not status:
        status = pf.get_portfolio_status(portfolio_name)
    holdings_list = status.get('holdings', [])
    holding = next((h for h in holdings_list if h['ticker'].upper() == ticker.upper()), None)
    holdings = holding or {}
    total_value = status.get('total_value', 0.0) or 1.0
    weight = holdings.get('value', 0.0) / total_value if total_value else 0.0
    returns = data.get('returns') if isinstance(data, dict) else None
    if not returns:
        # Try to get all returns periods for this ticker
        returns = {}
        y = pf.get_ticker_last_day_possible_returns(portfolio_name, ticker)
        w = pf.get_ticker_weekly_returns(portfolio_name, ticker)
        m = pf.get_ticker_monthly_returns(portfolio_name, ticker)
        three_m = pf.get_ticker_three_month_returns(portfolio_name, ticker)
        ytd = pf.get_ticker_ytd_returns(portfolio_name, ticker)
        returns = {
            'yesterday': y,
            'weekly': w,
            'monthly': m,
            'three_month': three_m,
            'ytd': ytd
        }
    # Parse 'force' from query string or JSON body
    force = False
    if 'force' in request.args:
        force_val = request.args.get('force', 'false').lower()
        force = force_val in ['1', 'true', 'yes', 'on']
    elif isinstance(data, dict) and 'force' in data:
        force = bool(data.get('force'))
    # Fetch ticker_info from DB
    conn = db.sqlite3.connect(db.DATABASE_NAME)
    conn.row_factory = db.sqlite3.Row
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM ticker_info WHERE ticker = ?', (ticker.upper(),))
    ticker_info_row = cursor.fetchone()
    ticker_info = dict(ticker_info_row) if ticker_info_row else None
    conn.close()
    # app.logger.info(f"[LLM INPUT] Ticker report for {ticker} in {portfolio_name}:\nHoldings: {holdings}\nWeight: {weight}\nStatus: {status}\nReturns: {returns}\nTicker Info: {ticker_info}\nForce: {force}\n")
    report, cost = generate_ticker_report_with_gemini(
        ticker,
        holdings,
        weight,
        status,
        returns,
        ticker_info,
        force
    )
    return jsonify({'ticker': ticker, 'report': report, 'cost': cost})


if __name__ == '__main__':
    # Run the Flask app
    # In a production environment, you would use a proper WSGI server like Gunicorn
    app.run(host="0.0.0.0", port=5000, debug=False)
