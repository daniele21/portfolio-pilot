from functools import lru_cache
import os
import google.generativeai as genai

from core.gemini_cost import GEMINI_2_5_FLASH, GEMINI_2_5_FLASH_LITE, GEMINI_2_5_FLASH_LITE_PREVIEW_06_17
from core.gemini_cost import calculate_gemini_cost
from db.database import *
from services.data_fetcher import *

API_KEY = os.getenv("GEMINI_API_KEY")
if not API_KEY:
    raise RuntimeError("GEMINI_API_KEY not set")

genai.configure(api_key=API_KEY)

@lru_cache
def parse_transactions(raw_text, portfolio_name=None):
    prompt = """
You are a strict data extractor.

TASK: Extract ALL transactions from the text below and return ONLY a single valid JSON array (no prose, no markdown, no code fences).

Each array item MUST have exactly these fields:
- ticker: string (market symbol, optional; empty string if unknown)
- isin: string (ISIN identifier, optional; prefer this if present; empty string if unknown)
- name: string (issuer / asset name; empty string if unknown)
- quantity: number (use numeric types; null if unknown) [in case of commissions/fees/taxes, this 0]
- price: number (unit price as a plain number; null if unknown) [in case of commissions/fees/taxes, this is the total amount, not per-unit]
- total_amount: final price that is the result of quantity * price; null if unknown or not applicable
- date: string (ISO date YYYY-MM-DD; null if unknown)
- operation: string (canonical operation: one of Buy, Sell, Dividend, Fee, Commission, Tax)
- description: string (REQUIRED for operation values other than Buy or Sell; otherwise empty string)

IMPORTANT RULES
- Every transaction MUST include at least one identifier: 'isin' or 'ticker' (if both present, keep both).
- Normalize operation names to the canonical English values listed above.
- Normalize dates to ISO YYYY-MM-DD.
- Return numbers as numeric types (no thousands separators).
- Trim whitespace from all text fields.
- If a numeric/date field cannot be determined, set it to null. If any text field is missing, set it to an empty string.
- Could happen that just total_amount is available and price per unit not, in this case leave price as null

Return a COMPACT JSON array only.

TEXT TO PARSE:
{raw_text}
    """
    model_name = os.getenv("GEMINI_MODEL", f"models/{GEMINI_2_5_FLASH_LITE}")
    # Use grounded generation (Google Search) to improve ticker symbol resolution on Yahoo Finance.
    from google import genai as genai_client
    from google.genai import types
    client = genai_client.Client()
    # grounding_tool = types.Tool(google_search=types.GoogleSearch())
    
    config = types.GenerateContentConfig(temperature=0.0, 
                                        #  tools=[grounding_tool],
                                        #  response_mime_type="application/json"
                                         )
    
    print("Prompt sent to Gemini (grounded):", prompt)
    # Provide prompt + raw text as separate content items so the model can reference both
    content = prompt.format(raw_text=raw_text)
    response = client.models.generate_content(
        model=model_name, 
        contents=content,
        config=config
    )
    try:
        from pprint import pprint
        pprint(response.__dict__)
        print("response._result:", getattr(response, '_result', None))
        print("response._chunks:", getattr(response, '_chunks', None))
        if hasattr(response, '_result') and hasattr(response._result, 'candidates'):
            print("response._result.candidates:", response._result.candidates)
            if response._result.candidates and hasattr(response._result.candidates[0], 'content'):
                print("response._result.candidates[0].content:", response._result.candidates[0].content)
                if hasattr(response._result.candidates[0].content, 'parts'):
                    print("response._result.candidates[0].content.parts:", response._result.candidates[0].content.parts)
    except Exception as e:
        print("[Gemini API debug] Could not print response dict:", e)
    print("[Gemini API raw response]", response)
    # Extraction logic (if any output is present)
    import json
    cleaned = None
    # Try to extract all text parts and join them (in case of chunked output)
    text_parts = []
    if hasattr(response, 'candidates') and response.candidates:
        try:
            for part in response.candidates[0].content.parts:
                text_parts.append(part.text)
        except Exception:
            pass
    if not text_parts and hasattr(response, 'parts') and response.parts:
        try:
            for part in response.parts:
                text_parts.append(part.text)
        except Exception:
            pass
    if not text_parts and hasattr(response, 'text'):
        try:
            text_parts.append(response.text)
        except Exception:
            pass
    if text_parts:
        # Keep only actual strings; drop None or other objects
        safe_parts = [p for p in text_parts if isinstance(p, str)]
        if len(safe_parts) != len(text_parts):
            print(f"[Gemini parse] Dropped {len(text_parts) - len(safe_parts)} non-string parts from response")
        try:
            cleaned = "".join(safe_parts).strip("`\n ")
        except TypeError as e:
            # Last resort: coerce everything to string
            print(f"[Gemini parse] Join failed ({e}); coercing all parts to str")
            cleaned = "".join([str(p) for p in safe_parts])
        # Remove leading markdown/json hints but avoid stripping legitimate 'json' substrings inside data
        if cleaned.lower().startswith('json'):
            cleaned = cleaned[4:].lstrip(':').lstrip()
        # Try to find the first and last square brackets to extract a valid JSON list
        start = cleaned.find('[')
        end = cleaned.rfind(']')
        if start != -1 and end != -1 and start < end:
            cleaned = cleaned[start:end+1]
    if not cleaned:
        raise RuntimeError("Could not extract text from Gemini response. Candidates, parts, and text fields were all empty or missing.")
    try:
        transactions = json.loads(cleaned)
        # Ensure every transaction has a 'name' field (portfolio is supplied by frontend)
        for tx in transactions:
            if 'name' not in tx:
                tx['name'] = ''
    except Exception as e:
        raise RuntimeError(f"Could not decode JSON from Gemini response: {e}\nExtracted text: {cleaned}")
    # Validate schema after parsing
    expected_keys = {'ticker', 'isin', 'quantity', 'price', 'date', 'operation', 'name', 'description', 'yahoo_ticker'}
    for idx, tx in enumerate(transactions):
        missing = expected_keys - set(tx.keys())
        for key in missing:
            # Set missing fields to None, except 'portfolio' which must be a non-empty string, and 'ticker' which must be a non-empty string, and 'name' which must be a string
            if key == 'ticker':
                tx['ticker'] = ''
            elif key == 'name':
                tx['name'] = ''
            elif key == 'description':
                tx['description'] = ''
            elif key == 'yahoo_ticker':
                tx['yahoo_ticker'] = ''
            else:
                tx[key] = None
        # Enforce types and non-empty portfolio/ticker/name
        if not tx['ticker'] or not isinstance(tx['ticker'], str):
            tx['ticker'] = ''
        if 'name' not in tx or not isinstance(tx['name'], str):
            tx['name'] = ''
        if 'description' not in tx or not isinstance(tx.get('description'), str):
            tx['description'] = ''
        if 'yahoo_ticker' not in tx or not isinstance(tx.get('yahoo_ticker'), str):
            tx['yahoo_ticker'] = ''
    # Remove transactions that lack both ticker and isin (we require at least one identifier)
    def has_identifier(tx):
        t = tx.get('ticker')
        i = tx.get('isin')
        if isinstance(t, str) and t.strip():
            return True
        if isinstance(i, str) and i.strip():
            return True
        return False

    transactions = [tx for tx in transactions if has_identifier(tx)]
    # Attach the provided portfolio name to each transaction (backend still validates/overrides)
    for tx in transactions:
        tx['portfolio'] = portfolio_name or ''
    return transactions

def generate_grounded_report_response(prompt: str, 
                                      model_name: str = "gemini-2.5-flash",
                                      thinking=None):
    """
    Generate a Gemini report using grounding (Google Search) for more accurate, up-to-date information.
    Returns the model's answer and grounding metadata (search queries, citations), and logs the Gemini API cost.
    """
    from google import genai
    from google.genai import types
    client = genai.Client()
    # 1) Define the grounding tool
    grounding_tool = types.Tool(
        google_search=types.GoogleSearch()
    )
    # 2) Include it in your config. If a `thinking` budget is provided, set it
    # as the thinking_config; otherwise leave it None.
    thinking_config = None
    if thinking is not None:
        try:
            # Accept either an integer budget or a value coercible to int
            thinking_budget = int(thinking)
            thinking_config = types.ThinkingConfig(thinking_budget=thinking_budget)
        except Exception:
            # If building ThinkingConfig fails, fall back to None (no thinking config)
            thinking_config = None

    config = types.GenerateContentConfig(
        temperature=0.0,
        tools=[grounding_tool],
        thinking_config=thinking_config,
    )
    # 3) Make a grounded call
    response = client.models.generate_content(
        model=model_name,
        contents=prompt,
        config=config,
    )
    # --- Cost calculation and logging ---
    in_tokens = response.usage_metadata.prompt_token_count
    out_tokens = response.usage_metadata.candidates_token_count
    cost = calculate_gemini_cost(model_name, in_tokens, out_tokens)
    print(f"\033[93m[Gemini Cost] {model_name} grounded call: ${cost:.4f} (in: {in_tokens}, out: {out_tokens})\033[0m")
    # Return both the text and the grounding metadata if available
    answer = getattr(response, 'text', None)
    grounding_metadata = None
    try:
        if hasattr(response, 'candidates') and response.candidates:
            grounding_metadata = getattr(response.candidates[0], 'grounding_metadata', None)
    except Exception:
        pass
    return {
        'text': answer,
        'cost': cost,
        # 'grounding_metadata': grounding_metadata
    }
