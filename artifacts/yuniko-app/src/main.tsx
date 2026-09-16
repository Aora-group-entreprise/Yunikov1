import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 2 },
    mutations: { retry: 1 },
  },
});

createRoot(document.getElementById('root')!, {
  onCaughtError: (error, errorInfo) => console.error(error, errorInfo.componentStack),
}).render(
  <QueryClientProvider client={queryClient}>
    <ErrorBoundary><App /></ErrorBoundary>
  </QueryClientProvider>,
);
