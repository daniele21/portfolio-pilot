import { HistoricalDataPoint, BackendTickerResponse, BackendTickerHistoryItem } from '../types';

const API_BASE_URL = 'http://127.0.0.1:5000';

export const getAuthIdToken = (): string | null => {
  return localStorage.getItem('idToken');
};

const commonFetch = async (apiUrl: string, symbolForLogging: string): Promise<BackendTickerResponse | null> => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  const idToken = getAuthIdToken();
  if (idToken) {
    headers['Authorization'] = `Bearer ${idToken}`;
  } else {
    console.warn(`MarketDataService: No ID token found for ${symbolForLogging}. Request to ${apiUrl} will be unauthenticated.`);
    // Potentially return an error or allow the request to proceed if some endpoints are public
    // For this app, auth is generally required by the backend.
  }

  try {
    const response = await fetch(apiUrl, { headers });

    if (!response.ok) {
      let errorDataMessage = `Status ${response.status}: ${response.statusText}.`;
      try {
        const errorData = await response.json();
        errorDataMessage += ` Server message: ${errorData.error || JSON.stringify(errorData)}`;
      } catch (e) { /* Ignore if error body isn't JSON */ }
      console.error(`MarketDataService: API request failed for ${symbolForLogging} at ${apiUrl}. ${errorDataMessage}`);
      // Construct a BackendTickerResponse-like error object to propagate the error consistently
      return { 
        source: "CLIENT_ERROR", 
        ticker: symbolForLogging, 
        error: `API request failed: ${response.status} ${response.statusText}` 
      };
    }

    const backendResponse: BackendTickerResponse = await response.json();
    if (backendResponse.error) {
        console.warn(`MarketDataService: Backend returned an error for ${symbolForLogging}: ${backendResponse.error}`);
    }
    return backendResponse;

  } catch (error) {
    let detailedErrorMessage = `MarketDataService: Network or parsing error for ${symbolForLogging} at ${apiUrl}.`;
    if (error instanceof TypeError && error.message.toLowerCase().includes("failed to fetch")) {
        detailedErrorMessage = `MarketDataService: "Failed to fetch" for ${symbolForLogging} from ${apiUrl}. This often indicates a CORS issue, network problem, or the server is down. Ensure the backend allows requests from this origin and handles Authorization headers correctly, especially for error responses.`;
    } else if (error instanceof Error) {
        detailedErrorMessage += ` Details: ${error.message}`;
    } else {
        detailedErrorMessage += ` Unknown error: ${String(error)}`;
    }
    console.error(detailedErrorMessage, error);
    return { 
        source: "CLIENT_ERROR", 
        ticker: symbolForLogging, 
        error: "Network error or failed to parse response." 
    };
  }
};


export const fetchHistoricalMarketPrices = async (
  symbol: string,
  startDate: string, // YYYY-MM-DD
  endDate: string    // YYYY-MM-DD
): Promise<HistoricalDataPoint[] | null> => {
  const cleanApiBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  // The backend /api/ticker/<symbol> returns all available history. Filtering by date is done client-side.
  const apiUrl = `${cleanApiBaseUrl}/api/ticker/${symbol.toUpperCase()}`;

  const backendResponse = await commonFetch(apiUrl, symbol);

  if (!backendResponse || backendResponse.error || !backendResponse.data || !backendResponse.data.history) {
    console.warn(`MarketDataService: Could not retrieve valid historical data for ${symbol}. Error: ${backendResponse?.error}`);
    return null;
  }
  
  const transformedData: HistoricalDataPoint[] = backendResponse.data.history
    .map((item: BackendTickerHistoryItem) => ({
      date: new Date(item.date).toISOString().split('T')[0], // Normalize date format
      value: item.close,
    }))
    .filter(point => {
      const pointDate = new Date(point.date);
      return pointDate >= new Date(startDate) && pointDate <= new Date(endDate);
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  // console.log(`MarketDataService: Successfully fetched and transformed historical prices for ${symbol}. Points: ${transformedData.length}`);
  return transformedData;
};

export const fetchTickerDetails = async (symbol: string): Promise<BackendTickerResponse | null> => {
  const cleanApiBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const apiUrl = `${cleanApiBaseUrl}/api/ticker/${symbol.toUpperCase()}`;
  
  const response = await commonFetch(apiUrl, symbol);
  // console.log(`MarketDataService: fetchTickerDetails response for ${symbol}`, response);
  return response;
};

export const fetchBenchmarkPerformance = async (symbol: string): Promise<HistoricalDataPoint[] | null> => {
  const cleanApiBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const apiUrl = `${cleanApiBaseUrl}/api/benchmark/${encodeURIComponent(symbol)}/performance`;
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const idToken = getAuthIdToken ? getAuthIdToken() : null;
  if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
  try {
    const response = await fetch(apiUrl, { headers });
    if (!response.ok) return null;
    const data = await response.json();
    // The backend returns a list of {date, value, abs_value, pct}
    return Array.isArray(data) ? data : null;
  } catch (e) {
    return null;
  }
};
