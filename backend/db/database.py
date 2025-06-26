import sqlite3
import json
from datetime import datetime
from services import data_fetcher
import time

DATABASE_NAME = 'ticker_data.db'


def init_db():
    """Initializes the database and creates the necessary tables if they don't exist."""
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    # Table for cached ticker data
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tickers (
            ticker TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            last_updated TIMESTAMP NOT NULL
        )
    ''')

    # Table for portfolios
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS portfolios (
            name TEXT PRIMARY KEY
        )
    ''')

    # Table for transactions
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            portfolio TEXT NOT NULL,
            ticker TEXT NOT NULL,
            quantity REAL NOT NULL,
            price REAL NOT NULL,
            date TEXT NOT NULL,
            label TEXT,
            name TEXT,
            FOREIGN KEY(portfolio) REFERENCES portfolios(name)
        )
    ''')

    # New: Table for portfolio status (flattened)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS portfolio_status (
            portfolio TEXT PRIMARY KEY,
            total_value REAL NOT NULL,
            last_updated TIMESTAMP NOT NULL
        )
    ''')

    # New: Table for portfolio holdings (one row per asset per portfolio)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS portfolio_holdings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            portfolio TEXT NOT NULL,
            ticker TEXT NOT NULL,
            name TEXT,
            quantity REAL NOT NULL,
            price REAL NOT NULL,
            value REAL NOT NULL,
            FOREIGN KEY(portfolio) REFERENCES portfolios(name)
        )
    ''')

    # New: Table for ticker_info (flat columns for each info field)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS ticker_info (
            ticker TEXT PRIMARY KEY,
            shortName TEXT,
            longName TEXT,
            symbol TEXT,
            sector TEXT,
            sectorKey TEXT,
            sectorDisp TEXT,
            industry TEXT,
            industryKey TEXT,
            industryDisp TEXT,
            country TEXT,
            address1 TEXT,
            address2 TEXT,
            city TEXT,
            zip TEXT,
            phone TEXT,
            website TEXT,
            fullTimeEmployees INTEGER,
            longBusinessSummary TEXT,
            maxAge INTEGER,
            priceHint INTEGER,
            previousClose REAL,
            open REAL,
            dayLow REAL,
            dayHigh REAL,
            regularMarketPreviousClose REAL,
            regularMarketOpen REAL,
            regularMarketDayLow REAL,
            regularMarketDayHigh REAL,
            dividendRate REAL,
            dividendYield REAL,
            exDividendDate INTEGER,
            payoutRatio REAL,
            beta REAL,
            trailingPE REAL,
            volume INTEGER,
            regularMarketVolume INTEGER,
            averageVolume INTEGER,
            averageVolume10days INTEGER,
            averageDailyVolume10Day INTEGER,
            bid REAL,
            ask REAL,
            marketCap REAL,
            fiftyTwoWeekLow REAL,
            fiftyTwoWeekHigh REAL,
            priceToSalesTrailing12Months REAL,
            fiftyDayAverage REAL,
            twoHundredDayAverage REAL,
            trailingAnnualDividendRate REAL,
            trailingAnnualDividendYield REAL,
            currency TEXT,
            tradeable BOOLEAN,
            enterpriseValue REAL,
            forwardPE REAL,
            profitMargins REAL,
            floatShares INTEGER,
            sharesOutstanding INTEGER,
            heldPercentInsiders REAL,
            heldPercentInstitutions REAL,
            impliedSharesOutstanding INTEGER,
            bookValue REAL,
            priceToBook REAL,
            lastFiscalYearEnd INTEGER,
            nextFiscalYearEnd INTEGER,
            mostRecentQuarter INTEGER,
            earningsQuarterlyGrowth REAL,
            netIncomeToCommon REAL,
            trailingEps REAL,
            enterpriseToRevenue REAL,
            enterpriseToEbitda REAL,
            lastDividendValue REAL,
            lastDividendDate INTEGER,
            quoteType TEXT,
            currentPrice REAL,
            targetHighPrice REAL,
            targetLowPrice REAL,
            targetMeanPrice REAL,
            targetMedianPrice REAL,
            recommendationMean REAL,
            recommendationKey TEXT,
            numberOfAnalystOpinions INTEGER,
            totalCash REAL,
            totalCashPerShare REAL,
            ebitda REAL,
            totalDebt REAL,
            quickRatio REAL,
            currentRatio REAL,
            totalRevenue REAL,
            debtToEquity REAL,
            revenuePerShare REAL,
            returnOnAssets REAL,
            returnOnEquity REAL,
            grossProfits REAL,
            freeCashflow REAL,
            operatingCashflow REAL,
            earningsGrowth REAL,
            revenueGrowth REAL,
            grossMargins REAL,
            ebitdaMargins REAL,
            operatingMargins REAL,
            financialCurrency TEXT,
            language TEXT,
            region TEXT,
            typeDisp TEXT,
            quoteSourceName TEXT,
            triggerable BOOLEAN,
            customPriceAlertConfidence TEXT,
            regularMarketChange REAL,
            regularMarketDayRange TEXT,
            fullExchangeName TEXT,
            averageDailyVolume3Month INTEGER,
            fiftyTwoWeekLowChange REAL,
            fiftyTwoWeekLowChangePercent REAL,
            fiftyTwoWeekRange TEXT,
            fiftyTwoWeekHighChange REAL,
            fiftyTwoWeekHighChangePercent REAL,
            fiftyTwoWeekChangePercent REAL,
            epsTrailingTwelveMonths REAL,
            epsCurrentYear REAL,
            priceEpsCurrentYear REAL,
            fiftyDayAverageChange REAL,
            fiftyDayAverageChangePercent REAL,
            twoHundredDayAverageChange REAL,
            twoHundredDayAverageChangePercent REAL,
            sourceInterval INTEGER,
            exchangeDataDelayedBy INTEGER,
            averageAnalystRating TEXT,
            cryptoTradeable BOOLEAN,
            corporateActions TEXT,
            regularMarketTime INTEGER,
            exchange TEXT,
            messageBoardId TEXT,
            exchangeTimezoneName TEXT,
            exchangeTimezoneShortName TEXT,
            gmtOffSetMilliseconds INTEGER,
            market TEXT,
            esgPopulated BOOLEAN,
            hasPrePostMarketData BOOLEAN,
            firstTradeDateMilliseconds INTEGER,
            regularMarketChangePercent REAL,
            regularMarketPrice REAL,
            marketState TEXT,
            trailingPegRatio REAL,
            last_updated TIMESTAMP
        )
    ''')

    # New: Table for ticker_history (one row per date, with OHLCV fields)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS ticker_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT NOT NULL,
            date TEXT NOT NULL,
            open REAL,
            close REAL,
            high REAL,
            low REAL,
            volume REAL,
            UNIQUE(ticker, date),
            FOREIGN KEY(ticker) REFERENCES ticker_info(ticker)
        )
    ''')
    # Ensure unique index exists for upsert even if table already created
    cursor.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_ticker_date ON ticker_history(ticker, date);')

    # New: Table for portfolio reports (stores generated reports with reference date)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS portfolio_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            portfolio TEXT NOT NULL,
            report_json TEXT NOT NULL,
            cost REAL,  -- Optional cost of the report generation
            reference_date DATETIME NOT NULL,  -- ISO date string when the report was generated
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(portfolio, reference_date)
        )
    ''')

    # New: Table for ticker_reports (stores generated reports for tickers)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS ticker_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT NOT NULL,
            report_json TEXT NOT NULL,
            cost REAL,
            reference_date DATETIME NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(ticker, reference_date)
        )
    ''')

    conn.commit()
    conn.close()
    print("Database initialized.")


def get_ticker_data(ticker_symbol):
    """
    Retrieves data for a specific ticker from the database.
    Returns (data, last_updated) tuple or (None, None) if not found.
    """
    conn = sqlite3.connect(DATABASE_NAME)
    # This row_factory allows accessing columns by name
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("SELECT data, last_updated FROM tickers WHERE ticker = ?", (ticker_symbol,))
    row = cursor.fetchone()
    conn.close()

    if row:
        # The data is stored as a JSON string, so we parse it back into a Python dict
        data = json.loads(row['data'])
        # The timestamp is stored as a string, so we parse it back into a datetime object
        last_updated = datetime.fromisoformat(row['last_updated'])
        return data, last_updated

    return None, None


def save_ticker_data(ticker_symbol, data, max_retries=5, base_delay=0.2):
    """
    Saves or updates the data for a specific ticker in the database, including ticker_info and ticker_history tables.
    The `OR REPLACE` clause handles both new insertions and updates.
    Implements retry logic to handle sqlite3.OperationalError: database is locked.
    """
    attempt = 0
    while True:
        try:
            conn = sqlite3.connect(DATABASE_NAME)
            cursor = conn.cursor()

            # Serialize the data dictionary into a JSON string for storage
            data_json = json.dumps(data)
            current_time = datetime.now().isoformat()

            # Save to tickers table (raw data)
            cursor.execute('''
                INSERT OR REPLACE INTO tickers (ticker, data, last_updated)
                VALUES (?, ?, ?)
            ''', (ticker_symbol, data_json, current_time))

            # Save to ticker_info table (flat fields)
            info = data.get('info', {})
            ticker_info_fields = [
                'ticker', 'shortName', 'longName', 'symbol', 'sector', 'sectorKey', 'sectorDisp', 'industry', 'industryKey', 'industryDisp',
                'country', 'address1', 'address2', 'city', 'zip', 'phone', 'website', 'fullTimeEmployees', 'longBusinessSummary',
                'maxAge', 'priceHint', 'previousClose', 'open', 'dayLow', 'dayHigh', 'regularMarketPreviousClose', 'regularMarketOpen',
                'regularMarketDayLow', 'regularMarketDayHigh', 'dividendRate', 'dividendYield', 'exDividendDate', 'payoutRatio', 'beta',
                'trailingPE', 'volume', 'regularMarketVolume', 'averageVolume', 'averageVolume10days', 'averageDailyVolume10Day', 'bid', 'ask',
                'marketCap', 'fiftyTwoWeekLow', 'fiftyTwoWeekHigh', 'priceToSalesTrailing12Months', 'fiftyDayAverage', 'twoHundredDayAverage',
                'trailingAnnualDividendRate', 'trailingAnnualDividendYield', 'currency', 'tradeable', 'enterpriseValue', 'forwardPE',
                'profitMargins', 'floatShares', 'sharesOutstanding', 'heldPercentInsiders', 'heldPercentInstitutions', 'impliedSharesOutstanding',
                'bookValue', 'priceToBook', 'lastFiscalYearEnd', 'nextFiscalYearEnd', 'mostRecentQuarter', 'earningsQuarterlyGrowth',
                'netIncomeToCommon', 'trailingEps', 'enterpriseToRevenue', 'enterpriseToEbitda',
                'lastDividendValue', 'lastDividendDate', 'quoteType', 'currentPrice', 'targetHighPrice', 'targetLowPrice', 'targetMeanPrice',
                'targetMedianPrice', 'recommendationMean', 'recommendationKey', 'numberOfAnalystOpinions', 'totalCash', 'totalCashPerShare',
                'ebitda', 'totalDebt', 'quickRatio', 'currentRatio', 'totalRevenue', 'debtToEquity', 'revenuePerShare', 'returnOnAssets',
                'returnOnEquity', 'grossProfits', 'freeCashflow', 'operatingCashflow', 'earningsGrowth', 'revenueGrowth', 'grossMargins',
                'ebitdaMargins', 'operatingMargins', 'financialCurrency', 'language', 'region', 'typeDisp', 'quoteSourceName', 'triggerable',
                'customPriceAlertConfidence', 'regularMarketChange', 'regularMarketDayRange', 'fullExchangeName', 'averageDailyVolume3Month',
                'fiftyTwoWeekLowChange', 'fiftyTwoWeekLowChangePercent', 'fiftyTwoWeekRange', 'fiftyTwoWeekHighChange',
                'fiftyTwoWeekHighChangePercent', 'fiftyTwoWeekChangePercent', 'epsTrailingTwelveMonths', 'epsCurrentYear', 'priceEpsCurrentYear',
                'fiftyDayAverageChange', 'fiftyDayAverageChangePercent', 'twoHundredDayAverageChange', 'twoHundredDayAverageChangePercent',
                'sourceInterval', 'exchangeDataDelayedBy', 'averageAnalystRating', 'cryptoTradeable', 'corporateActions', 'regularMarketTime',
                'exchange', 'messageBoardId', 'exchangeTimezoneName', 'exchangeTimezoneShortName', 'gmtOffSetMilliseconds', 'market',
                'esgPopulated', 'hasPrePostMarketData', 'firstTradeDateMilliseconds', 'regularMarketChangePercent', 'regularMarketPrice',
                'marketState', 'trailingPegRatio'
            ]
            def safe_sql_col(col):
                if col and col[0].isdigit():
                    return f'_{col}'
                return col
            info_key_to_col = {k: safe_sql_col(k) for k in ticker_info_fields}
            existing_cols = set(row[1] for row in cursor.execute("PRAGMA table_info(ticker_info)").fetchall())
            for col in info_key_to_col.values():
                if col not in existing_cols:
                    cursor.execute(f"ALTER TABLE ticker_info ADD COLUMN {col} TEXT")
            def serialize_if_needed(val):
                if isinstance(val, (list, dict)):
                    return None
                return val
            values = [
                ticker_symbol
            ] + [serialize_if_needed(info.get(k)) for k in ticker_info_fields[1:]] + [current_time]
            sql_cols = ', '.join([safe_sql_col(f) for f in ticker_info_fields] + ['last_updated'])
            sql_qs = ', '.join(['?'] * (len(ticker_info_fields) + 1))
            cursor.execute(f'''
                INSERT OR REPLACE INTO ticker_info ({sql_cols})
                VALUES ({sql_qs})
            ''', values)
            history = data.get('history', [])
            if history:
                for h in history:
                    h_date = h.get('date') or h.get('Date')
                    cursor.execute('''
                        INSERT INTO ticker_history (ticker, date, open, close, high, low, volume)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(ticker, date) DO UPDATE SET
                            open=excluded.open,
                            close=excluded.close,
                            high=excluded.high,
                            low=excluded.low,
                            volume=excluded.volume
                    ''', (
                        ticker_symbol,
                        h_date,
                        h.get('open') if 'open' in h else h.get('Open'),
                        h.get('close') if 'close' in h else h.get('Close'),
                        h.get('high') if 'high' in h else h.get('High'),
                        h.get('low') if 'low' in h else h.get('Low'),
                        h.get('volume') if 'volume' in h else h.get('Volume')
                    ))
            conn.commit()
            conn.close()
            break  # Success
        except sqlite3.OperationalError as e:
            if 'database is locked' in str(e) and attempt < max_retries:
                delay = base_delay * (2 ** attempt)
                time.sleep(delay)
                attempt += 1
                continue
            else:
                raise


def create_portfolio(name):
    """Create a portfolio if it doesn't already exist."""
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT OR IGNORE INTO portfolios (name) VALUES (?)",
        (name,)
    )
    conn.commit()
    conn.close()


def save_transactions(portfolio, transactions, max_retries=5, base_delay=0.2):
    """Save a list of transactions for a portfolio. For each unique ticker, fetch and store ticker data. Returns list of inserted transaction dicts with IDs."""
    # Ensure the portfolio exists in the portfolios table
    create_portfolio(portfolio)
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    inserted = []
    unique_tickers = set()
    for t in transactions:
        cursor.execute(
            """
            INSERT INTO transactions (portfolio, ticker, quantity, price, date, label, name)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                portfolio,
                t.get("ticker"),
                t.get("quantity"),
                t.get("price"),
                t.get("date"),
                t.get("label"),
                t.get("name"),
            ),
        )
        unique_tickers.add(t.get("ticker"))
        # Fetch the auto-generated id
        inserted_id = cursor.lastrowid
        inserted.append({
            'id': inserted_id,
            'portfolio': portfolio,
            'ticker': t.get("ticker"),
            'quantity': t.get("quantity"),
            'price': t.get("price"),
            'date': t.get("date"),
            'label': t.get("label"),
            'name': t.get("name"),
        })
    conn.commit()
    conn.close()
    # After saving transactions, fetch and store ticker data for each unique ticker using save_ticker_data
    for ticker in unique_tickers:
        if not ticker:
            continue
        try:
            data, _ = data_fetcher.fetch_with_cache(ticker)
            if data:
                save_ticker_data(ticker, data, max_retries=max_retries, base_delay=base_delay)
        except Exception as e:
            print(f"[save_transactions] Failed to fetch/store ticker data for {ticker}: {e}")
    # Invalidate performance cache for this portfolio
    from core.portfolio import clear_performance_caches
    clear_performance_caches(portfolio)
    return inserted


def get_transactions(portfolio=None):
    """Get all transactions, or all for a given portfolio."""
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    if portfolio:
        cursor.execute(
            "SELECT id, portfolio, ticker, quantity, price, date, label, name FROM transactions WHERE portfolio = ? ORDER BY date ASC, id ASC",
            (portfolio,)
        )
    else:
        cursor.execute(
            "SELECT id, portfolio, ticker, quantity, price, date, label, name FROM transactions ORDER BY date ASC, id ASC"
        )
    rows = cursor.fetchall()
    conn.close()
    keys = ["id", "portfolio", "ticker", "quantity", "price", "date", "label", "name"]
    return [dict(zip(keys, row)) for row in rows]


def aggregate_positions(transactions):
    """Return a dict of ticker -> total quantity."""
    positions = {}
    for t in transactions:
        qty = float(t.get("quantity", 0))
        ticker = t.get("ticker")
        positions[ticker] = positions.get(ticker, 0) + qty
    return positions


def save_portfolio_status(portfolio, status):
    """Save the computed portfolio status (holdings, total_value) to the new flat tables."""
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    # Ensure tables exist
    init_db()
    # Remove old status if exists
    cursor.execute('DELETE FROM portfolio_status WHERE portfolio = ?', (portfolio,))
    cursor.execute('DELETE FROM portfolio_holdings WHERE portfolio = ?', (portfolio,))
    # Insert new status
    total_value = status.get('total_value', 0)
    last_updated = datetime.now().isoformat()
    cursor.execute('''
        INSERT INTO portfolio_status (portfolio, total_value, last_updated)
        VALUES (?, ?, ?)
    ''', (portfolio, total_value, last_updated))
    # Insert holdings
    holdings = status.get('holdings', [])
    for h in holdings:
        cursor.execute('''
            INSERT INTO portfolio_holdings (portfolio, ticker, name, quantity, price, value)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            portfolio,
            h.get('ticker'),
            h.get('name'),
            h.get('quantity', 0),
            h.get('price', 0),
            h.get('value', 0)
        ))
    conn.commit()
    conn.close()


def get_portfolio_status_saved(portfolio):
    """Retrieve the saved portfolio status from the new flat tables. If missing, auto-create an empty status using yfinance (via data_fetcher)."""
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    # Get top-level status
    cursor.execute('''
        SELECT total_value, last_updated FROM portfolio_status WHERE portfolio = ?
    ''', (portfolio,))
    row = cursor.fetchone()
    if not row:
        # Auto-create empty status if missing, using yfinance for tickers
        transactions = get_transactions(portfolio)
        positions = aggregate_positions(transactions)
        holdings = []
        total_value = 0.0
        for ticker, qty in positions.items():
            if qty == 0:
                continue
            # Fetch latest info from yfinance (via data_fetcher)
            data, _ = data_fetcher.fetch_with_cache(ticker)
            info = (data or {}).get('info', {})
            price = info.get('regularMarketPrice') or 0
            name = info.get('shortName') or ticker
            value = price * qty
            total_value += value
            holdings.append({
                'ticker': ticker,
                'name': name,
                'quantity': qty,
                'price': price,
                'value': value
            })
        last_updated = datetime.now().isoformat()
        cursor.execute('''
            INSERT INTO portfolio_status (portfolio, total_value, last_updated)
            VALUES (?, ?, ?)
        ''', (portfolio, total_value, last_updated))
        # Insert holdings
        for h in holdings:
            cursor.execute('''
                INSERT INTO portfolio_holdings (portfolio, ticker, name, quantity, price, value)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (
                portfolio,
                h['ticker'],
                h['name'],
                h['quantity'],
                h['price'],
                h['value']
            ))
        conn.commit()
    else:
        total_value, last_updated = row
        # Get holdings
        cursor.execute('''
            SELECT ticker, name, quantity, price, value FROM portfolio_holdings WHERE portfolio = ?
        ''', (portfolio,))
        holdings = [
            {
                'ticker': h[0],
                'name': h[1],
                'quantity': h[2],
                'price': h[3],
                'value': h[4]
            }
            for h in cursor.fetchall()
        ]
    conn.close()
    status = {
        'total_value': total_value,
        'holdings': holdings
    }
    return status, last_updated


def delete_portfolio(portfolio_name):
    """Delete a portfolio and all its related data (transactions, status)."""
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM transactions WHERE portfolio = ?", (portfolio_name,))
    cursor.execute("DELETE FROM portfolio_status WHERE portfolio = ?", (portfolio_name,))
    cursor.execute("DELETE FROM portfolio_holdings WHERE portfolio = ?", (portfolio_name,))
    cursor.execute("DELETE FROM portfolios WHERE name = ?", (portfolio_name,))
    conn.commit()
    conn.close()
    # Invalidate performance cache for this portfolio
    from core.portfolio import clear_performance_caches
    clear_performance_caches(portfolio_name)


def delete_transaction(portfolio_name, transaction_id):
    """Delete a specific transaction by ID for a portfolio."""
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM transactions WHERE id = ? AND portfolio = ?", (transaction_id, portfolio_name))
    conn.commit()
    conn.close()
    # Invalidate performance cache for this portfolio
    from core.portfolio import clear_performance_caches
    clear_performance_caches(portfolio_name)


def get_all_portfolio_names():
    """Return a list of all portfolio names in the database."""
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    cursor.execute("SELECT distinct name FROM portfolios ORDER BY name")
    rows = cursor.fetchall()
    conn.close()
    return [row[0] for row in rows]


def get_transaction_by_id(transaction_id):
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, portfolio, ticker, quantity, price, date, label, name FROM transactions WHERE id = ?",
        (transaction_id,)
    )
    row = cursor.fetchone()
    conn.close()
    if row:
        keys = ["id", "portfolio", "ticker", "quantity", "price", "date", "label", "name"]
        return dict(zip(keys, row))
    return None


def migrate_tickers_to_new_schema():
    """Migrate data from old tickers table to ticker_info and ticker_history tables (with OHLCV fields)."""
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    cursor.execute('SELECT ticker, data, last_updated FROM tickers')
    rows = cursor.fetchall()
    for row in rows:
        ticker, data_json, last_updated = row
        try:
            data = json.loads(data_json)
            info = data.get('info', {})
            history = data.get('history', [])
            # Insert into ticker_info
            cursor.execute('''
                INSERT OR REPLACE INTO ticker_info (
                    ticker, shortName, longName, symbol, sector, industry, country, website, marketCap, currency, exchange, quoteType, regularMarketPrice, previousClose, open, dayHigh, dayLow, fiftyTwoWeekHigh, fiftyTwoWeekLow, volume, averageVolume, trailingPE, forwardPE, dividendYield, longBusinessSummary, last_updated
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                ticker,
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
                last_updated
            ))
            # Insert into ticker_history (with OHLCV fields)
            for h in history:
                date = h.get('date')
                open_ = h.get('open')
                close = h.get('close')
                high = h.get('high')
                low = h.get('low')
                volume = h.get('volume')
                if date is not None:
                    cursor.execute('''
                        INSERT INTO ticker_history (ticker, date, open, close, high, low, volume) VALUES (?, ?, ?, ?, ?, ?, ?)
                    ''', (ticker, date, open_, close, high, low, volume))
        except Exception as e:
            print(f"Migration failed for ticker {ticker}: {e}")
    conn.commit()
    conn.close()


def fix_history_date_column(df):
    """Ensure the 'Date' column in a DataFrame is datetime type before using .dt accessor."""
    import pandas as pd
    if 'Date' in df.columns:
        df['Date'] = pd.to_datetime(df['Date'], errors='coerce')
    return df


def get_ticker_history(ticker):
    """
    Return a list of dicts with historical OHLCV data for the given ticker, sorted by date ascending.
    Each dict contains: date, open, close, high, low, volume.
    """
    conn = sqlite3.connect(DATABASE_NAME)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute('''
        SELECT date, open, close, high, low, volume
        FROM ticker_history
        WHERE ticker = ?
        ORDER BY date ASC
    ''', (ticker,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def save_portfolio_report(portfolio, report, reference_date=None, cost=None):
    """Save a generated portfolio report to the portfolio_reports table. reference_date is an ISO datetime string (default: now)."""
    if reference_date is None:
        reference_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    report_json = json.dumps(report)
    cursor.execute('''
        INSERT OR REPLACE INTO portfolio_reports (portfolio, report_json, cost, reference_date)
        VALUES (?, ?, ?, ?)
    ''', (portfolio, report_json, cost, reference_date))
    conn.commit()
    conn.close()


def get_portfolio_report(portfolio, reference_date=None):
    """Retrieve a portfolio report for a given portfolio and reference date (ISO datetime string). If reference_date is None, return the latest report. Returns dict with report/cost and reference_date, or None."""
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    if reference_date:
        cursor.execute('''
            SELECT report_json, cost, reference_date FROM portfolio_reports WHERE portfolio = ? AND DATE(reference_date) = ? ORDER BY created_at DESC LIMIT 1
        ''', (portfolio, reference_date))
    else:
        cursor.execute('''
            SELECT report_json, cost, reference_date FROM portfolio_reports WHERE portfolio = ? ORDER BY reference_date DESC, created_at DESC LIMIT 1
        ''', (portfolio,))
    row = cursor.fetchone()
    conn.close()
    if row:
        report_data = json.loads(row[0])
        report_data['cost'] = row[1]
        report_data['reference_date'] = row[2]
        return report_data
    return None


def save_ticker_report(ticker, report, reference_date=None, cost=None):
    """Save a generated ticker report to the ticker_reports table. reference_date is an ISO datetime string (default: now)."""
    if reference_date is None:
        reference_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    report_json = json.dumps(report)
    cursor.execute('''
        INSERT OR REPLACE INTO ticker_reports (ticker, report_json, cost, reference_date)
        VALUES (?, ?, ?, ?)
    ''', (ticker, report_json, cost, reference_date))
    conn.commit()
    conn.close()


def get_ticker_report(ticker, reference_date=None):
    """Retrieve a ticker report for a given ticker and reference date (ISO datetime string). If reference_date is None, return the latest report. Returns dict with report/cost and reference_date, or None."""
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    # Table: ticker_reports (id, ticker, report_json, cost, reference_date, created_at)
    # If not exists, create it (for backward compatibility)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS ticker_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT NOT NULL,
            report_json TEXT NOT NULL,
            cost REAL,
            reference_date DATETIME NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(ticker, reference_date)
        )
    ''')
    if reference_date:
        cursor.execute('''
            SELECT report_json, cost, reference_date FROM ticker_reports WHERE ticker = ? AND DATE(reference_date) = ? ORDER BY created_at DESC LIMIT 1
        ''', (ticker, reference_date))
    else:
        cursor.execute('''
            SELECT report_json, cost, reference_date FROM ticker_reports WHERE ticker = ? ORDER BY reference_date DESC, created_at DESC LIMIT 1
        ''', (ticker,))
    row = cursor.fetchone()
    conn.close()
    if row:
        report_data = json.loads(row[0])
        report_data['cost'] = row[1]
        report_data['reference_date'] = row[2]
        return report_data
    return None


if __name__ == "__main__":
    # Run migration if needed
    init_db()
    migrate_tickers_to_new_schema()
    print("Migration complete.")
