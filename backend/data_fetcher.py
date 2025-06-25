import yfinance as yf
from datetime import datetime, timedelta
import database
import pandas as pd


def fetch_from_yfinance(ticker_symbol):
    """Fetch details about a ticker using :mod:`yfinance`."""
    print(f"\033[91m[fetch_from_yfinance] Fetching data from yfinance for {ticker_symbol}\033[0m")
    try:
        print(f"\033[91m[yf.Ticker] Instantiating yf.Ticker for {ticker_symbol}\033[0m")
        ticker = yf.Ticker(ticker_symbol)

        # Fetch company info
        info = ticker.info

        if not info.get("shortName"):
            print(f"Could not find info for ticker: {ticker_symbol}")
            return None

        hist = ticker.history(period="1y")
        if not hist.empty:
            hist.reset_index(inplace=True)
            # Ensure 'Date' column is datetime before using .dt
            if 'Date' in hist.columns:
                hist['Date'] = pd.to_datetime(hist['Date'], errors='coerce')
            elif 'index' in hist.columns:
                hist.rename(columns={"index": "Date"}, inplace=True)
                hist['Date'] = pd.to_datetime(hist['Date'], errors='coerce')
            else:
                hist.rename(columns={hist.columns[0]: "Date"}, inplace=True)
                hist['Date'] = pd.to_datetime(hist['Date'], errors='coerce')
            hist["Date"] = hist["Date"].dt.strftime("%Y-%m-%d")
            hist_dict = hist.to_dict(orient="records")
        else:
            hist_dict = []

        actions = ticker.actions
        if not actions.empty:
            actions.reset_index(inplace=True)
            if 'Date' in actions.columns:
                actions['Date'] = pd.to_datetime(actions['Date'], errors='coerce')
            elif 'index' in actions.columns:
                actions.rename(columns={"index": "Date"}, inplace=True)
                actions['Date'] = pd.to_datetime(actions['Date'], errors='coerce')
            else:
                actions.rename(columns={actions.columns[0]: "Date"}, inplace=True)
                actions['Date'] = pd.to_datetime(actions['Date'], errors='coerce')
            actions["Date"] = actions["Date"].dt.strftime("%Y-%m-%d")
            actions_dict = actions.to_dict(orient="records")
        else:
            actions_dict = []

        dividends = ticker.dividends
        if dividends is not None and not dividends.empty:
            dividends = dividends.reset_index()
            if 'Date' in dividends.columns:
                dividends['Date'] = pd.to_datetime(dividends['Date'], errors='coerce')
            elif 'index' in dividends.columns:
                dividends.rename(columns={"index": "Date"}, inplace=True)
                dividends['Date'] = pd.to_datetime(dividends['Date'], errors='coerce')
            else:
                dividends.rename(columns={dividends.columns[0]: "Date"}, inplace=True)
                dividends['Date'] = pd.to_datetime(dividends['Date'], errors='coerce')
            dividends["Date"] = dividends["Date"].dt.strftime("%Y-%m-%d")
            dividends_dict = dividends.to_dict(orient="records")
        else:
            dividends_dict = []

        recommendations = ticker.recommendations
        if recommendations is not None and not recommendations.empty:
            recommendations.reset_index(inplace=True)
            if 'Date' in recommendations.columns:
                recommendations['Date'] = pd.to_datetime(recommendations['Date'], errors='coerce')
            elif 'index' in recommendations.columns:
                recommendations.rename(columns={"index": "Date"}, inplace=True)
                recommendations['Date'] = pd.to_datetime(recommendations['Date'], errors='coerce')
            else:
                recommendations.rename(columns={recommendations.columns[0]: "Date"}, inplace=True)
                recommendations['Date'] = pd.to_datetime(recommendations['Date'], errors='coerce')
            recommendations["Date"] = recommendations["Date"].dt.strftime("%Y-%m-%d")
            recommendations_dict = recommendations.to_dict(orient="records")
        else:
            recommendations_dict = []

        response_data = {
            "info": info,
            "history": hist_dict,
            "events": {
                "actions": actions_dict,
                "dividends": dividends_dict,
                "recommendations": recommendations_dict,
            },
        }

        return response_data

    except Exception as e:
        print(f"An error occurred while fetching data for {ticker_symbol}: {e}")
        return None


def fetch_with_cache(ticker_symbol, cache_duration=timedelta(hours=24)):
    """Return ticker data from cache if fresh, otherwise fetch from Yahoo Finance."""
    cached, last_updated = database.get_ticker_data(ticker_symbol)
    if cached and datetime.now() - last_updated < cache_duration:
        print(f"\033[92m[fetch_with_cache] Returning cached data for {ticker_symbol}\033[0m")
        return cached, "CACHE"

    fresh = fetch_from_yfinance(ticker_symbol)
    if fresh:
        database.save_ticker_data(ticker_symbol, fresh)
        return fresh, "YAHOO_FINANCE_API"

    return None, None
