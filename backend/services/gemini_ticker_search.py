"""Gemini-based ticker discovery service.

Given a natural language query (company name, description, ISIN, etc.) this module
asks a Gemini model to propose likely Yahoo Finance ticker symbols. The model
is instructed to output strict JSON so we can parse deterministically.

We still treat the model output as suggestions only (NOT authoritative) and the
frontend / caller should validate by attempting a real data fetch before use.
"""
from __future__ import annotations

import os
import json
import time
import threading
from typing import Any, Dict, List
from core.gemini_cost import GEMINI_2_5_FLASH_LITE, GEMINI_2_5_FLASH_LITE_PREVIEW_06_17

import google.generativeai as genai

API_KEY = os.getenv("GEMINI_API_KEY")
if not API_KEY:
    raise RuntimeError("GEMINI_API_KEY not set (required for Gemini ticker search)")

genai.configure(api_key=API_KEY)


class TTLCache:
    def __init__(self, ttl_seconds: int = 300, max_entries: int = 256):
        self.ttl = ttl_seconds
        self.max_entries = max_entries
        self._store: Dict[str, Any] = {}
        self._lock = threading.Lock()

    def get(self, key: str):
        now = time.time()
        with self._lock:
            entry = self._store.get(key)
            if not entry:
                return None
            exp, value = entry
            if now > exp:
                self._store.pop(key, None)
                return None
            return value

    def set(self, key: str, value: Any):
        with self._lock:
            if len(self._store) >= self.max_entries:
                # crude eviction: remove expired or oldest
                for k, (exp, _) in sorted(self._store.items(), key=lambda kv: kv[1][0]):
                    self._store.pop(k, None)
                    if len(self._store) < self.max_entries:
                        break
            self._store[key] = (time.time() + self.ttl, value)


_cache = TTLCache(ttl_seconds=420)


PROMPT_TEMPLATE = (
    "You are a precise financial instruments resolver. Given the user input below, "
    "produce a JSON array (and ONLY the JSON array) of up to 8 likely current, valid, "
    "publicly traded financial instruments that best match. Prefer primary listings. Use Yahoo Finance symbol format (e.g. ENEL.MI, AAPL, 7203.T).\n"
    "Rules:\n"
    "- Output ONLY JSON (no prose, no markdown).\n"
    "- Each element object keys: symbol, name, exchange, country.\n"
    "- If unsure about a field, omit that field (do not invent).\n"
    "- Never output delisted symbols unless query explicitly mentions historical or delisted.\n"
    f"User input: {{query}}\n"
    "Return JSON array now:"
)


def _extract_json(text: str) -> str | None:
    if not text:
        return None
    start = text.find('[')
    end = text.rfind(']')
    if start == -1 or end == -1 or end <= start:
        return None
    return text[start:end + 1]


def gemini_ticker_search(
    query: str,
    model_name: str | None = GEMINI_2_5_FLASH_LITE,
    temperature: float = 0.0,
    max_output_tokens: int = 256,
    grounding: bool = True,
) -> Dict[str, Any]:
    """Search for tickers using Gemini.

    Parameters:
      - query: user input
      - model_name: optional model identifier (falls back to env)
      - temperature: model temperature
      - max_output_tokens: token limit for output
      - grounding: when True, use grounded generation with Google Search
    """
    q = (query or '').strip()
    if len(q) < 2:
        return {"query": q, "count": 0, "results": [], "provider": "gemini"}
    cache_key = f"{q.lower()}::m={model_name or ''}::g={int(bool(grounding))}::t={temperature}::tok={max_output_tokens}"
    cached = _cache.get(cache_key)
    if cached:
        return cached

    model_name = model_name or os.getenv("GEMINI_TICKER_MODEL", os.getenv("GEMINI_MODEL", f"models/{GEMINI_2_5_FLASH_LITE_PREVIEW_06_17}"))
    prompt = PROMPT_TEMPLATE.format(query=q)

    # Use grounding path if requested
    response = None
    try:
        if grounding:
            # Use grounded generation via genai.Client and tools
            try:
                from google import genai as genai_client
                from google.genai import types
                client = genai_client.Client()
                grounding_tool = types.Tool(google_search=types.GoogleSearch())
                config = types.GenerateContentConfig(
                    temperature=temperature,
                    tools=[grounding_tool],
                    max_output_tokens=max_output_tokens,
                )
                response = client.models.generate_content(
                    model=model_name,
                    contents=[prompt],
                    config=config,
                )
            except Exception as e:
                return {"query": q, "count": 0, "results": [], "error": f"Grounded Gemini call failed: {e}", "provider": "gemini"}
        else:
            model = genai.GenerativeModel(model_name)
            gen_cfg = genai.GenerationConfig(temperature=temperature, max_output_tokens=max_output_tokens)
            response = model.generate_content([prompt], generation_config=gen_cfg)
    except Exception as e:  # noqa: BLE001
        return {"query": q, "count": 0, "results": [], "error": f"Gemini call failed: {e}", "provider": "gemini"}

    # Collect text parts (both GenAI client and genai.GenerativeModel shapes)
    parts: List[str] = []
    try:
        # genai.GenerativeModel style
        if hasattr(response, 'candidates') and response.candidates:
            # candidates[0].content.parts
            try:
                for part in response.candidates[0].content.parts:
                    if getattr(part, 'text', None):
                        parts.append(part.text)
            except Exception:
                # some responses have text field directly
                if getattr(response.candidates[0], 'text', None):
                    parts.append(response.candidates[0].text)

        # grounded client style
        if not parts and hasattr(response, 'text') and response.text:
            parts.append(response.text)
        # Some grounded responses return candidates with content.parts as well
        if not parts and hasattr(response, 'candidates') and response.candidates:
            try:
                for part in response.candidates[0].content.parts:
                    if getattr(part, 'text', None):
                        parts.append(part.text)
            except Exception:
                pass
    except Exception:
        pass
    raw_text = ''.join(parts).strip()
    json_str = _extract_json(raw_text) or raw_text
    results: List[Dict[str, Any]] = []
    try:
        parsed = json.loads(json_str)
        if isinstance(parsed, list):
            for item in parsed:
                if not isinstance(item, dict):
                    continue
                symbol = (item.get('symbol') or '').strip()
                if not symbol:
                    continue
                results.append({
                    'symbol': symbol.upper(),
                    'shortname': item.get('name') or item.get('shortName') or item.get('longName'),
                    'longname': item.get('name') or item.get('longName') or item.get('shortName'),
                    'exchDisp': item.get('exchange') or item.get('exch') or item.get('exchangeDisplay'),
                    'quoteType': 'EQUITY',  # default assumption
                    'currency': item.get('currency'),
                    'source': 'gemini'
                })
    except Exception:
        # parsing failed; treat as no results
        results = []

    payload = {"query": q, "count": len(results), "results": results, "provider": "gemini"}
    _cache.set(cache_key, payload)
    return payload


__all__ = ["gemini_ticker_search"]
