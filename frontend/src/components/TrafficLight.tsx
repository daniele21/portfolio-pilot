import React from 'react';

export type TrafficLightColor = 'green' | 'yellow' | 'red' | '';

export function getTrafficLightColor(sentiment: string | undefined | null): TrafficLightColor {
  if (!sentiment) return '';
  const s = sentiment.toLowerCase();
  if (s === 'positive' || s === 'low') return 'green';
  if (s === 'neutral' || s === 'medium') return 'yellow';
  if (s === 'negative' || s === 'high') return 'red';
  return '';
}

export const TrafficLight: React.FC<{ sentiment?: string | null, className?: string, title?: string }> = ({ sentiment, className = '', title }) => {
  const color = getTrafficLightColor(sentiment);
  if (!color) return null;
  let emoji = '';
  if (color === 'green') emoji = '🟢';
  else if (color === 'yellow') emoji = '🟡';
  else if (color === 'red') emoji = '🔴';
  return <span className={className} title={title || sentiment || ''}>{emoji}</span>;
};
