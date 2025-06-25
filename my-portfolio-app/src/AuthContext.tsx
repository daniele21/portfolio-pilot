
import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { jwtDecode } from 'jwt-decode';

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
  isGoogleAuthReady: boolean; // New state to indicate GSI library readiness
  handleSignOut: () => void;
  GOOGLE_CLIENT_ID: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const GOOGLE_CLIENT_ID_CONST = '335283962900-7i4ggscsqff6557okn1ddc33me6n0fi0.apps.googleusercontent.com';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [idToken, setIdToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isGoogleAuthReady, setIsGoogleAuthReady] = useState<boolean>(false); // New state

  const handleCredentialResponse = useCallback((response: any) => {
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
      } catch (error) {
        console.error("[AuthContext] Error decoding ID token:", error);
        setProfile(null);
      }
    } else {
      console.error("[AuthContext] Google Sign-In: No credential found in response.");
    }
  }, []);
  
  const handleSignOut = useCallback(() => {
    console.log("[AuthContext] Signing out user.");
    setIdToken(null);
    setProfile(null);
    localStorage.removeItem('idToken');
    // Consider if google.accounts.id.disableAutoSelect() or similar needs to be called
  }, []);


  useEffect(() => {
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

  }, [handleCredentialResponse, isGoogleAuthReady]); // Added isGoogleAuthReady to dependencies to prevent re-polling if already ready

  return (
    <AuthContext.Provider value={{ idToken, profile, isLoggedIn: !!idToken, isGoogleAuthReady, handleSignOut, GOOGLE_CLIENT_ID: GOOGLE_CLIENT_ID_CONST }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
