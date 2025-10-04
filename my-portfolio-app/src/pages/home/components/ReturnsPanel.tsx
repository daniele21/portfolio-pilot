import React from 'react';
import { Kpi } from '../../../types';
import KpiCard from '../../../components/KpiCard';
import CollapsibleSection from '../../../components/CollapsibleComponent';

type Props = { kpis: Kpi[] | any };

type RawReturnsResult = {
  cards: Kpi[];
  ignoredTickers: string[]; // tickers ignored because start/end not both finite
};

const buildCardsFromRawReturns = (raw: any): RawReturnsResult => {
  const cards: Kpi[] = [];
  const ignoredTickersAccumulator: Set<string> = new Set();
  if (!raw || typeof raw !== 'object') return { cards, ignoredTickers: [] };

  const mappings: Array<[string, string, string]> = [
    ['daily', 'Return (1 Day)', '1d'],
    ['weekly', 'Return (1 Week)', '7d'],
    ['monthly', 'Return (1 Month)', '30d'],
    ['three_month', 'Return (3 Months)', '90d'],
    ['ytd', 'Return (YTD)', 'ytd'],
    ['one_year', 'Return (1 Year)', '1y'],
  ];

  for (const [key, title, idSuffix] of mappings) {
    try {
      const p = raw[key];
      let pct: number | null = null;
      // Prefer portfolio-level value
      const val = p && p.portfolio ? p.portfolio.return_pct : null;
      if (typeof val === 'number' && Number.isFinite(val)) {
        pct = val;
      } else {
        // Fallback: compute portfolio-level return by summing per-ticker start/end
        const tickers = p && p.tickers ? p.tickers : null;
        if (tickers && typeof tickers === 'object') {
          let sumStart = 0;
          let sumEnd = 0;
          for (const tk of Object.keys(tickers)) {
            try {
              const item = (tickers as any)[tk];
              const s = item?.start_value;
              const e = item?.end_value;
              const startOk = typeof s === 'number' && Number.isFinite(s);
              const endOk = typeof e === 'number' && Number.isFinite(e);
              if (startOk && endOk) {
                sumStart += s;
                sumEnd += e;
              } else {
                ignoredTickersAccumulator.add(tk);
              }
            } catch (e) {
              // ignore malformed ticker entries
            }
          }
          if (sumStart > 0 && Number.isFinite(sumEnd)) {
            pct = ((sumEnd - sumStart) / sumStart) * 100;
          }
        }
      }

      if (typeof pct === 'number' && Number.isFinite(pct)) {
        cards.push({
          id: `return_${idSuffix}`,
          name: title,
          value: pct.toFixed(2) + '%',
          unit: '',
          status: pct > 0 ? ('GREEN' as any) : pct < 0 ? ('RED' as any) : ('NEUTRAL' as any),
          description: `${title} for portfolio`,
        });
      }
    } catch (e) {
      // skip period on error
    }
  }

  return { cards, ignoredTickers: Array.from(ignoredTickersAccumulator) };
};

const ReturnsPanel: React.FC<Props> = ({ kpis }) => {
  let cards: Kpi[] = [];
  let ignoredTickers: string[] = [];
  if (Array.isArray(kpis) && kpis.length > 0) {
    cards = kpis;
  } else if (kpis && typeof kpis === 'object') {
    const result = buildCardsFromRawReturns(kpis);
    cards = result.cards;
    ignoredTickers = result.ignoredTickers;
  }

  if (!cards || cards.length === 0) return null;

  return (
    <CollapsibleSection key="returns" title="Recent Portfolio Returns">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 w-full">
        {cards.map(kpi => (
          <div key={kpi.id} className="flex-1 min-w-0">
            <KpiCard kpi={kpi} small />
          </div>
        ))}
      </div>
      {ignoredTickers && ignoredTickers.length > 0 && (
        <p className="text-xs text-yellow-300 mt-2">Partial data: ignored {ignoredTickers.length} ticker(s) due to missing prices: {ignoredTickers.join(', ')}.</p>
      )}
    </CollapsibleSection>
  );
};

export default ReturnsPanel;
