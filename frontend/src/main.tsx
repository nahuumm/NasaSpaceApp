import './lib/migrarClaves';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import App from './App';
import AvisoError from './components/AvisoError';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AvisoError completa>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </AvisoError>
  </StrictMode>,
);