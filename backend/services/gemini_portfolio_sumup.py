"""Gemini-powered portfolio summary ("sumup") generation.

This module exposes `gemini_portfolio_sumup` which produces a concise JSON
snapshot for a portfolio combining performance, returns, risk, allocation,
and volatility context. The output is intentionally opinionated and designed
to feed a dashboard UI without further free-form parsing.

The function relies on the existing Gemini helper `generate_grounded_report_response`
and requests STRICT JSON (no markdown / prose) matching a fixed schema.
"""
from __future__ import annotations

from typing import Any, Dict, Optional, Sequence
import json
from datetime import datetime

from core.gemini_cost import GEMINI_2_5_FLASH
from core.gemini_helper import generate_grounded_report_response

SchemaType = Dict[str, Any]


SUMMARY_JSON_SCHEMA_EXAMPLE = {
	"headline": "Balanced with rising short-term vol and mild drift",
	"subheadline": "YTD +7.8% (−0.7pp vs MSCI World). DD −6.8%.",
	"highlights": [
		"Top position ABC.MI at 12.4% (watch concentration).",
		"Vol30 ↑ vs Vol90 (18.5% vs 14.2%).",
		"Allocation drift 4.2pp; cash 10%."
	],
	"risk_flags": ["VOLATILITY_SPIKE", "CONCENTRATION", "DRIFT"],
	"urgency": "HIGH",  # NONE | LOW | MEDIUM | HIGH | CRITICAL
	"next_best_action": "Trim ABC.MI to 10% and rotate 2pp into global aggregate bond ETF.",
	"explanations_short": [
		"Short-term volatility up 30% vs 90d baseline.",
		"Tracking below benchmark by 0.7pp YTD.",
		"Max drift close to soft limit for Balanced."
	],
	"confidence": 0.0
}


def _clean_text(text: Optional[str]) -> Optional[str]:
	if text is None:
		return None
	return text.replace('```json', '').replace('```', '').strip()


def build_sumup_prompt(context: Dict[str, Any]) -> str:
	"""Build the strict instruction prompt for Gemini.

	Args:
		context: Aggregated raw numeric / structured data for the portfolio.

	Returns:
		A string prompt including explicit JSON schema enforced instructions.
	"""
	# We inline a *minimal* view of the context to reduce token usage while retaining grounding.
	# Context keys expected (best effort, some may be None):
	#   performance.last, performance.first, returns (period objects), risk.report, allocation,
	#   volatility: { vol30, vol90 }, meta (portfolio_name, timestamp), benchmark (optional)
	schema_json = json.dumps(SUMMARY_JSON_SCHEMA_EXAMPLE, indent=2)
	context_json = json.dumps(context, indent=2, default=str)

	return f"""
You are a portfolio analytics assistant. Produce a SINGLE VALID JSON object (UTF-8, no markdown
fences, no commentary) summarizing the portfolio using ONLY the provided structured CONTEXT.

CONTEXT (trusted data):
{context_json}

REQUIREMENTS:
1. Output MUST strictly match the schema below (all top-level keys present) – do NOT add extra keys.
2. All percentage strings in quick_metrics MUST include a percent sign and be rounded sensibly (1 decimal where useful) or 'N/A'.
3. Avoid hallucination: if a metric is missing or None, reflect it as 'N/A' (or skip a highlight referencing it).
4. risk_flags: choose zero or more from this controlled vocabulary ONLY:
   ["VOLATILITY_SPIKE","CONCENTRATION","DRIFT","UNDERPERFORMANCE","DRAWNDOWN","LIQUIDITY","RISK_INCREASE"]
5. urgency: one of NONE | LOW | MEDIUM | HIGH | CRITICAL based on severity and multi-factor alignment.
6. confidence: float 0.0 – 1.0 (your self-estimated reliability given data completeness).
7. highlights: 2–5 concise bullet sentences (<= 110 chars each) – no redundancy.
8. explanations_short: 2–4 succinct causal / interpretive statements (<= 140 chars each).
9. headline <= 70 chars, subheadline <= 120 chars.

STRICT JSON SCHEMA (example values – adapt, but keep keys):
{schema_json}

OUTPUT RULES:
- Return ONLY the JSON object, nothing before or after.
- Do not wrap in code fences.
- Do not invent tickers or metrics absent from context.
""".strip()


def gemini_portfolio_sumup(
	portfolio_name: str,
	*,
	performance: Sequence[Dict[str, Any]] | None = None,
	returns_kpis: Dict[str, Any] | None = None,
	risk_report: Dict[str, Any] | None = None,
	allocation: Dict[str, Any] | None = None,
	volatility: Dict[str, Any] | None = None,
	benchmark: Dict[str, Any] | None = None,
	model_name: str = GEMINI_2_5_FLASH,
) -> Dict[str, Any]:
	"""Generate a structured summary JSON for a portfolio.

	Parameters are intentionally raw so callers (API route / batch job) can
	compose them from existing cached computations without recomputation.

	Returns a dict:
	  {
		'summary': <parsed JSON or raw text>,
		'cost': float|None,
		'error': str|None,
		'reference_date': 'YYYY-MM-DD HH:MM:SS'
	  }
	"""
	# Build a distilled context object for grounding.
	last_point = performance[-1] if performance else None
	first_point = performance[0] if performance else None
	context: Dict[str, Any] = {
		"meta": {
			"portfolio_name": portfolio_name,
			"generated_at_utc": datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S'),
		},
		"performance": {
			"first": first_point,
			"last": last_point,
			"count": len(performance) if performance else 0,
		},
		"returns": returns_kpis or {},
		"risk": risk_report or {},
		"allocation": allocation or {},
		"volatility": volatility or {},
		"benchmark": benchmark or {},
	}

	prompt = build_sumup_prompt(context)

	try:
		response = generate_grounded_report_response(prompt, model_name=model_name, thinking=1024)
	except Exception as e:  # pragma: no cover (network/LLM failures)
		return {
			"summary": None,
			"cost": None,
			"error": f"Gemini call failed: {e}",
			"reference_date": datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
		}

	text = response.get('text') if isinstance(response, dict) else None
	cost = response.get('cost') if isinstance(response, dict) else None
	cleaned = _clean_text(text)
	if not cleaned:
		return {
			"summary": None,
			"cost": cost,
			"error": "Empty response from Gemini",
			"reference_date": datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
		}

	try:
		parsed = json.loads(cleaned)
		# (Optional) minimal shape validation: ensure top-level keys exist
		required = [
			"headline", "subheadline", "highlights", "risk_flags", "urgency",
			"next_best_action", "explanations_short",
			"confidence"
		]
		for k in required:
			if k not in parsed:
				raise ValueError(f"Missing key '{k}' in summary JSON")
		return {
			"summary": parsed,
			"cost": cost,
			"error": None,
			"reference_date": datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
		}
	except Exception as e:
		return {
			"summary": cleaned,
			"cost": cost,
			"error": f"Could not parse JSON: {e}",
			"reference_date": datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
		}


__all__ = ["gemini_portfolio_sumup", "build_sumup_prompt", "SUMMARY_JSON_SCHEMA_EXAMPLE"]

