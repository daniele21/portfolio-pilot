import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../AuthContext';
import { fetchTickerPerformance } from '../../../services/portfolioService';
import GenericPerformanceSection, { ValueType } from '../../../components/PerformanceSection';
import { Listbox, Transition } from '@headlessui/react';
import { CheckIcon, ChevronUpDownIcon } from '@heroicons/react/20/solid';

interface TickerOption {
  id: string;
  name: string;
}

interface TickerPerformanceSectionProps {
  selectedPortfolio: string | null;
  availableTickers: TickerOption[];
  selectedTickers: string[];
  onSelectedTickersChange: (tickers: string[]) => void;
}

const TickerPerformanceSection: React.FC<TickerPerformanceSectionProps> = ({
  selectedPortfolio,
  availableTickers,
  selectedTickers,
  onSelectedTickersChange
}) => {
  const { isLoggedIn, idToken } = useAuth();
  const [valueType, setValueType] = React.useState<ValueType>('pct_from_first');
  const [dateRange, setDateRange] = React.useState<{start: string; end: string} | null>(null);

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

  // Filter data by date range
  const filteredSeries = React.useMemo(() => {
    if (!tickerPerformanceQueries.data) return [];
    
    return tickerPerformanceQueries.data.map(series => ({
      ...series,
      data: dateRange 
        ? series.data.filter(point => {
            const pointDate = new Date(point.date);
            const startDate = new Date(dateRange.start);
            const endDate = new Date(dateRange.end);
            return pointDate >= startDate && pointDate <= endDate;
          })
        : series.data
    }));
  }, [tickerPerformanceQueries.data, dateRange]);

  // Compute date range bounds
  const dateBounds = React.useMemo(() => {
    if (!tickerPerformanceQueries.data || tickerPerformanceQueries.data.length === 0) {
      const today = new Date().toISOString().split('T')[0];
      return { minDate: today, maxDate: today };
    }
    
    const allDates = tickerPerformanceQueries.data.flatMap(series => 
      series.data.map(point => point.date)
    ).sort();
    
    return {
      minDate: allDates[0] || new Date().toISOString().split('T')[0],
      maxDate: allDates[allDates.length - 1] || new Date().toISOString().split('T')[0]
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

  // Ticker selector component
  const tickerSelector = (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-300">Assets:</span>
      <Listbox
        value={selectedTickers}
        onChange={onSelectedTickersChange}
        multiple
      >
        <div className="relative">
          <Listbox.Button className="relative w-64 cursor-default rounded-lg bg-gray-700 py-2 pl-3 pr-10 text-left shadow-md focus:outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-700 sm:text-sm">
            <span className="block truncate text-white">
              {selectedTickers.length === 0
                ? 'Select assets...'
                : `${selectedTickers.length} asset${selectedTickers.length === 1 ? '' : 's'} selected`}
            </span>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
              <ChevronUpDownIcon
                className="h-5 w-5 text-gray-400"
                aria-hidden="true"
              />
            </span>
          </Listbox.Button>
          <Transition
            as={React.Fragment}
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-gray-700 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
              {availableTickers.map((ticker) => (
                <Listbox.Option
                  key={ticker.id}
                  className={({ active }) =>
                    `relative cursor-default select-none py-2 pl-10 pr-4 ${
                      active ? 'bg-indigo-600 text-white' : 'text-gray-200'
                    }`
                  }
                  value={ticker.id}
                >
                  {({ selected }) => (
                    <>
                      <span
                        className={`block truncate ${
                          selected ? 'font-medium' : 'font-normal'
                        }`}
                      >
                        {ticker.name}
                      </span>
                      {selected ? (
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-indigo-400">
                          <CheckIcon className="h-5 w-5" aria-hidden="true" />
                        </span>
                      ) : null}
                    </>
                  )}
                </Listbox.Option>
              ))}
            </Listbox.Options>
          </Transition>
        </div>
      </Listbox>
    </div>
  );

  if (selectedTickers.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="mb-4">{tickerSelector}</div>
        <p className="text-gray-400">Select one or more assets to compare their performance.</p>
      </div>
    );
  }

  return (
    <GenericPerformanceSection
      title="Asset Performance Comparison"
      valueType={valueType}
      onValueTypeChange={setValueType}
      data={[]} // Not used in multi-line mode
      series={filteredSeries}
      dateRange={dateRange}
      onDateRangeChange={setDateRange}
      minDate={dateBounds.minDate}
      maxDate={dateBounds.maxDate}
      onSetYTD={setYTD}
      loading={tickerPerformanceQueries.isLoading}
      notEnoughDataMessage="Not enough data to display asset performance comparison"
      finalValue={finalValue}
      selector={tickerSelector}
    />
  );
};

export default TickerPerformanceSection;