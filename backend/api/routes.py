from flask import Blueprint, jsonify, request, current_app
from api.auth import require_google_token
from api.utils import safe_get_json
from datetime import datetime, timedelta
import math


# Simple intraday cache (in-memory): key -> (expiry_ts, data)
_INTRADAY_CACHE = {}


def _get_intraday_cached(key: str):
    entry = _INTRADAY_CACHE.get(key)
    if not entry:
        return None
    expiry_ts, data = entry
    now_ts = datetime.utcnow().timestamp()
    if now_ts < expiry_ts:
        current_app.logger.debug(f"[CACHE HIT] {key}")
        return data
    # expired
    _INTRADAY_CACHE.pop(key, None)
    return None


def _set_intraday_cache(key: str, data):
    now = datetime.utcnow()
    # expire at next UTC midnight
    next_midnight = datetime(year=now.year, month=now.month, day=now.day) + timedelta(days=1)
    expiry_ts = next_midnight.timestamp()
    _INTRADAY_CACHE[key] = (expiry_ts, data)
    current_app.logger.debug(f"[CACHE SET] {key} expires at {next_midnight.isoformat()}Z")

bp = Blueprint('api', __name__)


@bp.route('/api/portfolios', methods=['GET'])
def get_all_portfolios():
    try:
        from db.database import get_all_portfolio_names
        names = get_all_portfolio_names()
        current_app.logger.info(f"[DEBUG] /api/portfolios result: {names}")
        return jsonify({'portfolios': names})
    except Exception as e:
        current_app.logger.error(f"Failed to fetch portfolio names: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/api/transactions/<string:portfolio_name>', methods=['POST'])
def add_transactions(portfolio_name):
    try:
        data = safe_get_json(request)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    raw = data.get('raw')
    transactions = data.get('transactions')
    if raw:
        try:
            from core.gemini_helper import parse_transactions
            transactions = parse_transactions(raw, portfolio_name)
        except Exception as e:
            return jsonify({'error': str(e)}), 400
    if not transactions:
        return jsonify({'error': 'No transactions provided'}), 400
    from db.portfolios import save_transactions
    inserted = save_transactions(portfolio_name, transactions)
    for transaction in inserted:
        transaction['name'] = transaction.get('name')
    return jsonify({'status': 'saved', 'count': len(inserted), 'transactions': inserted})


@bp.route('/api/transactions/ingest/<string:portfolio_name>', methods=['POST'])
def ingest_transactions(portfolio_name):
    """Ingest transactions from raw text or uploaded document(s).

    Accepts:
      - JSON: { raw: str }
      - multipart/form-data with one or multiple file fields named 'file'

    Returns inserted transactions or validation errors.
    """
    from db.portfolios import save_transactions
    from core.ingestion import (
        extract_transactions_from_file,
        validate_transactions,
    )
    all_transactions = []
    used_llm = False
    sources = []
    if request.content_type and 'multipart/form-data' in request.content_type:
        if not request.files:
            return jsonify({'error': 'No files uploaded'}), 400
        for file in request.files.getlist('file'):
            try:
                txs, llm_used, src = extract_transactions_from_file(file, portfolio_name)
                if llm_used:
                    used_llm = True
                sources.append(src)
                all_transactions.extend(txs)
            except Exception as e:
                current_app.logger.exception("File ingestion failed")
                return jsonify({'error': f'Failed to process file {file.filename}: {e}'}), 500
    else:
        # Expect JSON body with 'raw'
        try:
            data = safe_get_json(request)
        except ValueError as e:
            return jsonify({'error': str(e)}), 400
        raw_text = data.get('raw')
        if not raw_text:
            return jsonify({'error': 'Missing raw text or files'}), 400
        from core.gemini_helper import parse_transactions
        try:
            all_transactions = parse_transactions(raw_text, portfolio_name)
            used_llm = True
            sources.append('raw-text')
        except Exception as e:
            return jsonify({'error': f'LLM parsing failed: {e}'}), 500
    cleaned = validate_transactions(all_transactions, portfolio_name)
    if not cleaned:
        return jsonify({'error': 'No valid transactions extracted'}), 400
    inserted = save_transactions(portfolio_name, cleaned)
    return jsonify({
        'status': 'saved',
        'portfolio': portfolio_name,
        'count': len(inserted),
        'transactions': inserted,
        'used_llm': used_llm,
        'sources': sources,
    })


@bp.route('/api/portfolio/<string:portfolio_name>/transactions', methods=['GET'])
def get_portfolio_transactions(portfolio_name):
    try:
        from db.portfolios import get_transactions
        transactions = get_transactions(portfolio_name)
        for t in transactions:
            t['name'] = t.get('name')
        return jsonify({'transactions': transactions})
    except Exception as e:
        current_app.logger.error(f"Failed to fetch transactions for portfolio {portfolio_name}: {e}")
        return jsonify({'error': str(e)}), 500



@bp.route('/api/portfolio/<string:portfolio_name>/status', methods=['GET'])
def get_portfolio_status_saved_route(portfolio_name):
    try:
        from db.portfolios import get_portfolio_status_saved
        status, last_updated, updated_at = get_portfolio_status_saved(portfolio_name)
        # Serialize datetimes
        last_updated_iso = last_updated.isoformat() if last_updated else None
        return jsonify({'status': status, 'last_updated': last_updated_iso}), 200
    except Exception as e:
        current_app.logger.exception(f"Failed to fetch saved status for {portfolio_name}")
        return jsonify({'error': str(e)}), 500


# Explicit OPTIONS handler to satisfy CORS preflight for status endpoint
@bp.route('/api/portfolio/<string:portfolio_name>/status', methods=['OPTIONS'])
def get_portfolio_status_options(portfolio_name):
    # Return empty 200; CORS headers will be added by after_request
    return ('', 200)


@bp.route('/api/portfolio/<string:portfolio_name>/status/live', methods=['GET'])
def get_portfolio_status_live_route(portfolio_name):
    try:
        from core.portfolio import get_portfolio_status
        status = get_portfolio_status(portfolio_name)
        return jsonify({'status': status}), 200
    except Exception as e:
        current_app.logger.exception(f"Failed to compute live status for {portfolio_name}")
        return jsonify({'error': str(e)}), 500


@bp.route('/api/portfolio/<string:portfolio_name>/status/save', methods=['POST'])
def save_portfolio_status_route(portfolio_name):
    try:
        from core.portfolio import get_portfolio_status
        from db.portfolios import save_portfolio_status
        status = get_portfolio_status(portfolio_name)
        save_portfolio_status(portfolio_name, status)
        return jsonify({'status': 'saved', 'portfolio': portfolio_name}), 200
    except Exception as e:
        current_app.logger.exception(f"Failed to save status for {portfolio_name}")
        return jsonify({'error': str(e)}), 500


# Explicit OPTIONS handler to satisfy CORS preflight for status save endpoint
@bp.route('/api/portfolio/<string:portfolio_name>/status/save', methods=['OPTIONS'])
def save_portfolio_status_options(portfolio_name):
    return ('', 200)


@bp.route('/api/portfolio/<string:portfolio_name>/status/metadata', methods=['POST'])
@require_google_token()
def save_portfolio_status_metadata_route(portfolio_name):
    try:
        data = safe_get_json(request)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    metadata = data.get('metadata')
    if not isinstance(metadata, dict):
        return jsonify({'error': 'Invalid metadata payload'}), 400
    try:
        from db.portfolios import save_holdings_metadata
        save_holdings_metadata(portfolio_name, metadata)
        return jsonify({'status': 'saved', 'portfolio': portfolio_name}), 200
    except Exception as e:
        current_app.logger.exception('Failed to save holdings metadata')
        return jsonify({'error': str(e)}), 500


@bp.route('/api/portfolio/<string:portfolio_name>/status/metadata', methods=['OPTIONS'])
def save_portfolio_status_metadata_options(portfolio_name):
    return ('', 200)


@bp.route('/api/portfolio/<string:portfolio_name>/performance', methods=['GET'])
def portfolio_performance(portfolio_name):
    try:
        from core.portfolio import get_cached_portfolio_performance
        cache_key = f"performance::{portfolio_name}"
        cached = _get_intraday_cached(cache_key)
        if cached is not None:
            return jsonify(cached)
        perf = get_cached_portfolio_performance(portfolio_name)
        # If performance computation returned empty, try to provide a minimal current snapshot
        if not perf or (isinstance(perf, list) and len(perf) == 0):
            try:
                from core.portfolio import get_portfolio_status
                status = get_portfolio_status(portfolio_name)
                total_value = status.get('total_value', 0)
                perf = [{ 'date': datetime.utcnow().strftime('%Y-%m-%d'), 'value': total_value, 'abs_value': total_value, 'pct': 0.0, 'pct_from_first': 0.0 }]
            except Exception:
                perf = []
        _set_intraday_cache(cache_key, perf)
        return jsonify(perf)
    except Exception as e:
        current_app.logger.error(f"Error computing performance: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/api/benchmark/<path:ticker>/performance', methods=['GET'])
def benchmark_performance(ticker):
    try:
        from core.portfolio import compute_benchmark_performance
        cache_key = f"benchmark_performance::{ticker}"
        cached = _get_intraday_cached(cache_key)
        if cached is not None:
            return jsonify(cached)

        perf = compute_benchmark_performance(ticker)
        if not perf or (isinstance(perf, list) and len(perf) == 0):
            return jsonify([])
        _set_intraday_cache(cache_key, perf)
        return jsonify(perf)
    except Exception as e:
        current_app.logger.exception(f"Error fetching benchmark performance for {ticker}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/api/benchmark/<path:ticker>/performance', methods=['OPTIONS'])
def benchmark_performance_options(ticker):
    return ('', 200)


@bp.route('/api/benchmark/performance', methods=['GET'])
def benchmark_performance_query():
    # Fallback endpoint that accepts ticker as query parameter to avoid routing issues
    ticker = request.args.get('ticker')
    if not ticker:
        return jsonify({'error': 'Missing ticker query parameter'}), 400
    return benchmark_performance(ticker)


@bp.route('/api/benchmark/performance', methods=['OPTIONS'])
def benchmark_performance_query_options():
    return ('', 200)


@bp.route('/api/portfolio/<string:portfolio_name>/ticker/<path:ticker>/performance', methods=['GET'])
def portfolio_ticker_performance(portfolio_name, ticker):
    try:
        from core.portfolio import compute_ticker_performance
        cache_key = f"ticker_performance::{portfolio_name}::{ticker}"
        cached = _get_intraday_cached(cache_key)
        if cached is not None:
            return jsonify(cached)

        perf = compute_ticker_performance(portfolio_name, ticker)
        if not perf or (isinstance(perf, list) and len(perf) == 0):
            return jsonify([])
        _set_intraday_cache(cache_key, perf)
        return jsonify(perf)
    except Exception as e:
        current_app.logger.exception(f"Error fetching ticker performance for {portfolio_name} ticker {ticker}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/api/portfolio/<string:portfolio_name>/ticker/<path:ticker>/performance', methods=['OPTIONS'])
def portfolio_ticker_performance_options(portfolio_name, ticker):
    return ('', 200)


@bp.route('/api/portfolio/<string:portfolio_name>/ticker/performance', methods=['GET'])
def portfolio_ticker_performance_query(portfolio_name):
    # Fallback endpoint that accepts ticker as query parameter to avoid routing/encoding issues
    ticker = request.args.get('ticker')
    if not ticker:
        return jsonify({'error': 'Missing ticker query parameter'}), 400
    return portfolio_ticker_performance(portfolio_name, ticker)


@bp.route('/api/portfolio/<string:portfolio_name>/ticker/performance', methods=['OPTIONS'])
def portfolio_ticker_performance_query_options(portfolio_name):
    return ('', 200)


@bp.route('/api/portfolio/<string:portfolio_name>/kpis', methods=['GET'])
def portfolio_kpis(portfolio_name):
    try:
        from core.portfolio import get_portfolio_status
        status = get_portfolio_status(portfolio_name)
        
        # Extract KPIs from portfolio status
        total_value = status.get('total_value', 0)
        holdings_count = len(status.get('holdings', []))
        
        cache_key = f"kpis::{portfolio_name}"
        cached = _get_intraday_cached(cache_key)
        if cached is not None:
            return jsonify(cached)

        # Try to compute a simple cost-basis and net performance from transactions
        net_performance = None
        net_pl = None
        cost_basis = None
        try:
            from db.portfolios import get_transactions
            txs = get_transactions(portfolio_name)
            # cost basis: sum(quantity * price) for buy transactions (quantity > 0)
            cost_basis = 0.0
            for t in txs:
                try:
                    q = float(t.get('quantity', 0) or 0)
                    p = float(t.get('price', 0) or 0)
                except Exception:
                    q = 0.0
                    p = 0.0
                if q > 0:
                    cost_basis += q * p
            if cost_basis and isinstance(total_value, (int, float)):
                net_pl = float(total_value) - float(cost_basis)
                net_performance = (net_pl / cost_basis) * 100 if cost_basis != 0 else None
        except Exception:
            # If transaction-based derivation fails, leave net fields as None
            net_performance = None
            net_pl = None
            cost_basis = None

        # Determine best/worst ticker by net performance (pct) using transactions cost-basis and current holding value
        best_ticker = None
        worst_ticker = None
        try:
            # Build cost basis per ticker
            from collections import defaultdict
            per_ticker_cost = defaultdict(float)
            for t in txs:
                try:
                    q = float(t.get('quantity', 0) or 0)
                    p = float(t.get('price', 0) or 0)
                except Exception:
                    q = 0.0
                    p = 0.0
                if q > 0 and t.get('ticker'):
                    per_ticker_cost[t.get('ticker')] += q * p

            # Use holdings for current values
            holdings = status.get('holdings', []) or []
            perf_list = []
            for h in holdings:
                tk = h.get('ticker')
                if not tk:
                    continue
                current_abs = float(h.get('value', 0) or 0)
                cb = float(per_ticker_cost.get(tk, 0) or 0)
                if cb and cb != 0:
                    pct = (current_abs - cb) / cb * 100.0
                    perf_list.append({'ticker': tk, 'ticker_name': h.get('name'), 'abs_value': current_abs, 'pct': pct})
            if perf_list:
                # best by pct
                best = max(perf_list, key=lambda x: x['pct'])
                worst = min(perf_list, key=lambda x: x['pct'])
                best_ticker = best
                worst_ticker = worst
        except Exception:
            best_ticker = None
            worst_ticker = None

        kpis = {
            'total_value': total_value,
            'holdings_count': holdings_count,
            'holdings': status.get('holdings', []),
            'cost_basis': cost_basis,
            'net_pl': net_pl,
            'net_performance': net_performance,
            'best_ticker': best_ticker,
            'worst_ticker': worst_ticker,
        }
        _set_intraday_cache(cache_key, kpis)
        return jsonify(kpis)
    except Exception as e:
        current_app.logger.error(f"Error fetching portfolio KPIs: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/api/portfolio/<string:portfolio_name>/kpis/returns', methods=['GET'])
def portfolio_returns_kpis(portfolio_name):
    try:
        from core.portfolio import (
            get_last_day_possible_returns, 
            get_weekly_returns, 
            get_monthly_returns,
            get_three_month_returns,
            get_ytd_returns,
            get_one_year_return
        )
        cache_key = f"returns::{portfolio_name}"
        cached = _get_intraday_cached(cache_key)
        if cached is not None:
            return jsonify(cached)

        returns_kpis = {
            'daily': get_last_day_possible_returns(portfolio_name),
            'weekly': get_weekly_returns(portfolio_name),
            'monthly': get_monthly_returns(portfolio_name),
            'three_month': get_three_month_returns(portfolio_name),
            'ytd': get_ytd_returns(portfolio_name),
            'one_year': get_one_year_return(portfolio_name)
        }

        # Post-process each period to ensure portfolio-level end_value and return_pct
        # are computed by aggregating per-ticker end_values when possible. Some ticker
        # entries may have NaN end_value; ignore those when summing.
        for period_key, period_obj in returns_kpis.items():
            try:
                portfolio_obj = period_obj.get('portfolio', {}) if isinstance(period_obj, dict) else {}
                tickers_obj = period_obj.get('tickers', {}) if isinstance(period_obj, dict) else {}

                # First, clean up NaN values in ticker data
                for tk, tkobj in (tickers_obj.items() if isinstance(tickers_obj, dict) else []):
                    try:
                        # Convert NaN to None for all ticker fields
                        for field in ['start_value', 'end_value', 'return_pct']:
                            if field in tkobj:
                                val = tkobj[field]
                                if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
                                    tkobj[field] = None
                    except Exception:
                        continue

                # Sum finite end_values from tickers
                sum_end = 0.0
                found_any = False
                for tk, tkobj in (tickers_obj.items() if isinstance(tickers_obj, dict) else []):
                    try:
                        ev = tkobj.get('end_value')
                        if isinstance(ev, (int, float)) and not math.isnan(ev) and not math.isinf(ev):
                            sum_end += float(ev)
                            found_any = True
                    except Exception:
                        continue

                start_value = portfolio_obj.get('start_value') if isinstance(portfolio_obj, dict) else None

                if found_any:
                    # Set aggregated end_value
                    period_obj['portfolio'] = period_obj.get('portfolio', {})
                    period_obj['portfolio']['end_value'] = sum_end
                    # Compute return_pct if start_value is valid
                    if isinstance(start_value, (int, float)) and not math.isnan(start_value) and start_value != 0:
                        period_obj['portfolio']['return_pct'] = (sum_end - float(start_value)) / float(start_value) * 100.0
                    else:
                        period_obj['portfolio']['return_pct'] = None
                else:
                    # No valid ticker end_values found; leave portfolio fields as-is but normalize NaN->None
                    if isinstance(portfolio_obj.get('end_value'), float) and math.isnan(portfolio_obj.get('end_value')):
                        period_obj['portfolio']['end_value'] = None
                    if isinstance(portfolio_obj.get('return_pct'), float) and math.isnan(portfolio_obj.get('return_pct')):
                        period_obj['portfolio']['return_pct'] = None

                # Also clean up NaN values in portfolio data
                for field in ['start_value', 'end_value', 'return_pct']:
                    if field in period_obj.get('portfolio', {}):
                        val = period_obj['portfolio'][field]
                        if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
                            period_obj['portfolio'][field] = None
            except Exception:
                # On error, ensure we don't crash the whole endpoint
                continue
        _set_intraday_cache(cache_key, returns_kpis)
        return jsonify(returns_kpis)
    except Exception as e:
        current_app.logger.error(f"Error fetching portfolio returns KPIs: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/api/portfolio/<string:portfolio_name>/allocation', methods=['GET'])
def portfolio_allocation(portfolio_name):
    try:
        grouping = request.args.get('grouping', 'overall')
        
        if grouping == 'overall':
            from core.portfolio import get_overall_asset_allocation
            allocation_data = get_overall_asset_allocation(portfolio_name)
        elif grouping == 'quoteType':
            from core.portfolio import get_asset_allocation_by_quote_type
            allocation_data = get_asset_allocation_by_quote_type(portfolio_name)
        else:
            return jsonify({'error': 'Invalid grouping parameter. Use "overall" or "quoteType"'}), 400
        
        cache_key = f"allocation::{portfolio_name}::grouping={grouping}"
        cached = _get_intraday_cached(cache_key)
        if cached is not None:
            return jsonify(cached)

        payload = {
            'grouping': grouping,
            'allocation': allocation_data
        }
        _set_intraday_cache(cache_key, payload)
        return jsonify(payload)
    except Exception as e:
        current_app.logger.error(f"Error fetching portfolio allocation: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/api/portfolio/<string:portfolio_name>/volatility', methods=['GET'])
def portfolio_volatility(portfolio_name):
    try:
        from core.portfolio import (
            compute_portfolio_volatility,
            DEFAULT_VOLATILITY_WINDOW,
            VALID_VOLATILITY_WINDOWS,
            DEFAULT_EWM_SPAN,
        )
        import math

        raw_window = (request.args.get('window') or '').strip()
        method = 'rolling'
        cache_window_key = 'full'
        window_value = None

        if not raw_window:
            window_value = DEFAULT_VOLATILITY_WINDOW
            cache_window_key = str(window_value)
        else:
            lowered = raw_window.lower()
            if lowered in {'full', 'all'}:
                window_value = None
                cache_window_key = 'full'
            elif lowered.startswith('ewm') or lowered.startswith('ewma'):
                method = 'ewm'
                span_token = lowered.replace('ewma', 'ewm')
                span_value = ''.join(filter(str.isdigit, span_token))
                if span_value:
                    try:
                        span = int(span_value)
                    except ValueError:
                        return jsonify({'error': 'Invalid EWMA window span.'}), 400
                    if span < 2:
                        return jsonify({'error': 'EWMA span must be at least 2.'}), 400
                    window_value = span
                else:
                    window_value = DEFAULT_EWM_SPAN
                cache_window_key = f'ewm{window_value}'
            else:
                try:
                    parsed = int(raw_window)
                except ValueError:
                    return jsonify({'error': 'Invalid window parameter. Use 30, 90, 252, ewm or full.'}), 400
                if parsed not in VALID_VOLATILITY_WINDOWS:
                    return jsonify({'error': f'Unsupported window. Choose from {sorted(VALID_VOLATILITY_WINDOWS)} or "full"/"ewm".'}), 400
                window_value = parsed
                cache_window_key = str(parsed)

        cache_key = f"volatility::{portfolio_name}::method={method}::window={cache_window_key}"
        cached = _get_intraday_cached(cache_key)
        if cached is not None:
            return jsonify(cached)

        volatility = compute_portfolio_volatility(portfolio_name, window=window_value, method=method)
        payload = {
            'volatility': volatility if (volatility is not None and not math.isnan(volatility)) else None,
            'window': None if window_value is None else window_value,
            'method': method
        }
        _set_intraday_cache(cache_key, payload)
        return jsonify(payload)
    except Exception as e:
        current_app.logger.error(f"Error fetching portfolio volatility: {e}")
        return jsonify({'error': str(e)}), 500


# OPTIONS handlers for CORS preflight requests
@bp.route('/api/portfolio/<string:portfolio_name>/kpis', methods=['OPTIONS'])
def portfolio_kpis_options(portfolio_name):
    return ('', 200)


@bp.route('/api/portfolio/<string:portfolio_name>/kpis/returns', methods=['OPTIONS'])
def portfolio_returns_kpis_options(portfolio_name):
    return ('', 200)


@bp.route('/api/portfolio/<string:portfolio_name>/allocation', methods=['OPTIONS'])
def portfolio_allocation_options(portfolio_name):
    return ('', 200)


@bp.route('/api/portfolio/<string:portfolio_name>/volatility', methods=['OPTIONS'])
def portfolio_volatility_options(portfolio_name):
    return ('', 200)


# ---- Transaction item operations (update/delete) ----

@bp.route('/api/portfolio/<string:portfolio_name>/transaction/<string:transaction_id>', methods=['DELETE'])
@require_google_token()
def delete_single_transaction(portfolio_name, transaction_id):
    try:
        from db.portfolios import delete_transaction, get_transaction_by_id
        existing = get_transaction_by_id(transaction_id)
        if not existing:
            return jsonify({'error': 'Transaction not found'}), 404
        if existing.get('portfolio') != portfolio_name:
            return jsonify({'error': 'Portfolio mismatch'}), 400
        delete_transaction(portfolio_name, transaction_id)
        return jsonify({'status': 'deleted', 'id': transaction_id})
    except Exception as e:
        current_app.logger.exception('Failed to delete transaction')
        return jsonify({'error': str(e)}), 500


@bp.route('/api/portfolio/<string:portfolio_name>/transaction/<string:transaction_id>', methods=['PUT'])
@require_google_token()
def update_single_transaction(portfolio_name, transaction_id):
    try:
        from db.portfolios import update_transaction, get_transaction_by_id
        try:
            data = safe_get_json(request)
        except ValueError as e:
            return jsonify({'error': str(e)}), 400
        existing = get_transaction_by_id(transaction_id)
        if not existing:
            return jsonify({'error': 'Transaction not found'}), 404
        if existing.get('portfolio') != portfolio_name:
            return jsonify({'error': 'Portfolio mismatch'}), 400
        updated = update_transaction(portfolio_name, transaction_id, data or {})
        if updated is None:
            return jsonify({'error': 'Transaction not found'}), 404
        return jsonify({'status': 'updated', 'transaction': updated})
    except Exception as e:
        current_app.logger.exception('Failed to update transaction')
        return jsonify({'error': str(e)}), 500


@bp.route('/api/portfolio/<string:portfolio_name>/transaction/<string:transaction_id>', methods=['OPTIONS'])
def transaction_item_options(portfolio_name, transaction_id):  # CORS preflight
    return ('', 200)


# ---- Portfolio deletion (bulk) ----
@bp.route('/api/portfolio/<string:portfolio_name>', methods=['DELETE'])
@require_google_token()
def delete_portfolio_route(portfolio_name):
    try:
        from db.portfolios import delete_portfolio
        delete_portfolio(portfolio_name)
        return jsonify({'status': 'deleted', 'portfolio': portfolio_name}), 200
    except Exception as e:
        current_app.logger.exception(f'Failed to delete portfolio {portfolio_name}')
        return jsonify({'error': str(e)}), 500


@bp.route('/api/portfolio/<string:portfolio_name>', methods=['OPTIONS'])
def delete_portfolio_options(portfolio_name):
    # CORS preflight for portfolio deletion
    return ('', 200)
