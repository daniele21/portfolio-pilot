import json

import pandas as pd
from core.gemini_cost import GEMINI_2_0_FLASH, GEMINI_2_5_FLASH, calculate_gemini_cost
from core.gemini_helper import generate_grounded_report_response
from db.database import get_ticker_report, save_ticker_report, get_portfolio_report, save_portfolio_report
from datetime import datetime

# This module provides functions to generate a Gemini-based report for a given ticker in a portfolio.

def generate_ticker_report_with_gemini(ticker, holdings, weight, status, returns, ticker_info, force=False):
    """
    Generate a structured report for a single ticker using Gemini LLM.
    If a report for today already exists in the database and force is False, load and return it.
    Otherwise, generate a new report, save it, and return it.
    """
    today = datetime.now().date()
    # Try to load from DB if not force
    if not force:
        existing_report = get_ticker_report(ticker)
        if existing_report is not None:
            ref_date = existing_report.get('reference_date')
            if ref_date:
                ref_date = datetime.strptime(ref_date, '%Y-%m-%d %H:%M:%S').date()
                if ref_date == today:
                    print(f"\033[92m[TickerReport] Loaded report for '{ticker}' from DB (date: {today})\033[0m")
                    return existing_report, 0

    # Remove sensitive/duplicate analyst fields from ticker_info before prompt
    analyst_fields = [
        "averageAnalystRating", "recommendationKey", "numberOfAnalystOpinions",
        "recommendationMean", "targetMedianPrice", "targetMeanPrice",
        "targetLowPrice", "targetHighPrice", "currentPrice"
    ]
    ticker_info_clean = dict(ticker_info) if ticker_info else {}
    for field in analyst_fields:
        ticker_info_clean.pop(field, None)

    prompt = f"""
You are a financial analyst assistant. Given the following data for the ticker {ticker}:

Holdings: {holdings}
Weight in portfolio: {weight:.2%}
Recent {ticker} returns: {returns}
Portfolio status: {status}
Ticker info: {ticker_info_clean}

Generate a detailed report for {ticker} with the following valid JSON format:

    {{
        "fundamental_analysis": {{
            "revenue_and_ebitda": string, // key insights on revenue and EBITDA
            "profitability_and_margins": string, // key insights on profitability and margins
            "balance_sheet_strength": string, // key insights on balance sheet strength
            "cash_flow_analysis": string, // key insights on cash flow
            "valuation_metrics": string, // key insights on valuation metrics like P/E, P/B, etc.
            "growth_drivers": string, // key insights on growth drivers, market position, etc.
            "capital_allocation": string, // key insights on capital allocation, dividends, buybacks, etc.
            "risk_profile": string, // key insights on profile risks
            "financial_ratios": {{
                "current_ratio": float, // current ratio value and analysis
                "current_ratio_analysis": string, // current ratio analysis
                "quick_ratio": float, // quick ratio value and analysis
                "quick_ratio_analysis": string, // quick ratio analysis
                "debt_to_assets": float, // debt to assets ratio value and analysis
                "debt_to_assets_analysis": string, // debt to assets ratio analysis
                "debt_to_equity": float, // debt to equity ratio value and analysis
                "debt_to_equity_analysis": string, // debt to equity ratio analysis
                "return_on_equity": float, // return on equity value and analysis
                "return_on_equity_analysis": string, // return on equity analysis
                "return_on_investment": float, // return on investment value and analysis
                "return_on_investment_analysis": string, // return on investment analysis
                "return_on_assets": float, // return on assets value and analysis
                "return_on_assets_analysis": string // return on assets analysis
            }},
            "key_metrics": {{
                "market_cap": float, // market cap value and analysis
                "market_cap_analysis": string, // market cap analysis
                "pe_ratio": float, // P/E ratio value and analysis
                "pe_ratio_analysis": string, // P/E ratio analysis
                "pb_ratio": float, // P/B ratio value and analysis
                "pb_ratio_analysis": string, // P/B ratio analysis
                "dividend_yield": float, // dividend yield value and analysis
                "dividend_yield_analysis": string // dividend yield analysis
            }},
            
        }},
        "analysts_opinion": {{
                "consensus_rating": string, // consensus rating (buy/hold/sell)
                "target_price": float, // average target price from analysts
                "analyst_sentiment": string // overall sentiment from analysts
            }},
        "potential_benefits": [
            {{
                "benefit": "Your analysis here", // benefit title
                "description": "Your analysis here", // description of the benefit
            }}
        ],
        "potential_risks": [
            {{
                "risk": "Your analysis here", // risk title
                "description": "Your analysis here", // description of the risk
                "attention": "high/medium/low" // level of attention needed
            }},
            ...
        ],
        sentiment_analysis: {{
            "overall_sentiment": "positive/negative/neutral", // overall sentiment of the ticker
            "recent_news": "Your analysis here", // summary of recent news and its sentiment
        }},
        "key_events": [ // key events that can affect the ticker's performance about past, present, and future
            {{
                "event": string, // key event title
                "description": string, // description of the event
                "date": string // date of the event
            }},
            ...
        ],
        "valuation_summary": {{
            "score": float, // overall valuation score of the ticker (0-100 scale), based on fundamental analysis, analysts' ratings, valuation metrics, and key metrics
            "trend": "Bullish/Bearish/Neutral", // trend of the valuation score based on the score
            "explanation": string, // explanation of the valuation score and trend
            "top3_pros": [ // up to top 3 pros of the ticker, if are any pros
                {{
                    "pro": "Your analysis here", // pro title
                    "description": "Your analysis here" // description of the pro
                }},
            ],
            "top3_cons": [ // up to top 3 cons of the ticker, if are any cons
                {{
                    "con": "Your analysis here", // con title
                    "description": "Your analysis here" // description of the con
                }},
            ]
        }},
            "recommendations": [ // recommendation for this asset in my portfolio, based on the holdings, weight, and returns of my portfolio, but also basde on the fundamental analysis, analysts' ratings, valuation metrics, and key metrics
                {{
                    "action": "buy/sell/hold", // action to take with the ticker
                    "trading_strategy": "Your analysis here", // trading strategy to apply
                    "trade_quantity": float, // quantity to trade
                    "rationale": "Your reasoning here", // description of the recommendation
                    "timing": string, // timing of the recommendation
                    "priority": string // priority of the recommendation (high/medium/low)
                }},
                ...
            ]
    }}

IMPORTANT: 
- Use Markdown bold (**text**) for all key numbers, ticker symbols, and section headers in your text. For example, write **AAPL** or **12.5%** or **Valuation Summary** where appropriate.
- Generate just the JSON object without any additional text or explanation.
"""
    response = generate_grounded_report_response(prompt, model_name=GEMINI_2_0_FLASH)
    answer = response.get('text')
    cost = response.get('cost', None)
    if answer is not None:
        answer = answer.replace('```json', '').replace('```', '').strip()
        answer = json.loads(answer)
        # Save the report to the database
        reference_date = pd.Timestamp.now().strftime('%Y-%m-%d %H:%M:%S')
        save_ticker_report(ticker, answer, reference_date, cost)
        print(f"\033[91m[TickerReport] Generated new report for '{ticker}' and saved to DB (date: {today})\033[0m")
    return answer, cost

def generate_portfolio_report_with_gemini(portfolio_name, status, returns, force=False):
    """
    Generate a structured report for the entire portfolio using Gemini LLM.
    If a report for today already exists in the database and force is False, load and return it.
    Otherwise, generate a new report, save it, and return it.
    """
    today = datetime.now().date()
    
    if not force:
        existing_report = get_portfolio_report(portfolio_name)
        # Only use the report if its reference_date is today
        if existing_report is not None:
            ref_date = existing_report.get('reference_date')
            ref_date = datetime.strptime(ref_date, '%Y-%m-%d %H:%M:%S').date()
            if ref_date == today:
                print(f"\033[92m[PortfolioReport] Loaded report for '{portfolio_name}' from DB (date: {today})\033[0m")
                return existing_report, 0

    prompt = f"""
You are a financial analyst assistant. Given the following data for the portfolio '{portfolio_name}':

Portfolio status: {status}
Recent Portfolio returns: {returns}

First, provide a rapid overview for each ticker in the portfolio with the following structure:
- Ticker
- Momentum/News     // brief bullet or phrase about the timeliest news items whose directional sentiment and trading-volume response suggest a potential price-momentum
- Momentum Sentiment // positive, negative, neutral
- What to Evaluate  // bullets of the potential trade-through impact

Then, provide a weight check grouped by macro-class with the following structure:
- Macro-class (ETF, Bond, Equity, Crypto, etc.) 
- Value 
- % on Portfolio 
- Suggested Actions 
- Rationale // why this action is suggested
- Sentiment // positive, negative, neutral


Generate then a detailed report for the entire portfolio with the following sections.

Format your response as a valid JSON object as follows:
{{
  "overview": [
      {{
          "ticker": string,
          "momentum_news": string, 
          "momentum_sentiment": string, // positive, negative, neutral
          "what_to_evaluate": string
      }},
      ...
  ],
    "weight_check": [
        {{
            "macro_class": string,
            "value": float,
            "percent_on_portfolio": float,
            "suggested_actions": string,
            "rationale": string,
            "sentiment": string // positive, negative, neutral
        }},
        ...
    ],
    "portfolio_report": {{
        "portfolio_overview": "Your overview here", // bullets of key metrics, ratios, etc.
        "key_strengths": [
            {{
                "strength": string, // strenght title
                "description": string // description of the strength
            }},
            ...
        ],
        "diversification_analysis": [
            {{
                "diversification": string, // diversification title
                "description": string, // description of the diversification
                "attention": string // high, medium, low
            }},
            ...
        ],
        "main_risks": [
            {{
                "risk": string, // risk title
                "description": string, // description of the risk
                "attention": string // high, medium, low
            }},
            ...
        ],
        "notable_events": [
            {{
                "event": string, // event title
                "description": string, // description of the event
                "date": string // date of the event
            }},
            ...
        ],
        "final_evaluation": {{
            "score": float, // overall score of the portfolio. 0-100 scale
            "evaluation_label": Excellent[85-100]/Acceptable[70-84]/Caution[55-69]/Critical[0-54], // label of the evaluation
            "evaluation_description": "Your evaluation description here", // description of the evaluation
            "alert": string, // brief alert message if the portfolio is in non-excellent state
            "recommendations": [ // recommendation, based on the evaluation, to take the portoflio to the excellent state
                {{
                    "recommendation": string, // recommendation title
                    "rationale": string, // description of the recommendation
                    "timing": string, // timing of the recommendation (short-term/medium-term/long-term)
                    "priority": string // priority of the recommendation (high/medium/low)
                }},
                ...
            ]
        }}
    }}
}}

IMPORTANT: Use Markdown bold (**text**) and italic(*text*) when necessary to highlight the text and where appropriate.
"""
    # Call Gemini LLM via gemini_helper (assume gemini_helper.generate_json_response exists)
    response = generate_grounded_report_response(prompt, model_name=GEMINI_2_5_FLASH)
    answer = response.get('text')
    cost = response.get('cost', None)
    if answer is not None:
        answer = answer.replace('```json', '').replace('```', '').strip()
        answer = json.loads(answer)
        # Save the report to the database
        reference_date = pd.Timestamp.now().strftime('%Y-%m-%d %H:%M:%S')
        save_portfolio_report(portfolio_name, answer, reference_date, cost)
        print(f"\033[91m[PortfolioReport] Generated new report for '{portfolio_name}' and saved to DB (date: {today})\033[0m")
    return answer, cost

def generate_multi_ticker_report_with_gemini(tickers, holdings_list, weights, status, returns_dict, model_name=GEMINI_2_0_FLASH):
    """
    Generate a single Gemini LLM report for multiple tickers at once, passing all ticker info in one prompt.
    Args:
        tickers (list of str): List of ticker symbols to analyze.
        holdings_list (list of dict): List of holding info for each ticker.
        weights (list of float): List of weights for each ticker in the portfolio.
        status (dict): The portfolio status (can include other tickers, context).
        returns_dict (dict): Dict mapping ticker symbol to its returns data.
        model_name (str): Gemini model name for cost calculation.
    Returns:
        dict: Mapping ticker symbol to its structured report.
    """
    # Build a single prompt for all tickers
    tickers_info = []
    for i, ticker in enumerate(tickers):
        tickers_info.append({
            'ticker': ticker,
            'holdings': holdings_list[i] if i < len(holdings_list) else {},
            'weight': weights[i] if i < len(weights) else 0.0,
            'returns': returns_dict.get(ticker, {})
        })
    prompt = f"""
You are a financial analyst assistant. Given the following data for multiple tickers in a portfolio:

Portfolio status: {status}

Tickers data:
{tickers_info}

For each ticker, generate a detailed report with the following sections:
1. Fundamental analysis
2. Potential benefits and risks
3. Valuation summary
4. Analysts rating
5. Key events to happen that can affect its performance
6. Final summary overall

Format your response as a JSON object mapping each ticker symbol to its report, e.g.:
{{
  "AAPL": {{
    "fundamental_analysis": "...",
    "benefits": "...",
    "risks": "...",
    "valuation_summary": "...",
    "analysts_rating": "...",
    "key_events": "...",
    "final_summary": "..."
  }},
  ...
}}

IMPORTANT: Use Markdown bold (**text**) for all key numbers, ticker symbols, and section headers in your text.
"""
    response = generate_grounded_report_response(prompt, model_name=model_name)
    # Attach cost info to the report if available
    token_usage = getattr(response, 'token_usage', None) or getattr(response, 'usage', None) or {}
    in_tokens = token_usage.get('input_tokens', 0)
    out_tokens = token_usage.get('output_tokens', 0)
    cost = calculate_gemini_cost(model_name, in_tokens, out_tokens)
    # Add cost and token usage to the report output
    report = response if isinstance(response, dict) else {'text': response}
    report['gemini_cost'] = cost
    report['input_tokens'] = in_tokens
    report['output_tokens'] = out_tokens
    return report
