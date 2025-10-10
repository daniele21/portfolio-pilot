import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, ISeriesApi, LineData, Time } from 'lightweight-charts';

export interface TimeSeriesPoint { 
  time: string; 
  value: number; 
}

export interface TimeSeriesChartProps {
  series: Array<{ 
    id: string; 
    name: string; 
    color?: string; 
    data: TimeSeriesPoint[] 
  }>;
  height?: number;
  valueFormatter?: (value: number) => string;
  normalizeToZero?: boolean; // When true, normalize all series to start at 0
}

const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({ 
  series, 
  height = 300, 
  valueFormatter = (value: number) => value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  normalizeToZero = false
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const seriesRefs = useRef<Record<string, ISeriesApi<'Line'>>>({});

  useEffect(() => {
    if (!containerRef.current) return;

    // Finance-grade chart styling
    const chart = createChart(containerRef.current, {
      height,
      layout: { 
        background: { type: ColorType.Solid, color: 'transparent' }, 
        textColor: '#a1a1aa', // gray-400 for WCAG compliance
        fontSize: 12,
        fontFamily: 'Inter, sans-serif'
      },
      grid: { 
        vertLines: { color: 'rgba(161,161,170,0.1)' }, 
        horzLines: { color: 'rgba(161,161,170,0.1)' } 
      },
      rightPriceScale: { 
        borderColor: 'rgba(161,161,170,0.2)',
        scaleMargins: { top: 0.1, bottom: 0.1 },
        // Format Y-axis labels based on whether we're showing percentages
        ticksVisible: true,
        borderVisible: true
      },
      timeScale: { 
        borderColor: 'rgba(161,161,170,0.2)',
        timeVisible: true,
        secondsVisible: false,
        ticksVisible: true,
        borderVisible: true
      },
      crosshair: { 
        horzLine: { color: '#71717a', style: 1, width: 1 }, 
        vertLine: { color: '#71717a', style: 1, width: 1 } 
      },
      kineticScroll: { mouse: true, touch: true },
    });

    chartRef.current = chart;

    // Professional color palette for financial data
    const colors = [
      '#2563eb', // brand-600 
      '#dc2626', // red-600
      '#16a34a', // green-600
      '#ca8a04', // yellow-600  
      '#9333ea', // purple-600
      '#c2410c'  // orange-600
    ];

    // Configure price scale formatting for percentage display (like PerformanceChart Y-axis)
    if (normalizeToZero) {
      chart.priceScale('right').applyOptions({
        scaleMargins: { top: 0.1, bottom: 0.1 },
        borderColor: 'rgba(161,161,170,0.2)',
        ticksVisible: true,
        borderVisible: true
      });
    }

    // If one of the series is volatility, create a dedicated right-side price scale
    const hasVolatilitySeries = series.some(s => s.id === 'volatility');
    if (hasVolatilitySeries) {
      try {
        // Create a new named price scale for volatility (right side)
        (chart as any).addPriceScale('volatility', {
          position: 'right',
          scaleMargins: { top: 0.12, bottom: 0.12 },
          borderColor: 'rgba(161,161,170,0.2)'
        });
        // Ensure the newly created price scale is visible and configured
        try {
          chart.priceScale('volatility').applyOptions({
            visible: true,
            borderColor: 'rgba(161,161,170,0.2)',
            scaleMargins: { top: 0.12, bottom: 0.12 },
            borderVisible: true,
            ticksVisible: true
          } as any);
        } catch (e) {
          // best-effort: ignore if API differs
        }
      } catch (e) {
        // ignore if the price scale already exists or API not available
      }
    }

    series.forEach((s, idx) => {
      const isVol = s.id === 'volatility';
      const seriesOptions: any = {
        color: s.color || colors[idx % colors.length],
        lineWidth: isVol ? 2 : 2,
        priceLineVisible: false,
        lastValueVisible: true,
        title: s.name
      };
      // Attach volatility to its own price scale and format as percent
      if (isVol) {
        seriesOptions.priceScaleId = 'volatility';
        seriesOptions.priceFormat = {
          type: 'custom',
          formatter: (price: number) => `${price.toFixed(2)}%`,
          minMove: 0.01
        };
      } else {
        // Use percentage formatting when normalizing, otherwise numeric price formatting
        seriesOptions.priceFormat = normalizeToZero ? {
          type: 'custom',
          formatter: (price: number) => `${price.toFixed(1)}%`,
          minMove: 0.01
        } : {
          type: 'price',
          precision: 2,
          minMove: 0.01
        };
      }

      const line = chart.addLineSeries(seriesOptions);

      // Convert and normalize data to proper format for lightweight-charts
      let chartData: LineData[] = s.data
        .filter(point => point.time && typeof point.value === 'number')
        .map(point => {
          // Ensure time is in YYYY-MM-DD format for lightweight-charts
          let timeStr = point.time;
          if (timeStr.includes('T')) {
            timeStr = timeStr.split('T')[0]; // Remove time portion if present
          }
          return {
            time: timeStr as Time,
            value: point.value
          };
        })
        .sort((a, b) => String(a.time).localeCompare(String(b.time)));

      // Normalize pct_from_first to start at 0 for EACH series independently (EXACT same logic as PerformanceChart.tsx)
      if (normalizeToZero && chartData.length > 0) {
        // Find the first point with a valid (non-null) value for THIS series
        const firstPoint = chartData.find(d => d.value !== null && d.value !== undefined);
        if (firstPoint && typeof firstPoint.value === 'number') {
          const firstValue = firstPoint.value;
          // Subtract the first value from all points to normalize THIS series to start at 0
          chartData = chartData.map(point => ({
            time: point.time,
            value: point.value !== null && point.value !== undefined && typeof point.value === 'number'
              ? point.value - firstValue 
              : point.value
          }));
        }
      }

      line.setData(chartData);
      seriesRefs.current[s.id] = line;
    });

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        chart.applyOptions({ width });
        chart.timeScale().fitContent();
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [series, height, valueFormatter, normalizeToZero]);

  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: '100%', 
        height,
        borderRadius: '0.5rem',
        backgroundColor: 'transparent'
      }} 
    />
  );
};

export default TimeSeriesChart;
