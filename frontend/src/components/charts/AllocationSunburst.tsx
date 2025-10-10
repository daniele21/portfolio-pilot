import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

export interface AllocationNode {
  name: string;
  value: number;
  percentage?: number;
  children?: AllocationNode[];
  itemStyle?: {
    color?: string;
  };
}

export interface AllocationSunburstProps {
  data: AllocationNode[];
  height?: number;
  title?: string;
}

const AllocationSunburst: React.FC<AllocationSunburstProps> = ({ 
  data, 
  height = 360, 
  title = 'Portfolio Allocation' 
}) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current || !data.length) return;
    
    const chart = echarts.init(ref.current, 'dark', { renderer: 'svg' });
    
    // Finance-appropriate color palette
    const financeColors = [
      '#2563eb', '#dc2626', '#16a34a', '#ca8a04', '#9333ea', '#c2410c',
      '#0891b2', '#be123c', '#059669', '#d97706', '#7c3aed', '#ea580c'
    ];

    chart.setOption({
      title: {
        text: title,
        left: 'center',
        top: '5%',
        textStyle: {
          color: '#f4f4f5',
          fontSize: 16,
          fontWeight: 600,
          fontFamily: 'Inter, sans-serif'
        }
      },
      series: [{
        type: 'sunburst',
        radius: [30, '85%'],
        center: ['50%', '55%'],
        sort: 'desc',
        data,
        itemStyle: {
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          borderRadius: 2
        },
        label: {
          color: '#e4e4e7',
          fontSize: 11,
          fontFamily: 'Inter, sans-serif',
          fontWeight: 500,
          rotate: 'radial',
          formatter: (params: any) => {
            if (params.data.percentage) {
              return `${params.name}\n${params.data.percentage.toFixed(1)}%`;
            }
            return params.name;
          }
        },
        emphasis: {
          focus: 'ancestor',
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(37, 99, 235, 0.3)'
          }
        },
        levels: [
          {},
          {
            r0: 30,
            r: 70,
            itemStyle: {
              borderWidth: 2
            },
            label: {
              fontSize: 12,
              fontWeight: 600
            }
          },
          {
            r0: 70,
            r: 120,
            label: {
              fontSize: 10
            }
          }
        ]
      }],
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(39, 39, 42, 0.95)',
        borderColor: 'rgba(161, 161, 170, 0.2)',
        textStyle: {
          color: '#f4f4f5',
          fontFamily: 'Inter, sans-serif'
        },
        formatter: (params: any) => {
          const { name, value, data } = params;
          const percentage = data.percentage || 0;
          return `
            <div style="font-weight: 600; margin-bottom: 4px;">${name}</div>
            <div>Value: ${typeof value === 'number' ? value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value}</div>
            <div>Allocation: ${percentage.toFixed(2)}%</div>
          `;
        }
      },
      // Finance-grade color scheme
      color: financeColors
    });

    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(ref.current);

    return () => {
      chart.dispose();
      resizeObserver.disconnect();
    };
  }, [data, height, title]);

  return (
    <div 
      ref={ref} 
      style={{ 
        width: '100%', 
        height,
        borderRadius: '0.5rem',
        backgroundColor: 'transparent'
      }} 
    />
  );
};

export default AllocationSunburst;
