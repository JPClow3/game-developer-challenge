import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { useMockApi } from './api/environment';
import { PendingSubmissionQueue } from './api/pendingQueue';
import './index.css';
import './ui/polish.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5000,
    },
  },
});

async function prepare() {
  if (useMockApi) {
    const { enableMocking } = await import('./mocks/browser');
    await enableMocking();
  } else if ('serviceWorker' in navigator) {
    // Remove an old mock worker when switching a preview to the live backend.
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.filter((registration) =>
      [registration.active, registration.waiting, registration.installing].some(
        (worker) => worker && new URL(worker.scriptURL).pathname === '/mockServiceWorker.js'
      )
    ).map((registration) => registration.unregister()));
  }
  PendingSubmissionQueue.getInstance().startAutoSync(() => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['ranking'] }),
    queryClient.invalidateQueries({ queryKey: ['history'] }),
  ]));
}

prepare().finally(() => {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Failed to find root element');
  }

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </React.StrictMode>
  );
});
