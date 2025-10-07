"""Gemini-powered portfolio risk analysis service.

This module provides a single function `gemini_portfolio_risk_analysis` which
asks a Gemini model (via the existing `generate_grounded_report_response` helper)
to produce a structured JSON risk analysis for a portfolio given its status
and recent returns.

The function follows project conventions: it instructs the model to return
ONLY a JSON object matching the schema below, attempts to parse it, and
returns the parsed object together with the reported Gemini cost.
"""
from __future__ import annotations

import json
from typing import Any, Dict, Optional

from core.gemini_cost import GEMINI_2_5_FLASH
from core.gemini_helper import generate_grounded_report_response


def _clean_text(text: Optional[str]) -> Optional[str]:
    if text is None:
        return None
    cleaned = text.replace('```json', '').replace('```', '').strip()
    return cleaned


def gemini_portfolio_risk_analysis(portfolio_status: Any, returns: Any, model_name: str = GEMINI_2_5_FLASH) -> Dict[str, Any]:
    """Request a structured risk analysis for the portfolio from Gemini.

    Args:
        portfolio_status: Arbitrary object (dict/string) describing current portfolio holdings, weights, exposures, or other status info.
        returns: Arbitrary object (dict/string) describing recent portfolio returns, per-ticker returns, or aggregated returns.
        model_name: Gemini model name to use (defaults to a project constant).

    Returns:
        A dict with keys:
          - analysis: parsed JSON object returned by Gemini (or raw text on parse failure)
          - cost: estimated Gemini cost (float) when available
          - error: optional error message when parsing/call fails

    The prompt strictly asks for a JSON object with the following schema:
    {
      "overall_risk": "low|medium|high",
      "risk_score": float, // 0-100
      "drivers": [{"name": string, "type": string, "impact": "low|medium|high", "explanation": string}],
      "concentration": {"top_positions": [{"ticker": string, "percent": float}], "analysis": string},
      "liquidity": {"score": float, "analysis": string},
      "market_risk": {"score": float, "analysis": string},
      "tail_risk": {"score": float, "analysis": string},
      "recommended_actions": [{"action": "reduce/increase/monitor/hedge", "instrument": string, "size": string, "rationale": string}],
      "monitoring_plan": [{"metric": string, "threshold": string, "frequency": string}]
    }

    The model is instructed to return ONLY the JSON object and nothing else.
    """

    # Build a compact, explicit prompt that asks for strict JSON output.
    prompt = f"""
You are a financial risk analyst. Given the PORTFOLIO STATUS and RECENT RETURNS below, produce a structured risk analysis for the portfolio.

PORTFOLIO STATUS:
{portfolio_status}

RECENT RETURNS:
{returns}

Output MUST be a single valid JSON object and NOTHING else (no prose, no markdown, no code fences).
Follow this JSON schema exactly (fields may be empty but must be present):

{{
  "overall_risk": "low|medium|high",
  "risk_score": 0.0,  
  "drivers": [
    {{"name": "", 
        "type": "concentration|liquidity|market|credit|operational|other", 
        "impact": "low|medium|high", 
        "explanation": "",
        "concise_summary": ""}}
  ],
  "concentration": {{"top_positions": [{{"ticker": "", "percent": 0.0}}], 
                    "analysis": "",
                    "concise_summary": ""}},
  "liquidity": {{"score": 0.0, "analysis": ""}},
  "market_risk": {{"score": 0.0, "analysis": ""}},
  "tail_risk": {{"score": 0.0, "analysis": ""}},
  "recommended_actions": [
    {{"action": "reduce|increase|monitor|hedge", "instrument": "", "size": "small|medium|large|percent", "rationale": ""}}
  ],
  "monitoring_plan": [
    {{"metric": "", "threshold": "", "frequency": "daily|weekly|monthly"}}
  ]
}}

Be concise and numeric where possible (use floats for scores and percentages). Do not include any extra fields. Return only the JSON object.
"""

    # Call the helper to perform a grounded Gemini request
    try:
        response = generate_grounded_report_response(prompt, 
                                                     model_name=model_name,
                                                     thinking=1024)
    except Exception as e:
        return {"analysis": None, "cost": None, "error": f"Gemini call failed: {e}"}

    text = response.get('text') if isinstance(response, dict) else None
    cost = response.get('cost') if isinstance(response, dict) else None
    cleaned = _clean_text(text)

    if not cleaned:
        return {"analysis": None, "cost": cost, "error": "Empty response from Gemini"}

    # Try to load JSON; if parsing fails, return the raw cleaned text for debugging
    try:
        parsed = json.loads(cleaned)
        return {"analysis": parsed, "cost": cost}
    except Exception:
        return {"analysis": cleaned, "cost": cost, "error": "Could not parse JSON from Gemini response"}


__all__ = ["gemini_portfolio_risk_analysis"]
