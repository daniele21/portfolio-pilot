# Gemini model name constants
GEMINI_2_5_PRO = "gemini-2.5-pro"
GEMINI_2_5_FLASH_LITE_PREVIEW_06_17 = "gemini-2.5-flash-lite-preview-06-17"
GEMINI_2_5_FLASH = "gemini-2.5-flash"
GEMINI_2_0_FLASH = "gemini-2.0-flash"
GEMINI_1_5_PRO = "gemini-1.5-pro"
GEMINI_1_5_FLASH = "gemini-1.5-flash"
GEMINI_1_0_PRO = "gemini-1.0-pro"

gemini_api_pricing = {
    # --- 2.5 Models ---
    "gemini-2.5-pro": {
        "model_name": "Gemini 2.5 Pro",
        "description": "Most capable model with advanced reasoning.",
        "pricing": {
            "input": {
                "<=200k_tokens": 1.25,
                ">200k_tokens": 2.50
            },
            "output": {
                "<=200k_tokens": 10.00,
                ">200k_tokens": 15.00
            }
        },
        "unit": "per 1 million tokens"
    },
    "gemini-2.5-flash-lite-preview-06-17": {
    "model_name": "Gemini 2.5 Flash Lite Preview 06-17",
    "description": "A cost-efficient, low-latency preview of the 2.5 Flash family.",
    "pricing": {
        "input": {
            "default": 0.10,   # text / image / video, per 1 M tokens
            "audio": 0.50      # per 1 M tokens
        },
        "output": 0.40        # per 1 M tokens
    },
    "unit": "per 1 million tokens"
},
    "gemini-2.5-flash": {
        "model_name": "Gemini 2.5 Flash",
        "description": "Fast and efficient model for high-volume tasks.",
        "pricing": {
            "input": {
                "default": 0.30, # for text/image/video
                "audio": 1.00
            },
            "output": 2.50
        },
        "unit": "per 1 million tokens"
    },
    # --- 2.0 Models ---
    "gemini-2.0-flash": {
        "model_name": "Gemini 2.0 Flash",
        "description": "Previous generation fast model.",
        "pricing": {
            "input": {
                "default": 0.10, # for text/image/video
                "audio": 0.70
            },
            "output": 0.40
        },
        "unit": "per 1 million tokens"
    },
    # --- 1.5 Models ---
    "gemini-1.5-pro": {
        "model_name": "Gemini 1.5 Pro",
        "description": "Highly capable model for a wide range of tasks.",
        "pricing": {
            "input": {
                "<=128k_tokens": 1.25,
                ">128k_tokens": 2.50
            },
            "output": {
                "<=128k_tokens": 5.00,
                ">128k_tokens": 10.00
            }
        },
        "unit": "per 1 million tokens"
    },
    "gemini-1.5-flash": {
        "model_name": "Gemini 1.5 Flash",
        "description": "A faster and lower-cost model for high-frequency tasks.",
        "pricing": {
            "input": 0.35,  # for text, image, and video
            "output": 1.05
        },
        "unit": "per 1 million tokens"
    },
    # --- 1.0 Models ---
    "gemini-1.0-pro": {
        "model_name": "Gemini 1.0 Pro",
        "description": "The previous generation's general-purpose model.",
        "pricing": {
            "input": 0.125,
            "output": 0.375
        },
        "unit": "per 1 million characters"
    }
}

def calculate_gemini_cost(model_name: str, input_tokens: int, output_tokens: int, input_modality: str = 'default') -> float:
    """
    Calculates the cost of a Gemini API call based on the model, token counts, and input modality.

    Args:
        model_name: The name of the Gemini model used (e.g., 'gemini-1.5-pro').
        input_tokens: The number of tokens in the input/prompt.
        output_tokens: The number of tokens in the output/response.
        input_modality: The modality of the input ('default' for text/image/video, 'audio').

    Returns:
        The total cost of the API call in USD.
        
    Raises:
        ValueError: If the model_name is not found in the pricing dictionary.
        
    Note:
        For 'gemini-1.0-pro', pricing is by character. This function approximates its cost 
        using token count.
    """
    if model_name not in gemini_api_pricing:
        raise ValueError(f"Model '{model_name}' not found in pricing data.")

    model_info = gemini_api_pricing[model_name]
    pricing = model_info['pricing']
    unit = model_info['unit']
    
    divisor = 1_000_000 if 'million' in unit else 1

    input_price = 0
    output_price = 0

    # Tiered pricing for Pro models based on input token count
    if "pro" in model_name and isinstance(pricing['input'], dict) and any('tokens' in k for k in pricing['input']):
        tier_limit, low_tier_key, high_tier_key = (0, "", "")
        if model_name == "gemini-1.5-pro":
            tier_limit, low_tier_key, high_tier_key = (128_000, '<=128k_tokens', '>128k_tokens')
        elif model_name == "gemini-2.5-pro":
            tier_limit, low_tier_key, high_tier_key = (200_000, '<=200k_tokens', '>200k_tokens')

        if tier_limit > 0:
            if input_tokens <= tier_limit:
                input_price = pricing['input'][low_tier_key]
                output_price = pricing['output'][low_tier_key]
            else:
                input_price = pricing['input'][high_tier_key]
                output_price = pricing['output'][high_tier_key]
    
    # Modality-based pricing (typically for Flash models)
    elif isinstance(pricing['input'], dict):
        input_price = pricing['input'].get(input_modality, pricing['input']['default'])
        output_price = pricing['output']
        
    # Simple pricing (one rate for input, one for output)
    else:
        input_price = pricing['input']
        output_price = pricing['output']

    input_cost = (input_tokens / divisor) * input_price
    output_cost = (output_tokens / divisor) * output_price
    
    total_cost = input_cost + output_cost
    return total_cost
