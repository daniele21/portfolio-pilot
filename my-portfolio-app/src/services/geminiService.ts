
import { GoogleGenAI, GenerateContentResponse, GroundingChunk } from "@google/genai";
import { GEMINI_MODEL_TEXT } from '../constants';
import { Asset } from "../types"; // StandardizedMovement, ProcessMovementsResult removed

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.warn("API_KEY for Gemini is not set. AI Copilot and other AI features may not function.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY! }); 

interface AiResponse {
  text: string;
  sources?: GroundingChunk[];
}

const safeGenerateContent = async (modelConfig: any): Promise<AiResponse> => {
    if (!API_KEY) {
        return { text: "AI features are disabled. API key is missing." };
    }
    try {
        const response: GenerateContentResponse = await ai.models.generateContent(modelConfig);
        const text = response.text;
        const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        return { text, sources };
    } catch (error) {
        console.error("Gemini API error:", error);
        let errorMessage = "An error occurred while communicating with the AI. Please try again.";
        if (error instanceof Error) {
            if (error.message.includes("API key not valid") || error.message.includes("PERMISSION_DENIED")) {
                errorMessage = "There seems to be an issue with the API configuration. Please check the API key.";
            } else if (error.message.includes("quota")) {
                errorMessage = "API quota exceeded. Please try again later.";
            }
        }
        // No longer need special handling for JSON response error for standardizeMovementsData
        return { text: errorMessage };
    }
}

export const getChatResponse = async (promptText: string): Promise<AiResponse> => {
  const useSearch = promptText.toLowerCase().includes("latest") || 
                    promptText.toLowerCase().includes("current") ||
                    promptText.toLowerCase().includes("news") ||
                    promptText.toLowerCase().includes("recent") ||
                    /\b(what is|who is|explain)\b.*\b(today|this week|this month|202\d)\b/i.test(promptText);

  const modelConfig: any = {
    model: GEMINI_MODEL_TEXT,
    contents: [{ role: "user", parts: [{text: promptText}] }],
    config: {
      systemInstruction: "You are a helpful AI assistant for a Personal Portfolio Analyzer. Provide concise and informative answers related to finance, investments, and market analysis. If asked about recent events or data, leverage search capabilities if available. Keep responses professional and targeted to an investor audience.",
    }
  };
  
  if (useSearch) {
    modelConfig.config.tools = [{googleSearch: {}}];
  }
  return safeGenerateContent(modelConfig);
};

// standardizeMovementsData function is removed. Backend will handle this.

export const getPortfolioAnalysis = async (assets: Asset[]): Promise<AiResponse> => {
  const portfolioSummary = assets.map(a => ({ 
    symbol: a.symbol, 
    name: a.name, 
    value: a.value, 
    category: a.category,
    region: a.region,
    sector: a.sector,
    qualitativeRisk: a.qualitativeRisk,
    percentage: null 
  }));
  const totalValue = assets.reduce((sum, asset) => sum + asset.value, 0);
  portfolioSummary.forEach(a => (a.percentage as any) = totalValue > 0 ? parseFloat(((a.value / totalValue) * 100).toFixed(2)) : 0);


  const promptText = `
Analyze the following investment portfolio. Provide an overall status assessment (e.g., diversification, risk exposure based on categories, regions, and qualitative risk assessments) 
and make specific observations or suggestions for individual assets if any stand out. 
Consider concentration risks (e.g., if a single asset or sector is a very large portion of the portfolio).
Be balanced and informative, not prescriptive financial advice.

Portfolio Data:
${JSON.stringify(portfolioSummary, null, 2)}

Total Portfolio Value: ${totalValue.toLocaleString()} (assume USD or as per primary currency in data if evident)

Focus on:
- Overall diversification across asset categories (Equity, Bond, Real Estate, Cash etc.), regions, and sectors.
- Any significant concentration in a single asset, sector, or region.
- Alignment of qualitative risk assessments with asset categories.
- General alignment with common investment principles (e.g., risk-appropriate cash levels, overly speculative holdings if apparent).
- Keep the analysis concise and actionable.
`;
  const modelConfig = {
    model: GEMINI_MODEL_TEXT,
    contents: [{ role: "user", parts: [{text: promptText}] }],
    config: {
      systemInstruction: "You are an AI portfolio analyst. Provide insightful, high-level observations. Do not give financial advice or specific buy/sell recommendations.",
    }
  };
  return safeGenerateContent(modelConfig);
};

export const getAssetNews = async (assetSymbols: string[]): Promise<AiResponse> => {
  if (assetSymbols.length === 0) {
    return { text: "No asset symbols provided to fetch news for." };
  }
  const promptText = `
Provide recent news, relevant information, and any notable upcoming events (like earnings calls, major announcements, or significant market analysis if available via search) 
for the following asset symbol(s): ${assetSymbols.join(', ')}.
Focus on information that could be useful for an investor to make decisions or stay informed.
Prioritize information from the last month if possible.
`;
  const modelConfig = {
    model: GEMINI_MODEL_TEXT,
    contents: [{ role: "user", parts: [{text: promptText}] }],
    config: {
      systemInstruction: "You are an AI financial news aggregator. Fetch and summarize relevant information for the given stock symbols using available search tools.",
      tools: [{googleSearch: {}}],
    }
  };
  return safeGenerateContent(modelConfig);
};