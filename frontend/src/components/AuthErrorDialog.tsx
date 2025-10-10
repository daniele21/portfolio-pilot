import React from 'react';

interface AuthErrorDialogProps {
  open: boolean;
  onClose: () => void;
  onLogin: () => void;
  message?: string;
}

const AuthErrorDialog: React.FC<AuthErrorDialogProps> = ({ open, onClose, onLogin, message }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-sm w-full text-center">
        <h2 className="text-xl font-semibold mb-4 text-gray-900">Session Expired</h2>
        <p className="mb-6 text-gray-700">{message || 'Your session has expired or is invalid. Please log in again to continue.'}</p>
        <div className="flex justify-center gap-4">
          <button
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 focus:outline-none"
            onClick={onLogin}
          >
            Log In
          </button>
          <button
            className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400 focus:outline-none"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthErrorDialog;
