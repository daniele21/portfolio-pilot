import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { MantineProvider, ColorSchemeScript } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { designTheme } from './theme/designSystem';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './AuthContext';
import { HashRouter } from 'react-router-dom';

// Configure QueryClient to disable ALL automatic refetching that can be triggered
// by layout changes, focus events, or other UI interactions (like nav toggle)
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: true,
      refetchInterval: false,
      refetchIntervalInBackground: false,
      retry: 1,
      staleTime: 10 * 60 * 1000, // 10 minutes - data stays fresh longer
      gcTime: 15 * 60 * 1000, // 15 minutes cache time
    },
  },
});

// Removed development fetch wrapper - no longer needed after fixing root causes

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ColorSchemeScript />
    <HashRouter>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <MantineProvider theme={designTheme} defaultColorScheme="dark">
            <Notifications position="top-right" />
            <App />
          </MantineProvider>
        </QueryClientProvider>
      </AuthProvider>
    </HashRouter>
  </StrictMode>,
)
