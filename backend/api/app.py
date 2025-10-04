"""Minimal Flask application factory module.

All substantial route logic has been moved into blueprints (see api.routes and future modules).
This file now only:
  - Provides create_app() factory
  - Registers logging/CORS and blueprints
  - Exposes app = create_app() for flask run
"""

import sys
import os
from datetime import timedelta, datetime
from flask import Flask, jsonify, request

from api.utils import register_request_logging
from api.auth import require_google_token


def create_app():
    app = Flask(__name__)
    register_request_logging(app)

    # Lazy imports (avoid side effects during tooling / testing)
    from db.database import init_db, get_ticker_data, get_ticker_history, save_ticker_data
    from services.data_fetcher import fetch_with_cache
    from core.portfolio import get_cached_portfolio_performance
    from core.gemini_helper import parse_transactions  # noqa: F401 (used by blueprint modules)
    from db.firestore_client import (
        COL_TICKERS,
        COL_TICKER_INFO,
        COL_TICKER_HISTORY,
        COL_PORTFOLIOS,
        COL_TRANSACTIONS,
        COL_PORTFOLIO_STATUS,
        COL_PORTFOLIO_HOLDINGS,
        COL_PORTFOLIO_REPORTS,
        COL_TICKER_REPORTS,
        EMULATOR_HOST,
        _ensure_client,
    )

    init_db()
    CACHE_DURATION = timedelta(hours=24)

    @app.route('/api/ticker/<string:ticker_symbol>', methods=['GET'])
    @require_google_token()
    def get_ticker(ticker_symbol):
        ticker_symbol = ticker_symbol.upper()
        update = request.args.get('update', 'true').lower() == 'true'
        cached_data, last_updated = get_ticker_data(ticker_symbol)
        data_is_stale = True
        if cached_data and last_updated:
            try:
                if datetime.now() - last_updated <= CACHE_DURATION:
                    data_is_stale = False
            except Exception:
                data_is_stale = True
        if update or data_is_stale:
            data, _ = fetch_with_cache(ticker_symbol, CACHE_DURATION)
            if data:
                save_ticker_data(ticker_symbol, data)
        cached_data, _ = get_ticker_data(ticker_symbol)
        if not cached_data:
            return jsonify({'error': f'No info found for ticker {ticker_symbol}'}), 404
        info = cached_data.get('info') or {}
        history = get_ticker_history(ticker_symbol)
        return jsonify({'source': 'db', 'ticker': ticker_symbol, 'data': {'info': info, 'history': history}})

    # Register blueprint(s)
    try:
        from api.routes import bp as api_bp
        app.register_blueprint(api_bp)
    except Exception:  # pragma: no cover
        app.logger.exception("Failed to register api.routes blueprint")

    # Simple health endpoint (useful for tests / deployment checks)
    @app.route('/api/health', methods=['GET'])
    def health():
        return jsonify({'status': 'ok'}), 200

    @app.route('/api/debug/firestore/summary', methods=['GET'])
    def firestore_summary():
        """Return a lightweight snapshot of Firestore collections.

        NOTE: This is unsecured; in production you should restrict or remove it.
        Intended for local debugging / emulator verification.
        """
        client = _ensure_client()
        # Collections to inspect
        col_names = [
            COL_TICKERS,
            COL_TICKER_INFO,
            COL_TICKER_HISTORY,
            COL_PORTFOLIOS,
            COL_TRANSACTIONS,
            COL_PORTFOLIO_STATUS,
            COL_PORTFOLIO_HOLDINGS,
            COL_PORTFOLIO_REPORTS,
            COL_TICKER_REPORTS,
        ]
        summary = {}
        for c in col_names:
            try:
                docs_iter = client.collection(c).limit(15).stream()
                sample = []
                count = 0
                for d in docs_iter:
                    count += 1
                    data = d.to_dict() or {}
                    sample.append({
                        'id': d.id,
                        # Provide only selected keys for brevity/security
                        'keys': list(data.keys())[:8]
                    })
                summary[c] = {
                    'approx_sample_count': count,
                    'sample_docs': sample,
                }
            except Exception as e:  # pragma: no cover
                summary[c] = {'error': str(e)}
        payload = {
            'emulator': bool(EMULATOR_HOST),
            'emulator_host': EMULATOR_HOST,
            'database': os.environ.get('FIRESTORE_DATABASE'),
            'collections': summary,
        }
        return jsonify(payload), 200

    return app


app = create_app()

if __name__ == '__main__':  # pragma: no cover
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)), debug=True)
