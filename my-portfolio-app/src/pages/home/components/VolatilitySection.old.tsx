import React from 'react';
import KpiCard from '../../../components/KpiCard';
import { ChartBarIcon } from '@heroicons/react/24/outline';
import { Kpi, TrafficLightStatus } from '../../../types';
import { SegmentedControl, Text, Stack, SimpleGrid } from '@mantine/core';

interface VolatilityOption {
  value: string;
  label: string;
  description?: string;
}

interface Props {
  options: VolatilityOption[];
  selectedWindow: string;
  onWindowChange: (value: string) => void;
  backendVolatility?: number | null;
  backendMethod?: string;
  fallbackValues?: Record<string, number | null>;
}

const VolatilitySection: React.FC<Props> = ({
  options,
  selectedWindow,
  onWindowChange,
  backendVolatility,
  backendMethod,
  fallbackValues = {}
}) => {
  const cards: Kpi[] = [];
  const selectedOption = options.find(opt => opt.value === selectedWindow) || options[0];
  const backendDescription = backendMethod === 'ewm'
    ? 'Exponentially weighted volatility (EWMA)'
    : 'Rolling volatility sourced from backend';

  if (typeof backendVolatility === 'number') {
    cards.push({
      id: `vol_backend_${selectedWindow}`,
      name: `Volatility (${selectedOption?.label || selectedWindow})`,
      value: backendVolatility.toFixed(2) + '%',
      unit: '',
      status: TrafficLightStatus.NEUTRAL,
      icon: ChartBarIcon,
      description: backendDescription
    });
  } else {
    cards.push({
      id: `vol_backend_${selectedWindow}`,
      name: `Volatility (${selectedOption?.label || selectedWindow})`,
      value: '—',
      unit: '',
      status: TrafficLightStatus.NEUTRAL,
      icon: ChartBarIcon,
      description: 'Not enough data to compute volatility'
    });
  }

  options.forEach(option => {
    if (option.value === selectedWindow) return;
    const fallback = fallbackValues[option.value];
    if (typeof fallback === 'number') {
      cards.push({
        id: `vol_fallback_${option.value}`,
        name: `${option.label} (derived)`,
        value: fallback.toFixed(2) + '%',
        unit: '',
        status: TrafficLightStatus.NEUTRAL,
        icon: ChartBarIcon,
        description: 'Calculated locally from performance series'
      });
    }
  });

  return (
    <Stack gap="md">
      <div>
        <Text size="sm" c="dimmed" mb={4}>Window presets</Text>
        <SegmentedControl
          fullWidth
          size="sm"
          value={selectedWindow}
          onChange={onWindowChange}
          data={options.map(option => ({ value: option.value, label: option.label }))}
        />
      </div>
      <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }} spacing="md">
        {cards.map(card => (
          <KpiCard key={card.id} kpi={card} mantine />
        ))}
      </SimpleGrid>
    </Stack>
  );
};

export default VolatilitySection;
