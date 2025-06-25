export enum TrafficLightStatus {
  GREEN = 'GREEN',
  AMBER = 'AMBER',
  RED = 'RED',
  NEUTRAL = 'NEUTRAL'
}

export interface Kpi {
  id: string;
  name: string;
  value: string | number;
  unit?: string;
  status: TrafficLightStatus;
  target?: string | number;
  description?: string;
  icon?: React.ElementType;
}

export interface HistoricalDataPoint {
  date: string; // YYYY-MM-DD
  value: number; // Net value (market value minus cost spent)
  abs_value?: number; // Absolute market value (gross, not net)
  pct?: number; // Percentage performance relative to cost spent
  pct_from_first?: number; // Percentage performance relative to first abs_value (for normalized trend)
}

export interface Asset {
  id: string; // Typically symbol for backend-driven assets
  name: string;
  value: number; // Current total value of this asset holding
  category: string; // e.g., Equity, Bond, Cash
  region: string; // e.g., North America, Europe, Asia
  sector?: string; // e.g., Technology, Healthcare (for equities)
  symbol?: string;
  quantity?: number; // Number of shares/units held
  averageCostPrice?: number | null; // Average cost price per share/unit - may not be available from backend
  historicalValues?: HistoricalDataPoint[]; // History of the total value of this holding - may be limited
  marketPriceHistory?: HistoricalDataPoint[]; // History of the per-unit market price - fetched for charts
  qualitativeRisk?: 'Low' | 'Medium' | 'High' | 'Unknown';
  currency?: string; // From backend holding data
}

export interface PortfolioHistory {
  [date: string]: number; // Total portfolio value on a given date
}
export interface PortfolioData {
  assets: Asset[];
  kpis: Kpi[];
  portfolioHistory?: HistoricalDataPoint[];
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
  sources?: GroundingChunk[];
}

export interface SunburstDataNode {
  name: string;
  value?: number;
  children?: SunburstDataNode[];
  fill?: string;
}

export interface GroundingChunkWeb {
  uri?: string;
  title?: string;
}
export interface GroundingChunk {
  web?: GroundingChunkWeb;
}

export type MovementType = 'buy' | 'sell' | 'dividend' | 'deposit' | 'withdrawal' | 'fee' | 'interest' | 'stock_split';

export interface Movement {
  type: MovementType;
  date: string; // ISO 8601 format (YYYY-MM-DD)
  assetSymbol?: string;
  assetName?: string;
  quantity?: number;
  price?: number | null; // Allow null for price
  amount: number;
  currency: string;
  description?: string;
  splitRatio?: string;
}

export interface StandardizedMovement extends Movement {
  assetCategory?: string;
  assetRegion?: string;
  assetQualitativeRisk?: 'Low' | 'Medium' | 'High' | 'Unknown';
  name?: string; // Asset name from backend 'name' column
}

export interface ProcessMovementsResult {
  success: boolean;
  message: string;
  standardizedMovements?: StandardizedMovement[];
  error?: string;
  movementsProcessed?: number;
  movementsSkipped?: number;
  notes?: string[];
  successfullyProcessedMovements?: StandardizedMovement[];
}

export enum CopilotAction {
  ANALYZE_PORTFOLIO = "ANALYZE_PORTFOLIO",
  GET_ASSET_NEWS = "GET_ASSET_NEWS",
  GENERAL_QUERY = "GENERAL_QUERY"
}

// Types for Ticker Lookup (/api/ticker/<symbol>)
export interface TickerInfoDetails { // Matches yfinance info structure (subset)
  shortName?: string;
  longName?: string;
  symbol?: string;
  sector?: string;
  industry?: string;
  country?: string;
  website?: string;
  marketCap?: number;
  currency?: string;
  exchange?: string;
  quoteType?: string;
  regularMarketPrice?: number; // Added this, important field
  previousClose?: number;
  open?: number;
  dayHigh?: number;
  dayLow?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  volume?: number;
  averageVolume?: number;
  trailingPE?: number;
  forwardPE?: number;
  dividendYield?: number;
  longBusinessSummary?: string;
}

export interface BackendTickerHistoryItem { // Matches an item in backend's "history" array
  date: string; // "YYYY-MM-DD"
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
  dividends?: number;
  stocksplits?: number; // Note: yfinance might return 'Stock Splits'
}

export interface BackendTickerEvents {
  actions?: any[];
  dividends?: any[];
  recommendations?: any[];
}

export interface BackendTickerData { // Matches backend's "data" object for a ticker
  info?: TickerInfoDetails;
  history?: BackendTickerHistoryItem[];
  events?: BackendTickerEvents;
  // --- Extended fields for robust ticker report integration ---
  fundamental_analysis?: any; // TODO: Strong type
  recommendations?: any[]; // TODO: Strong type
  analysts_opinion?: any; // TODO: Strong type
  valuation_summary?: any; // TODO: Strong type
  potential_benefits?: any[]; // TODO: Strong type
  potential_risks?: any[]; // TODO: Strong type
  key_events?: any[]; // TODO: Strong type
  top_pros?: string[]; // Root-level pros/cons
  top_cons?: string[];
}

export interface BackendTickerResponse { // Top-level response from GET /api/ticker/<symbol>
  source: string;
  ticker: string;
  data?: BackendTickerData;
  error?: string;
}

// Types for Portfolio Status (GET /api/portfolio/<name>/status)
export interface PortfolioHolding {
  ticker: string;
  quantity: number;
  price: number; // Current market price from backend
  value: number; // Current total value (quantity * price) from backend
  // Note: currency might be part of TickerInfoDetails, or assumed USD
}
export interface PortfolioStatusResponse {
  holdings: PortfolioHolding[];
  total_value: number;
  last_updated?: string; // ISO string for last update time
  // Potentially add portfolio currency if backend provides it
}

// Types for Portfolio Performance (GET /api/portfolio/<name>/performance)
// This directly maps to HistoricalDataPoint[] where 'date' and 'value' are expected.
export type PortfolioPerformanceResponse = HistoricalDataPoint[];


// Types for Transaction Posting (POST /api/transactions/<name>)
export interface BackendTransactionPayloadItem { // For one item in the "transactions" array
  ticker: string;
  quantity: number;
  price: number;
  date: string; // YYYY-MM-DD
  label: 'buy' | 'sell'; // Backend expects 'label'
}
export interface BackendTransactionPayloadStructured {
  transactions: BackendTransactionPayloadItem[];
}
export interface BackendTransactionPayloadRaw {
  raw: string;
}
export interface BackendSaveTransactionsResponse {
  status: 'saved' | 'error' | string; // 'saved' is success
  count?: number;
  message?: string; // For errors or additional info
}
