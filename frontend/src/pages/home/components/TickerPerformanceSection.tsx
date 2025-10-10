import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../AuthContext';
import { fetchTickerPerformance, fetchPortfolioVolatilitySeries } from '../../../services/portfolioService';
import GenericPerformanceSection, { ValueType } from '../../../components/PerformanceSection';
// Listbox removed: selection is done from the Returns table on the Assets page

interface TickerOption {
  id: string;
  name: string;
}

interface TickerPerformanceSectionProps {
  selectedPortfolio: string | null;
  availableTickers: TickerOption[];
  selectedTickers: string[];
  onSelectedTickersChange?: (tickers: string[]) => void;
}

const TickerPerformanceSection: React.FC<TickerPerformanceSectionProps> = ({
  selectedPortfolio,
  availableTickers,
  selectedTickers,
}) => {
  const { isLoggedIn, idToken } = useAuth();
  const [valueType, setValueType] = React.useState<ValueType>('pct_from_first');
  const [dateRange, setDateRange] = React.useState<{start: string; end: string} | null>(null);
  // Volatility overlay options
  const [showVolatility] = React.useState<boolean>(false);
  const [volatilityWindow] = React.useState<string>('30');

  // Fetch performance data for selected tickers
  const tickerPerformanceQueries = useQuery({
    queryKey: ['tickerPerformances', selectedPortfolio, selectedTickers, isLoggedIn, idToken],
    queryFn: async () => {
      if (!selectedPortfolio || selectedTickers.length === 0) return [];
      
      const results = await Promise.all(
        selectedTickers.map(async (ticker) => {
          try {
            const data = await fetchTickerPerformance(selectedPortfolio, ticker);
            const tickerInfo = availableTickers.find(t => t.id === ticker);
            return {
              id: ticker,
              name: tickerInfo?.name || ticker,
              data: Array.isArray(data) ? data : []
            };
          } catch (error) {
            console.error(`Error fetching performance for ${ticker}:`, error);
            return {
              id: ticker,
              name: ticker,
              data: []
            };
          }
        })
      );
      
      return results.filter(result => result.data.length > 0);
    },
    enabled: !!selectedPortfolio && selectedTickers.length > 0 && !!isLoggedIn && !!idToken
  });

  // Fetch volatility time-series for optional overlay
  const volatilityQuery = useQuery({
    queryKey: ['tickerVolatilitySeries', selectedPortfolio, volatilityWindow, isLoggedIn, idToken],
    queryFn: async () => {
      if (!selectedPortfolio || !isLoggedIn || !idToken) return [];
      try {
        const data = await fetchPortfolioVolatilitySeries(selectedPortfolio, { window: volatilityWindow });
        return Array.isArray(data) ? data : [];
      } catch (e) {
        console.error('Error fetching volatility series', e);
        return [];
      }
    },
    enabled: !!selectedPortfolio && !!isLoggedIn && !!idToken && showVolatility,
  });

  // Filter data by date range
  const filteredSeries = React.useMemo(() => {
    const raw = Array.isArray(tickerPerformanceQueries.data) ? tickerPerformanceQueries.data : [];
    return raw.map(series => ({
      ...series,
      data: Array.isArray(series.data)
        ? (dateRange
            ? series.data.filter(point => {
                try {
                  const pointDate = new Date(point.date);
                  const startDate = new Date(dateRange.start);
                  const endDate = new Date(dateRange.end);
                  return pointDate >= startDate && pointDate <= endDate;
                } catch (e) {
                  return false;
                }
              })
            : series.data)
        : []
    }));
  }, [tickerPerformanceQueries.data, dateRange]);

  // Compute date range bounds
  const dateBounds = React.useMemo(() => {
    const raw = Array.isArray(tickerPerformanceQueries.data) ? tickerPerformanceQueries.data : [];
    if (raw.length === 0) {
      const today = new Date().toISOString().split('T')[0];
      return { minDate: today, maxDate: today };
    }
    const allDates = raw.flatMap(series => (Array.isArray(series.data) ? series.data.map(point => point.date) : [])).filter(Boolean).sort();
    const today = new Date().toISOString().split('T')[0];
    return {
      minDate: allDates.length > 0 ? allDates[0] : today,
      maxDate: allDates.length > 0 ? allDates[allDates.length - 1] : today
    };
  }, [tickerPerformanceQueries.data]);

  // Set YTD function
  const setYTD = React.useCallback(() => {
    const now = new Date();
    const ytdStart = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];
    setDateRange({ start: ytdStart, end: today });
  }, []);

  // Compute final value for display
  const finalValue = React.useMemo(() => {
    if (!filteredSeries || filteredSeries.length === 0) return 'N/A';
    
    // Show summary of selected tickers
    return `${filteredSeries.length} ticker${filteredSeries.length === 1 ? '' : 's'} selected`;
  }, [filteredSeries]);

  // If volatility overlay is enabled and we have data, append it as an additional series
  const finalSeries = React.useMemo(() => {
    const base = Array.isArray(filteredSeries) ? filteredSeries : [];
    if (showVolatility && volatilityQuery.data && Array.isArray(volatilityQuery.data) && volatilityQuery.data.length > 0) {
      const volData = volatilityQuery.data.map(pt => ({ date: pt.date, value: pt.volatility !== null && typeof pt.volatility === 'number' ? pt.volatility * 100 : 0, pct: pt.volatility !== null && typeof pt.volatility === 'number' ? pt.volatility * 100 : 0, pct_from_first: pt.volatility !== null && typeof pt.volatility === 'number' ? pt.volatility * 100 : 0 }));
      const volSeries = {
        id: 'volatility',
        name: `Volatility (${volatilityWindow})`,
        data: volData,
      } as any;
      return [...base, volSeries];
    }
    return base;
  }, [filteredSeries, showVolatility, volatilityQuery.data, volatilityWindow]);

  // The selector UI is removed — selection is controlled from the Returns table on the Assets page.

  if (selectedTickers.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">Select one or more assets from the Returns table to compare their performance.</p>
      </div>
    );
  }


  return (
    <GenericPerformanceSection
      title=""
      valueType={valueType}
      onValueTypeChange={setValueType}
      data={[]} // Not used in multi-line mode
      series={finalSeries}
      dateRange={dateRange}
      onDateRangeChange={setDateRange}
      minDate={dateBounds.minDate}
      maxDate={dateBounds.maxDate}
      onSetYTD={setYTD}
      loading={tickerPerformanceQueries.isLoading || (showVolatility && volatilityQuery.isLoading)}
      notEnoughDataMessage="Not enough data to display asset performance comparison"
      finalValue={finalValue}
    />
  );
};

export default TickerPerformanceSection;