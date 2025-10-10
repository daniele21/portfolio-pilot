import React from 'react';
import ActionButton from './ActionButton';

interface Props {
  open: boolean;
  title?: string;
  message?: React.ReactNode;
  confirmTextRequired?: string;
  confirmLabel?: string;
  loading?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}

const ConfirmDeleteModal: React.FC<Props> = ({ open, title = 'Confirm', message, confirmTextRequired, confirmLabel = 'Delete', loading = false, error = null, onCancel, onConfirm }) => {
  const [confirmText, setConfirmText] = React.useState('');
  if (!open) return null;
  const canConfirm = !confirmTextRequired || confirmText.trim() === confirmTextRequired;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
      <div className="bg-gray-900 p-6 rounded-xl shadow-2xl w-full max-w-md">
        <h2 className="text-2xl font-bold text-red-400 mb-4">{title}</h2>
        {message && <div className="text-gray-300 mb-4 text-sm">{message}</div>}
        {confirmTextRequired && (
          <div className="mb-4">
            <input className="w-full p-2 rounded bg-gray-800 text-gray-100 border border-gray-700" placeholder={`Type ${confirmTextRequired} to confirm`} value={confirmText} onChange={e => setConfirmText(e.target.value)} />
          </div>
        )}
        {error && <div className="text-red-400 mb-2">{error}</div>}
        <div className="flex justify-end gap-2">
          <ActionButton variant="ghost" size="md" onClick={onCancel} disabled={loading}>Cancel</ActionButton>
          <ActionButton variant="danger" size="md" onClick={() => onConfirm()} disabled={loading || !canConfirm}>{loading ? 'Working...' : confirmLabel}</ActionButton>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDeleteModal;
