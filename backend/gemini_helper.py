import os
import google.generativeai as genai

from backend.gemini_cost import GEMINI_2_5_FLASH_LITE_PREVIEW_06_17

API_KEY = os.getenv("GEMINI_API_KEY")
if not API_KEY:
    raise RuntimeError("GEMINI_API_KEY not set")

genai.configure(api_key=API_KEY)

def parse_transactions(raw_text, portfolio_name=None):
    prompt = (
        "Extract all transactions from the text below. "
        "Return directly just the VALID JSON list where each item has fields: "
        "ticker, quantity, price, date (YYYY-MM-DD), label, portfolio, and name. "
        "The output JSON MUST be a list of objects, each with these keys: "
        "'ticker' (string), 'quantity' (number), 'price' (number), 'date' (YYYY-MM-DD), 'label' (string), 'name' (string). "
        "If any field is missing in the input, set it to null or an empty string. "
        "All final values must be in English for each field, so if you see italian values, convert to english. "
        "DO NOT ADD ANYTHING ELSE. Output only the JSON list.\n"
        "Example JSON schema: [\n"
        "  {\"ticker\": \"AAPL\", \"quantity\": 10, \"price\": 150.0, \"date\": \"2024-06-01\", \"label\": \"Buy\", \"name\": \"Apple Inc.\"}\n"
        "]"
    )
    model_name = os.getenv("GEMINI_MODEL", f"models/{GEMINI_2_5_FLASH_LITE_PREVIEW_06_17}")
    model = genai.GenerativeModel(model_name)
    config = genai.GenerationConfig(temperature=0.0)
    print("Prompt sent to Gemini:", prompt)
    response = model.generate_content([prompt, raw_text], generation_config=config)
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
        cleaned = "".join(text_parts).strip("`\n ").replace('json', '')
        # Try to find the first and last square brackets to extract a valid JSON list
        start = cleaned.find('[')
        end = cleaned.rfind(']')
        if start != -1 and end != -1:
            cleaned = cleaned[start:end+1]
    if not cleaned:
        raise RuntimeError("Could not extract text from Gemini response. Candidates, parts, and text fields were all empty or missing.")
    try:
        transactions = json.loads(cleaned)
        # Ensure every transaction has a non-empty 'portfolio' field
        for tx in transactions:
            if 'portfolio' not in tx or not tx['portfolio']:
                tx['portfolio'] = portfolio_name or "Imported"
            if 'name' not in tx:
                tx['name'] = ''
    except Exception as e:
        raise RuntimeError(f"Could not decode JSON from Gemini response: {e}\nExtracted text: {cleaned}")
    # Validate schema after parsing
    expected_keys = {'ticker', 'quantity', 'price', 'date', 'label', 'portfolio', 'name'}
    for idx, tx in enumerate(transactions):
        missing = expected_keys - set(tx.keys())
        for key in missing:
            # Set missing fields to None, except 'portfolio' which must be a non-empty string, and 'ticker' which must be a non-empty string, and 'name' which must be a string
            if key == 'portfolio':
                tx['portfolio'] = portfolio_name or 'Imported'
            elif key == 'ticker':
                tx['ticker'] = ''
            elif key == 'name':
                tx['name'] = ''
            else:
                tx[key] = None
        # Enforce types and non-empty portfolio/ticker/name
        if not tx['portfolio']:
            tx['portfolio'] = portfolio_name or 'Imported'
        if not tx['ticker'] or not isinstance(tx['ticker'], str):
            tx['ticker'] = ''
        if 'name' not in tx or not isinstance(tx['name'], str):
            tx['name'] = ''
    # Remove transactions with empty or null ticker (cannot be saved to DB)
    transactions = [tx for tx in transactions if tx['ticker'] and isinstance(tx['ticker'], str) and tx['ticker'].strip()]
    return transactions

def generate_grounded_report_response(prompt: str, model_name: str = "gemini-2.5-flash"):
    """
    Generate a Gemini report using grounding (Google Search) for more accurate, up-to-date information.
    Returns the model's answer and grounding metadata (search queries, citations), and logs the Gemini API cost.
    """
    from google import genai
    from google.genai import types
    from gemini_cost import calculate_gemini_cost
    client = genai.Client()
    # 1) Define the grounding tool
    grounding_tool = types.Tool(
        google_search=types.GoogleSearch()
    )
    # 2) Include it in your config
    config = types.GenerateContentConfig(
        temperature=0.0,
        tools=[grounding_tool],
        # thinking_config=types.ThinkingConfig(
        #     thinking_budget=2048,
        # ),
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
