import { TrafficLightStatus, Asset, Kpi, HistoricalDataPoint } from './types';
import { ArrowTrendingUpIcon, ShieldExclamationIcon, ScaleIcon, BanknotesIcon, PresentationChartLineIcon } from '@heroicons/react/24/outline'; // Added PresentationChartLineIcon

export const TRAFFIC_LIGHT_COLORS: Record<TrafficLightStatus, string> = {
  [TrafficLightStatus.GREEN]: 'bg-green-600 border-green-500',
  [TrafficLightStatus.AMBER]: 'bg-yellow-500 border-yellow-400',
  [TrafficLightStatus.RED]: 'bg-red-600 border-red-500',
  [TrafficLightStatus.NEUTRAL]: 'bg-blue-600 border-blue-500',
};

export const TRAFFIC_LIGHT_TEXT_COLORS: Record<TrafficLightStatus, string> = {
  [TrafficLightStatus.GREEN]: 'text-green-100',
  [TrafficLightStatus.AMBER]: 'text-yellow-100',
  [TrafficLightStatus.RED]: 'text-red-100',
  [TrafficLightStatus.NEUTRAL]: 'text-blue-100',
};

const TODAY = new Date();
const formatDate = (date: Date): string => date.toISOString().split('T')[0];
const daysAgo = (days: number): Date => {
    const date = new Date(TODAY);
    date.setDate(TODAY.getDate() - days);
    return date;
};


export const MOCK_KPIS_DATA: Kpi[] = [
  { id: 'totalPortfolioValue', name: 'Total Portfolio Value', value: 0, unit: 'EUR', status: TrafficLightStatus.NEUTRAL, icon: BanknotesIcon, description: "The total current value of all assets in your portfolio." },
  { id: 'portfolioPL', name: 'Portfolio P/L', value: 0, unit: 'EUR', status: TrafficLightStatus.NEUTRAL, icon: PresentationChartLineIcon, description: "Unrealized Profit/Loss on your non-cash investments." },
  { id: 'riskScore', name: 'Risk Score', value: 65, unit: '/100', status: TrafficLightStatus.AMBER, target: '50-70', icon: ShieldExclamationIcon, description: "Overall portfolio risk assessment." },
  
];

export const MOCK_ASSETS_DATA: Asset[] = [
  { 
    id: 'a1', name: 'Global Tech ETF', value: 25000, category: 'Equity', region: 'Global', sector: 'Technology', symbol: 'TECH', quantity: 100, averageCostPrice: 200, // Cost basis = 20000
    historicalValues: [
      { date: formatDate(daysAgo(30)), value: 24000 }, { date: formatDate(daysAgo(15)), value: 24500 }, { date: formatDate(daysAgo(0)), value: 25000 }
    ],
    qualitativeRisk: 'Medium'
  },
  { 
    id: 'a2', name: 'US Treasury Bonds', value: 15000, category: 'Bond', region: 'North America', sector: 'Government', symbol: 'USTB', quantity: 150, averageCostPrice: 98, // Cost basis = 14700
    historicalValues: [
      { date: formatDate(daysAgo(30)), value: 15100 }, { date: formatDate(daysAgo(15)), value: 15050 }, { date: formatDate(daysAgo(0)), value: 15000 }
    ],
    qualitativeRisk: 'Low'
  },
  { 
    id: 'a3', name: 'European REIT', value: 10000, category: 'Real Estate', region: 'Europe', sector: 'Property', symbol: 'EUREIT', quantity: 50, averageCostPrice: 190, // Cost basis = 9500
    historicalValues: [
      { date: formatDate(daysAgo(30)), value: 9800 }, { date: formatDate(daysAgo(15)), value: 10200 }, { date: formatDate(daysAgo(0)), value: 10000 }
    ],
    qualitativeRisk: 'Medium'
  },
  { 
    id: 'a4', name: 'Emerging Markets Fund', value: 8000, category: 'Equity', region: 'Emerging Markets', sector: 'Diversified', symbol: 'EMF', quantity: 80, averageCostPrice: 95, // Cost basis = 7600
    historicalValues: [
      { date: formatDate(daysAgo(30)), value: 7500 }, { date: formatDate(daysAgo(15)), value: 7800 }, { date: formatDate(daysAgo(0)), value: 8000 }
    ],
    qualitativeRisk: 'High'
  },
  { 
    id: 'a5', name: 'Cash Account USD', value: 12000, category: 'Cash', region: 'Global', symbol: 'CASH-USD', quantity: 12000, averageCostPrice: 1,
    historicalValues: [
      { date: formatDate(daysAgo(30)), value: 11000 }, { date: formatDate(daysAgo(15)), value: 11500 }, { date: formatDate(daysAgo(0)), value: 12000 }
    ],
    qualitativeRisk: 'Low'
  },
  { 
    id: 'a6', name: 'S&P 500 Index Fund', value: 30000, category: 'Equity', region: 'North America', sector: 'Diversified Index', symbol: 'SPX500', quantity: 60, averageCostPrice: 480, // Cost basis = 28800
    historicalValues: [
      { date: formatDate(daysAgo(30)), value: 29000 }, { date: formatDate(daysAgo(15)), value: 29500 }, { date: formatDate(daysAgo(0)), value: 30000 }
    ],
    qualitativeRisk: 'Medium'
  },
];
// Total Demo Value: 25000+15000+10000+8000+12000+30000 = 100000
// Total Demo Non-Cash Cost Basis: 20000+14700+9500+7600+28800 = 80600
// Total Demo Non-Cash Value: 25000+15000+10000+8000+30000 = 88000
// Demo P/L: 88000 - 80600 = 7400

export const MOCK_PORTFOLIO_HISTORY_DATA: HistoricalDataPoint[] = MOCK_ASSETS_DATA[0].historicalValues!.map((_, i) => {
    let totalValue = 0;
    MOCK_ASSETS_DATA.forEach(asset => {
        if (asset.historicalValues && asset.historicalValues[i]) {
            totalValue += asset.historicalValues[i].value;
        } else if (i === (asset.historicalValues?.length ?? 0) -1) { 
            totalValue += asset.value;
        }
    });
    const date = MOCK_ASSETS_DATA[0].historicalValues?.[i]?.date || formatDate(daysAgo(30-i*15));
    return { date, value: totalValue };
}).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());


export const GEMINI_MODEL_TEXT = 'gemini-2.5-flash-preview-04-17';

export const COPILOT_PROMPT_ANALYZE_PORTFOLIO = "Analyze My Portfolio";
export const COPILOT_PROMPT_GET_ASSET_NEWS = "Get News for My Top Assets";