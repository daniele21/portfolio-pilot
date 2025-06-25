import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import SettingsPage from './pages/SettingsPage';
import TransactionsPage from './pages/TransactionsPage';
import TickerInfoPage from './pages/TickerInfoPage';
import InitialChoiceModal from './components/InitialChoiceModal';
import PortfolioStatusPage from './pages/PortfolioStatusPage';
import ReportPage from './pages/ReportPage';
import TickerLookupPage from './pages/TickerLookupPage';
import AssetsPage from './pages/AssetsPage';
import { HomeIcon, ChartPieIcon, ChatBubbleLeftEllipsisIcon, Cog6ToothIcon, ClipboardDocumentListIcon, MagnifyingGlassCircleIcon, ArrowRightOnRectangleIcon, UserCircleIcon } from '@heroicons/react/24/outline';
import { resetPortfolioDataToMocks, isPortfolioInitialized, markPortfolioAsInitialized, initialLoad as initialPortfolioLoad } from './services/portfolioService';
import { useAuth } from './AuthContext';

const App: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [showInitialChoiceModal, setShowInitialChoiceModal] = useState<boolean>(false);
  const { isLoggedIn, profile, handleSignOut, GOOGLE_CLIENT_ID, isGoogleAuthReady, idToken } = useAuth();
  const signInButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Attempt initial portfolio load if user is logged in and token is available
    if (isLoggedIn && idToken && !isPortfolioInitialized()) {
        console.log("[App.tsx] User logged in, attempting initial portfolio load.");
        initialPortfolioLoad().then(() => {
            markPortfolioAsInitialized(); // Mark after load attempt
            console.log("[App.tsx] Initial portfolio load attempted.");
             // Check if initial choice modal should be shown *after* initial load attempt
            const choiceMade = localStorage.getItem('initialChoiceMade');
            if (!choiceMade && !isPortfolioInitialized()) { // Re-check, as initialLoad might not fully init if backend is empty
                setShowInitialChoiceModal(true);
            }
        });
    } else if (!isLoggedIn) {
        // If not logged in, and no choice made, show modal (e.g. first visit)
        const choiceMade = localStorage.getItem('initialChoiceMade');
         if (!choiceMade) { // Only show if no choice made yet. Once choice is made, it implies user interaction.
            setShowInitialChoiceModal(true);
        }
    }
  }, [isLoggedIn, idToken]);
  
  useEffect(() => {
    if (!isLoggedIn && isGoogleAuthReady && signInButtonRef.current) {
        console.log("[App.tsx] Conditions met: User not logged in, Google Auth is Ready, and signInButtonRef exists.");
        try {
            // Check if button already rendered to avoid errors
            if (signInButtonRef.current && signInButtonRef.current.childNodes.length === 0) {
                 console.log("[App.tsx] Attempting to render Google Sign-In button.");
                window.google.accounts.id.renderButton(
                    signInButtonRef.current,
                    { theme: 'outline', size: 'large', type: 'standard', text: 'signin_with', width: '220px' } 
                );
                console.log("[App.tsx] Google Sign-In button render call successful.");
            } else {
                 console.log("[App.tsx] Google Sign-In button appears to be already rendered or ref is not empty.");
            }
        } catch (error) {
            console.error("[App.tsx] Error rendering Google Sign-In button:", error);
        }
    } else {
        if (!isLoggedIn) {
            if(!isGoogleAuthReady) console.log("[App.tsx] Google Auth not ready yet, deferring button render.");
            if(!signInButtonRef.current) console.log("[App.tsx] signInButtonRef.current is null, deferring button render.");
        }
    }
  }, [isLoggedIn, isGoogleAuthReady, signInButtonRef.current]);


  const handleInitialChoice = async (choice: 'demo' | 'upload') => {
    localStorage.setItem('initialChoiceMade', choice);
    setShowInitialChoiceModal(false);
    if (choice === 'demo') {
      // "Demo" now means proceed with whatever is in the backend (could be empty)
      // Ensure portfolio service attempts to load from backend if not already.
      if (!isPortfolioInitialized()) {
        await initialPortfolioLoad(); // This will fetch from backend
      }
      markPortfolioAsInitialized(); // Ensure it's marked
      navigate('/');
    } else { // 'upload'
      // Clear any local mock/demo state and navigate to settings for upload
      await resetPortfolioDataToMocks(true); // Clears local state, prepares for backend
      markPortfolioAsInitialized();
      navigate('/settings');
    }
  };

  const navItems = [
    { path: '/', label: 'Home', icon: HomeIcon },
    { path: '/assets', label: 'Assets', icon: ChatBubbleLeftEllipsisIcon }, // New Assets nav item
    { path: '/report', label: 'AI Report', icon: ChartPieIcon },
    { path: '/transactions', label: 'Transactions', icon: ClipboardDocumentListIcon },
    { path: '/ticker-lookup', label: 'Ticker Lookup', icon: MagnifyingGlassCircleIcon },
  ];

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 font-sans">
      <aside className="w-64 bg-gray-800 p-6 space-y-6 border-r border-gray-700 flex flex-col">
        <div>
          <div className="text-3xl font-bold text-indigo-400 mb-8">My Financial Investments</div>
          <nav className="space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-700 transition-colors duration-150
                  ${location.pathname === item.path ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-300 hover:text-white'}`}
              >
                <item.icon className="h-6 w-6" />
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-auto pt-6 border-t border-gray-700 space-y-3">
           <Link
              to="/settings"
              className={`flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-700 transition-colors duration-150
                ${location.pathname === '/settings' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-300 hover:text-white'}`}
            >
              <Cog6ToothIcon className="h-6 w-6" />
              <span>Settings</span>
            </Link>
            
            {isLoggedIn && profile ? (
              <div className="text-center space-y-2">
                {profile.picture ? (
                    <img src={profile.picture} alt="User" className="w-10 h-10 rounded-full mx-auto border-2 border-indigo-500"/>
                ) : (
                    <UserCircleIcon className="w-10 h-10 mx-auto text-gray-400"/>
                )}
                <p className="text-xs text-gray-300 truncate" title={profile.email}>{profile.name || profile.email}</p>
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center justify-center space-x-2 p-2 rounded-lg text-sm bg-red-600 hover:bg-red-700 text-white transition-colors"
                >
                  <ArrowRightOnRectangleIcon className="h-5 w-5" />
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              <div id="signInDivRef" ref={signInButtonRef} className="flex justify-center py-2 min-h-[50px]">
                {!isGoogleAuthReady && <p className="text-xs text-gray-500">Loading Sign-In...</p>}
              </div>
            )}
        </div>
      </aside>

      <main className="flex-1 p-8 overflow-y-auto bg-gray-900">
         {(!isLoggedIn && (location.pathname !== '/ticker-lookup' && location.pathname !== '/settings')) && !showInitialChoiceModal && (
            <div className="flex flex-col items-center justify-center h-full text-center">
                <UserCircleIcon className="h-24 w-24 text-indigo-400 mb-4" />
                <h2 className="text-2xl font-semibold text-white mb-2">Welcome to PortfolioPilot</h2>
                <p className="text-gray-400 mb-6">Please sign in to manage and analyze your portfolio.</p>
                {/* The sign-in button is in the sidebar, or could be duplicated here if needed */}
                 <p className="text-sm text-gray-500">If you don't have an account, signing in with Google will create one.</p>
            </div>
        )}
        {/* Render routes if user is logged in OR if modal is shown OR if on specific public-ish pages */}
        {(isLoggedIn || showInitialChoiceModal || location.pathname === '/ticker-lookup' || location.pathname === '/settings') && (
            <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/report" element={<ReportPage />} />
                <Route path="/transactions" element={<TransactionsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/portfolio-status" element={<PortfolioStatusPage />} />
                <Route path="/ticker/:ticker" element={<TickerInfoPage />} />
                <Route path="/ticker-lookup" element={<TickerLookupPage />} />
                <Route path="/assets" element={<AssetsPage />} /> {/* New route for AssetsPage */}
                {/* Remove CopilotPage route */}
            </Routes>
        )}
      </main>
      
      {showInitialChoiceModal && <InitialChoiceModal onChoice={handleInitialChoice} />}
    </div>
  );
};

export default App;
