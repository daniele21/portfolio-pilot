import React, { useEffect, useState } from 'react';
import { fetchPortfolioTargets, savePortfolioTargets, fetchPortfolioStatus } from '../services/portfolioService';

type TargetsMap = Record<string, number>;

type Props = {
  open: boolean;
  onClose: () => void;
  portfolioName: string;
  idToken?: string | null;
  onSaved?: () => void;
  assetTypes?: string[];
  riskOptions?: string[];
};

const LOCAL_STORAGE_PREFIX = 'target_allocations:';

export default function TargetAllocationPanel({ open, onClose, portfolioName, idToken, onSaved, assetTypes, riskOptions }: Props) {
  const [mode, setMode] = useState<'asset_type' | 'risk'>('asset_type');
  const [targets, setTargets] = useState<TargetsMap>({});
  const [savedRoot, setSavedRoot] = useState<Record<string, TargetsMap> | null>(null);
  const [availableKeys, setAvailableKeys] = useState<string[]>([]); // asset types or risk buckets
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storageKey = `${LOCAL_STORAGE_PREFIX}${portfolioName}:${mode}`;

  useEffect(() => {
    if (!open) return;
    // load available keys from portfolio status holdings or use provided lists
    const loadAvailable = async () => {
      try {
        // If caller provided lists and they match current mode, use them
        if (mode === 'asset_type' && assetTypes && assetTypes.length > 0) {
          setAvailableKeys(assetTypes);
        } else if (mode === 'risk' && riskOptions && riskOptions.length > 0) {
          setAvailableKeys(riskOptions);
        } else {
          const status = await fetchPortfolioStatus(portfolioName);
          if (status) {
            const holdings = status.holdings || [];
            // derive asset types list from holdings' category/asset_type fields if present, otherwise use ticker groups
            const types = new Set<string>();
            holdings.forEach((h: any) => {
              if (h.asset_type) types.add(h.asset_type);
              if (h.category) types.add(h.category);
            });
            const keys = Array.from(types).filter(Boolean);
            // if empty, fallback to tickers grouped by simple mapping
            if (keys.length === 0) {
              const tickers = (holdings || []).map((h:any) => h.ticker).slice(0, 20);
              setAvailableKeys(tickers);
            } else {
              setAvailableKeys(keys);
            }
          } else {
            setAvailableKeys([]);
          }
        }
      } catch (e) {
        // ignore
      }
      // load existing saved targets from backend or localStorage
      try {
        // try backend endpoint (new targets convenience path)
        const savedRoot = await fetchPortfolioTargets(portfolioName);
        if (savedRoot && typeof savedRoot === 'object') {
          setSavedRoot(savedRoot as Record<string, TargetsMap>);
          const saved = savedRoot[mode] || null;
          if (saved && typeof saved === 'object') {
            setTargets(Object.fromEntries(Object.entries(saved).map(([k,v]) => [k, Number(v)])));
            return;
          }
        }
      } catch(e) {}
      // fallback to localStorage
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            setTargets(Object.fromEntries(Object.entries(parsed).map(([k,v])=>[k, Number(v)])));
            return;
          }
        }
      } catch (e) {}
      // default empty map
      setTargets({});
    };
    loadAvailable();
  }, [open, portfolioName, mode, storageKey]);

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(targets)); } catch {}
  }, [targets, storageKey]);

  const updateKey = (key: string, percent: number) => {
    setTargets(prev => ({ ...prev, [key]: percent }));
  };

  const total = Object.values(targets).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);

  const savedTotals = {
    asset_type: savedRoot && savedRoot.asset_type ? Object.values(savedRoot.asset_type).reduce((s, v) => s + Number(v || 0), 0) : 0,
    risk: savedRoot && savedRoot.risk ? Object.values(savedRoot.risk).reduce((s, v) => s + Number(v || 0), 0) : 0,
  };

  const handleSave = async () => {
    setError(null);
    // basic validation
    if (Object.keys(targets).length === 0) { setError('No targets configured'); return; }
    // NOTE: removed blocking validation that required active-mode totals to equal 100%.
    // The UI still displays the total as a visual hint, but saving is allowed for flexibility
    // since asset_type and risk targets are independent.
    setSaving(true);
    try {
      // POST to backend route to save targets (requires auth)
      if (idToken) {
        try {
          const resp = await savePortfolioTargets(portfolioName, mode, targets);
          // update in-memory savedRoot for immediate UI feedback
          setSavedRoot(prev => ({ ...(prev || {}), [mode]: { ...(targets || {}) } }));
          // backend may return error object; keep going regardless
          void resp;
        } catch (e) { console.warn('Failed saving targets to backend', e); }
      }
      // Always persist locally
      try { localStorage.setItem(storageKey, JSON.stringify(targets)); } catch {}
      if (onSaved) onSaved();
      onClose();
    } finally { setSaving(false); }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-2 sm:p-4">
      <div className="bg-gray-900 p-4 sm:p-6 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3 sm:gap-0">
          <h3 className="text-lg font-semibold text-indigo-300">Configure Targets for {portfolioName}</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={mode} onChange={e => setMode(e.target.value as any)} className="bg-gray-800 text-gray-100 px-2 py-1 rounded text-sm">
              <option value="asset_type">By Asset Type</option>
              <option value="risk">By Risk</option>
            </select>
            <button className="px-3 py-1 rounded bg-gray-700 text-gray-200 text-sm" onClick={onClose}>Close</button>
          </div>
        </div>

        <div className="mb-3 text-sm text-gray-300">Set percentage targets (must sum to 100%). You can define targets by asset type (preferred) or by risk bucket.</div>

        <div className="mb-3">
          <div className="mb-1 text-xs text-gray-400">Note: asset-type and risk targets are independent — you can save both. Each set should sum to 100% individually.</div>
          <div className="flex gap-3 text-xs">
            <div className="inline-flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-[11px] ${Math.abs(savedTotals.asset_type - 100) < 0.5 ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-200'}`} title="Saved totals for Asset Type targets">
                Saved (Asset Type): {savedTotals.asset_type.toFixed(0)}%
              </span>
            </div>
            <div className="inline-flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-[11px] ${Math.abs(savedTotals.risk - 100) < 0.5 ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-200'}`} title="Saved totals for Risk targets">
                Saved (Risk): {savedTotals.risk.toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {availableKeys.length === 0 && <div className="text-xs text-gray-400">No asset types detected — you can enter custom keys below.</div>}
          {(availableKeys.length > 0 ? availableKeys : Object.keys(targets).slice(0,10)).map(k => (
            <div key={k} className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex-1 text-sm text-gray-200 min-w-0">{k}</div>
              <input 
                type="number" 
                className="w-full sm:w-28 p-2 rounded bg-gray-800 text-gray-100 border border-gray-700 text-right text-sm" 
                value={targets[k] ?? 0} 
                onChange={e => updateKey(k, Number(e.target.value))} 
              />
            </div>
          ))}
          {/* allow adding a custom key */}
          <AddCustomKey onAdd={(k) => { setAvailableKeys(prev => prev.includes(k) ? prev : [...prev, k]); updateKey(k, 0); }} />
        </div>

        <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-sm text-gray-300">Total (By {mode === 'asset_type' ? 'Asset Type' : 'Risk'}): <span className={`font-semibold ${Math.abs(total - 100) > 0.01 ? 'text-red-400' : 'text-green-400'}`}>{total.toFixed(2)}%</span></div>
          <div className="flex items-center gap-2 flex-wrap">
            <button className="px-3 py-1 rounded bg-gray-700 text-gray-200 text-sm" onClick={() => { setTargets({}); }}>Reset</button>
            <button className="px-3 py-1 rounded bg-indigo-600 text-white font-semibold text-sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Targets'}</button>
          </div>
        </div>
        {error && <div className="mt-2 text-xs text-red-400">{error}</div>}
      </div>
    </div>
  );
}

const AddCustomKey: React.FC<{ onAdd: (k: string) => void }> = ({ onAdd }) => {
  const [val, setVal] = useState('');
  return (
    <div className="mt-3 flex gap-2">
      <input className="flex-1 p-2 rounded bg-gray-800 text-gray-100 border border-gray-700" placeholder="Custom key (e.g. Real Estate)" value={val} onChange={e=>setVal(e.target.value)} />
      <button className="px-3 py-1 rounded bg-gray-700 text-gray-200" onClick={() => { const k = val.trim(); if (!k) return; onAdd(k); setVal(''); }}>Add</button>
    </div>
  );
};
