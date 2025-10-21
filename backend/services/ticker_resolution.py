"""
Ticker resolution service that provides human-in-the-loop functionality
when fetch_with_cache fails to find a ticker.
"""
from typing import Dict, List, Any, Optional, Tuple
from services.yahoo_search import search_instruments
from services.data_fetcher import fetch_with_cache
import logging

logger = logging.getLogger(__name__)


class TickerResolutionResult:
    """Result of ticker resolution attempt"""
    def __init__(self, success: bool, data: Optional[Dict[str, Any]] = None, 
                 suggestions: Optional[List[Dict[str, Any]]] = None, 
                 error: Optional[str] = None):
        self.success = success
        self.data = data
        self.suggestions = suggestions or []
        self.error = error


def fetch_with_resolution_suggestions(ticker_symbol: str) -> TickerResolutionResult:
    """
    Attempt to fetch ticker data, and if it fails, provide ticker suggestions
    for human-in-the-loop resolution.
    
    Returns:
        TickerResolutionResult with either:
        - success=True, data=ticker_data if fetch succeeds
        - success=False, suggestions=list_of_options if fetch fails but suggestions found
        - success=False, error=message if both fetch and suggestions fail
    """
    
    # Search for candidate symbols using Yahoo only
    logger.info(f"Searching for ticker suggestions (Yahoo) for: {ticker_symbol}")
    suggestions: List[Dict[str, Any]] = []
    try:
        yahoo_result = search_instruments(ticker_symbol)
        if yahoo_result and not yahoo_result.get('error') and yahoo_result.get('results'):
            for result in yahoo_result.get('results', [])[:10]:
                symbol = result.get('symbol')
                if not symbol:
                    continue
                # Avoid duplicates (by symbol)
                if any(s.get('symbol') == symbol for s in suggestions):
                    continue
                suggestions.append({
                    'symbol': symbol,
                    'name': result.get('shortname') or result.get('longname') or '',
                    'source': 'yahoo',
                    'exchange': result.get('exchDisp', ''),
                    'quoteType': result.get('quoteType', '')
                })
    except Exception as e:
        logger.warning(f"Yahoo search failed for {ticker_symbol}: {e}")

    # If we found suggestions, return them immediately for user selection
    if suggestions:
        logger.info(f"Found {len(suggestions)} ticker suggestions for {ticker_symbol}")
        return TickerResolutionResult(success=False, suggestions=suggestions)

    # No suggestions found: as a last resort attempt to fetch directly (maybe the input is already a precise symbol)
    logger.info(f"No suggestions found for '{ticker_symbol}', attempting direct fetch as fallback")
    try:
        data, source = fetch_with_cache(ticker_symbol)
        if data:
            logger.info(f"Direct fetch succeeded for {ticker_symbol} from {source}")
            return TickerResolutionResult(success=True, data=data)
        else:
            return TickerResolutionResult(success=False, error=f"No data found for '{ticker_symbol}' and no suggestions available")
    except Exception as e:
        logger.error(f"Direct fetch failed for {ticker_symbol}: {e}")
        return TickerResolutionResult(success=False, error=str(e))


def resolve_ticker_with_user_choice(original_ticker: str, chosen_symbol: str) -> TickerResolutionResult:
    """
    Resolve a ticker using the user's chosen symbol and validate it works.
    
    Args:
        original_ticker: The original ticker that failed
        chosen_symbol: The symbol chosen by the user from suggestions
        
    Returns:
        TickerResolutionResult with success=True and data if resolution works
    """
    try:
        data, source = fetch_with_cache(chosen_symbol)
        if data:
            logger.info(f"Successfully resolved {original_ticker} -> {chosen_symbol} from {source}")
            return TickerResolutionResult(success=True, data=data)
        else:
            return TickerResolutionResult(
                success=False, 
                error=f"Chosen symbol '{chosen_symbol}' could not be fetched"
            )
    except Exception as e:
        logger.error(f"Failed to resolve {original_ticker} -> {chosen_symbol}: {e}")
        return TickerResolutionResult(
            success=False,
            error=f"Error fetching chosen symbol '{chosen_symbol}': {str(e)}"
        )


def fetch_suggestions_for_tickers(ticker_symbols: List[str]) -> Dict[str, List[Dict[str, Any]]]:
    """
    Given a list of ticker strings, return a mapping from the original ticker
    to a list of candidate suggestions (from Yahoo) so the frontend can present
    choices for the human-in-the-loop resolution.

    The result format is:
      { original_ticker: [ { symbol, name, exchange, quoteType, source }, ... ], ... }

    This function intentionally does not attempt direct fetches; it only
    performs search-based suggestion discovery so the UI can ask the user
    to pick the correct symbol for each ambiguous input.
    """
    results: Dict[str, List[Dict[str, Any]]] = {}
    # Deduplicate inputs but preserve order-ish iteration
    seen: set = set()
    for t in ticker_symbols:
        if not isinstance(t, str) or not t.strip():
            results[t] = []
            continue
        key = t.strip()
        if key in seen:
            # if we've already processed the same string, reuse the results
            results[t] = results.get(key, [])
            continue
        seen.add(key)

        suggestions: List[Dict[str, Any]] = []
        try:
            yahoo_result = search_instruments(key)
            if yahoo_result and not yahoo_result.get('error') and yahoo_result.get('results'):
                for result in yahoo_result.get('results', [])[:10]:
                    symbol = result.get('symbol')
                    if not symbol:
                        continue
                    if any(s.get('symbol') == symbol for s in suggestions):
                        continue
                    suggestions.append({
                        'symbol': symbol,
                        'name': result.get('shortname') or result.get('longname') or '',
                        'source': 'yahoo',
                        'exchange': result.get('exchDisp', ''),
                        'quoteType': result.get('quoteType', '')
                    })
        except Exception as e:
            logger.warning(f"Yahoo search failed for {key}: {e}")

        results[t] = suggestions

    return results