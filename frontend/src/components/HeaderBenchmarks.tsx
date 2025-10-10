import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { idbGet } from '../utils/idbCache';

const DEFAULT_BENCHMARKS = [
  { symbol: '^GSPC', name: 'S&P 500' },
  { symbol: '^NDX', name: 'NASDAQ 100' },
  { symbol: '^RUT', name: 'Russell 2000' }
];

const HeaderBenchmarks: React.FC = () => {
  const [benchmarks, setBenchmarks] = useState<{ symbol: string; name: string }[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stored = await idbGet('benchmarks_list_v1');
        if (mounted && Array.isArray(stored) && stored.length > 0) {
          setBenchmarks(stored.map((b: any) => ({ symbol: String(b.symbol), name: String(b.name || b.symbol) })));
        } else if (mounted) {
          setBenchmarks(DEFAULT_BENCHMARKS);
        }
      } catch (e) {
        if (mounted) setBenchmarks(DEFAULT_BENCHMARKS);
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (!benchmarks || benchmarks.length === 0) return null;

  return (
    <div className="hidden sm:flex items-center gap-2">
      {benchmarks.slice(0, 4).map(b => (
        <Link key={b.symbol} to={`/ticker/${encodeURIComponent(b.symbol)}`} className="text-xs text-gray-200 bg-gray-800/60 px-2 py-1 rounded hover:bg-gray-700" title={b.name}>
          {b.symbol}
        </Link>
      ))}
    </div>
  );
};

export default HeaderBenchmarks;
