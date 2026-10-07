import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);

export async function enableMocking(): Promise<void> {
  // If running in development or when VITE_USE_MSW is true (or when not explicitly using live backend),
  // start MSW worker with bypass for static assets
  if (typeof window === 'undefined') return;

  try {
    await worker.start({
      onUnhandledRequest: 'bypass',
      serviceWorker: {
        url: '/mockServiceWorker.js',
      },
    });
    console.log('[MSW] Mock Service Worker started successfully.');
  } catch (err) {
    console.warn('[MSW] Could not start Service Worker; continuing in fallback mode.', err);
  }
}
