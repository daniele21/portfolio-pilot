import React from 'react';
import { useAuth } from '../AuthContext';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

// Lightweight banner prompting user to reauthenticate without losing context.
export const ReauthBanner: React.FC = () => {
  const { needsReauth, reauthenticate, isGoogleAuthReady } = useAuth();
  const [pending, setPending] = React.useState(false);

  if (!needsReauth) return null;

  const handleClick = async () => {
    if (pending) return;
    setPending(true);
    try { await reauthenticate(); } finally { setPending(false); }
  };

  return (
    <div className="fixed bottom-4 right-4 max-w-sm bg-yellow-600 text-white p-4 rounded shadow-lg border border-yellow-500 z-50">
      <p className="text-sm font-semibold mb-2">Session expired</p>
      <p className="text-xs mb-3 opacity-90">Your session can be renewed silently. Click Reauthenticate to continue making requests.</p>
      <button
        onClick={handleClick}
        disabled={!isGoogleAuthReady || pending}
        className="flex items-center px-3 py-2 bg-yellow-800 hover:bg-yellow-700 disabled:bg-yellow-900 rounded text-sm font-semibold"
      >
        {pending && <ArrowPathIcon className="h-4 w-4 mr-2 animate-spin" />} Reauthenticate
      </button>
    </div>
  );
};

export default ReauthBanner;
