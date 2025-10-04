import React, { useEffect, useRef } from 'react';
import { useAuth } from '../AuthContext';

/**
 * GoogleSignIn component
 * Renders the Google Identity Services button when user is not logged in.
 * Shows a compact profile + sign-out action when logged in.
 */
const GoogleSignIn: React.FC = () => {
  const { isLoggedIn, profile, handleSignOut, isGoogleAuthReady } = useAuth();
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const renderedRef = useRef<boolean>(false);

  // Render Google button once library is ready & user not logged in
  useEffect(() => {
  if (!isLoggedIn && isGoogleAuthReady && window.google?.accounts?.id && buttonRef.current && !renderedRef.current) {
      try {
        window.google.accounts.id.renderButton(buttonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'medium',
          text: 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: '220px'
        });
  renderedRef.current = true;
      } catch (e) {
        console.error('[GoogleSignIn] Failed to render Google button:', e);
      }
    }
  }, [isLoggedIn, isGoogleAuthReady]);

  if (isLoggedIn && profile) {
    return (
      <div className="flex items-center gap-2">
        {profile.picture && (
            <img src={profile.picture} alt={profile.name} className="h-8 w-8 rounded-full border border-gray-600" referrerPolicy="no-referrer" />
        )}
        <div className="hidden sm:flex flex-col leading-tight">
          <span className="text-xs text-gray-400">Signed in</span>
          <span className="text-sm font-medium text-gray-100 max-w-[140px] truncate" title={profile.name}>{profile.name}</span>
        </div>
        <button
          onClick={handleSignOut}
          className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs text-gray-200 font-semibold"
          aria-label="Sign out"
        >Sign out</button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div ref={buttonRef} aria-label="Google Sign-In Button" />
      {!isGoogleAuthReady && (
        <div className="text-xs text-gray-400 animate-pulse">Loading Google...</div>
      )}
      {/* Fallback manual trigger */}
      {!isLoggedIn && isGoogleAuthReady && (
        <button
          onClick={() => window.google?.accounts?.id?.prompt?.()}
          className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
        >Sign in</button>
      )}
    </div>
  );
};

export default GoogleSignIn;
