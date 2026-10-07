// Development keeps the fault-injection tools; production uses the real API.
export const useMockApi = import.meta.env.VITE_USE_MSW === 'true' ||
  (import.meta.env.DEV && import.meta.env.VITE_USE_MSW !== 'false');
