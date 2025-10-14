
import * as React from 'react';
import { showNotification } from '@mantine/notifications';
import { jwtDecode } from 'jwt-decode';
import { setGlobalRefreshStrategy } from './utils/authFetch';

interface UserProfile {
  email: string;
  name: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
}

interface AuthContextType {
  idToken: string | null;
  profile: UserProfile | null;
  isLoggedIn: boolean;
  isGoogleAuthReady: boolean; // Indicates GSI library readiness
  handleSignOut: () => void;
  forceRefresh: () => Promise<string | null>; // Explicit refresh trigger returning Promise
  GOOGLE_CLIENT_ID: string;
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

const GOOGLE_CLIENT_ID_CONST = '335283962900-7i4ggscsqff6557okn1ddc33me6n0fi0.apps.googleusercontent.com';

interface AuthProviderProps { children: React.ReactNode }
export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [idToken, setIdToken] = React.useState<string | null>(null);
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [isGoogleAuthReady, setIsGoogleAuthReady] = React.useState<boolean>(false); // New state
  const refreshPromiseRef = React.useRef<Promise<string | null> | null>(null);
  const refreshTimerRef = React.useRef<number | null>(null);

  // Clear any pending scheduled refresh
  const clearScheduledRefresh = () => {
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  };

  const decodeExpiry = (token: string): number | null => {
    try {
      const decoded: any = jwtDecode(token);
      if (decoded && typeof decoded.exp === 'number') return decoded.exp; // seconds epoch
    } catch {/* ignore */}
    return null;
  };

  const scheduleRefresh = React.useCallback((token: string) => {
    clearScheduledRefresh();
    const exp = decodeExpiry(token);
    if (!exp) return; // can't schedule
    const nowSec = Math.floor(Date.now() / 1000);
    // Refresh 5 minutes before expiry (or immediately if within that window)
    const refreshAtSec = exp - 300; // 5 minutes early
    const delayMs = (refreshAtSec - nowSec) * 1000;
    if (delayMs <= 0) {
      // Expiring soon or already past window; trigger immediate refresh attempt (non-blocking)
      forceRefresh();
      return;
    }
    refreshTimerRef.current = window.setTimeout(() => {
      forceRefresh();
    }, delayMs);
  }, []);

  const forceRefresh = React.useCallback((): Promise<string | null> => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;
    // If GSI not ready, resolve null
    if (!(window as any).google?.accounts?.id) {
      return Promise.resolve(null);
    }
    refreshPromiseRef.current = new Promise<string | null>((resolve) => {
      try {
        const gsi = (window as any).google.accounts.id;
        gsi.initialize({
          client_id: GOOGLE_CLIENT_ID_CONST,
          callback: (resp: any) => {
            const newTokenResp: string | null = resp && resp.credential ? resp.credential : null;
            if (newTokenResp) {
              localStorage.setItem('idToken', newTokenResp);
              setIdToken(newTokenResp);
              try {
                const decodedToken: any = jwtDecode(newTokenResp);
                setProfile({
                  email: decodedToken.email,
                  name: decodedToken.name,
                  picture: decodedToken.picture,
                  given_name: decodedToken.given_name,
                  family_name: decodedToken.family_name,
                });
              } catch (err) {
                console.error('[AuthContext] Error decoding refreshed token', err);
              }
              scheduleRefresh(newTokenResp);
            }
            resolve(newTokenResp);
            refreshPromiseRef.current = null;
          }
        });
        // Prompt usually silent if user already granted consent (One Tap / auto sign-in)
        gsi.prompt((notification: any) => {
          if (notification && (notification.isNotDisplayed?.() || notification.isSkippedMoment?.())) {
            // Could not display or skipped; allow resolution if callback not already fired
            // If still pending after small timeout, resolve null.
            setTimeout(() => {
              if (refreshPromiseRef.current) {
                resolve(null);
                refreshPromiseRef.current = null;
              }
            }, 500);
          }
        });
      } catch (e) {
        console.error('[AuthContext] forceRefresh error', e);
        resolve(null);
        refreshPromiseRef.current = null;
      }
    });
    return refreshPromiseRef.current;
  }, []);

  const handleCredentialResponse = React.useCallback((response: any) => {
    console.log("[AuthContext] Google Sign-In: Credential response received", response);
    const token = response.credential;
    if (token) {
      localStorage.setItem('idToken', token);
      setIdToken(token);
      try {
        const decodedToken: any = jwtDecode(token);
        console.log("[AuthContext] Decoded ID Token:", decodedToken);
        setProfile({
          email: decodedToken.email,
          name: decodedToken.name,
          picture: decodedToken.picture,
          given_name: decodedToken.given_name,
          family_name: decodedToken.family_name,
        });
        scheduleRefresh(token);
      } catch (error) {
        console.error("[AuthContext] Error decoding ID token:", error);
        setProfile(null);
      }
    } else {
      console.error("[AuthContext] Google Sign-In: No credential found in response.");
    }
  }, [scheduleRefresh]);
  
  const handleSignOut = React.useCallback(() => {
    console.log("[AuthContext] Signing out user.");
    setIdToken(null);
    setProfile(null);
    localStorage.removeItem('idToken');
    clearScheduledRefresh();
    // Consider if google.accounts.id.disableAutoSelect() or similar needs to be called
    // Clear global refresh strategy when the user signs out
    try {
      setGlobalRefreshStrategy(null);
    } catch (e) {
      // ignore
    }
  }, []);


  React.useEffect(() => {
    const storedToken = localStorage.getItem('idToken');
    if (storedToken) {
      console.log("[AuthContext] Found stored ID token in localStorage.");
      setIdToken(storedToken);
      try {
        const decodedToken: any = jwtDecode(storedToken);
         setProfile({
          email: decodedToken.email,
          name: decodedToken.name,
          picture: decodedToken.picture,
          given_name: decodedToken.given_name,
          family_name: decodedToken.family_name,
        });
        scheduleRefresh(storedToken);
      } catch (error) {
        console.error("[AuthContext] Error decoding stored ID token:", error);
        localStorage.removeItem('idToken');
        setProfile(null);
      }
    }

    const initializeGoogleSignIn = () => {
        if (typeof window.google !== 'undefined' && window.google.accounts?.id) {
            console.log("[AuthContext] Initializing Google Sign-In with Client ID:", GOOGLE_CLIENT_ID_CONST);
            try {
                window.google.accounts.id.initialize({
                    client_id: GOOGLE_CLIENT_ID_CONST,
                    callback: handleCredentialResponse,
                });
                setIsGoogleAuthReady(true); // GSI initialized successfully
                // Register the global refresh strategy referencing forceRefresh
                setGlobalRefreshStrategy(() => forceRefresh());
                console.log("[AuthContext] Google Sign-In initialized successfully.");
            } catch (initError) {
                console.error("[AuthContext] Error during google.accounts.id.initialize:", initError);
                setIsGoogleAuthReady(false); // GSI initialization failed
            }
        } else {
            console.warn("[AuthContext] Google Identity Services script not ready yet or google.accounts.id not available. Will retry.");
            return false; // Indicate not ready
        }
        return true; // Indicate ready
    };

  if (!isGoogleAuthReady) {
        if (initializeGoogleSignIn()) {
            // Already initialized
        } else {
      // Poll for the GSI script if not immediately available
            let attempts = 0;
            const intervalId = setInterval(() => {
                attempts++;
                console.log(`[AuthContext] Polling for Google GSI script (attempt ${attempts})...`);
                if (initializeGoogleSignIn()) {
                    clearInterval(intervalId);
                } else if (attempts >= 10) { // Stop after 10 attempts (e.g., 5 seconds)
                    clearInterval(intervalId);
                    console.error("[AuthContext] Failed to initialize Google Sign-In after multiple attempts. GSI script might be blocked or not loaded.");
                    setIsGoogleAuthReady(false); // Explicitly set to false on failure
                }
            }, 500); // Check every 500ms

            return () => clearInterval(intervalId); // Cleanup interval on unmount
        }
    }

    // Cleanup: ensure global refresh strategy is cleared if this provider unmounts
    const onTokenExpired = (ev: any) => {
      console.warn('[AuthContext] Received auth:token_expired event', ev?.detail);
      // Notify the user and sign them out so they can relogin
      showNotification({
        title: 'Session expired',
        message: 'Your session has expired. Please sign in again.',
        color: 'yellow',
        autoClose: 8000,
      });
      handleSignOut();
    };
    const onInvalidToken = (ev: any) => {
      console.warn('[AuthContext] Received auth:invalid_token event', ev?.detail);
      showNotification({
        title: 'Authentication error',
        message: 'Your session is no longer valid. Please sign in again.',
        color: 'red',
        autoClose: 8000,
      });
      handleSignOut();
    };

    window.addEventListener('auth:token_expired', onTokenExpired as EventListener);
    window.addEventListener('auth:invalid_token', onInvalidToken as EventListener);

    return () => {
      try { setGlobalRefreshStrategy(null); } catch (e) { /* ignore */ }
      window.removeEventListener('auth:token_expired', onTokenExpired as EventListener);
      window.removeEventListener('auth:invalid_token', onInvalidToken as EventListener);
    };

  }, [handleCredentialResponse, isGoogleAuthReady, forceRefresh, scheduleRefresh, handleSignOut]); // include dependencies

  return (
    <AuthContext.Provider value={{ idToken, profile, isLoggedIn: !!idToken, isGoogleAuthReady, handleSignOut, forceRefresh, GOOGLE_CLIENT_ID: GOOGLE_CLIENT_ID_CONST }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = React.useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
