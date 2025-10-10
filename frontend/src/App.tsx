import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import HomePage from './pages/HomePage';
import SettingsPage from './pages/SettingsPage';
import TransactionsPage from './pages/SetupPage';
import TickerInfoPage from './pages/TickerInfoPage';
import ReportPage from './pages/ReportPage';
import TickerLookupPage from './pages/TickerLookupPage';
import AssetsPage from './pages/AssetsPage';
import PortfolioSelectorPage from './pages/PortfolioSelectorPage';
import './styles/mobile.css';
import './styles/desktop.css';
import { 
  HomeIcon, 
  Cog6ToothIcon, 
  DocumentTextIcon,
  CurrencyDollarIcon,
  DocumentChartBarIcon,
  MagnifyingGlassIcon,
  Bars3Icon,
  RectangleStackIcon
} from '@heroicons/react/24/outline';
import GoogleSignIn from './components/GoogleSignIn';
import HeaderPortfolioDropdown from './components/HeaderPortfolioDropdown';
import { SelectedPortfolioProvider, useSelectedPortfolio } from './SelectedPortfolioContext';
import SimpleHome from './pages/home/HomePage';

const AppContent: React.FC = () => {
  const location = useLocation();
  const initialIsDesktop = typeof window !== 'undefined' && window.matchMedia('(min-width:900px)').matches;
  const [drawerOpen, setDrawerOpen] = useState<boolean>(initialIsDesktop);
  const [isDesktop, setIsDesktop] = useState<boolean>(initialIsDesktop);
  const { selectedPortfolio, setSelectedPortfolio } = useSelectedPortfolio();
  // Track viewport to auto-open drawer on desktop (and keep it open)
  useEffect(() => {
    const mq = window.matchMedia('(min-width:900px)');
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      const matches = 'matches' in e ? e.matches : (e as MediaQueryList).matches;
      setIsDesktop(matches);
    };
    // Initial sync
    handler(mq);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  const navRef = useRef<HTMLElement | null>(null);
  const hamburgerRef = useRef<HTMLButtonElement | null>(null);
  
  // Memoize the toggle function to prevent unnecessary re-renders
  const toggleDrawer = useCallback(() => {
    setDrawerOpen((s) => !s);
  }, []);
  
  // Memoize the close drawer function
  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  // Close drawer only on mobile when clicking nav items
  const handleNavClick = useCallback(() => {
    if (!isDesktop) {
      closeDrawer();
    }
  }, [isDesktop, closeDrawer]);

  // When closing the drawer, if focus is trapped inside it, move focus back to the hamburger button.
  useEffect(() => {
    if (!drawerOpen && navRef.current) {
      const active = document.activeElement;
      if (active && navRef.current.contains(active) && hamburgerRef.current) {
        hamburgerRef.current.focus();
      }
    }
  }, [drawerOpen]);

  // Charts now use ResizeObserver and media query listeners, so no need for global resize dispatch

  // Memoize navigation items to prevent recreation on every render
  const bottomNav = useMemo(() => [
    { path: '/portfolio-selector', label: 'Portfolios', id: 'portfolios', Icon: RectangleStackIcon },
    { path: '/', label: 'Dashboard', id: 'home', Icon: HomeIcon },
    { path: '/assets', label: 'Assets', id: 'assets', Icon: CurrencyDollarIcon },
    // { path: '/report', label: 'Report', id: 'report', Icon: DocumentChartBarIcon },
    // { path: '/transactions', label: 'Setupe', id: 'txs', Icon: DocumentTextIcon },
    { path: '/transactions', label: 'Setup', id: 'txs', Icon: Cog6ToothIcon },
    // { path: '/settings', label: 'Settings', id: 'settings', Icon: Cog6ToothIcon }
  ], []);

  const sideNav = useMemo(() => [
    { path: '/portfolio-selector', label: 'Portfolios', id: 'portfolios', Icon: RectangleStackIcon },
    { path: '/', label: 'Dashboard', id: 'home', Icon: HomeIcon },
    { path: '/assets', label: 'Assets', id: 'assets', Icon: CurrencyDollarIcon },
    // { path: '/report', label: 'AI Report', id: 'report', Icon: DocumentChartBarIcon },
    { path: '/transactions', label: 'Setup', id: 'txs', Icon: Cog6ToothIcon },
    // { path: '/settings', label: 'Settings', id: 'settings', Icon: Cog6ToothIcon }
  ], []);



  // Always show the normal app layout

  return (
    <div className="mp-app">
      <header className="mp-header">
        <button
          ref={hamburgerRef}
          className="mp-hamburger"
          onClick={toggleDrawer}
          aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={drawerOpen}
          aria-controls="app-drawer"
        >
          <Bars3Icon className="w-5 h-5" />
        </button>
        <div className="mp-title">
          Portfolio Pilot
          {selectedPortfolio && (
            <span className="text-sm text-gray-400 ml-2">• {selectedPortfolio}</span>
          )}
        </div>
        <div className="mp-actions flex items-center gap-3">
          <div className="hidden sm:block">
            <HeaderPortfolioDropdown selected={selectedPortfolio} onSelect={(name) => setSelectedPortfolio(name)} />
          </div>
          <GoogleSignIn />
        </div>
      </header>

  <div className={`mp-content ${(!drawerOpen && isDesktop) ? 'mp-collapsed' : ''}`}>
        {/* Mobile overlay when drawer is open */}
        <div 
          className={`mp-drawer-overlay ${drawerOpen ? 'open' : ''}`}
          onClick={closeDrawer}
        />

        {/* Use inert (supported in modern browsers) to fully disable interaction when closed */}
        <nav
          id="app-drawer"
          ref={navRef}
          className={`mp-drawer ${drawerOpen ? 'open' : ''}`}
          {...(!drawerOpen && !isDesktop ? { inert: '' as any } : {})}
        >
          <ul>
            {sideNav.map(({ path, label, id, Icon }) => (
              <li key={id} className="mp-drawer-item">
                <Link 
                  to={path} 
                  onClick={handleNavClick} 
                  className={`mp-drawer-link ${location.pathname === path ? 'active' : ''}`}
                  data-label={label}
                >
                  <Icon className="mp-drawer-icon" />
                  <span className="mp-drawer-label">{label}</span>
                </Link>
              </li>
            ))}
            <li className="mp-drawer-item">
              <Link 
                to="/ticker-lookup" 
                onClick={handleNavClick} 
                className={`mp-drawer-link ${location.pathname === '/ticker-lookup' ? 'active' : ''}`}
                data-label="Ticker Lookup"
              >
                <MagnifyingGlassIcon className="mp-drawer-icon" />
                <span className="mp-drawer-label">Ticker Lookup</span>
              </Link>
            </li>
          </ul>
        </nav>

        <MainContent />
      </div>

      <footer className="mp-bottomnav" role="navigation" aria-label="Main">
        {bottomNav.map((n) => (
          <Link key={n.id} to={n.path} className={`mp-navitem ${location.pathname === n.path ? 'active' : ''}`}>
            <n.Icon className="w-5 h-5" />
            <span>{n.label}</span>
          </Link>
        ))}
      </footer>
    </div>
  );
};

// Memoized main content component to prevent re-renders when drawer state changes
const MainContent: React.FC = React.memo(() => {
  const { selectedPortfolio, setSelectedPortfolio } = useSelectedPortfolio();
  return (
    <main className="mp-main">
      <Routes>
        <Route 
          path="/" 
          element={
            selectedPortfolio ? (
              <SimpleHome selectedPortfolio={selectedPortfolio} />
            ) : (
              <PortfolioSelectorPage selectedPortfolio={selectedPortfolio} onPortfolioSelect={(name) => setSelectedPortfolio(name)} />
            )
          } 
        />
        <Route path="/portfolio-selector" element={<PortfolioSelectorPage selectedPortfolio={selectedPortfolio} onPortfolioSelect={(name) => setSelectedPortfolio(name)} />} />
        <Route path="/assets" element={<AssetsPage />} />
        <Route path="/report" element={<ReportPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/ticker/:ticker" element={<TickerInfoPage />} />
        <Route path="/ticker-lookup" element={<TickerLookupPage />} />
      </Routes>
    </main>
  );
});

MainContent.displayName = 'MainContent';

const App: React.FC = () => {
  return (
    <SelectedPortfolioProvider>
      <AppContent />
    </SelectedPortfolioProvider>
  );
};

export default App;
