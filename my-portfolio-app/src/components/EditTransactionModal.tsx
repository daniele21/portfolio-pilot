import React, { useEffect, useState } from 'react';
import ActionButton from './ActionButton';

const EditTransactionModal: React.FC<{
  transaction: any | null;
  open: boolean;
  onClose: () => void;
  onSave: (updated: any) => Promise<boolean>;
}> = ({ transaction, open, onClose, onSave }) => {
  const [formState, setFormState] = useState<any>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (transaction) setFormState({ ...transaction });
    else setFormState({});
  }, [transaction]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4 overflow-y-auto">
      <div className="bg-gray-900 p-6 rounded-xl shadow-2xl w-full max-w-2xl my-auto mx-auto">
        <h2 className="text-2xl font-bold text-white mb-4">Edit Transaction</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <label className="text-xs text-gray-300">Date
            <input type="date" value={formState.date ? new Date(formState.date).toISOString().slice(0,10) : ''} onChange={e => setFormState((s:any)=>({...s, date: e.target.value}))} className="w-full p-2 rounded bg-gray-800 text-gray-100 border border-gray-700" />
          </label>
          <label className="text-xs text-gray-300">Ticker
            <input type="text" value={formState.assetSymbol || formState.ticker || ''} onChange={e => setFormState((s:any)=>({...s, assetSymbol: e.target.value, ticker: e.target.value}))} className="w-full p-2 rounded bg-gray-800 text-gray-100 border border-gray-700" />
          </label>
          <label className="text-xs text-gray-300">Name
            <input type="text" value={formState.name || formState.assetName || ''} onChange={e => setFormState((s:any)=>({...s, name: e.target.value, assetName: e.target.value}))} className="w-full p-2 rounded bg-gray-800 text-gray-100 border border-gray-700" />
          </label>
          <label className="text-xs text-gray-300">Quantity
            <input type="number" value={formState.quantity ?? ''} onChange={e => setFormState((s:any)=>({...s, quantity: parseFloat(e.target.value)}))} className="w-full p-2 rounded bg-gray-800 text-gray-100 border border-gray-700" />
          </label>
          <label className="text-xs text-gray-300">Price
            <input type="number" value={formState.price ?? ''} onChange={e => setFormState((s:any)=>({...s, price: parseFloat(e.target.value)}))} className="w-full p-2 rounded bg-gray-800 text-gray-100 border border-gray-700" />
          </label>
          <label className="text-xs text-gray-300 col-span-1 sm:col-span-2">Notes
            <input type="text" value={formState.notes || ''} onChange={e => setFormState((s:any)=>({...s, notes: e.target.value}))} className="w-full p-2 rounded bg-gray-800 text-gray-100 border border-gray-700" />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <ActionButton variant="ghost" size="md" onClick={onClose} disabled={saving}>Cancel</ActionButton>
          <ActionButton variant="primary" size="md" disabled={saving} onClick={async () => { setSaving(true); const ok = await onSave(formState); setSaving(false); if (ok) onClose(); }}>{saving ? 'Saving...' : 'Save changes'}</ActionButton>
        </div>
      </div>
    </div>
  );
};

export default EditTransactionModal;
