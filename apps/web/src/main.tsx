import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App.jsx';
import { AuthProvider } from './auth.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { initTheme } from './theme.js';

import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/landing.css';

// Before the first render, so the page never flashes the wrong theme.
initTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // A refusal will not become an answer on a retry.
        const status = (error as { status?: number }).status ?? 0;
        if (status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('The page has no #root element');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
